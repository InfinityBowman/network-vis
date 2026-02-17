import { SIGNAL_COLORS, SIGNAL_LABELS } from "@/visualization/colors"
import type { SignalType } from "@/types"

const TYPES: SignalType[] = [
  "this_device",
  "wifi",
  "lan",
  "bluetooth",
  "bonjour",
  "connection",
]

export function Legend() {
  return (
    <div className="absolute top-4 right-4 bg-card/90 backdrop-blur border border-border rounded-lg px-3 py-2 shadow-lg">
      <div className="space-y-1.5">
        {TYPES.map((type) => (
          <div key={type} className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: SIGNAL_COLORS[type] }}
            />
            <span className="text-[11px] text-muted-foreground">
              {SIGNAL_LABELS[type]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
