import * as d3 from "d3"
import type { SimNode, SimEdge } from "./renderers"
import { getNodeRadius } from "./renderers"

export type LayoutMode = "force" | "radial"

const TYPE_ANGLE: Record<string, number> = {
  wifi: 0,
  lan: (Math.PI * 2) / 5,
  bluetooth: (Math.PI * 2 * 2) / 5,
  bonjour: (Math.PI * 2 * 3) / 5,
  connection: (Math.PI * 2 * 4) / 5,
}

export function createSimulation(
  width: number,
  height: number,
  mode: LayoutMode
) {
  const cx = width / 2
  const cy = height / 2

  const sim = d3
    .forceSimulation<SimNode>()
    .force(
      "link",
      d3
        .forceLink<SimNode, SimEdge>()
        .id((d) => d.id)
        .distance(120)
        .strength(0.3)
    )
    .force("charge", d3.forceManyBody().strength(-200))
    .force("center", d3.forceCenter(cx, cy))
    .force(
      "collision",
      d3.forceCollide<SimNode>().radius((d) => getNodeRadius(d) + 8)
    )
    .alphaDecay(0.02)

  if (mode === "radial") {
    sim.force(
      "radial",
      d3
        .forceRadial<SimNode>(
          (d) => {
            if (d.signalType === "this_device") return 0
            const strength = d.signalStrength ?? 50
            // Stronger signal = closer to center
            return 60 + (100 - strength) * 2.5
          },
          cx,
          cy
        )
        .strength(0.8)
    )

    // Add angular positioning force
    sim.force(
      "x",
      d3.forceX<SimNode>((d) => {
        if (d.signalType === "this_device") return cx
        const angle = TYPE_ANGLE[d.signalType] ?? 0
        const radius = 60 + ((100 - (d.signalStrength ?? 50)) * 2.5)
        return cx + Math.cos(angle) * radius
      }).strength(0.15)
    )
    sim.force(
      "y",
      d3.forceY<SimNode>((d) => {
        if (d.signalType === "this_device") return cy
        const angle = TYPE_ANGLE[d.signalType] ?? 0
        const radius = 60 + ((100 - (d.signalStrength ?? 50)) * 2.5)
        return cy + Math.sin(angle) * radius
      }).strength(0.15)
    )

    // Remove center force in radial mode
    sim.force("center", null)
  }

  return sim
}
