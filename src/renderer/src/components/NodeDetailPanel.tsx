import type { NetworkNode, PacketEvent, PacketScannerStatus } from "@/types"
import { SIGNAL_LABELS, getNodeColor } from "@/visualization/colors"
import { getProtocolColor } from "@/visualization/protocol-colors"
import { X, Radio, Shield, AlertTriangle } from "lucide-react"

interface NodeDetailPanelProps {
  node: NetworkNode
  events: PacketEvent[]
  onClose: () => void
  capturing: boolean
  onStartCapture: () => void
  onStopCapture: () => void
  captureStatus: PacketScannerStatus | null
}

export function NodeDetailPanel({
  node,
  events,
  onClose,
  capturing,
  onStartCapture,
  onStopCapture,
  captureStatus,
}: NodeDetailPanelProps) {
  const color = getNodeColor(node.signalType)

  const protocols = node.protocols
  const totalProtoPackets = protocols
    ? Object.values(protocols).reduce((a, b) => a + b, 0)
    : 0

  const recentEvents = events.slice(-50).reverse()

  return (
    <div className="absolute right-0 top-0 h-full w-80 bg-card border-l border-border flex flex-col overflow-hidden shadow-xl z-10">
      {/* Header */}
      <div className="flex items-center gap-2 p-4 border-b border-border mt-6 flex-shrink-0">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-foreground truncate">
            {node.name}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {SIGNAL_LABELS[node.signalType]}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-accent rounded-md text-muted-foreground flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Basic info */}
        <section className="p-4 border-b border-border space-y-1">
          {node.ip && <Row label="IP" value={node.ip} />}
          {node.mac && <Row label="MAC" value={node.mac} />}
          <Row label="Status" value={node.status} />
          {node.signalStrength != null && (
            <Row label="Signal" value={`${Math.round(node.signalStrength)}%`} />
          )}
        </section>

        {/* DPI Capture Controls */}
        <section className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="w-3 h-3" /> Packet Capture
            </h3>
            <button
              onClick={capturing ? onStopCapture : onStartCapture}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                capturing
                  ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                  : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
              }`}
            >
              <Radio className="w-3 h-3" />
              {capturing ? "Stop" : "Start"}
            </button>
          </div>
          {captureStatus?.error && (
            <div className="mt-2 flex items-start gap-1.5 text-[10px] text-amber-400 bg-amber-500/10 rounded-md px-2 py-1.5">
              <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span>{captureStatus.error}</span>
            </div>
          )}
          {capturing && captureStatus?.interface && (
            <div className="mt-2 text-[10px] text-muted-foreground">
              Capturing on <span className="font-mono text-foreground">{captureStatus.interface}</span>
            </div>
          )}
        </section>

        {/* Traffic Stats */}
        {(node.totalBytes != null || node.totalPackets != null) && (
          <section className="p-4 border-b border-border">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Radio className="w-3 h-3" /> Traffic
            </h3>
            <div className="space-y-1">
              {node.totalPackets != null && (
                <Row label="Packets" value={node.totalPackets.toLocaleString()} />
              )}
              {node.totalBytes != null && (
                <Row label="Bytes" value={formatBytes(node.totalBytes)} />
              )}
            </div>
          </section>
        )}

        {/* Protocol Breakdown */}
        {protocols && totalProtoPackets > 0 && (
          <section className="p-4 border-b border-border">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Protocols
            </h3>
            <div className="space-y-2">
              {Object.entries(protocols)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([proto, count]) => {
                  const pct = Math.round((count / totalProtoPackets) * 100)
                  const pColor = getProtocolColor(proto)
                  return (
                    <div key={proto}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-foreground">{proto}</span>
                        <span className="text-muted-foreground font-mono">
                          {count.toLocaleString()} ({pct}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full transition-all duration-300"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: pColor,
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          </section>
        )}

        {/* Recent Packet Events */}
        {recentEvents.length > 0 && (
          <section className="p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Recent Packets ({events.length})
            </h3>
            <div className="space-y-1">
              {recentEvents.map((evt) => {
                const pColor = getProtocolColor(evt.protocol)
                return (
                <div
                  key={evt.id}
                  className="flex items-center gap-1.5 text-[10px] font-mono py-0.5"
                >
                  <span
                    className="px-1 py-0.5 rounded text-[9px] font-bold flex-shrink-0"
                    style={{
                      backgroundColor: pColor + "25",
                      color: pColor,
                    }}
                  >
                    {evt.protocol}
                  </span>
                  <span className="text-muted-foreground truncate flex-1">
                    {evt.srcIp} → {evt.dstIp}
                  </span>
                  <span className="text-muted-foreground flex-shrink-0">
                    {evt.length}B
                  </span>
                </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Empty state */}
        {!capturing && totalProtoPackets === 0 && (
          <div className="p-4 text-xs text-muted-foreground text-center">
            Start packet capture to see DPI data for this node.
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-mono truncate">{value}</span>
    </div>
  )
}

function formatBytes(b: number): string {
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(1)} GB`
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${b} B`
}
