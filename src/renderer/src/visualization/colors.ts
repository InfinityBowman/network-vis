import type { SignalType, NodeStatus } from "@/types"

export const SIGNAL_COLORS: Record<SignalType, string> = {
  this_device: "#ffffff",
  wifi: "#3B82F6",
  lan: "#10B981",
  bluetooth: "#8B5CF6",
  bonjour: "#F59E0B",
  connection: "#EF4444",
}

export const SIGNAL_LABELS: Record<SignalType, string> = {
  this_device: "This Device",
  wifi: "Wi-Fi",
  lan: "LAN Device",
  bluetooth: "Bluetooth",
  bonjour: "Bonjour",
  connection: "Connection",
}

export function getNodeColor(signalType: SignalType): string {
  return SIGNAL_COLORS[signalType]
}

export function getStatusOpacity(status: NodeStatus): number {
  switch (status) {
    case "active": return 1
    case "stale": return 0.5
    case "expired": return 0.2
  }
}
