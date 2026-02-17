import { useEffect, useRef, useCallback } from "react"
import * as d3 from "d3"
import type { NetworkNode, NetworkEdge, SubnetInfo } from "@/types"
import type { SimNode, SimEdge } from "@/visualization/renderers"
import { renderNode, renderProtocolRing, getNodeRadius } from "@/visualization/renderers"
import { getNodeColor, getStatusOpacity } from "@/visualization/colors"
import { createSimulation, type LayoutMode } from "@/visualization/force-layout"
import { buildClusterGroups, updateClusterBounds } from "@/visualization/cluster-renderer"

interface UseD3SimulationOptions {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  layoutMode: LayoutMode
  onNodeHover: (node: NetworkNode | null, x: number, y: number) => void
  onNodeClick: (node: NetworkNode | null) => void
  showSubnetGroups: boolean
  getSubnetForIp: (ip: string) => SubnetInfo | undefined
  showTrafficFlow: boolean
}

export function useD3Simulation({
  nodes,
  edges,
  layoutMode,
  onNodeHover,
  onNodeClick,
  showSubnetGroups,
  getSubnetForIp,
  showTrafficFlow,
}: UseD3SimulationOptions) {
  const svgRef = useRef<SVGSVGElement>(null)
  const simRef = useRef<d3.Simulation<SimNode, SimEdge>>()
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown>>()
  const prevLayoutRef = useRef<LayoutMode>(layoutMode)
  const prevSubnetToggleRef = useRef(showSubnetGroups)
  const zoomScaleRef = useRef(1)
  const getSubnetForIpRef = useRef(getSubnetForIp)
  getSubnetForIpRef.current = getSubnetForIp

  const updateGraph = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return

    const width = svg.clientWidth
    const height = svg.clientHeight
    const root = d3.select(svg)

    // Convert nodes/edges to simulation format, preserving existing positions
    const simNodes: SimNode[] = nodes.map((n) => {
      const existing = simRef.current
        ?.nodes()
        .find((sn) => sn.id === n.id)
      return {
        ...n,
        x: existing?.x ?? width / 2 + (Math.random() - 0.5) * 100,
        y: existing?.y ?? height / 2 + (Math.random() - 0.5) * 100,
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0,
        fx: n.signalType === "this_device"
          ? (existing?.fx ?? width / 2)
          : (existing?.fx ?? undefined),
        fy: n.signalType === "this_device"
          ? (existing?.fy ?? height / 2)
          : (existing?.fy ?? undefined),
      }
    })

    const simEdges: SimEdge[] = edges
      .filter(
        (e) =>
          simNodes.some((n) => n.id === e.source) &&
          simNodes.some((n) => n.id === e.target)
      )
      .map((e) => ({ ...e, source: e.source, target: e.target, bytesPerSec: e.bytesPerSec }))

    // Get or create the g container (once)
    let container = root.select<SVGGElement>("g.graph-container")
    if (container.empty()) {
      const defs = root.append("defs")

      const filter = defs
        .append("filter")
        .attr("id", "glow")
        .attr("x", "-50%")
        .attr("y", "-50%")
        .attr("width", "200%")
        .attr("height", "200%")
      filter
        .append("feGaussianBlur")
        .attr("stdDeviation", "4")
        .attr("result", "blur")
      const merge = filter.append("feMerge")
      merge.append("feMergeNode").attr("in", "blur")
      merge.append("feMergeNode").attr("in", "SourceGraphic")

      container = root.append("g").attr("class", "graph-container")
      container.append("g").attr("class", "clusters")
      container.append("g").attr("class", "edges")
      container.append("g").attr("class", "nodes")

      const zoom = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 5])
        .on("zoom", (event) => {
          container.attr("transform", event.transform)
          zoomScaleRef.current = event.transform.k
          applySemanticZoom(container, event.transform.k)
        })
      root.call(zoom)
      zoomRef.current = zoom
    }

    // Only recreate simulation when layout mode changes (or on first run)
    const layoutChanged = layoutMode !== prevLayoutRef.current
    prevLayoutRef.current = layoutMode

    if (layoutChanged || !simRef.current) {
      simRef.current?.stop()
      simRef.current = createSimulation(width, height, layoutMode)
    }

    const simulation = simRef.current

    // Manage cluster force based on toggle
    const subnetToggleChanged = showSubnetGroups !== prevSubnetToggleRef.current
    prevSubnetToggleRef.current = showSubnetGroups

    if (showSubnetGroups) {
      // Add or update the cluster force
      simulation.force("cluster", createClusterForce(getSubnetForIpRef))
    } else {
      simulation.force("cluster", null)
      // Clear cluster visuals when toggled off
      if (subnetToggleChanged) {
        container
          .select<SVGGElement>("g.clusters")
          .selectAll("*")
          .transition()
          .duration(400)
          .attr("opacity", 0)
          .remove()
      }
    }

    simulation.nodes(simNodes)

    const linkForce = simulation.force<d3.ForceLink<SimNode, SimEdge>>("link")
    if (linkForce) linkForce.links(simEdges)

    // Edges
    const edgeSelection = container
      .select<SVGGElement>("g.edges")
      .selectAll<SVGLineElement, SimEdge>("line")
      .data(simEdges, (d) => d.id)

    edgeSelection.exit().remove()

    const edgeEnter = edgeSelection
      .enter()
      .append("line")
      .attr("stroke", "#334155")
      .attr("stroke-width", 1)
      .attr("stroke-opacity", 0.4)

    const allEdges = edgeEnter.merge(edgeSelection)

    // Traffic flow styling
    allEdges.each(function (d) {
      const el = d3.select(this)
      const bps = d.bytesPerSec ?? 0

      if (showTrafficFlow && bps > 0) {
        // Log scale for stroke width: 1px at ~100 B/s, 5px at ~10 MB/s
        const logBps = Math.log10(Math.max(bps, 1))
        const width = Math.min(5, Math.max(1, logBps - 1))

        // Color tiers: gray → cyan → bright cyan by bandwidth
        let color: string
        if (bps < 1000) color = "#475569"         // < 1 KB/s — dim
        else if (bps < 100000) color = "#0891b2"   // < 100 KB/s — teal
        else if (bps < 1000000) color = "#06b6d4"  // < 1 MB/s — cyan
        else color = "#22d3ee"                      // 1 MB/s+ — bright cyan

        // Speed: faster flow for higher bandwidth
        const duration = Math.max(0.2, 1.5 - logBps * 0.2)

        el.attr("stroke", color)
          .attr("stroke-width", width)
          .attr("stroke-opacity", 0.7)
          .attr("stroke-dasharray", "6 4")
          .attr("class", "edge-flowing")
          .style("--flow-duration", `${duration}s`)
      } else {
        // Static default style
        el.attr("stroke", "#334155")
          .attr("stroke-width", 1)
          .attr("stroke-opacity", 0.4)
          .attr("stroke-dasharray", null)
          .attr("class", null)
          .style("--flow-duration", null)
      }
    })

    // Nodes
    const nodeSelection = container
      .select<SVGGElement>("g.nodes")
      .selectAll<SVGGElement, SimNode>("g.node")
      .data(simNodes, (d) => d.id)

    nodeSelection.exit().transition().duration(500).attr("opacity", 0).remove()

    const nodeEnter = nodeSelection
      .enter()
      .append("g")
      .attr("class", "node")
      .attr("cursor", "pointer")

    // Render shapes on newly entering nodes
    renderNode(nodeEnter)
    nodeEnter.attr("data-icon-key", (d) => (d.iconKey as string) ?? "")

    // Re-render existing nodes only when their iconKey changes (late enrichment)
    nodeSelection.each(function (d) {
      const prev = this.getAttribute("data-icon-key") ?? ""
      const curr = (d.iconKey as string) ?? ""
      if (prev !== curr) {
        renderNode(d3.select<SVGGElement, SimNode>(this))
        this.setAttribute("data-icon-key", curr)
      }
    })

    // Re-render protocol ring when packet stats change
    nodeSelection.each(function (d) {
      const protocols = d.protocols as Record<string, number> | undefined
      const curr = protocols
        ? Object.entries(protocols).map(([k, v]) => `${k}:${v}`).sort().join(",")
        : ""
      const prev = this.getAttribute("data-protocols-hash") ?? ""
      if (prev !== curr) {
        const sel = d3.select<SVGGElement, SimNode>(this)
        const visual = sel.select<SVGGElement>(".node-visual")
        visual.select(".protocol-ring").remove()
        if (protocols && Object.keys(protocols).length > 0) {
          renderProtocolRing(visual, getNodeRadius(d), protocols)
        }
        this.setAttribute("data-protocols-hash", curr)
      }
    })

    const allNodes = nodeEnter.merge(nodeSelection)

    // Bind drag on all nodes — look up live sim node by ID so that
    // mid-drag data updates (which replace node objects) don't break dragging
    allNodes.call(
      d3
        .drag<SVGGElement, SimNode>()
        .on("start", (_event, d) => {
          if (!_event.active) simRef.current!.alphaTarget(0.3).restart()
          const live = simRef.current!.nodes().find((n) => n.id === d.id) ?? d
          live.fx = live.x
          live.fy = live.y
        })
        .on("drag", (event, d) => {
          const live = simRef.current!.nodes().find((n) => n.id === d.id) ?? d
          live.fx = event.x
          live.fy = event.y
        })
        .on("end", (_event, d) => {
          if (!_event.active) simRef.current!.alphaTarget(0)
          if (d.signalType !== "this_device") {
            const live = simRef.current!.nodes().find((n) => n.id === d.id) ?? d
            live.fx = null
            live.fy = null
          }
        })
    )

    // Update glow filter on existing nodes for status changes
    allNodes.each(function (d) {
      if (d.signalType === "this_device") return
      d3.select(this)
        .select("circle, rect, polygon")
        .attr("filter", d.status === "active" ? "url(#glow)" : null)
    })

    // Opacity based on status
    allNodes
      .transition()
      .duration(300)
      .attr("opacity", (d) => getStatusOpacity(d.status))

    // Events
    allNodes
      .on("mouseenter", function (event, d) {
        onNodeHover(d as unknown as NetworkNode, event.pageX, event.pageY)
      })
      .on("mouseleave", () => onNodeHover(null, 0, 0))
      .on("click", (_event, d) =>
        onNodeClick(d as unknown as NetworkNode)
      )

    // Tick
    const clusterLayer = container.select<SVGGElement>("g.clusters")
    simulation.on("tick", () => {
      allEdges
        .attr("x1", (d) => (d.source as SimNode).x!)
        .attr("y1", (d) => (d.source as SimNode).y!)
        .attr("x2", (d) => (d.target as SimNode).x!)
        .attr("y2", (d) => (d.target as SimNode).y!)

      allNodes.attr("transform", (d) => `translate(${d.x},${d.y})`)

      // Update subnet cluster bounding boxes
      if (showSubnetGroups) {
        const groups = buildClusterGroups(simNodes, getSubnetForIpRef.current)
        updateClusterBounds(clusterLayer, groups)
      }
    })

    // Apply semantic zoom styling to newly created/updated elements
    applySemanticZoom(container, zoomScaleRef.current)

    // Higher alpha for layout/toggle changes, gentle settle for data updates
    const needsRestart = layoutChanged || subnetToggleChanged
    simulation.alpha(needsRestart ? 0.5 : 0.1).restart()
  }, [nodes, edges, layoutMode, onNodeHover, onNodeClick, showSubnetGroups, showTrafficFlow])

  useEffect(() => {
    updateGraph()
    return () => {
      simRef.current?.stop()
    }
  }, [updateGraph])

  // Handle window/container resize (e.g. fullscreen)
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const observer = new ResizeObserver(() => {
      const width = svg.clientWidth
      const height = svg.clientHeight
      if (!width || !height) return

      const sim = simRef.current
      if (!sim) return

      // Update center force to new dimensions
      const centerForce = sim.force<d3.ForceCenter<SimNode>>("center")
      if (centerForce) {
        centerForce.x(width / 2).y(height / 2)
      }

      // Update radial/x/y forces if present
      const radialForce = sim.force("radial") as d3.ForceRadial<SimNode> | null
      if (radialForce) {
        radialForce.x(width / 2).y(height / 2)
      }

      // Update this_device fixed position only if it hasn't been manually dragged
      for (const node of sim.nodes()) {
        if (node.signalType === "this_device" && node.fx != null && node.fy != null) {
          // Keep it pinned but don't force back to center — user may have dragged it
          break
        }
      }

      sim.alpha(0.3).restart()
    })

    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  const zoomIn = useCallback(() => {
    const svg = svgRef.current
    if (!svg || !zoomRef.current) return
    d3.select(svg)
      .transition()
      .duration(300)
      .call(zoomRef.current.scaleBy, 1.3)
  }, [])

  const zoomOut = useCallback(() => {
    const svg = svgRef.current
    if (!svg || !zoomRef.current) return
    d3.select(svg)
      .transition()
      .duration(300)
      .call(zoomRef.current.scaleBy, 0.7)
  }, [])

  const resetZoom = useCallback(() => {
    const svg = svgRef.current
    if (!svg || !zoomRef.current) return
    d3.select(svg)
      .transition()
      .duration(500)
      .call(zoomRef.current.transform, d3.zoomIdentity)
  }, [])

  return { svgRef, zoomIn, zoomOut, resetZoom }
}

