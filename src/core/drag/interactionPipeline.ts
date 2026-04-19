import type { WallGraph } from "../model/projectTypes";
import type { SnapCandidate } from "../snap/snapTypes";
import type { DragIntent, DragSession } from "./dragSessionTypes";
import {
  ORTHO_GUIDE_ANGLE_DEG,
  ORTHOGONAL_GUIDE_ENABLE_DISTANCE_CM,
} from "../constants/tolerances";

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
    toolFlow: {
      activeTool: intent === "draw-wall" ? "draw-wall" : "select",
      drawWallPolylineNodeIds: [],
    },
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

function angleDegrees(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

function normalizeAngleDeg(angle: number): number {
  let a = angle % 360;
  if (a < 0) {
    a += 360;
  }
  return a;
}

function orthogonalizedPoint(
  start: { x: number; y: number },
  pointer: { x: number; y: number },
): { x: number; y: number } {
  const dx = pointer.x - start.x;
  const dy = pointer.y - start.y;
  const distance = Math.hypot(dx, dy);
  if (distance < ORTHOGONAL_GUIDE_ENABLE_DISTANCE_CM) {
    return pointer;
  }

  const angle = normalizeAngleDeg(angleDegrees(start, pointer));
  const targets = [0, 90, 180, 270];
  let closest = targets[0];
  let minDelta = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const delta = Math.min(Math.abs(angle - target), 360 - Math.abs(angle - target));
    if (delta < minDelta) {
      minDelta = delta;
      closest = target;
    }
  }

  if (minDelta > ORTHO_GUIDE_ANGLE_DEG) {
    return pointer;
  }

  if (closest === 0 || closest === 180) {
    return { x: pointer.x, y: start.y };
  }
  return { x: start.x, y: pointer.y };
}

export function applySoftOrthogonalGuide(
  drag: DragSession,
  pointer: { x: number; y: number },
): { x: number; y: number } {
  if (!drag.startWorld) {
    return pointer;
  }
  if (
    drag.intent !== "draw-wall" &&
    drag.intent !== "move-wall" &&
    drag.intent !== "move-node"
  ) {
    return pointer;
  }
  return orthogonalizedPoint(drag.startWorld, pointer);
}

export function applyOrthogonalGuideFromStart(
  start: { x: number; y: number },
  pointer: { x: number; y: number },
): { x: number; y: number } {
  return orthogonalizedPoint(start, pointer);
}

export function cancelInteraction(): DragSession {
  return {
    active: false,
    intent: null,
    draggingIds: [],
    toolFlow: {
      activeTool: "none",
      drawWallPolylineNodeIds: [],
    },
    committedSnapshot: null,
    previewPatch: null,
    snapLock: null,
    startWorld: null,
    payload: undefined,
  };
}

export function completeInteraction(drag: DragSession): DragSession {
  return {
    ...drag,
    active: false,
    intent: null,
    draggingIds: [],
    toolFlow: {
      activeTool: "select",
      drawWallPolylineNodeIds: [],
    },
    committedSnapshot: null,
    previewPatch: null,
    snapLock: null,
    startWorld: null,
    payload: undefined,
  };
}

export const resetInteractionSession = completeInteraction;
