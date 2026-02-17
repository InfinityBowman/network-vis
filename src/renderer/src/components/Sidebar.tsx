import { useState } from "react"
import type { NetworkNode, SignalType } from "@/types"
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
}

export function Sidebar({
  nodes,
  filters,
  onToggleFilter,
  onNodeClick,
  selectedNode,
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

  const filterTypes: SignalType[] = [
    "wifi",
    "lan",
    "bluetooth",
    "bonjour",
    "connection",
  ]

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
        {visibleNodes.map((node) => (
          <button
            key={node.id}
            onClick={() => onNodeClick(node)}
            className={`flex items-center gap-2 w-full px-4 py-2 text-left text-xs border-b border-border/50 transition-colors hover:bg-accent/50 ${
              selectedNode?.id === node.id ? "bg-accent" : ""
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
              {node.signalType === 'lan' && node.productName && (
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
        ))}
      </div>
    </aside>
  )
}
