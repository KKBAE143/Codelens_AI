import Graph, { DirectedGraph, UndirectedGraph } from "graphology";
import louvain from "graphology-communities-louvain";
import forceAtlas2 from "graphology-layout-forceatlas2";
import betweennessCentrality from "graphology-metrics/centrality/betweenness";
import type { V2OverviewGraph } from "./course-types";

export interface GraphNode {
  id: string;
  label: string;
  moduleIndex: number;
  connections: number;
  x: number;
  y: number;
  size: number;
  color: string;
  cluster: number;
  betweenness: number;
  description?: string;
  fileCount?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  label?: string;
  color: string;
}

export interface ClusterInfo {
  id: number;
  color: string;
  name: string;
  nodeCount: number;
  hull: Array<{ x: number; y: number }>;
}

const CLUSTER_COLORS = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#3b82f6",
  "#84cc16",
  "#06b6d4",
  "#a855f7",
];

export function buildGraphologyGraph(overviewGraph: V2OverviewGraph) {
  const graph = new DirectedGraph();

  for (const node of overviewGraph.nodes) {
    if (!graph.hasNode(node.id)) {
      graph.addNode(node.id, {
        label: node.label,
        moduleIndex: node.moduleIndex,
        connections: node.connections,
        description: node.description || "",
        fileCount: node.fileCount || 0,
      });
    }
  }

  for (const edge of overviewGraph.edges) {
    if (
      graph.hasNode(edge.from) &&
      graph.hasNode(edge.to) &&
      edge.from !== edge.to &&
      !graph.hasEdge(edge.from, edge.to)
    ) {
      graph.addEdge(edge.from, edge.to, {
        relation: edge.relation,
        label: edge.label || edge.relation,
      });
    }
  }

  return graph;
}

export function detectCommunities(graph: Graph): Map<string, number> {
  const communities = new Map<string, number>();

  if (graph.order < 2) {
    graph.forEachNode((node) => communities.set(node, 0));
    return communities;
  }

  try {
    const undirected = new UndirectedGraph();
    graph.forEachNode((node, attrs) => {
      undirected.addNode(node, attrs);
    });
    graph.forEachEdge((_edge, _attrs, source, target) => {
      if (source !== target && !undirected.hasEdge(source, target)) {
        undirected.addEdge(source, target);
      }
    });

    if (undirected.size < 1) {
      undirected.forEachNode((node) => communities.set(node, 0));
      return communities;
    }

    const result = louvain(undirected);
    for (const [node, cluster] of Object.entries(result)) {
      communities.set(node, cluster as number);
    }
  } catch {
    graph.forEachNode((node) => communities.set(node, 0));
  }

  return communities;
}

function assignRandomPositions(graph: Graph): void {
  graph.forEachNode((node) => {
    graph.setNodeAttribute(node, "x", Math.random() * 100 - 50);
    graph.setNodeAttribute(node, "y", Math.random() * 100 - 50);
  });
}

function runForceAtlas2Layout(graph: Graph): void {
  assignRandomPositions(graph);

  if (graph.order < 2 || graph.size < 1) return;

  const n = graph.order;
  const iterations = n > 80 ? 150 : n > 40 ? 200 : 300;

  try {
    forceAtlas2.assign(graph, {
      iterations,
      settings: {
        gravity: 0.5,
        scalingRatio: 25,
        barnesHutOptimize: n > 50,
        strongGravityMode: false,
        slowDown: 3,
        adjustSizes: true,
      },
    });
  } catch {
    // fallback: keep random positions
  }
}

function computeBetweenness(graph: Graph): Map<string, number> {
  const result = new Map<string, number>();

  if (graph.order < 3 || graph.size < 2) {
    graph.forEachNode((node) => result.set(node, 0));
    return result;
  }

  try {
    const bc = betweennessCentrality(graph, { normalized: true });
    for (const [node, val] of Object.entries(bc)) {
      result.set(node, val);
    }
  } catch {
    graph.forEachNode((node) => result.set(node, 0));
  }

  return result;
}

