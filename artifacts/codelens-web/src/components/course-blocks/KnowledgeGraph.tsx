"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { DirectedGraph } from "graphology";
import Sigma from "sigma";
import type { V2OverviewGraph } from "@/lib/course-types";
import {
  buildVisualizationData,
  type GraphNode,
  type ClusterInfo,
} from "@/lib/graph-utils";

interface KnowledgeGraphProps {
  overviewGraph: V2OverviewGraph;
  onModuleClick: (moduleIndex: number) => void;
}

export function KnowledgeGraph({ overviewGraph, onModuleClick }: KnowledgeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const graphRef = useRef<DirectedGraph | null>(null);
  const [search, setSearch] = useState("");
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{ relation: string; from: string; to: string; description?: string } | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [showMinimap, setShowMinimap] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const minimapDrawRef = useRef<(() => void) | null>(null);
  const dragStateRef = useRef<{ node: string; active: boolean } | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const vizData = useMemo(
    () => buildVisualizationData(overviewGraph),
    [overviewGraph]
  );

  const initGraph = useCallback(() => {
    if (!containerRef.current || vizData.nodes.length === 0) return;

    if (sigmaRef.current) {
      sigmaRef.current.kill();
      sigmaRef.current = null;
    }

    const graph = new DirectedGraph();

    for (const node of vizData.nodes) {
      graph.addNode(node.id, {
        label: node.label,
        x: node.x,
        y: node.y,
        size: node.size,
        color: node.color,
        moduleIndex: node.moduleIndex,
        connections: node.connections,
        cluster: node.cluster,
        betweenness: node.betweenness,
        description: node.description || "",
        fileCount: node.fileCount || 0,
        originalColor: node.color,
        originalSize: node.size,
      });
    }

    for (const edge of vizData.edges) {
      if (
        graph.hasNode(edge.source) &&
        graph.hasNode(edge.target) &&
        !graph.hasEdge(edge.source, edge.target)
      ) {
        graph.addEdge(edge.source, edge.target, {
          label: edge.label,
          relation: edge.relation,
          color: edge.color,
          size: 1.5,
          type: "arrow",
        });
      }
    }

    graphRef.current = graph;

    const sigma = new Sigma(graph, containerRef.current, {
      renderEdgeLabels: false,
      enableEdgeEvents: true,
      defaultEdgeType: "arrow",
      labelSize: 12,
      labelWeight: "bold",
      labelColor: { color: "#374151" },
      labelFont: "Inter, system-ui, sans-serif",
      stagePadding: 40,
      defaultNodeColor: "#6366f1",
      defaultEdgeColor: "#d1d5db",
      minCameraRatio: 0.2,
      maxCameraRatio: 5,
      labelDensity: 0.07,
      labelGridCellSize: 150,
      labelRenderedSizeThreshold: 9,
    });

    sigma.on("enterNode", ({ node, event }) => {
      if (dragStateRef.current?.active) return;
      const attrs = graph.getNodeAttributes(node);
      const nodeData: GraphNode = {
        id: node,
        label: attrs.label,
        moduleIndex: attrs.moduleIndex,
        connections: attrs.connections,
        x: attrs.x,
        y: attrs.y,
        size: attrs.size,
        color: attrs.originalColor,
        cluster: attrs.cluster,
        betweenness: attrs.betweenness ?? 0,
        description: attrs.description || "",
        fileCount: attrs.fileCount || 0,
      };
      setHoveredNode(nodeData);
      setHoveredEdge(null);
      setTooltipPos({ x: event.x, y: event.y });

      graph.forEachNode((n) => {
        if (n === node || graph.hasEdge(node, n) || graph.hasEdge(n, node)) {
          graph.setNodeAttribute(n, "color", graph.getNodeAttribute(n, "originalColor"));
          graph.setNodeAttribute(n, "size", graph.getNodeAttribute(n, "originalSize") * 1.2);
        } else {
          graph.setNodeAttribute(n, "color", "#e5e7eb");
          graph.setNodeAttribute(n, "size", graph.getNodeAttribute(n, "originalSize") * 0.8);
        }
      });
      graph.setNodeAttribute(node, "size", attrs.originalSize * 1.5);

      graph.forEachEdge((e, _eAttrs, src, tgt) => {
        if (src === node || tgt === node) {
          graph.setEdgeAttribute(e, "color", graph.getNodeAttribute(src, "originalColor") + "cc");
          graph.setEdgeAttribute(e, "size", 3);
        } else {
          graph.setEdgeAttribute(e, "color", "#e5e7eb40");
          graph.setEdgeAttribute(e, "size", 0.5);
        }
      });

      sigma.refresh();
    });

    sigma.on("leaveNode", () => {
      if (dragStateRef.current?.active) return;
      setHoveredNode(null);
      graph.forEachNode((n) => {
        graph.setNodeAttribute(n, "color", graph.getNodeAttribute(n, "originalColor"));
        graph.setNodeAttribute(n, "size", graph.getNodeAttribute(n, "originalSize"));
      });
      graph.forEachEdge((e) => {
        const src = graph.source(e);
        graph.setEdgeAttribute(e, "color", graph.getNodeAttribute(src, "originalColor") + "60");
        graph.setEdgeAttribute(e, "size", 1.5);
      });
      sigma.refresh();
    });

    sigma.on("enterEdge", ({ edge, event }) => {
      const attrs = graph.getEdgeAttributes(edge);
      const src = graph.source(edge);
      const tgt = graph.target(edge);
      setHoveredEdge({
        relation: attrs.relation || attrs.label || "",
        from: graph.getNodeAttribute(src, "label") || src,
        to: graph.getNodeAttribute(tgt, "label") || tgt,
        description: attrs.label || attrs.relation || "",
      });
      setHoveredNode(null);
      setTooltipPos({ x: event.x, y: event.y });
    });

    sigma.on("leaveEdge", () => {
      setHoveredEdge(null);
    });

    sigma.on("clickNode", ({ node }) => {
      if (dragStateRef.current?.active) return;
      const attrs = graph.getNodeAttributes(node);
      if (typeof attrs.moduleIndex === "number") {
        onModuleClick(attrs.moduleIndex);
      }
    });

    sigma.on("downNode", ({ node }) => {
      dragStateRef.current = { node, active: false };
    });

    sigma.getMouseCaptor().on("mousemovebody", (e) => {
      if (!dragStateRef.current) return;
      dragStateRef.current.active = true;
      const pos = sigma.viewportToGraph(e);
      graph.setNodeAttribute(dragStateRef.current.node, "x", pos.x);
      graph.setNodeAttribute(dragStateRef.current.node, "y", pos.y);
      e.preventSigmaDefault();
      e.original.preventDefault();
      e.original.stopPropagation();
    });

    const handleMouseUp = () => {
      dragStateRef.current = null;
    };
    sigma.getMouseCaptor().on("mouseup", handleMouseUp);

    sigma.getCamera().on("updated", () => {
      minimapDrawRef.current?.();
    });

    sigmaRef.current = sigma;
  }, [vizData, onModuleClick]);

  useEffect(() => {
    initGraph();
    return () => {
      if (sigmaRef.current) {
        sigmaRef.current.kill();
        sigmaRef.current = null;
      }
    };
  }, [initGraph]);

  useEffect(() => {
    const graph = graphRef.current;
    const sigma = sigmaRef.current;
    if (!graph || !sigma) return;

    const searchLower = search.toLowerCase().trim();

    if (!searchLower) {
      graph.forEachNode((n) => {
        graph.setNodeAttribute(n, "color", graph.getNodeAttribute(n, "originalColor"));
        graph.setNodeAttribute(n, "size", graph.getNodeAttribute(n, "originalSize"));
      });
      graph.forEachEdge((e) => {
        const src = graph.source(e);
        graph.setEdgeAttribute(e, "color", graph.getNodeAttribute(src, "originalColor") + "60");
        graph.setEdgeAttribute(e, "size", 1.5);
      });
      sigma.refresh();
      minimapDrawRef.current?.();
      return;
    }

    const matchingNodes = new Set<string>();
    graph.forEachNode((n) => {
      const label = (graph.getNodeAttribute(n, "label") || "").toLowerCase();
      if (label.includes(searchLower)) {
        matchingNodes.add(n);
      }
    });

    graph.forEachNode((n) => {
      if (matchingNodes.has(n)) {
        graph.setNodeAttribute(n, "color", graph.getNodeAttribute(n, "originalColor"));
        graph.setNodeAttribute(n, "size", graph.getNodeAttribute(n, "originalSize") * 1.3);
      } else {
        graph.setNodeAttribute(n, "color", "#e5e7eb");
        graph.setNodeAttribute(n, "size", graph.getNodeAttribute(n, "originalSize") * 0.6);
      }
    });

    graph.forEachEdge((e) => {
      const src = graph.source(e);
      const tgt = graph.target(e);
      if (matchingNodes.has(src) || matchingNodes.has(tgt)) {
        graph.setEdgeAttribute(e, "color", graph.getNodeAttribute(src, "originalColor") + "aa");
        graph.setEdgeAttribute(e, "size", 2);
      } else {
        graph.setEdgeAttribute(e, "color", "#e5e7eb30");
        graph.setEdgeAttribute(e, "size", 0.5);
      }
    });

    sigma.refresh();

    if (matchingNodes.size === 1) {
      const [nodeId] = matchingNodes;
      const nodeX = graph.getNodeAttribute(nodeId, "x") as number;
      const nodeY = graph.getNodeAttribute(nodeId, "y") as number;
      const viewportCenter = sigma.framedGraphToViewport({ x: 0.5, y: 0.5 });
      const nodeViewport = sigma.graphToViewport({ x: nodeX, y: nodeY });
      const dx = nodeViewport.x - viewportCenter.x;
      const dy = nodeViewport.y - viewportCenter.y;
      const camera = sigma.getCamera();
      const state = camera.getState();
      const container = containerRef.current;
      if (container) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        camera.animate(
          {
            x: state.x + (dx / w) * state.ratio,
            y: state.y + (dy / h) * state.ratio,
            ratio: 0.5,
          },
          { duration: 300 }
        );
      }
    }

    minimapDrawRef.current?.();
  }, [search]);

  const handleResetZoom = useCallback(() => {
    sigmaRef.current?.getCamera().animate(
      { x: 0.5, y: 0.5, ratio: 1 },
      { duration: 300 }
    );
  }, []);

  const handleZoomIn = useCallback(() => {
    const camera = sigmaRef.current?.getCamera();
    if (camera) {
      const state = camera.getState();
      camera.animate({ ratio: state.ratio / 1.5 }, { duration: 200 });
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    const camera = sigmaRef.current?.getCamera();
    if (camera) {
      const state = camera.getState();
      camera.animate({ ratio: state.ratio * 1.5 }, { duration: 200 });
    }
  }, []);

  if (vizData.nodes.length === 0) {
    return null;
  }

  return (
    <div className="kg-container">
      <div className="kg-toolbar">
        <div className="kg-search-wrapper">
          <svg className="kg-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="kg-search-input"
            placeholder="Search nodes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search graph nodes"
          />
          {search && (
            <button
              className="kg-search-clear"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <div className="kg-zoom-controls">
          <button onClick={handleZoomIn} className="kg-zoom-btn" aria-label="Zoom in" title="Zoom in">+</button>
          <button onClick={handleZoomOut} className="kg-zoom-btn" aria-label="Zoom out" title="Zoom out">−</button>
          <button onClick={handleResetZoom} className="kg-zoom-btn" aria-label="Reset view" title="Reset view">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              <polyline points="23 1 23 10 14 10" />
              <polyline points="1 23 1 14 10 14" />
            </svg>
          </button>
          {!isMobile && (
            <button
              onClick={() => setShowMinimap(!showMinimap)}
              className={`kg-zoom-btn ${showMinimap ? "kg-zoom-btn-active" : ""}`}
              aria-label="Toggle minimap"
              title="Toggle minimap"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <rect x="13" y="13" width="6" height="6" rx="1" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="kg-graph-wrapper">
        <ClusterHulls clusters={vizData.clusters} sigmaRef={sigmaRef} containerRef={containerRef} />
        <div ref={containerRef} className="kg-graph-canvas" />

        {(hoveredNode || hoveredEdge) && (
          <div
            className="kg-tooltip"
            style={{
              left: Math.min(tooltipPos.x + 12, (containerRef.current?.clientWidth ?? 400) - 240),
              top: Math.min(tooltipPos.y + 12, (containerRef.current?.clientHeight ?? 300) - 120),
            }}
          >
            {hoveredNode && (
              <>
                <div className="kg-tooltip-title">
                  <span className="kg-tooltip-dot" style={{ background: hoveredNode.color }} />
                  {hoveredNode.label}
                </div>
                {hoveredNode.description && (
                  <div className="kg-tooltip-desc">{hoveredNode.description}</div>
                )}
                <div className="kg-tooltip-meta">
                  Module {hoveredNode.moduleIndex + 1}
                </div>
                <div className="kg-tooltip-meta">
                  {hoveredNode.connections} connection{hoveredNode.connections !== 1 ? "s" : ""}
                </div>
                {(hoveredNode.fileCount ?? 0) > 0 && (
                  <div className="kg-tooltip-meta">
                    {hoveredNode.fileCount} file{(hoveredNode.fileCount ?? 0) !== 1 ? "s" : ""}
                  </div>
                )}
                <div className="kg-tooltip-hint">Click to navigate · Drag to reposition</div>
              </>
            )}
            {hoveredEdge && (
              <>
                <div className="kg-tooltip-title">{hoveredEdge.relation}</div>
                {hoveredEdge.description && hoveredEdge.description !== hoveredEdge.relation && (
                  <div className="kg-tooltip-desc">{hoveredEdge.description}</div>
                )}
                <div className="kg-tooltip-meta">
                  {hoveredEdge.from} → {hoveredEdge.to}
                </div>
              </>
            )}
          </div>
        )}

        {showMinimap && !isMobile && (
          <MiniMap vizData={vizData} sigmaRef={sigmaRef} drawRef={minimapDrawRef} />
        )}
      </div>

      {vizData.clusters.length > 1 && (
        <div className="kg-legend">
          <span className="kg-legend-title">Clusters</span>
          <div className="kg-legend-items">
            {vizData.clusters.map((cluster) => (
              <div key={cluster.id} className="kg-legend-item">
                <span className="kg-legend-dot" style={{ background: cluster.color }} />
                <span className="kg-legend-label">
                  {cluster.name} ({cluster.nodeCount})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ClusterHulls({
  clusters,
  sigmaRef,
  containerRef,
}: {
  clusters: ClusterInfo[];
  sigmaRef: React.RefObject<Sigma | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const sigma = sigmaRef.current;
    if (!sigma || clusters.length < 2) return;

    const updateHulls = () => {
      const svg = svgRef.current;
      if (!svg || !containerRef.current) return;

      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      svg.setAttribute("width", String(w));
      svg.setAttribute("height", String(h));

      while (svg.firstChild) svg.removeChild(svg.firstChild);

      for (const cluster of clusters) {
        if (cluster.hull.length < 2) continue;

        const viewportPoints = cluster.hull.map((p) => {
          const vp = sigma.graphToViewport({ x: p.x, y: p.y });
          return vp;
        });

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const d = viewportPoints
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
          .join(" ") + " Z";
        path.setAttribute("d", d);
        path.setAttribute("fill", cluster.color + "12");
        path.setAttribute("stroke", cluster.color + "30");
        path.setAttribute("stroke-width", "1.5");
        path.setAttribute("stroke-linejoin", "round");
        svg.appendChild(path);

        const cx = viewportPoints.reduce((s, p) => s + p.x, 0) / viewportPoints.length;
        const minY = Math.min(...viewportPoints.map((p) => p.y));
        const labelY = minY - 6;

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", String(cx));
        text.setAttribute("y", String(labelY));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", cluster.color + "99");
        text.setAttribute("font-size", "10");
        text.setAttribute("font-family", "Inter, system-ui, sans-serif");
        text.setAttribute("font-weight", "600");
        text.textContent = cluster.name;
        svg.appendChild(text);
      }
    };

    updateHulls();

    sigma.getCamera().on("updated", updateHulls);
    const resizeOb = new ResizeObserver(updateHulls);
    if (containerRef.current) resizeOb.observe(containerRef.current);

    return () => {
      sigma.getCamera().removeListener("updated", updateHulls);
      resizeOb.disconnect();
    };
  }, [clusters, sigmaRef, containerRef]);

  if (clusters.length < 2) return null;

  return (
    <svg
      ref={svgRef}
      className="kg-cluster-hulls"
    />
  );
}

function MiniMap({
  vizData,
  sigmaRef,
  drawRef,
}: {
  vizData: { nodes: GraphNode[]; clusters: ClusterInfo[] };
  sigmaRef: React.RefObject<Sigma | null>;
  drawRef: React.MutableRefObject<(() => void) | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || vizData.nodes.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = 140;
    const h = 100;
    canvas.width = w * 2;
    canvas.height = h * 2;
    ctx.scale(2, 2);

    const xs = vizData.nodes.map((n) => n.x);
    const ys = vizData.nodes.map((n) => n.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const padding = 10;

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(249, 250, 251, 0.95)";
      ctx.fillRect(0, 0, w, h);

      for (const node of vizData.nodes) {
        const nx = padding + ((node.x - minX) / rangeX) * (w - padding * 2);
        const ny = padding + ((node.y - minY) / rangeY) * (h - padding * 2);
        ctx.beginPath();
        ctx.arc(nx, ny, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();
      }

      const sigma = sigmaRef.current;
      if (sigma) {
        const camera = sigma.getCamera();
        const state = camera.getState();
        const ratio = state.ratio || 1;

        const vw = (1 / ratio) * (w - padding * 2);
        const vh = (1 / ratio) * (h - padding * 2);
        const vx = padding + state.x * (w - padding * 2) - vw / 2;
        const vy = padding + state.y * (h - padding * 2) - vh / 2;

        ctx.strokeStyle = "rgba(99, 102, 241, 0.6)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(vx, vy, vw, vh);
      }
    };

    draw();
    drawRef.current = draw;

    return () => {
      drawRef.current = null;
    };
  }, [vizData, sigmaRef, drawRef]);

  return (
    <div className="kg-minimap">
      <canvas
        ref={canvasRef}
        style={{ width: 140, height: 100, borderRadius: 4 }}
      />
    </div>
  );
}
