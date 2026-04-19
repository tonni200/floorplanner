import type { WallGraph } from "../model/projectTypes";
import type { SnapCandidate } from "../snap/snapTypes";
import type { DragIntent, DragSession } from "./dragSessionTypes";

export function beginInteraction(
  intent: DragIntent,
  draggingIds: string[],
  startWorld: { x: number; y: number },
  committedGraph: WallGraph,
): DragSession {
  return {
    active: true,
    intent,
    draggingIds,
    committedSnapshot: {
      graph: structuredClone(committedGraph),
    },
    previewPatch: {
      graph: structuredClone(committedGraph),
      pointerWorld: { ...startWorld },
      snappedWorld: null,
      candidate: null,
    },
    snapLock: null,
    startWorld,
    payload: undefined,
  };
}

export function updateMoveNodePreview(
  drag: DragSession,
  pointerWorld: { x: number; y: number },
  candidate: SnapCandidate | null,
): DragSession {
  if (!drag.active || drag.intent !== "move-node" || !drag.committedSnapshot) {
    return drag;
  }
  const nodeId = drag.draggingIds[0];
  if (!nodeId) {
    return drag;
  }

  const graph = structuredClone(drag.committedSnapshot.graph);
  const node = graph.nodes[nodeId];
  if (!node) {
    return drag;
  }
  node.x = pointerWorld.x;
  node.y = pointerWorld.y;

  return {
    ...drag,
    previewPatch: {
      graph,
      pointerWorld: { ...pointerWorld },
      snappedWorld: candidate ? { x: candidate.x, y: candidate.y } : null,
      candidate,
    },
    snapLock: candidate
      ? {
          candidateId: candidate.id,
          kind: candidate.kind,
          lockScore: candidate.score,
        }
      : drag.snapLock,
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
