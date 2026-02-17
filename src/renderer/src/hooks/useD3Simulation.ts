import { useEffect, useRef, useCallback } from "react"
import * as d3 from "d3"
import type { NetworkNode, NetworkEdge } from "@/types"
import type { SimNode, SimEdge } from "@/visualization/renderers"
import { renderNode, getNodeRadius } from "@/visualization/renderers"
import { getNodeColor, getStatusOpacity } from "@/visualization/colors"
import { createSimulation, type LayoutMode } from "@/visualization/force-layout"

interface UseD3SimulationOptions {
  nodes: NetworkNode[]
  edges: NetworkEdge[]
  layoutMode: LayoutMode
  onNodeHover: (node: NetworkNode | null, x: number, y: number) => void
  onNodeClick: (node: NetworkNode | null) => void
}

export function useD3Simulation({
  nodes,
  edges,
  layoutMode,
  onNodeHover,
  onNodeClick,
}: UseD3SimulationOptions) {
  const svgRef = useRef<SVGSVGElement>(null)
  const simRef = useRef<d3.Simulation<SimNode, SimEdge>>()
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown>>()
  const prevLayoutRef = useRef<LayoutMode>(layoutMode)

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
        fx: n.signalType === "this_device" ? width / 2 : undefined,
        fy: n.signalType === "this_device" ? height / 2 : undefined,
      }
    })

    const simEdges: SimEdge[] = edges
      .filter(
        (e) =>
          simNodes.some((n) => n.id === e.source) &&
          simNodes.some((n) => n.id === e.target)
      )
      .map((e) => ({ ...e, source: e.source, target: e.target }))

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
      container.append("g").attr("class", "edges")
      container.append("g").attr("class", "nodes")

      const zoom = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on("zoom", (event) => {
          container.attr("transform", event.transform)
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

    const allNodes = nodeEnter.merge(nodeSelection)

    // Bind drag on all nodes — uses simRef to always target current simulation
    allNodes.call(
      d3
        .drag<SVGGElement, SimNode>()
        .on("start", (_event, d) => {
          if (!_event.active) simRef.current!.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on("drag", (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on("end", (_event, d) => {
          if (!_event.active) simRef.current!.alphaTarget(0)
          if (d.signalType !== "this_device") {
            d.fx = null
            d.fy = null
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
    simulation.on("tick", () => {
      allEdges
        .attr("x1", (d) => (d.source as SimNode).x!)
        .attr("y1", (d) => (d.source as SimNode).y!)
        .attr("x2", (d) => (d.target as SimNode).x!)
        .attr("y2", (d) => (d.target as SimNode).y!)

      allNodes.attr("transform", (d) => `translate(${d.x},${d.y})`)
    })

    // Higher alpha for layout changes, gentle settle for data updates
    simulation.alpha(layoutChanged ? 0.5 : 0.1).restart()
  }, [nodes, edges, layoutMode, onNodeHover, onNodeClick])

  useEffect(() => {
    updateGraph()
    return () => {
      simRef.current?.stop()
    }
  }, [updateGraph])

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
