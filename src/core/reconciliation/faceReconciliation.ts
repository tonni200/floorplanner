import { FACE_RECONCILIATION_MIN_SCORE } from "../constants/tolerances";
import { createFaceId } from "../model/ids";
import type { Face, FaceId } from "../model/projectTypes";

export interface FaceReconciliationResult {
  nextFaces: Face[];
  oldToNewFaceId: Record<FaceId, FaceId>;
  unmatchedOldFaceIds: FaceId[];
}

export function reconcileFaces(previous: Face[], nextRaw: Face[]): FaceReconciliationResult {
  const usedOld = new Set<FaceId>();
  const usedNext = new Set<FaceId>();
  const oldToNewFaceId: Record<FaceId, FaceId> = {};
  const nextFaces: Face[] = [];

  for (const nextFace of nextRaw) {
    const exact = previous.find(
      (oldFace) =>
        !usedOld.has(oldFace.id) &&
        oldFace.floorLevel === nextFace.floorLevel &&
        oldFace.fingerprint === nextFace.fingerprint,
    );
    if (!exact) {
      continue;
    }

    usedOld.add(exact.id);
    usedNext.add(nextFace.id);
    oldToNewFaceId[exact.id] = exact.id;
    nextFaces.push({ ...nextFace, id: exact.id });
  }

  for (const nextFace of nextRaw) {
    if (usedNext.has(nextFace.id)) {
      continue;
    }

    const candidate = previous
      .filter((oldFace) => !usedOld.has(oldFace.id) && oldFace.floorLevel === nextFace.floorLevel)
      .map((oldFace) => ({ oldFace, score: continuityScore(oldFace, nextFace) }))
      .sort((a, b) => b.score - a.score)[0];

    if (candidate && candidate.score >= FACE_RECONCILIATION_MIN_SCORE) {
      usedOld.add(candidate.oldFace.id);
      oldToNewFaceId[candidate.oldFace.id] = candidate.oldFace.id;
      nextFaces.push({ ...nextFace, id: candidate.oldFace.id });
      continue;
    }

    nextFaces.push({ ...nextFace, id: createFaceId() });
  }

  const unmatchedOldFaceIds = previous
    .filter((face) => !usedOld.has(face.id))
    .map((face) => face.id);

  return { nextFaces, oldToNewFaceId, unmatchedOldFaceIds };
}

function continuityScore(previous: Face, next: Face): number {
  const centroidDistance = Math.hypot(
    previous.centroid.x - next.centroid.x,
    previous.centroid.y - next.centroid.y,
  );
  const areaSimilarity =
    1 - Math.abs(previous.area - next.area) / Math.max(previous.area, next.area, 1);
  const centroidInsideScore = pointInPolygon(next.centroid, previous.polygon) ? 1 : 0;
  const centroidScore = Math.max(0, 1 - centroidDistance / 150);
  return areaSimilarity * 0.55 + centroidScore * 0.2 + centroidInsideScore * 0.25;
}

function pointInPolygon(
  point: { x: number; y: number },
  polygon: Array<{ x: number; y: number }>,
): boolean {
  let inside = false;
  if (polygon.length < 3) {
    return false;
  }
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (!a || !b) {
      continue;
    }
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y + Number.EPSILON) + a.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}
