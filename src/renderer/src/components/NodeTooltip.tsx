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

function formatBytesPerSec(bps: number): string {
  if (bps < 1024) return `${Math.round(bps)} B/s`
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`
  if (bps < 1024 * 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
  return `${(bps / (1024 * 1024 * 1024)).toFixed(1)} GB/s`
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
      if (node.resolvedHostname)
        details.push(["Hostname", node.resolvedHostname])
      details.push(["Remote", `${node.remoteHost}:${node.remotePort}`])
      if (node.serviceName)
        details.push(["Service", node.serviceName])
      details.push(["Protocol", node.protocol])
      details.push(["State", node.state])
      if (node.bytesPerSec != null && node.bytesPerSec > 0) {
        details.push(["Throughput", formatBytesPerSec(node.bytesPerSec)])
      }
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

  // Viewport-aware positioning — estimate tooltip size and clamp
  const estW = 290
  const estH = 52 + details.length * 22
  const vw = window.innerWidth
  const vh = window.innerHeight
  const pad = 8

  let left = x + 16
  let top = y - 10

  // Flip to left side if overflowing right edge
  if (left + estW > vw - pad) {
    left = x - estW - 16
  }
  // Shift up if overflowing bottom edge
  if (top + estH > vh - pad) {
    top = vh - estH - pad
  }
  // Clamp to viewport
  left = Math.max(pad, left)
  top = Math.max(pad, top)

  return (
    <div
      className="fixed z-50 pointer-events-none bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-xl px-4 py-3 min-w-[220px] max-w-[320px]"
      style={{ left, top }}
    >
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
        <div
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="font-semibold text-sm text-foreground truncate">
          {node.name}
        </span>
      </div>
      <div className="space-y-1">
        {details.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 text-xs">
            <span className="text-muted-foreground whitespace-nowrap">{label}</span>
            <span className="text-foreground font-mono truncate">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
