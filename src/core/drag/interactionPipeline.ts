import type { DragIntent, DragSession } from "./dragSessionTypes";

export function beginInteraction(
  intent: DragIntent,
  draggingIds: string[],
  startWorld: { x: number; y: number },
): DragSession {
  return {
    active: true,
    intent,
    draggingIds,
    committedSnapshot: null,
    previewPatch: null,
    snapLock: null,
    startWorld,
    payload: undefined,
  };
}

export function cancelInteraction(): DragSession {
  return {
    active: false,
    intent: null,
    draggingIds: [],
    committedSnapshot: null,
    previewPatch: null,
    snapLock: null,
    startWorld: null,
    payload: undefined,
  };
}
