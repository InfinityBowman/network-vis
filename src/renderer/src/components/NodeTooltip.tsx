import type { NetworkNode } from "@/types"
import { SIGNAL_LABELS, getNodeColor } from "@/visualization/colors"

interface NodeTooltipProps {
  node: NetworkNode | null
  x: number
  y: number
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString()
}

function getDetails(node: NetworkNode): [string, string][] {
  const details: [string, string][] = [
    ["Type", SIGNAL_LABELS[node.signalType]],
    ["Status", node.status],
  ]

  if (node.ip) details.push(["IP", node.ip])
  if (node.mac) details.push(["MAC", node.mac])
  if (node.signalStrength != null)
    details.push(["Signal", `${Math.round(node.signalStrength)}%`])

  switch (node.signalType) {
    case "wifi":
      details.push(["SSID", node.ssid])
      details.push(["Channel", `${node.channel} (${node.band})`])
      details.push(["Security", node.security])
      break
    case "lan":
      if (node.vendor) details.push(["Vendor", node.vendor])
      if (node.deviceType) details.push(["Device Type", node.deviceType.replace(/-/g, ' ')])
      if (node.productName) details.push(["Product", node.productName])
      if (node.isGateway) details.push(["Role", "Gateway"])
      details.push(["Interface", node.interface])
      break
    case "bluetooth":
      if (node.minorType) details.push(["Device Type", node.minorType])
      details.push(["Connected", node.isConnected ? "Yes" : "No"])
      if (node.batteryLevel != null)
        details.push(["Battery", `${node.batteryLevel}%`])
      break
    case "bonjour":
      details.push(["Service", node.serviceType])
      details.push(["Host", node.host])
      details.push(["Port", String(node.port)])
      break
    case "connection":
      details.push(["Process", node.processName])
      details.push(["Remote", `${node.remoteHost}:${node.remotePort}`])
      details.push(["Protocol", node.protocol])
      details.push(["State", node.state])
      break
    case "this_device":
      details.push(["Hostname", node.hostname])
      break
  }

  details.push(["First Seen", formatTime(node.firstSeen)])
  details.push(["Last Seen", formatTime(node.lastSeen)])

  return details
}

export function NodeTooltip({ node, x, y }: NodeTooltipProps) {
  if (!node) return null

  const details = getDetails(node)
  const color = getNodeColor(node.signalType)

  return (
    <div
      className="fixed z-50 pointer-events-none bg-card border border-border rounded-lg shadow-xl px-4 py-3 min-w-[220px] max-w-[320px]"
      style={{
        left: x + 16,
        top: y - 10,
      }}
    >
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="font-semibold text-sm text-foreground truncate">
          {node.name}
        </span>
      </div>
      <div className="space-y-1">
        {details.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 text-xs">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-foreground font-mono truncate">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
