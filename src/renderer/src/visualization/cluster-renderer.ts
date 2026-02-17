import * as d3 from "d3"
import type { SimNode } from "./renderers"
import type { SubnetInfo } from "@/types"

export interface ClusterGroup {
  cidr: string
  interface: string
  nodes: SimNode[]
}

const PAD = 28
const LABEL_H = 18

export function buildClusterGroups(
  simNodes: SimNode[],
  getSubnetForIp: (ip: string) => SubnetInfo | undefined
): ClusterGroup[] {
  const groups = new Map<string, ClusterGroup>()

  for (const node of simNodes) {
    if (node.signalType !== "lan" || !node.ip) continue
    const subnet = getSubnetForIp(node.ip as string)
    if (!subnet) continue

    let group = groups.get(subnet.cidr)
    if (!group) {
      group = { cidr: subnet.cidr, interface: subnet.interface, nodes: [] }
      groups.set(subnet.cidr, group)
    }
    group.nodes.push(node)
  }

  // Only return groups with at least 2 nodes (single-node groups aren't useful)
  return Array.from(groups.values()).filter((g) => g.nodes.length >= 2)
}

export function updateClusterBounds(
  layer: d3.Selection<SVGGElement, unknown, null, undefined>,
  groups: ClusterGroup[]
): void {
  const rects = layer
    .selectAll<SVGGElement, ClusterGroup>("g.cluster-group")
    .data(groups, (d) => d.cidr)

  // Exit
  rects.exit().transition("cluster-exit").duration(400).attr("opacity", 0).remove()

  // Enter
  const enter = rects
    .enter()
    .append("g")
    .attr("class", "cluster-group")
    .attr("pointer-events", "none")
    .attr("opacity", 0)

  enter
    .append("rect")
    .attr("rx", 12)
    .attr("fill", "rgba(20, 184, 166, 0.06)")
    .attr("stroke", "rgba(20, 184, 166, 0.16)")
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", "4 3")

  enter
    .append("text")
    .attr("fill", "rgba(20, 184, 166, 0.65)")
    .attr("font-size", "10px")
    .attr("font-family", "ui-monospace, monospace")
    .attr("pointer-events", "none")

  enter.transition("cluster-enter").duration(400).attr("opacity", 1)

  // Update bounds on all (enter + existing)
  const all = enter.merge(rects)

  all.each(function (d) {
    if (d.nodes.length === 0) return
    const xs = d.nodes.map((n) => n.x ?? 0)
    const ys = d.nodes.map((n) => n.y ?? 0)
    const x0 = Math.min(...xs) - PAD
    const y0 = Math.min(...ys) - PAD - LABEL_H
    const x1 = Math.max(...xs) + PAD
    const y1 = Math.max(...ys) + PAD

    d3.select(this)
      .select("rect")
      .attr("x", x0)
      .attr("y", y0)
      .attr("width", Math.max(x1 - x0, 60))
      .attr("height", Math.max(y1 - y0, 40))

    d3.select(this)
      .select("text")
      .attr("x", x0 + 8)
      .attr("y", y0 + 12)
      .text(`${d.cidr}  ${d.interface}`)
  })
}