/**
 * Semantic zoom: dampens text and shape scaling, counter-scales label offsets,
 * and progressively reveals detail labels based on zoom level.
 */
function applySemanticZoom(
  container: d3.Selection<SVGGElement, unknown, null, undefined>,
  k: number
) {
  // Counter-scale: text grows with ~sqrt of zoom instead of linearly
  const textScale = 1 / Math.pow(k, 0.55)
  // Subtle shape counter-scale (only when zoomed in)
  const shapeScale = k > 1 ? 1 / Math.pow(k, 0.2) : 1

  // Scale node visuals (shapes, badges, rings) slightly less than geometric
  container
    .selectAll<SVGGElement, SimNode>("g.node .node-visual")
    .attr("transform", shapeScale < 1 ? `scale(${shapeScale})` : null)

  // Helper: counter-scale label dy so text stays close to the (shrinking) shape
  function adjustDy(el: SVGTextElement, defaultR: number, defaultOffset: number) {
    const r = parseFloat(el.getAttribute("data-r") || String(defaultR))
    const offset = parseFloat(el.getAttribute("data-offset") || String(defaultOffset))
    if (k > 1) {
      el.setAttribute("dy", String(r * shapeScale + offset * textScale))
    } else {
      el.setAttribute("dy", String(r + offset))
    }
  }

  // Primary labels: dampen font scaling and dy, hide when very zoomed out
  container
    .selectAll<SVGTextElement, SimNode>("g.node .primary-label")
    .attr("font-size", `${11 * textScale}px`)
    .attr("opacity", k < 0.4 ? 0 : null)
    .each(function () { adjustDy(this, 12, 14) })

  // Detail labels (IP/MAC): fade in when zoomed past ~1.8x
  const detailOpacity = k >= 1.8 ? Math.min(0.8, (k - 1.5) * 0.6) : 0
  container
    .selectAll<SVGTextElement, SimNode>("g.node .detail-label")
    .attr("font-size", `${9 * textScale}px`)
    .attr("opacity", detailOpacity)
    .each(function () { adjustDy(this, 12, 27) })

  // Connection labels: fade in when zoomed past ~2.2x
  const connOpacity = k >= 2.2 ? Math.min(0.7, (k - 2.0) * 0.5) : 0
  container
    .selectAll<SVGTextElement, SimNode>("g.node .connection-label")
    .attr("font-size", `${9 * textScale}px`)
    .attr("opacity", connOpacity)
    .each(function () { adjustDy(this, 6, 10) })
}

