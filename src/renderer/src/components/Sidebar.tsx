import { useState, useMemo } from "react"
import type { NetworkNode, SignalType, SubnetInfo } from "@/types"
import { SIGNAL_COLORS, SIGNAL_LABELS } from "@/visualization/colors"
import {
  Wifi,
  Monitor,
  Bluetooth,
  Globe,
  ArrowUpDown,
  Laptop,
} from "lucide-react"

const SIGNAL_ICONS: Record<SignalType, React.ReactNode> = {
  this_device: <Laptop className="w-3.5 h-3.5" />,
  wifi: <Wifi className="w-3.5 h-3.5" />,
  lan: <Monitor className="w-3.5 h-3.5" />,
  bluetooth: <Bluetooth className="w-3.5 h-3.5" />,
  bonjour: <Globe className="w-3.5 h-3.5" />,
  connection: <ArrowUpDown className="w-3.5 h-3.5" />,
}

interface SidebarProps {
  nodes: NetworkNode[]
  filters: Set<SignalType>
  onToggleFilter: (type: SignalType) => void
  onNodeClick: (node: NetworkNode) => void
  selectedNode: NetworkNode | null
  showSubnetGroups?: boolean
  subnets?: SubnetInfo[]
  getSubnetForIp?: (ip: string) => SubnetInfo | undefined
}

