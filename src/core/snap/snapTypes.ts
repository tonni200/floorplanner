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