/** Custom D3 force that pulls LAN nodes toward their subnet group centroid */
function createClusterForce(
  getSubnetForIpRef: React.RefObject<(ip: string) => SubnetInfo | undefined>
) {
  const strength = 0.12
  let nodes: SimNode[] = []

  function force(alpha: number) {
    // Group LAN nodes by subnet
    const groups = new Map<string, SimNode[]>()
    for (const node of nodes) {
      if (node.signalType !== "lan" || !node.ip) continue
      const subnet = getSubnetForIpRef.current(node.ip as string)
      if (!subnet) continue
      let group = groups.get(subnet.cidr)
      if (!group) {
        group = []
        groups.set(subnet.cidr, group)
      }
      group.push(node)
    }

    // Apply centroid attraction
    for (const group of groups.values()) {
      if (group.length <= 1) continue
      const cx = group.reduce((s, n) => s + (n.x ?? 0), 0) / group.length
      const cy = group.reduce((s, n) => s + (n.y ?? 0), 0) / group.length
      for (const node of group) {
        node.vx! += (cx - (node.x ?? 0)) * strength * alpha
        node.vy! += (cy - (node.y ?? 0)) * strength * alpha
      }
    }
  }

  force.initialize = (n: SimNode[]) => {
    nodes = n
  }

  return force
}
