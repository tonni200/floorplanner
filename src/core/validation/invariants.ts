import { MIN_EDGE_LENGTH_CM, MIN_FACE_AREA_CM2 } from "../constants/tolerances";
import type { Face, Point2D, ProjectData } from "../model/projectTypes";
import type { ValidationIssue } from "./validationErrors";

const polygonArea = (polygon: Point2D[]): number => {
  let sum = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (!a || !b) {
      continue;
    }
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
};

const lineSegmentsIntersect = (
  a: Point2D,
  b: Point2D,
  c: Point2D,
  d: Point2D,
): boolean => {
  const orient = (p: Point2D, q: Point2D, r: Point2D): number =>
    (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);

  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);

  if (Math.abs(o1) <= Number.EPSILON || Math.abs(o2) <= Number.EPSILON) {
    // Collinear overlap checks are intentionally omitted in v1 foundation.
    return false;
  }
  return o1 * o2 < 0 && o3 * o4 < 0;
};

const polygonSelfIntersects = (polygon: Point2D[]): boolean => {
  if (polygon.length < 4) {
    return false;
  }
  for (let i = 0; i < polygon.length; i += 1) {
    const a1 = polygon[i];
    const a2 = polygon[(i + 1) % polygon.length];
    if (!a1 || !a2) {
      continue;
    }
    for (let j = i + 1; j < polygon.length; j += 1) {
      const b1 = polygon[j];
      const b2 = polygon[(j + 1) % polygon.length];
      if (!b1 || !b2) {
        continue;
      }
      const sharedEndpoint =
        a1 === b1 || a1 === b2 || a2 === b1 || a2 === b2 || i === j || (i + 1) % polygon.length === j;
      if (!sharedEndpoint && lineSegmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }
  return false;
};

function validateFacePolygons(faces: Face[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const face of faces) {
    const area = Math.abs(polygonArea(face.polygon));
    if (area < MIN_FACE_AREA_CM2) {
      issues.push({
        code: "FACE_POLYGON_INVALID",
        message: `Face ${face.id} polygon area too small.`,
        severity: "error",
        entityId: face.id,
      });
      continue;
    }
    if (polygonSelfIntersects(face.polygon)) {
      issues.push({
        code: "FACE_POLYGON_INVALID",
        message: `Face ${face.id} polygon self-intersects.`,
        severity: "error",
        entityId: face.id,
      });
    }
  }
  return issues;
}

export function validateInvariants(project: ProjectData, faces: Face[] = []): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const edge of Object.values(project.graph.edges)) {
    const nodeA = project.graph.nodes[edge.nodeAId];
    const nodeB = project.graph.nodes[edge.nodeBId];
    if (!nodeA || !nodeB) {
      issues.push({
        code: "EDGE_NODE_REF_INVALID",
        message: `Edge ${edge.id} references missing node(s).`,
        severity: "error",
        entityId: edge.id,
      });
      continue;
    }

    if (nodeA.floorLevel !== edge.floorLevel || nodeB.floorLevel !== edge.floorLevel) {
      issues.push({
        code: "EDGE_FLOOR_LEVEL_MISMATCH",
        message: `Edge ${edge.id} floor level mismatches node floor level.`,
        severity: "error",
        entityId: edge.id,
      });
    }

    const dx = nodeB.x - nodeA.x;
    const dy = nodeB.y - nodeA.y;
    const length = Math.hypot(dx, dy);
    if (length < MIN_EDGE_LENGTH_CM) {
      issues.push({
        code: "EDGE_DEGENERATE",
        message: `Edge ${edge.id} is degenerate (${length.toFixed(6)} cm).`,
        severity: "error",
        entityId: edge.id,
      });
    }
  }

  for (const opening of Object.values(project.openings)) {
    const host = project.graph.edges[opening.hostEdgeId];
    if (!host) {
      issues.push({
        code: "OPENING_HOST_INVALID",
        message: `Opening ${opening.id} references missing edge ${opening.hostEdgeId}.`,
        severity: "error",
        entityId: opening.id,
      });
      continue;
    }
    if (host.floorLevel !== opening.floorLevel) {
      issues.push({
        code: "OPENING_HOST_INVALID",
        message: `Opening ${opening.id} floor level mismatch with host edge ${host.id}.`,
        severity: "error",
        entityId: opening.id,
      });
    }
  }

  issues.push(...validateFacePolygons(faces));
  const validFaceIds = new Set<string>(faces.map((face) => face.id));

  for (const room of Object.values(project.roomMetadataMap)) {
    if (room.faceId !== null && !validFaceIds.has(room.faceId)) {
      issues.push({
        code: "ROOM_FACE_REF_INVALID",
        message: `Room metadata ${room.id} points to missing face ${room.faceId}.`,
        severity: "error",
        entityId: room.id,
      });
    }
  }

  return issues;
}
