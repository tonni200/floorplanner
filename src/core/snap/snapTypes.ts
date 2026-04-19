export type SnapKind = "node" | "wall" | "guide" | "element" | "grid";

export interface SnapCandidate {
  kind: SnapKind;
  id: string;
  x: number;
  y: number;
  score: number;
}

export interface SnapLock {
  candidateId: string;
  kind: SnapKind;
  lockScore: number;
}

export interface SnapResolution {
  candidate: SnapCandidate | null;
  lock: SnapLock | null;
}

export const snapKindPriority = (kind: SnapKind): number => {
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

export const compareSnapCandidates = (a: SnapCandidate, b: SnapCandidate): number => {
  const priorityDelta = snapKindPriority(a.kind) - snapKindPriority(b.kind);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }
  return b.score - a.score;
};

export interface SnapPreview {
  world: { x: number; y: number };
  candidate: SnapCandidate | null;
  lock: SnapLock | null;
}