export function computeNodeSizes(
  graph: Graph,
  betweennessMap: Map<string, number>
): Map<string, number> {
  const sizes = new Map<string, number>();
  const minSize = 8;
  const maxSize = 28;

  let maxScore = 0;
  graph.forEachNode((node) => {
    const degree = graph.degree(node);
    const bc = betweennessMap.get(node) || 0;
    const score = degree + bc * 10;
    if (score > maxScore) maxScore = score;
  });

  graph.forEachNode((node) => {
    const degree = graph.degree(node);
    const bc = betweennessMap.get(node) || 0;
    const score = degree + bc * 10;
    const normalized = maxScore > 0 ? score / maxScore : 0;
    sizes.set(node, minSize + normalized * (maxSize - minSize));
  });

  return sizes;
}

function convexHull(points: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  if (points.length < 3) return points;

  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);

  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Array<{ x: number; y: number }> = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Array<{ x: number; y: number }> = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function expandHull(hull: Array<{ x: number; y: number }>, pad: number): Array<{ x: number; y: number }> {
  if (hull.length < 2) return hull;

  const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;

  return hull.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    return {
      x: p.x + (dx / dist) * pad,
      y: p.y + (dy / dist) * pad,
    };
  });
}

export function buildVisualizationData(overviewGraph: V2OverviewGraph): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: ClusterInfo[];
} {
  const graph = buildGraphologyGraph(overviewGraph);

  if (graph.order === 0) {
    return { nodes: [], edges: [], clusters: [] };
  }

  runForceAtlas2Layout(graph);

  const communities = detectCommunities(graph);
  const betweennessMap = computeBetweenness(graph);
  const sizes = computeNodeSizes(graph, betweennessMap);

  const uniqueClusters = [...new Set(communities.values())].sort();
  const clusterColorMap = new Map<number, string>();
  uniqueClusters.forEach((c, i) => {
    clusterColorMap.set(c, CLUSTER_COLORS[i % CLUSTER_COLORS.length]);
  });

  const nodes: GraphNode[] = [];
  graph.forEachNode((nodeId, attrs) => {
    const cluster = communities.get(nodeId) ?? 0;
    const x = (attrs.x as number) ?? 0;
    const y = (attrs.y as number) ?? 0;
    const size = sizes.get(nodeId) ?? 10;

    nodes.push({
      id: nodeId,
      label: attrs.label || nodeId,
      moduleIndex: attrs.moduleIndex ?? 0,
      connections: attrs.connections ?? 0,
      x,
      y,
      size,
      color: clusterColorMap.get(cluster) || CLUSTER_COLORS[0],
      cluster,
      betweenness: betweennessMap.get(nodeId) ?? 0,
      description: attrs.description || "",
      fileCount: attrs.fileCount || 0,
    });
  });

  const edges: GraphEdge[] = [];
  graph.forEachEdge((_edge, attrs, source, target) => {
    const sourceCluster = communities.get(source) ?? 0;
    const sourceColor = clusterColorMap.get(sourceCluster) || CLUSTER_COLORS[0];
    edges.push({
      source,
      target,
      relation: attrs.relation || "",
      label: attrs.label || attrs.relation || "",
      color: sourceColor + "60",
    });
  });

  const clusterNodeMap = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    if (!clusterNodeMap.has(node.cluster)) clusterNodeMap.set(node.cluster, []);
    clusterNodeMap.get(node.cluster)!.push(node);
  }

  const clusters: ClusterInfo[] = uniqueClusters.map((c) => {
    const clusterNodes = clusterNodeMap.get(c) || [];
    const labels = clusterNodes.map((n) => n.label);
    const name = labels.length <= 3
      ? labels.join(", ")
      : labels.slice(0, 2).join(", ") + ` +${labels.length - 2}`;

    const points = clusterNodes.map((n) => ({ x: n.x, y: n.y }));
    const hull = clusterNodes.length >= 3
      ? expandHull(convexHull(points), 50)
      : points.length === 2
        ? expandHull(points, 60)
        : points.map((p) => ({ x: p.x, y: p.y }));

    return {
      id: c,
      color: clusterColorMap.get(c) || CLUSTER_COLORS[0],
      name,
      nodeCount: clusterNodes.length,
      hull,
    };
  });

  return { nodes, edges, clusters };
}
