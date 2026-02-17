import * as d3 from "d3"
import type { SignalType } from "@/types"
import { getNodeColor } from "./colors"
import { getDeviceIconPath } from "./device-icons"

export interface SimNode extends d3.SimulationNodeDatum {
  id: string
  signalType: SignalType
  name: string
  status: "active" | "stale" | "expired"
  signalStrength?: number
  [key: string]: unknown
}

export interface SimEdge extends d3.SimulationLinkDatum<SimNode> {
  id: string
  type: string
}

export function getNodeRadius(node: SimNode): number {
  if (node.signalType === "this_device") return 24
  if (node.signalType === "connection") return 6
  return 12
}

export function renderNode(
  selection: d3.Selection<SVGGElement, SimNode, SVGGElement, unknown>
) {
  // Glow filter is defined in the SVG defs
  selection.each(function (d) {
    const g = d3.select(this)
    g.selectAll("*").remove()

    const color = getNodeColor(d.signalType)
    const r = getNodeRadius(d)

    if (d.signalType === "this_device") {
      // Pulsing center circle
      g.append("circle")
        .attr("r", r)
        .attr("fill", color)
        .attr("opacity", 0.15)
        .attr("class", "pulse-ring")

      g.append("circle")
        .attr("r", r * 0.7)
        .attr("fill", color)
        .attr("filter", "url(#glow)")
        .attr("opacity", 0.9)
    } else if (d.signalType === "lan") {
      // Rounded rect
      g.append("rect")
        .attr("x", -r)
        .attr("y", -r * 0.7)
        .attr("width", r * 2)
        .attr("height", r * 1.4)
        .attr("rx", 4)
        .attr("fill", color)
        .attr("filter", d.status === "active" ? "url(#glow)" : null)
    } else if (d.signalType === "bonjour") {
      // Diamond
      g.append("polygon")
        .attr("points", `0,${-r} ${r},0 0,${r} ${-r},0`)
        .attr("fill", color)
        .attr("filter", d.status === "active" ? "url(#glow)" : null)
    } else {
      // Circle (wifi, bluetooth, connection)
      g.append("circle")
        .attr("r", r)
        .attr("fill", color)
        .attr("filter", d.status === "active" ? "url(#glow)" : null)
    }

    // Device type icon badge for classified LAN nodes
    if (d.signalType === "lan") {
      const iconPath = getDeviceIconPath(d.iconKey as string | undefined)
      if (iconPath) {
        const badgeR = 8
        const badgeX = r + 2
        const badgeY = -r * 0.5

        g.append("circle")
          .attr("cx", badgeX)
          .attr("cy", badgeY)
          .attr("r", badgeR)
          .attr("fill", "#0f172a")
          .attr("stroke", color)
          .attr("stroke-width", 1)

        g.append("path")
          .attr("d", iconPath)
          .attr(
            "transform",
            `translate(${badgeX - 6.5}, ${badgeY - 6.5}) scale(0.54)`
          )
          .attr("fill", "none")
          .attr("stroke", color)
          .attr("stroke-width", 1.5)
          .attr("stroke-linecap", "round")
          .attr("stroke-linejoin", "round")
          .attr("pointer-events", "none")
      }
    }

    // Label
    if (d.signalType !== "connection") {
      g.append("text")
        .attr("dy", r + 14)
        .attr("text-anchor", "middle")
        .attr("fill", "#94a3b8")
        .attr("font-size", "10px")
        .attr("pointer-events", "none")
        .text(
          d.name.length > 20 ? d.name.slice(0, 18) + "..." : d.name
        )
    }
  })
}
