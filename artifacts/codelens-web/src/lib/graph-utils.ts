import Graph, { DirectedGraph, UndirectedGraph } from "graphology";
import louvain from "graphology-communities-louvain";
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
  description?: string;
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

export function layoutCircular(graph: Graph): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const nodes = graph.nodes();
  const n = nodes.length;

  if (n === 0) return positions;
  if (n === 1) {
    positions.set(nodes[0], { x: 0, y: 0 });
    return positions;
  }

  const communities = detectCommunities(graph);
  const clusterNodes = new Map<number, string[]>();
  for (const [node, cluster] of communities) {
    if (!clusterNodes.has(cluster)) clusterNodes.set(cluster, []);
    clusterNodes.get(cluster)!.push(node);
  }

  const clusterCount = clusterNodes.size;
  const clusterRadius = Math.max(150, clusterCount * 80);
  let clusterIdx = 0;

  for (const [, nodesInCluster] of clusterNodes) {
    const clusterAngle = (2 * Math.PI * clusterIdx) / clusterCount;
    const cx = clusterRadius * Math.cos(clusterAngle);
    const cy = clusterRadius * Math.sin(clusterAngle);

    const intraRadius = Math.max(50, nodesInCluster.length * 25);
    nodesInCluster.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / nodesInCluster.length;
      positions.set(node, {
        x: cx + intraRadius * Math.cos(angle),
        y: cy + intraRadius * Math.sin(angle),
      });
    });

    clusterIdx++;
  }

  return positions;
}

export function computeNodeSizes(graph: Graph): Map<string, number> {
  const sizes = new Map<string, number>();
  const minSize = 8;
  const maxSize = 25;

  let maxDegree = 0;
  graph.forEachNode((node) => {
    const degree = graph.degree(node);
    if (degree > maxDegree) maxDegree = degree;
  });

  graph.forEachNode((node) => {
    const degree = graph.degree(node);
    const normalized = maxDegree > 0 ? degree / maxDegree : 0;
    sizes.set(node, minSize + normalized * (maxSize - minSize));
  });

  return sizes;
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

  const communities = detectCommunities(graph);
  const positions = layoutCircular(graph);
  const sizes = computeNodeSizes(graph);

  const uniqueClusters = [...new Set(communities.values())].sort();
  const clusterColorMap = new Map<number, string>();
  uniqueClusters.forEach((c, i) => {
    clusterColorMap.set(c, CLUSTER_COLORS[i % CLUSTER_COLORS.length]);
  });

  const nodes: GraphNode[] = [];
  graph.forEachNode((nodeId, attrs) => {
    const cluster = communities.get(nodeId) ?? 0;
    const pos = positions.get(nodeId) ?? { x: 0, y: 0 };
    const size = sizes.get(nodeId) ?? 10;

    nodes.push({
      id: nodeId,
      label: attrs.label || nodeId,
      moduleIndex: attrs.moduleIndex ?? 0,
      connections: attrs.connections ?? 0,
      x: pos.x,
      y: pos.y,
      size,
      color: clusterColorMap.get(cluster) || CLUSTER_COLORS[0],
      cluster,
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

  const clusterNodeCounts = new Map<number, number>();
  const clusterLabels = new Map<number, string[]>();
  for (const node of nodes) {
    clusterNodeCounts.set(node.cluster, (clusterNodeCounts.get(node.cluster) || 0) + 1);
    if (!clusterLabels.has(node.cluster)) clusterLabels.set(node.cluster, []);
    clusterLabels.get(node.cluster)!.push(node.label);
  }

  const clusters: ClusterInfo[] = uniqueClusters.map((c) => {
    const labels = clusterLabels.get(c) || [];
    const name = labels.length <= 3
      ? labels.join(", ")
      : labels.slice(0, 2).join(", ") + ` +${labels.length - 2}`;
    return {
      id: c,
      color: clusterColorMap.get(c) || CLUSTER_COLORS[0],
      name,
      nodeCount: clusterNodeCounts.get(c) || 0,
    };
  });

  return { nodes, edges, clusters };
}
