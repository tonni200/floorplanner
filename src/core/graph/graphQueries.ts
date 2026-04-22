import type { EdgeId, NodeId, WallEdge, WallGraph } from "../model/projectTypes";
import { GEOMETRY_EPSILON_CM } from "../constants/tolerances";

export function getConnectedEdgeIds(graph: WallGraph, nodeId: NodeId): EdgeId[] {
  const result: EdgeId[] = [];
  for (const edge of Object.values(graph.edges)) {
    if (edge.nodeAId === nodeId || edge.nodeBId === nodeId) {
      result.push(edge.id);
    }
  }
  return result;
}

export const getNodeIncidentEdgeIds = getConnectedEdgeIds;

export function getEdgeLengthCm(graph: WallGraph, edge: WallEdge): number {
  const nodeA = graph.nodes[edge.nodeAId];
  const nodeB = graph.nodes[edge.nodeBId];
  if (!nodeA || !nodeB) {
    return 0;
  }
  return Math.hypot(nodeB.x - nodeA.x, nodeB.y - nodeA.y);
}

export function getEdgeLength(graph: WallGraph, edgeId: EdgeId): number {
  const edge = graph.edges[edgeId];
  if (!edge) {
    return 0;
  }
  return getEdgeLengthCm(graph, edge);
}

export function areNodesNear(
  graph: WallGraph,
  nodeAId: NodeId,
  nodeBId: NodeId,
  tolerance = GEOMETRY_EPSILON_CM,
): boolean {
  const a = graph.nodes[nodeAId];
  const b = graph.nodes[nodeBId];
  if (!a || !b) {
    return false;
  }
  return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
}

export function edgeExistsBetweenNodes(
  graph: WallGraph,
  nodeAId: NodeId,
  nodeBId: NodeId,
): boolean {
  return Object.values(graph.edges).some((edge) => {
    return (
      (edge.nodeAId === nodeAId && edge.nodeBId === nodeBId) ||
      (edge.nodeAId === nodeBId && edge.nodeBId === nodeAId)
    );
  });
}

export function getNodeById(graph: WallGraph, nodeId: NodeId) {
  return graph.nodes[nodeId];
}

export function getNodeDegree(graph: WallGraph, nodeId: NodeId): number {
  return getConnectedEdgeIds(graph, nodeId).length;
}
