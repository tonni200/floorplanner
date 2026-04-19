import { DEFAULT_WALL_HEIGHT_CM, DEFAULT_WALL_THICKNESS_CM } from "../model/defaults";
import { createEdgeId, createNodeId } from "../model/ids";
import type {
  NodeId,
  EdgeId,
  WallEdge,
  WallGraph,
  WallType,
} from "../model/projectTypes";
import { getEdgeLengthCm, getConnectedEdgeIds } from "./graphQueries";
import { MIN_EDGE_LENGTH_CM, GEOMETRY_EPSILON_CM } from "../constants/tolerances";

export interface AddNodeInput {
  x: number;
  y: number;
  floorLevel?: number;
  id?: NodeId;
}

export function addNode(graph: WallGraph, input: AddNodeInput): NodeId {
  const id = input.id ?? createNodeId();
  graph.nodes[id] = {
    id,
    x: input.x,
    y: input.y,
    floorLevel: input.floorLevel ?? 0,
  };
  return id;
}

export interface AddEdgeInput {
  nodeAId: NodeId;
  nodeBId: NodeId;
  wallType?: WallType;
  thickness?: number;
  floorLevel?: number;
  id?: EdgeId;
}

function makeEdge(input: AddEdgeInput): WallEdge {
  return {
    id: input.id ?? createEdgeId(),
    nodeAId: input.nodeAId,
    nodeBId: input.nodeBId,
    wallType: input.wallType ?? "inner",
    thickness: input.thickness ?? DEFAULT_WALL_THICKNESS_CM,
    height: DEFAULT_WALL_HEIGHT_CM,
    floorLevel: input.floorLevel ?? 0,
  };
}

export function addEdge(graph: WallGraph, input: AddEdgeInput): EdgeId {
  const edge = makeEdge(input);
  if (edge.nodeAId === edge.nodeBId) {
    throw new Error("Cannot create edge with identical node endpoints.");
  }

  if (!graph.nodes[edge.nodeAId] || !graph.nodes[edge.nodeBId]) {
    throw new Error("Cannot create edge with missing endpoint node.");
  }

  const length = getEdgeLengthCm(graph, edge);
  if (length < MIN_EDGE_LENGTH_CM) {
    throw new Error("Edge length below minimum threshold.");
  }

  graph.edges[edge.id] = edge;
  return edge.id;
}

export function removeEdge(graph: WallGraph, edgeId: EdgeId): void {
  delete graph.edges[edgeId];
}

export function removeNode(graph: WallGraph, nodeId: NodeId): void {
  if (getConnectedEdgeIds(graph, nodeId).length > 0) {
    throw new Error("Cannot remove node while connected edges exist.");
  }
  delete graph.nodes[nodeId];
}

export function splitEdgeAtPoint(
  graph: WallGraph,
  edgeId: EdgeId,
  point: { x: number; y: number },
): { insertedNodeId: NodeId; leftEdgeId: EdgeId; rightEdgeId: EdgeId } {
  const edge = graph.edges[edgeId];
  if (!edge) {
    throw new Error(`Edge ${edgeId} does not exist.`);
  }

  const a = graph.nodes[edge.nodeAId];
  const b = graph.nodes[edge.nodeBId];
  if (!a || !b) {
    throw new Error("Edge endpoints are invalid.");
  }

  const insertedNodeId = addNode(graph, {
    x: point.x,
    y: point.y,
    floorLevel: edge.floorLevel,
  });

  const leftEdgeId = addEdge(graph, {
    nodeAId: edge.nodeAId,
    nodeBId: insertedNodeId,
    wallType: edge.wallType,
    thickness: edge.thickness,
    floorLevel: edge.floorLevel,
  });

  const rightEdgeId = addEdge(graph, {
    nodeAId: insertedNodeId,
    nodeBId: edge.nodeBId,
    wallType: edge.wallType,
    thickness: edge.thickness,
    floorLevel: edge.floorLevel,
  });

  removeEdge(graph, edgeId);

  return { insertedNodeId, leftEdgeId, rightEdgeId };
}

export function mergeNodes(graph: WallGraph, sourceNodeId: NodeId, targetNodeId: NodeId): void {
  if (sourceNodeId === targetNodeId) {
    return;
  }

  const source = graph.nodes[sourceNodeId];
  const target = graph.nodes[targetNodeId];
  if (!source || !target) {
    throw new Error("Cannot merge missing nodes.");
  }

  if (
    Math.abs(source.x - target.x) > GEOMETRY_EPSILON_CM ||
    Math.abs(source.y - target.y) > GEOMETRY_EPSILON_CM ||
    source.floorLevel !== target.floorLevel
  ) {
    throw new Error("Nodes must overlap on the same floor to merge.");
  }

  const connected = getConnectedEdgeIds(graph, sourceNodeId);

  for (const edgeId of connected) {
    const edge = graph.edges[edgeId];
    if (!edge) {
      continue;
    }
    const updated: WallEdge = {
      ...edge,
      nodeAId: edge.nodeAId === sourceNodeId ? targetNodeId : edge.nodeAId,
      nodeBId: edge.nodeBId === sourceNodeId ? targetNodeId : edge.nodeBId,
    };

    if (updated.nodeAId === updated.nodeBId) {
      delete graph.edges[edgeId];
      continue;
    }

    graph.edges[edgeId] = updated;
  }

  delete graph.nodes[sourceNodeId];
}
