export type DragIntent =
  | "none"
  | "draw-wall"
  | "move-node"
  | "move-wall"
  | "place-opening"
  | "place-furniture"
  | "marquee";

export interface DragSession {
  active: boolean;
  intent: DragIntent | null;
  draggingIds: string[];
  committedSnapshot: {
    graph: import("../model/projectTypes").WallGraph;
  } | null;
  previewPatch: {
    graph: import("../model/projectTypes").WallGraph;
    pointerWorld: { x: number; y: number };
    snappedWorld: { x: number; y: number } | null;
    candidate: import("../snap/snapTypes").SnapCandidate | null;
  } | null;
  snapLock: import("../snap/snapTypes").SnapLock | null;
  startWorld: { x: number; y: number } | null;
  payload?: Record<string, unknown>;
}