export function Sidebar({
  nodes,
  filters,
  onToggleFilter,
  onNodeClick,
  selectedNode,
  showSubnetGroups = false,
  subnets = [],
  getSubnetForIp,
}: SidebarProps) {
  const [search, setSearch] = useState("")

  const counts: Record<SignalType, number> = {
    this_device: 0,
    wifi: 0,
    lan: 0,
    bluetooth: 0,
    bonjour: 0,
    connection: 0,
  }
  for (const node of nodes) {
    counts[node.signalType]++
  }

  const visibleNodes = nodes
    .filter((n) => filters.has(n.signalType))
    .filter((n) =>
      search ? n.name.toLowerCase().includes(search.toLowerCase()) : true
    )
    .sort((a, b) => a.name.localeCompare(b.name))

  // Compute grouped view when subnet grouping is on
  const { nonLanNodes, subnetGrouped, unassignedLan } = useMemo(() => {
    if (!showSubnetGroups || !getSubnetForIp || !filters.has("lan")) {
      return { nonLanNodes: visibleNodes, subnetGrouped: new Map<string, { subnet: SubnetInfo; nodes: NetworkNode[] }>(), unassignedLan: [] as NetworkNode[] }
    }

    const nonLan: NetworkNode[] = []
    const grouped = new Map<string, { subnet: SubnetInfo; nodes: NetworkNode[] }>()
    const unassigned: NetworkNode[] = []

    for (const node of visibleNodes) {
      if (node.signalType !== "lan") {
        nonLan.push(node)
        continue
      }
      if (!node.ip) {
        unassigned.push(node)
        continue
      }
      const subnet = getSubnetForIp(node.ip)
      if (!subnet) {
        unassigned.push(node)
        continue
      }
      let group = grouped.get(subnet.cidr)
      if (!group) {
        group = { subnet, nodes: [] }
        grouped.set(subnet.cidr, group)
      }
      group.nodes.push(node)
    }

    return { nonLanNodes: nonLan, subnetGrouped: grouped, unassignedLan: unassigned }
  }, [visibleNodes, showSubnetGroups, getSubnetForIp, filters])

  const filterTypes: SignalType[] = [
    "wifi",
    "lan",
    "bluetooth",
    "bonjour",
    "connection",
  ]

  const showGrouped = showSubnetGroups && getSubnetForIp && filters.has("lan") && subnetGrouped.size > 0

  return (
    <aside className="w-72 h-full flex flex-col bg-card border-r border-border overflow-hidden">
      {/* Header */}
      <div className="p-4 mt-6 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground tracking-tight">
          Network Signals
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {nodes.length} devices discovered
        </p>
      </div>

      {/* Filters */}
      <div className="p-3 border-b border-border space-y-1.5">
        {filterTypes.map((type) => (
          <button
            key={type}
            onClick={() => onToggleFilter(type)}
            className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-xs transition-colors ${
              filters.has(type)
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50"
            }`}
          >
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{
                backgroundColor: filters.has(type)
                  ? SIGNAL_COLORS[type]
                  : "#475569",
              }}
            />
            {SIGNAL_ICONS[type]}
            <span className="flex-1 text-left">{SIGNAL_LABELS[type]}</span>
            <span className="tabular-nums font-mono text-muted-foreground">
              {counts[type]}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="p-3 border-b border-border">
        <input
          type="text"
          placeholder="Search nodes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-1.5 text-xs rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Node List */}
      <div className="flex-1 overflow-y-auto">
        {showGrouped ? (
          <>
            {/* Non-LAN nodes flat */}
            {nonLanNodes.map((node) => (
              <NodeListItem
                key={node.id}
                node={node}
                selected={selectedNode?.id === node.id}
                onClick={() => onNodeClick(node)}
              />
            ))}

            {/* Subnet groups */}
            {Array.from(subnetGrouped.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([cidr, group]) => (
                <div key={cidr}>
                  <div className="px-4 py-2 border-b border-border/50 bg-teal-500/5">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-teal-500/50 flex-shrink-0" />
                      <span className="text-[10px] font-mono text-teal-400/80 flex-1">
                        {cidr} ({group.subnet.interface})
                      </span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {group.nodes.length}
                      </span>
                    </div>
                  </div>
                  {group.nodes.map((node) => (
                    <NodeListItem
                      key={node.id}
                      node={node}
                      selected={selectedNode?.id === node.id}
                      onClick={() => onNodeClick(node)}
                      indented
                    />
                  ))}
                </div>
              ))}

            {/* Unassigned LAN nodes */}
            {unassignedLan.length > 0 && (
              <div>
                <div className="px-4 py-2 border-b border-border/50 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/50 flex-shrink-0" />
                    <span className="text-[10px] font-mono text-muted-foreground flex-1">
                      Other
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {unassignedLan.length}
                    </span>
                  </div>
                </div>
                {unassignedLan.map((node) => (
                  <NodeListItem
                    key={node.id}
                    node={node}
                    selected={selectedNode?.id === node.id}
                    onClick={() => onNodeClick(node)}
                    indented
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          visibleNodes.map((node) => (
            <NodeListItem
              key={node.id}
              node={node}
              selected={selectedNode?.id === node.id}
              onClick={() => onNodeClick(node)}
            />
          ))
        )}
      </div>
    </aside>
  )
}

function NodeListItem({
  node,
  selected,
  onClick,
  indented = false,
}: {
  node: NetworkNode
  selected: boolean
  onClick: () => void
  indented?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 w-full ${indented ? "pl-7 pr-4" : "px-4"} py-2 text-left text-xs border-b border-border/50 transition-colors hover:bg-accent/50 ${
        selected ? "bg-accent" : ""
      }`}
    >
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: SIGNAL_COLORS[node.signalType] }}
      />
      <div className="flex-1 min-w-0">
        <div className="truncate text-foreground">{node.name}</div>
        {node.ip && (
          <div className="text-muted-foreground font-mono truncate">
            {node.ip}
          </div>
        )}
        {node.signalType === "lan" && node.productName && (
          <div className="text-[10px] text-muted-foreground truncate capitalize">
            {node.productName}
          </div>
        )}
      </div>
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded-full ${
          node.status === "active"
            ? "bg-green-500/20 text-green-400"
            : node.status === "stale"
              ? "bg-yellow-500/20 text-yellow-400"
              : "bg-red-500/20 text-red-400"
        }`}
      >
        {node.status}
      </span>
    </button>
  )
}
