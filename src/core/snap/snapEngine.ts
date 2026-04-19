import { SNAP_RADIUS_CM } from "../constants/tolerances";
import type { Point2D, WallGraph } from "../model/projectTypes";
import type { SnapCandidate } from "./snapTypes";

const projectPointOnSegment = (p: Point2D, a: Point2D, b: Point2D): Point2D => {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const lenSq = vx * vx + vy * vy;
  if (lenSq === 0) {
    return a;
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / lenSq));
  return { x: a.x + vx * t, y: a.y + vy * t };
};

const distance = (a: Point2D, b: Point2D): number => Math.hypot(a.x - b.x, a.y - b.y);

const candidateWeight = (kind: SnapCandidate["kind"]): number => {
  switch (kind) {
    case "node":
      return 1;
    case "wall":
      return 2;
    case "guide":
      return 3;
    case "element":
      return 4;
    case "grid":
      return 5;
  }
};

export const collectSnapCandidates = (graph: WallGraph, pointer: Point2D): SnapCandidate[] => {
  const candidates: SnapCandidate[] = [];

  for (const node of Object.values(graph.nodes)) {
    const d = distance(pointer, node);
    if (d <= SNAP_RADIUS_CM) {
      candidates.push({
        kind: "node",
        id: node.id,
        x: node.x,
        y: node.y,
        score: 100 - d,
      });
    }
  }

  for (const edge of Object.values(graph.edges)) {
    const a = graph.nodes[edge.nodeAId];
    const b = graph.nodes[edge.nodeBId];
    if (!a || !b) {
      continue;
    }
    const proj = projectPointOnSegment(pointer, a, b);
    const d = distance(pointer, proj);
    if (d <= SNAP_RADIUS_CM) {
      candidates.push({
        kind: "wall",
        id: edge.id,
        x: proj.x,
        y: proj.y,
        score: 80 - d,
      });
    }
  }

  return candidates.sort((a, b) => {
    const weightDelta = candidateWeight(a.kind) - candidateWeight(b.kind);
    if (weightDelta !== 0) {
      return weightDelta;
    }
    return b.score - a.score;
  });
};

export const pickBestSnap = (
  graph: WallGraph,
  pointer: Point2D,
): SnapCandidate | null => {
  const candidates = collectSnapCandidates(graph, pointer);
  return candidates[0] ?? null;
};
