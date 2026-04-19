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
import type { DragSession } from "../core/drag/dragSessionTypes";
import type { FloorplannerStore, TopologyState, SelectionState } from "./types";
import {
  beginInteraction as beginDrag,
  cancelInteraction as cancelDrag,
  updateMoveNodePreview,
} from "../core/drag/interactionPipeline";
import { collectSnapCandidates } from "../core/snap/snapEngine";
import { resolveSnapWithHysteresis } from "../core/snap/hysteresis";

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
  committedSnapshot: null,
  previewPatch: null,
  snapLock: null,
  startWorld: null,
};

function getDisplayedProject(project: ProjectData, drag: DragSession): ProjectData {
  if (!drag.active || !drag.previewPatch) {
    return project;
  }
  return {
    ...project,
    graph: drag.previewPatch.graph,
  };
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

    set((state) => ({
      drag: beginDrag(intent ?? "none", selectionIds, startWorld, baseline),
      project: state.project,
    }));
  },

  updateInteractionPreview: (pointerWorld) => {
    const current = get();
    if (!current.drag.active || !current.drag.intent || !current.drag.committedSnapshot) {
      return;
    }

    const baselineGraph = current.drag.committedSnapshot.graph;
    const candidates = collectSnapCandidates(baselineGraph, pointerWorld);
    const snap = resolveSnapWithHysteresis(candidates, current.drag.snapLock);
    const snappedPointer = snap ? { x: snap.x, y: snap.y } : pointerWorld;

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
      });
    }

    set((state) => ({
      drag: emptyDrag,
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
