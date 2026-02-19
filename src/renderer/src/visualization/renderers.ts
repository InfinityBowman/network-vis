import * as d3 from "d3"
import type { SignalType } from "@/types"
import { getNodeColor } from "./colors"
import { getDeviceIconPath } from "./device-icons"
import { getOsIconPath, getOsFamilyColor } from "./os-icons"
import { getProtocolColor } from "./protocol-colors"

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
  bytesPerSec?: number
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

    // Visual wrapper — scaled by semantic zoom independently from labels
    const visual = g.append("g").attr("class", "node-visual")

    if (d.signalType === "this_device") {
      // Pulsing center circle
      visual.append("circle")
        .attr("r", r)
        .attr("fill", color)
        .attr("opacity", 0.15)
        .attr("class", "pulse-ring")

      visual.append("circle")
        .attr("r", r * 0.7)
        .attr("fill", color)
        .attr("filter", "url(#glow)")
        .attr("opacity", 0.9)
    } else if (d.signalType === "lan") {
      // Rounded rect
      visual.append("rect")
        .attr("x", -r)
        .attr("y", -r * 0.7)
        .attr("width", r * 2)
        .attr("height", r * 1.4)
        .attr("rx", 4)
        .attr("fill", color)
        .attr("filter", d.status === "active" ? "url(#glow)" : null)
    } else if (d.signalType === "bonjour") {
      // Diamond
      visual.append("polygon")
        .attr("points", `0,${-r} ${r},0 0,${r} ${-r},0`)
        .attr("fill", color)
        .attr("filter", d.status === "active" ? "url(#glow)" : null)
    } else {
      // Circle (wifi, bluetooth, connection)
      visual.append("circle")
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

        visual.append("circle")
          .attr("cx", badgeX)
          .attr("cy", badgeY)
          .attr("r", badgeR)
          .attr("fill", "#0f172a")
          .attr("stroke", color)
          .attr("stroke-width", 1)

        visual.append("path")
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

    // OS family badge — top-left corner (symmetric to device badge on top-right)
    const osFamily = d.osFamily as string | undefined
    const osIconPath = getOsIconPath(osFamily)
    if (osIconPath) {
      const osBadgeR = 7
      const osBadgeX = -(r + 2)
      const osBadgeY = -r * 0.5
      const osColor = getOsFamilyColor(osFamily)

      visual.append("circle")
        .attr("cx", osBadgeX)
        .attr("cy", osBadgeY)
        .attr("r", osBadgeR)
        .attr("fill", "#0f172a")
        .attr("stroke", osColor)
        .attr("stroke-width", 1)

      visual.append("path")
        .attr("d", osIconPath)
        .attr(
          "transform",
          `translate(${osBadgeX - 5.5}, ${osBadgeY - 5.5}) scale(0.46)`
        )
        .attr("fill", osColor)
        .attr("fill-opacity", 0.9)
        .attr("stroke", "none")
        .attr("pointer-events", "none")
    }

    // Protocol ring (DPI enrichment)
    const protocols = d.protocols as Record<string, number> | undefined
    if (protocols && Object.keys(protocols).length > 0) {
      renderProtocolRing(visual, r, protocols)
    }

    // Primary label (outside visual group — scaled independently by semantic zoom)
    const primaryOffset = protocols ? 20 : 14
    if (d.signalType !== "connection") {
      g.append("text")
        .attr("class", "primary-label")
        .attr("dy", r + primaryOffset)
        .attr("data-r", r)
        .attr("data-offset", primaryOffset)
        .attr("text-anchor", "middle")
        .attr("fill", "#94a3b8")
        .attr("font-size", "11px")
        .attr("pointer-events", "none")
        .text(d.name.length > 20 ? d.name.slice(0, 18) + "..." : d.name)

      // Secondary detail (IP/MAC) — revealed by semantic zoom
      const detail = getNodeDetailText(d)
      if (detail) {
        const detailOffset = protocols ? 33 : 27
        g.append("text")
          .attr("class", "detail-label")
          .attr("dy", r + detailOffset)
          .attr("data-r", r)
          .attr("data-offset", detailOffset)
          .attr("text-anchor", "middle")
          .attr("fill", "#64748b")
          .attr("font-size", "9px")
          .attr("pointer-events", "none")
          .attr("opacity", 0)
          .text(detail)
      }
    } else {
      // Connection label — revealed by semantic zoom
      g.append("text")
        .attr("class", "connection-label")
        .attr("dy", r + 10)
        .attr("data-r", r)
        .attr("data-offset", 10)
        .attr("text-anchor", "middle")
        .attr("fill", "#64748b")
        .attr("font-size", "9px")
        .attr("pointer-events", "none")
        .attr("opacity", 0)
        .text(d.name.length > 24 ? d.name.slice(0, 22) + "..." : d.name)
    }
  })
}

function getNodeDetailText(d: SimNode): string {
  const ip = d.ip as string | undefined
  const mac = d.mac as string | undefined
  if (ip) return ip
  if (mac) return mac
  return ""
}

export function renderProtocolRing(
  g: d3.Selection<SVGGElement, any, any, unknown>,
  nodeRadius: number,
  protocols: Record<string, number>,
  insertBeforeText = false
): void {
  const entries = Object.entries(protocols).sort(([, a], [, b]) => b - a)
  const total = entries.reduce((sum, [, count]) => sum + count, 0)
  if (total === 0) return

  const ringInner = nodeRadius + 4
  const ringOuter = nodeRadius + 8

  const arc = d3
    .arc<d3.PieArcDatum<{ name: string; value: number }>>()
    .innerRadius(ringInner)
    .outerRadius(ringOuter)

  const pie = d3
    .pie<{ name: string; value: number }>()
    .value((d) => d.value)
    .sort(null)
    .padAngle(0.04)

  const data = entries.map(([name, value]) => ({ name, value }))
  const arcs = pie(data)

  const ringGroup = (insertBeforeText ? g.insert("g", "text") : g.append("g"))
    .attr("class", "protocol-ring")
    .attr("pointer-events", "none")

  ringGroup
    .selectAll("path")
    .data(arcs)
    .enter()
    .append("path")
    .attr("d", arc as any)
    .attr("fill", (d) => getProtocolColor(d.data.name))
    .attr("opacity", 0.85)
}
