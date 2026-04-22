import type { EdgeId, Face, FloorLevel, Point2D, WallGraph } from "../model/projectTypes";
import { MIN_FACE_AREA_CM2, GEOMETRY_EPSILON_CM } from "../constants/tolerances";
import { createFaceId } from "../model/ids";
import { computeFaceFingerprint } from "./faceFingerprint";

type DirectedEdge = {
  edgeId: EdgeId;
  from: string;
  to: string;
};

const quantize = (value: number): number =>
  Math.round(value / GEOMETRY_EPSILON_CM) * GEOMETRY_EPSILON_CM;

const pointKey = (p: Point2D): string => `${quantize(p.x)}:${quantize(p.y)}`;

const polygonAreaSigned = (points: Point2D[]): number => {
  let acc = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (!a || !b) {
      continue;
    }
    acc += a.x * b.y - b.x * a.y;
  }
  return acc * 0.5;
};

const polygonCentroid = (points: Point2D[]): Point2D => {
  const area = polygonAreaSigned(points);
  if (Math.abs(area) < GEOMETRY_EPSILON_CM) {
    return points[0] ?? { x: 0, y: 0 };
  }

  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (!a || !b) {
      continue;
    }
    const cross = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  const factor = 1 / (6 * area);
  return { x: cx * factor, y: cy * factor };
};

const cycleFingerprint = (polygon: Point2D[]): string =>
  polygon
    .map((p) => pointKey(p))
    .sort()
    .join("|");

const sortByAngleAroundNode = (
  nodeId: string,
  neighbors: DirectedEdge[],
  graph: WallGraph,
): DirectedEdge[] => {
  const origin = graph.nodes[nodeId];
  if (!origin) {
    return neighbors;
  }
  return [...neighbors].sort((a, b) => {
    const ap = graph.nodes[a.to];
    const bp = graph.nodes[b.to];
    if (!ap || !bp) {
      return 0;
    }
    const aa = Math.atan2(ap.y - origin.y, ap.x - origin.x);
    const ba = Math.atan2(bp.y - origin.y, bp.x - origin.x);
    return aa - ba;
  });
};

const canonicalCycleKey = (nodeIds: string[]): string => {
  if (nodeIds.length === 0) {
    return "";
  }
  const variants: string[] = [];
  for (let i = 0; i < nodeIds.length; i += 1) {
    const rotated = [...nodeIds.slice(i), ...nodeIds.slice(0, i)].join(">");
    variants.push(rotated);
  }
  const reversed = [...nodeIds].reverse();
  for (let i = 0; i < reversed.length; i += 1) {
    const rotated = [...reversed.slice(i), ...reversed.slice(0, i)].join(">");
    variants.push(rotated);
  }
  variants.sort();
  return variants[0] ?? "";
};

export const deriveFacesForFloor = (
  graph: WallGraph,
  floorLevel: FloorLevel,
): Face[] => {
  const edges = Object.values(graph.edges).filter((edge) => edge.floorLevel === floorLevel);
  const directed: DirectedEdge[] = [];
  for (const edge of edges) {
    directed.push({ edgeId: edge.id, from: edge.nodeAId, to: edge.nodeBId });
    directed.push({ edgeId: edge.id, from: edge.nodeBId, to: edge.nodeAId });
  }

  const outgoing = new Map<string, DirectedEdge[]>();
  for (const part of directed) {
    const list = outgoing.get(part.from) ?? [];
    list.push(part);
    outgoing.set(part.from, list);
  }

  for (const [nodeId, neighbors] of outgoing.entries()) {
    outgoing.set(nodeId, sortByAngleAroundNode(nodeId, neighbors, graph));
  }

  const visited = new Set<string>();
  const cycles: DirectedEdge[][] = [];

  const traverse = (start: DirectedEdge): DirectedEdge[] | null => {
    const cycle: DirectedEdge[] = [];
    let current = start;
    const guard = directed.length * 2 + 10;
    let steps = 0;

    while (steps < guard) {
      steps += 1;
      const mark = `${current.from}->${current.to}`;
      if (visited.has(mark)) {
        return null;
      }
      cycle.push(current);
      visited.add(mark);

      const options = outgoing.get(current.to);
      if (!options || options.length === 0) {
        return null;
      }

      const incomingIndex = options.findIndex((cand) => cand.to === current.from);
      if (incomingIndex < 0) {
        return null;
      }

      const next = options[(incomingIndex - 1 + options.length) % options.length];
      if (!next) {
        return null;
      }
      current = next;

      if (current.from === start.from && current.to === start.to) {
        return cycle;
      }
    }
    return null;
  };

  for (const edge of directed) {
    const key = `${edge.from}->${edge.to}`;
    if (visited.has(key)) {
      continue;
    }
    const cycle = traverse(edge);
    if (!cycle || cycle.length < 3) {
      continue;
    }
    cycles.push(cycle);
  }

  const seen = new Set<string>();
  const faces: Face[] = [];

  for (const cycle of cycles) {
    const nodeIds = cycle.map((part) => part.from);
    const uniqueKey = canonicalCycleKey(nodeIds);
    if (seen.has(uniqueKey)) {
      continue;
    }
    seen.add(uniqueKey);

    const polygon = nodeIds
      .map((nodeId) => graph.nodes[nodeId])
      .filter((node): node is NonNullable<typeof node> => Boolean(node))
      .map((node) => ({ x: node.x, y: node.y }));

    if (polygon.length < 3) {
      continue;
    }

    const signedArea = polygonAreaSigned(polygon);
    const area = Math.abs(signedArea);
    if (area < MIN_FACE_AREA_CM2) {
      continue;
    }

    const centroid = polygonCentroid(polygon);
    const fingerprint = cycleFingerprint(polygon);
    faces.push({
      id: createFaceId(),
      polygon,
      centroid,
      area,
      edgeIds: cycle.map((part) => part.edgeId),
      fingerprint: computeFaceFingerprint({
        polygon,
        floorLevel,
      }),
      floorLevel,
    });
  }

  return faces;
};

export const detectFacesFromGraph = (graph: WallGraph): Face[] => {
  const floors = new Set(
    Object.values(graph.edges).map((edge) => edge.floorLevel),
  );

  const allFaces: Face[] = [];
  for (const floor of floors) {
    allFaces.push(...deriveFacesForFloor(graph, floor));
  }
  return allFaces;
};
