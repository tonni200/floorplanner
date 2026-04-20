import { create } from "zustand";
import { createEmptyProjectData } from "../core/model/defaults";
import type {
  AnnotationObject,
  EdgeId,
  Face,
  FurnitureObject,
  Node,
  OpeningObject,
  ProjectData,
  SelectionState as ModelSelectionState,
  ViewportState,
  WallEdge,
  WallGraph,
} from "../core/model/projectTypes";
import { detectFacesFromGraph } from "../core/topology/faceDetection";
import { reconcileFaces } from "../core/reconciliation/faceReconciliation";
import { reconcileRoomMetadata } from "../core/reconciliation/roomMetadataReconciliation";
import { validateInvariants } from "../core/validation/invariants";
import { createInitialHistory, pushHistory, redoHistory, undoHistory } from "../core/history/historyStore";
import {
  addEdge,
  addNode,
  prepareDrawStartFromEdgePoint,
  splitEdgeAtPoint,
} from "../core/graph/graphOps";
import type { DragSession } from "../core/drag/dragSessionTypes";
import type { FloorplannerStore, TopologyState, SelectionState } from "./types";
import {
  beginInteraction as beginDrag,
  cancelInteraction as cancelDrag,
  completeInteraction as completeDrag,
  applyOrthogonalGuideFromStart,
  applySoftOrthogonalGuide,
  updateMoveNodePreview,
} from "../core/drag/interactionPipeline";
import { collectSnapCandidates, sortSnapCandidates } from "../core/snap/snapEngine";
import { resolveSnapWithHysteresis, toSnapLock } from "../core/snap/hysteresis";
import { MIN_EDGE_LENGTH_CM } from "../core/constants/tolerances";

function deriveTopology(
  graph: WallGraph,
  previousFaces: Face[],
): { topology: TopologyState; roomReconciliation: ReturnType<typeof reconcileFaces> } {
  const detected = detectFacesFromGraph(graph);
  const roomReconciliation = reconcileFaces(previousFaces, detected);
  return {
    topology: {
      faces: roomReconciliation.nextFaces,
      openChains: [],
      invalidFaces: [],
      lastDerivedAt: Date.now(),
    },
    roomReconciliation,
  };
}

function cloneProject(project: ProjectData): ProjectData {
  return structuredClone(project);
}

const initialSelection: SelectionState = {
  nodeIds: [],
  edgeIds: [],
  roomIds: [],
  openingIds: [],
  furnitureIds: [],
  annotationIds: [],
  marquee: null,
};

