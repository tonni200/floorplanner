import type { DragSession } from "../core/drag/dragSessionTypes";
import type { HistoryState } from "../core/history/historyTypes";
import type {
  AnnotationObject,
  EdgeId,
  Face,
  FloorLevel,
  FurnitureObject,
  Node,
  NodeId,
  OpeningObject,
  Point2D,
  ProjectData,
  ViewportState,
  WallEdge,
} from "../core/model/projectTypes";
import type { ValidationIssue } from "../core/validation/validationErrors";

export interface TopologyState {
  faces: Face[];
  openChains: string[];
  invalidFaces: string[];
  lastDerivedAt: number;
}

export interface SelectionState {
  nodeIds: NodeId[];
  edgeIds: EdgeId[];
  roomIds: string[];
  openingIds: string[];
  furnitureIds: string[];
  annotationIds: string[];
  marquee: { start: Point2D; end: Point2D } | null;
}

export interface PersistenceState {
  enabled: boolean;
  dirty: boolean;
  lastSavedAt: number | null;
  saveError: string | null;
}

export interface DebugState {
  devMode: boolean;
  lastValidationErrors: ValidationIssue[];
  lastCommitDurationMs: number | null;
}

export interface FloorplannerStoreState {
  project: ProjectData;
  topology: TopologyState;
  selection: SelectionState;
  viewport: ViewportState;
  drag: DragSession;
  history: HistoryState;
  persistence: PersistenceState;
  debug: DebugState;
}

export interface FloorplannerStoreActions {
  runGraphCommit: (mutator: (graph: ProjectData["graph"]) => ProjectData["graph"]) => void;
  replaceProject: (project: ProjectData) => void;
  upsertNode: (node: Node) => void;
  upsertEdge: (edge: WallEdge) => void;
  setViewport: (viewport: ViewportState) => void;
  upsertOpening: (opening: OpeningObject) => void;
  upsertFurniture: (furniture: FurnitureObject) => void;
  upsertAnnotation: (annotation: AnnotationObject) => void;
  updateNodePosition: (nodeId: NodeId, x: number, y: number) => void;
  startWallFromEdgePoint: (
    edgeId: EdgeId,
    point: Point2D,
    options?: {
      wallType?: WallEdge["wallType"];
      thickness?: number;
      floorLevel?: FloorLevel;
      targetPoint?: Point2D;
    },
  ) => { startNodeId: NodeId; newEdgeId: EdgeId } | null;
  updateEdgeThickness: (edgeId: EdgeId, thickness: number) => void;
  setSelection: (selection: SelectionState) => void;
  clearSelection: () => void;
  setDrag: (drag: DragSession) => void;
  clearDrag: () => void;
  markSaved: () => void;
  setSaveError: (message: string) => void;
  setDevMode: (enabled: boolean) => void;
  beginInteraction: (
    intent: DragSession["intent"],
    draggingIds: string[],
    startWorld: Point2D,
    floorLevel?: FloorLevel,
  ) => void;
  updateInteractionPreview: (pointerWorld: Point2D) => void;
  commitInteraction: () => void;
  cancelInteraction: () => void;
  undo: () => void;
  redo: () => void;
}

export type FloorplannerStore = FloorplannerStoreState & FloorplannerStoreActions;
