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
  committedSnapshot: unknown | null;
  previewPatch: unknown | null;
  snapLock: import("../snap/snapTypes").SnapLock | null;
  startWorld: { x: number; y: number } | null;
  payload?: Record<string, unknown>;
}