const emptyDrag: DragSession = {
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

function withDrawToolFlow(drag: DragSession, nodeIds: string[]): DragSession {
  return {
    ...drag,
    toolFlow: {
      activeTool: "draw-wall",
      drawWallPolylineNodeIds: nodeIds,
    },
  };
}

function resolveDrawWallEndpoint(
  drag: DragSession,
  committedGraph: WallGraph,
  pointerWorld: { x: number; y: number },
): {
  payload: { drawWallStartNodeId?: string; lastNodeId?: string; floorLevel?: number } | undefined;
  lastNodeId: string;
  fromNode: WallGraph["nodes"][string];
  from: { x: number; y: number };
  to: { x: number; y: number };
  snap: ReturnType<typeof resolveSnapWithHysteresis>;
} | null {
  const payload = drag.payload as
    | { drawWallStartNodeId?: string; lastNodeId?: string; floorLevel?: number }
    | undefined;
  const lastNodeId = payload?.lastNodeId ?? payload?.drawWallStartNodeId;
  if (!lastNodeId) {
    return null;
  }

  const fromNode = committedGraph.nodes[lastNodeId];
  if (!fromNode) {
    return null;
  }

  const candidates = sortSnapCandidates(collectSnapCandidates(committedGraph, pointerWorld));
  const snap = resolveSnapWithHysteresis(candidates, drag.snapLock);
  let to = snap ? { x: snap.x, y: snap.y } : pointerWorld;
  to = applySoftOrthogonalGuide(drag, to);

  return {
    payload,
    lastNodeId,
    fromNode,
    from: { x: fromNode.x, y: fromNode.y },
    to,
    snap,
  };
}

function resolveOrCreatePolylineNode(
  graph: WallGraph,
  snap: ReturnType<typeof resolveSnapWithHysteresis>,
  fallbackWorld: { x: number; y: number },
  floorLevel: number,
): string {
  if (snap?.kind === "node" && graph.nodes[snap.id]) {
    return snap.id;
  }
  if (snap?.kind === "wall" && graph.edges[snap.id]) {
    const host = graph.edges[snap.id];
    const a = host ? graph.nodes[host.nodeAId] : null;
    const b = host ? graph.nodes[host.nodeBId] : null;
    if (host && a && b) {
      const distanceToA = Math.hypot(snap.x - a.x, snap.y - a.y);
      const distanceToB = Math.hypot(snap.x - b.x, snap.y - b.y);
      if (distanceToA < MIN_EDGE_LENGTH_CM) {
        return a.id;
      }
      if (distanceToB < MIN_EDGE_LENGTH_CM) {
        return b.id;
      }
      return splitEdgeAtPoint(graph, snap.id, { x: snap.x, y: snap.y }).insertedNodeId;
    }
  }
  return addNode(graph, {
    x: snap ? snap.x : fallbackWorld.x,
    y: snap ? snap.y : fallbackWorld.y,
    floorLevel,
  });
}

function getDisplayedProject(project: ProjectData, drag: DragSession): ProjectData {
  if (!drag.active || !drag.previewPatch) {
    return project;
  }
  return {
    ...project,
    graph: drag.previewPatch.graph,
  };
}

function chooseWallContinuationTarget(
  graph: WallGraph,
  start: { x: number; y: number; floorLevel: number },
  requestedTarget?: { x: number; y: number },
): { x: number; y: number } | null {
  if (requestedTarget) {
    return requestedTarget;
  }
  return null;
}

const initialProjectBase = createEmptyProjectData();
const initialDerived = deriveTopology(initialProjectBase.graph, []);
const initialProject: ProjectData = {
  ...initialProjectBase,
  roomMetadataMap: reconcileRoomMetadata(
    initialProjectBase.roomMetadataMap,
    [],
    initialDerived.roomReconciliation,
  ),
};

function resetDragSession(drag: DragSession): DragSession {
  return completeDrag(drag);
}

export const useFloorplannerStore = create<FloorplannerStore>((set, get) => ({
  project: initialProject,
  topology: initialDerived.topology,
  selection: initialSelection,
  viewport: initialProject.viewport,
  drag: emptyDrag,
  history: createInitialHistory(initialProject),
  persistence: {
    enabled: true,
    dirty: false,
    lastSavedAt: null,
    saveError: null,
  },
  debug: {
    devMode: true,
    lastValidationErrors: [],
    lastCommitDurationMs: null,
  },

  runGraphCommit: (mutator) => {
    const current = get();
    const before = cloneProject(current.project);
    const graphClone = cloneProject(before).graph;
    mutator(graphClone);
    const nextGraph = graphClone;

    const t0 = performance.now();
    const derived = deriveTopology(nextGraph, current.topology.faces);
    const nextProject: ProjectData = {
      ...before,
      graph: nextGraph,
      roomMetadataMap: reconcileRoomMetadata(
        before.roomMetadataMap,
        current.topology.faces,
        derived.roomReconciliation,
      ),
      meta: {
        ...before.meta,
        updatedAtIso: new Date().toISOString(),
      },
    };

    const validationIssues = validateInvariants(nextProject, derived.topology.faces);
    if (current.debug.devMode && validationIssues.some((issue) => issue.severity === "error")) {
      throw new Error(validationIssues.map((issue) => issue.message).join("; "));
    }

    set((state) => ({
      project: nextProject,
      topology: derived.topology,
      viewport: nextProject.viewport,
      history: pushHistory(state.history, nextProject),
      persistence: {
        ...state.persistence,
        dirty: true,
      },
      debug: {
        ...state.debug,
        lastValidationErrors: validationIssues,
        lastCommitDurationMs: performance.now() - t0,
      },
    }));
  },

  upsertNode: (node: Node) => {
    get().runGraphCommit((graph) => {
      graph.nodes[node.id] = node;
      return graph;
    });
  },

  upsertEdge: (edge: WallEdge) => {
    get().runGraphCommit((graph) => {
      graph.edges[edge.id] = edge;
      return graph;
    });
  },

  setViewport: (viewport: ViewportState) => {
    set((state) => ({
      viewport,
      project: {
        ...state.project,
        viewport,
      },
      persistence: {
        ...state.persistence,
        dirty: true,
      },
    }));
  },

  upsertOpening: (opening: OpeningObject) => {
    set((state) => ({
      project: {
        ...state.project,
        openings: {
          ...state.project.openings,
          [opening.id]: opening,
        },
      },
      persistence: { ...state.persistence, dirty: true },
    }));
  },

  upsertFurniture: (furniture: FurnitureObject) => {
    set((state) => ({
      project: {
        ...state.project,
        furniture: {
          ...state.project.furniture,
          [furniture.id]: furniture,
        },
      },
      persistence: { ...state.persistence, dirty: true },
    }));
  },

  upsertAnnotation: (annotation: AnnotationObject) => {
    set((state) => ({
      project: {
        ...state.project,
        annotations: {
          ...state.project.annotations,
          [annotation.id]: annotation,
        },
      },
      persistence: { ...state.persistence, dirty: true },
    }));
  },

  setSelection: (selection: SelectionState) => set({ selection }),
  clearSelection: () => set({ selection: initialSelection }),

  setDrag: (drag: DragSession) => set({ drag }),
  clearDrag: () => set({ drag: emptyDrag }),

  updateNodePosition: (nodeId: string, x: number, y: number) => {
    get().runGraphCommit((graph) => {
      const currentNode = graph.nodes[nodeId];
      if (!currentNode) {
        return graph;
      }
      graph.nodes[nodeId] = {
        ...currentNode,
        x,
        y,
      };
      return graph;
    });
  },

  updateEdgeThickness: (edgeId: EdgeId, thickness: number) => {
    get().runGraphCommit((graph) => {
      const currentEdge = graph.edges[edgeId];
      if (!currentEdge) {
        return graph;
      }
      graph.edges[edgeId] = {
        ...currentEdge,
        thickness,
      };
      return graph;
    });
  },

  startWallFromEdgePoint: (edgeId, point, options) => {
    let result: { startNodeId: string; newEdgeId: string | null } | null = null;

    get().runGraphCommit((graph) => {
      const prep = prepareDrawStartFromEdgePoint(graph, edgeId, point);
      const startNode = graph.nodes[prep.startNodeId];
      if (!startNode) {
        return graph;
      }

      const target = chooseWallContinuationTarget(graph, startNode, options?.targetPoint);
      if (!target) {
        result = {
          startNodeId: prep.startNodeId,
          newEdgeId: null,
        };
        return graph;
      }
      const targetNodeId = addNode(graph, {
        x: target.x,
        y: target.y,
        floorLevel: options?.floorLevel ?? startNode.floorLevel,
      });
      const newEdgeId = addEdge(graph, {
        nodeAId: prep.startNodeId,
        nodeBId: targetNodeId,
        floorLevel: options?.floorLevel ?? startNode.floorLevel,
        wallType: options?.wallType,
        thickness: options?.thickness,
      });
      result = {
        startNodeId: prep.startNodeId,
        newEdgeId,
      };
      return graph;
    });

    return result;
  },

  replaceProject: (project: ProjectData) => {
    const derived = deriveTopology(project.graph, []);
    const nextProject: ProjectData = {
      ...project,
      roomMetadataMap: reconcileRoomMetadata(project.roomMetadataMap, [], derived.roomReconciliation),
    };
    set(() => ({
      project: nextProject,
      topology: derived.topology,
      viewport: nextProject.viewport,
      history: createInitialHistory(nextProject),
      selection: initialSelection,
      drag: emptyDrag,
      persistence: {
        enabled: true,
        dirty: true,
        lastSavedAt: null,
        saveError: null,
      },
    }));
  },

  beginInteraction: (intent, draggingIds, startWorld) => {
    const current = get();
    const baseline = cloneProject(current.project).graph;
    const selectionIds = draggingIds.length > 0
      ? draggingIds
      : intent === "move-node"
        ? current.selection.nodeIds
        : intent === "move-wall"
          ? current.selection.edgeIds
          : [];

    const anchorWorld =
      intent === "move-node" && selectionIds.length > 0
        ? (() => {
            const nodeId = selectionIds[0];
            if (!nodeId) {
              return startWorld;
            }
            const node = current.project.graph.nodes[nodeId];
            return node ? { x: node.x, y: node.y } : startWorld;
          })()
        : startWorld;

    set((state) => ({
      drag: beginDrag(intent ?? "none", selectionIds, anchorWorld, baseline),
      project: state.project,
    }));
  },

  startWallPolyline: (startWorld, floorLevel = 0) => {
    const current = get();
    if (current.drag.active && current.drag.intent === "draw-wall") {
      return null;
    }

    const candidates = sortSnapCandidates(collectSnapCandidates(current.project.graph, startWorld));
    const snap = resolveSnapWithHysteresis(candidates, null);

    let nodeId: string | null = null;
    if (snap?.kind === "node" && current.project.graph.nodes[snap.id]) {
      nodeId = snap.id;
    } else {
      get().runGraphCommit((graph) => {
        nodeId = resolveOrCreatePolylineNode(graph, snap, startWorld, floorLevel);
        return graph;
      });
    }

    if (!nodeId) {
      return null;
    }

    const refreshed = get();
    const baseline = cloneProject(refreshed.project).graph;
    const startNode = refreshed.project.graph.nodes[nodeId];
    const startAnchor = startNode ? { x: startNode.x, y: startNode.y } : startWorld;
    set((state) => ({
      drag: {
        ...beginDrag("draw-wall", [nodeId as string], startAnchor, baseline),
        toolFlow: {
          activeTool: "draw-wall",
          drawWallPolylineNodeIds: [nodeId as string],
        },
        payload: {
          drawWallStartNodeId: nodeId,
          lastNodeId: nodeId,
          floorLevel,
        },
        snapLock: toSnapLock(snap),
      },
      project: state.project,
    }));

    return { startNodeId: nodeId as string };
  },

  startWallPolylineFromEdgePoint: (edgeId, point, floorLevel) => {
    const current = get();
    if (current.drag.active && current.drag.intent === "draw-wall") {
      return null;
    }
    if (!current.project.graph.edges[edgeId]) {
      return null;
    }

    let nodeId: string | null = null;
    get().runGraphCommit((graph) => {
      const edge = graph.edges[edgeId];
      if (!edge) {
        return graph;
      }
      const prep = prepareDrawStartFromEdgePoint(graph, edgeId, point);
      nodeId = prep.startNodeId;
      return graph;
    });

    if (!nodeId) {
      return null;
    }

    const refreshed = get();
    const baseline = cloneProject(refreshed.project).graph;
    const startNode = refreshed.project.graph.nodes[nodeId];
    const resolvedFloorLevel = floorLevel ?? startNode?.floorLevel ?? 0;
    const startAnchor = startNode ? { x: startNode.x, y: startNode.y } : point;

    set((state) => ({
      drag: {
        ...beginDrag("draw-wall", [nodeId as string], startAnchor, baseline),
        toolFlow: {
          activeTool: "draw-wall",
          drawWallPolylineNodeIds: [nodeId as string],
        },
        payload: {
          drawWallStartNodeId: nodeId,
          lastNodeId: nodeId,
          floorLevel: resolvedFloorLevel,
        },
      },
      project: state.project,
    }));

    return { startNodeId: nodeId as string };
  },

  addWallPolylinePoint: (pointerWorld: { x: number; y: number }) => {
    const current = get();
    if (!current.drag.active || current.drag.intent !== "draw-wall") {
      return null;
    }
    const committedGraph = current.project.graph;
    if (!committedGraph) {
      return null;
    }

    const resolved = resolveDrawWallEndpoint(current.drag, committedGraph, pointerWorld);
    if (!resolved) {
      return null;
    }
    const { payload, lastNodeId, fromNode, to: endWorld, snap } = resolved;
    const segmentLength = Math.hypot(endWorld.x - fromNode.x, endWorld.y - fromNode.y);
    if (segmentLength < MIN_EDGE_LENGTH_CM) {
      return null;
    }

    let createdEdgeId: string | null = null;
    let createdNodeId: string | null = null;
    let closedLoop = false;

    get().runGraphCommit((graph) => {
      const startNode = graph.nodes[lastNodeId];
      if (!startNode) {
        return graph;
      }
      const targetNodeId = resolveOrCreatePolylineNode(
        graph,
        snap,
        endWorld,
        payload?.floorLevel ?? startNode.floorLevel,
      );
      if (targetNodeId === startNode.id) {
        return graph;
      }

      createdNodeId = targetNodeId;
      createdEdgeId = addEdge(graph, {
        nodeAId: startNode.id,
        nodeBId: targetNodeId,
        floorLevel: payload?.floorLevel ?? startNode.floorLevel,
        wallType: "inner",
      });
      closedLoop = Boolean(
        payload?.drawWallStartNodeId && targetNodeId === payload.drawWallStartNodeId,
      );
      return graph;
    });

    if (!createdEdgeId || !createdNodeId) {
      return null;
    }

    if (closedLoop) {
      set((state) => ({
        drag: completeDrag(state.drag),
      }));
    } else {
      set((state) => ({
        drag: {
          ...state.drag,
          toolFlow: {
            ...state.drag.toolFlow,
            activeTool: "draw-wall",
            drawWallPolylineNodeIds: createdNodeId
              ? [...(state.drag.toolFlow.drawWallPolylineNodeIds ?? []), createdNodeId]
              : [...(state.drag.toolFlow.drawWallPolylineNodeIds ?? [])],
          },
          startWorld: { x: endWorld.x, y: endWorld.y },
          payload: {
            ...(state.drag.payload ?? {}),
            drawWallStartNodeId:
              (state.drag.payload as { drawWallStartNodeId?: string } | undefined)
                ?.drawWallStartNodeId ?? lastNodeId,
            lastNodeId: createdNodeId ?? undefined,
            floorLevel:
              (state.drag.payload as { floorLevel?: number } | undefined)?.floorLevel ??
              fromNode.floorLevel,
          },
          snapLock: toSnapLock(snap),
          previewPatch: null,
        },
      }));
    }

    return {
      edgeId: createdEdgeId,
      nodeId: createdNodeId,
      closedLoop,
    };
  },

  finishWallPolyline: () => {
    const current = get();
    if (!current.drag.active || current.drag.intent !== "draw-wall") {
      return false;
    }
    set((state) => ({
      drag: completeDrag(state.drag),
    }));
    return true;
  },

  previewWallPolyline: (pointerWorld) => {
    const current = get();
    if (!current.drag.active || current.drag.intent !== "draw-wall") {
      return null;
    }
    const committedGraph = current.project.graph;
    const resolved = resolveDrawWallEndpoint(current.drag, committedGraph, pointerWorld);
    if (!resolved) {
      return null;
    }

    const { from, to, snap } = resolved;
    const lengthCm = Math.hypot(to.x - from.x, to.y - from.y);

    set((state) => ({
      drag: {
        ...state.drag,
        snapLock: toSnapLock(snap) ?? state.drag.snapLock,
        previewPatch: {
          graph: structuredClone(state.project.graph),
          pointerWorld: { x: pointerWorld.x, y: pointerWorld.y },
          snappedWorld: { x: to.x, y: to.y },
          candidate: snap,
        },
      },
    }));

    return { from, to, lengthCm };
  },

  confirmWallPolylinePreview: () => {
    const current = get();
    if (!current.drag.active || current.drag.intent !== "draw-wall") {
      return null;
    }

    const preview = current.drag.previewPatch;
    if (!preview) {
      return null;
    }

    const resolved = resolveDrawWallEndpoint(current.drag, current.project.graph, preview.pointerWorld);
    if (!resolved) {
      return null;
    }
    const segmentLength = Math.hypot(resolved.to.x - resolved.from.x, resolved.to.y - resolved.from.y);
    if (segmentLength < MIN_EDGE_LENGTH_CM) {
      return null;
    }
    return get().addWallPolylinePoint({ x: resolved.to.x, y: resolved.to.y });
  },

  updateInteractionPreview: (pointerWorld) => {
    const current = get();
    if (!current.drag.active || !current.drag.intent || !current.drag.committedSnapshot) {
      return;
    }

    const baselineGraph = current.drag.committedSnapshot.graph;
    const candidates = sortSnapCandidates(collectSnapCandidates(baselineGraph, pointerWorld));
    const snap = resolveSnapWithHysteresis(candidates, current.drag.snapLock);
    let snappedPointer = snap ? { x: snap.x, y: snap.y } : pointerWorld;
    if (current.drag.intent === "draw-wall" || current.drag.intent === "move-node") {
      snappedPointer = applySoftOrthogonalGuide(current.drag, snappedPointer);
    }

    if (current.drag.intent === "move-node") {
      const nextDrag = updateMoveNodePreview(current.drag, snappedPointer, snap);
      set(() => ({ drag: nextDrag }));
    }
  },

  commitInteraction: () => {
    const current = get();
    if (!current.drag.active) {
      return;
    }

    const committedGraph = current.drag.previewPatch?.graph;
    if (committedGraph) {
      current.runGraphCommit((graph) => {
        graph.nodes = structuredClone(committedGraph.nodes);
        graph.edges = structuredClone(committedGraph.edges);
        return graph;
      });
    }

    set((state) => ({
      drag: completeDrag(state.drag),
      project: state.project,
    }));
  },

  cancelInteraction: () => {
    set((state) => ({
      drag: cancelDrag(),
      project: state.project,
    }));
  },

  undo: () => {
    set((state) => {
      const unchanged = state.history.past.length === 0;
      const history = undoHistory(state.history);
      if (unchanged) {
        return state;
      }
      const derived = deriveTopology(history.present.graph, state.topology.faces);
      const project: ProjectData = {
        ...history.present,
        roomMetadataMap: reconcileRoomMetadata(
          history.present.roomMetadataMap,
          state.topology.faces,
          derived.roomReconciliation,
        ),
      };
      return {
        history,
        project,
        topology: derived.topology,
        viewport: project.viewport,
        persistence: {
          ...state.persistence,
          dirty: true,
        },
      };
    });
  },

  redo: () => {
    set((state) => {
      const unchanged = state.history.future.length === 0;
      const history = redoHistory(state.history);
      if (unchanged) {
        return state;
      }
      const derived = deriveTopology(history.present.graph, state.topology.faces);
      const project: ProjectData = {
        ...history.present,
        roomMetadataMap: reconcileRoomMetadata(
          history.present.roomMetadataMap,
          state.topology.faces,
          derived.roomReconciliation,
        ),
      };
      return {
        history,
        project,
        topology: derived.topology,
        viewport: project.viewport,
        persistence: {
          ...state.persistence,
          dirty: true,
        },
      };
    });
  },

  markSaved: () =>
    set((state) => ({
      persistence: {
        ...state.persistence,
        dirty: false,
        lastSavedAt: Date.now(),
        saveError: null,
      },
    })),

  setSaveError: (message: string) =>
    set((state) => ({
      persistence: {
        ...state.persistence,
        saveError: message,
      },
    })),

  setDevMode: (enabled: boolean) =>
    set((state) => ({
      debug: {
        ...state.debug,
        devMode: enabled,
      },
    })),

  getRenderedProject: () => {
    const state = get();
    return getDisplayedProject(state.project, state.drag);
  },
}));
