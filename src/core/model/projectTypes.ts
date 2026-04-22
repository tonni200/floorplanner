export type UUID = string;
export type FloorLevel = number;
export type IdString = string;

export type NodeId = UUID;
export type EdgeId = UUID;
export type WallEdgeId = EdgeId;
export type FaceId = UUID;
export type RoomMetadataId = UUID;
export type OpeningId = UUID;
export type FurnitureId = UUID;
export type AnnotationId = UUID;

export interface Point2D {
  x: number;
  y: number;
}

export type Point = Point2D;
export type Point2 = Point2D;

export interface Node extends Point2D {
  id: NodeId;
  floorLevel: FloorLevel;
}

export type WallType = "inner" | "outer" | "glass" | "partition";

export interface WallEdge {
  id: EdgeId;
  nodeAId: NodeId;
  nodeBId: NodeId;
  thickness: number;
  wallType: WallType;
  materialId?: string;
  curve?: unknown;
  height?: number;
  baseElevation?: number;
  floorLevel: FloorLevel;
}

export interface WallGraph {
  nodes: Record<NodeId, Node>;
  edges: Record<EdgeId, WallEdge>;
}

export interface Face {
  id: FaceId;
  polygon: Point2D[];
  centroid: Point2D;
  area: number;
  edgeIds: EdgeId[];
  fingerprint: string;
  floorLevel: FloorLevel;
}

export type RoomState = "ok" | "open" | "invalid" | "orphaned";
export type RoomType =
  | "unspecified"
  | "bedroom"
  | "living_room"
  | "dining"
  | "kitchen"
  | "bathroom"
  | "activity_room"
  | "pool_wellness"
  | "outdoor"
  | "building_structure";

export interface FloorStyle {
  materialId?: string;
  pattern?: string;
  tint?: string;
  tintOpacity?: number;
  scale?: number;
  rotation?: number;
}

export interface RoomMetadata {
  id: RoomMetadataId;
  faceId: FaceId | null;
  floorLevel: FloorLevel;
  label: string;
  roomType: RoomType;
  showLabel: boolean;
  showArea: boolean;
  floor: FloorStyle;
  state: RoomState;
  userEdited: boolean;
}

export type OpeningSubtype =
  | "interior_door"
  | "double_door"
  | "sliding_door"
  | "folding_door"
  | "small_window"
  | "large_window"
  | "panorama_window"
  | "skylight";

export interface OpeningObject {
  id: OpeningId;
  subtype: OpeningSubtype;
  hostEdgeId: EdgeId;
  offsetOnEdge: number;
  width: number;
  height: number;
  sillHeight?: number;
  headHeight?: number;
  floorLevel: FloorLevel;
  swing?: "left" | "right" | "double";
  slide?: "left" | "right" | "center";
  recoveryFingerprint?: string;
}

export type FurnitureSubtype = string;

export interface FurnitureAttachment {
  mode: "free" | "wall" | "corner" | "room";
  hostEdgeId?: EdgeId;
  hostNodeId?: NodeId;
  roomMetadataId?: RoomMetadataId;
  offset?: number;
}

export interface FurnitureObject {
  id: FurnitureId;
  subtype: FurnitureSubtype;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  locked: boolean;
  floorLevel: FloorLevel;
  attachment?: FurnitureAttachment;
  constraints?: Record<string, unknown>;
  parentRoomId?: RoomMetadataId;
}

export type AnnotationSubtype =
  | "note_marker"
  | "arrow_annotation"
  | "dimension_line"
  | "north_arrow";

export interface AnnotationObject {
  id: AnnotationId;
  subtype: AnnotationSubtype;
  x: number;
  y: number;
  floorLevel: FloorLevel;
  metadata?: Record<string, unknown>;
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
  floorLevel: FloorLevel;
}

export interface ProjectMeta {
  title: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface ProjectData {
  schemaVersion: number;
  graph: WallGraph;
  roomMetadataMap: Record<RoomMetadataId, RoomMetadata>;
  furniture: Record<FurnitureId, FurnitureObject>;
  openings: Record<OpeningId, OpeningObject>;
  annotations: Record<AnnotationId, AnnotationObject>;
  viewport: ViewportState;
  meta: ProjectMeta;
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

export type SelectionKind = "none" | "node" | "edge" | "room" | "opening" | "furniture" | "annotation";
export type EntityKind = Exclude<SelectionKind, "none">;
