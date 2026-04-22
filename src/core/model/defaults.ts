import { createRoomMetadataId } from "./ids";
import type {
  FloorStyle,
  ProjectData,
  RoomMetadata,
  RoomType,
  ViewportState,
} from "./projectTypes";

export const DEFAULT_WALL_THICKNESS_CM = 18;
export const DEFAULT_WALL_HEIGHT_CM = 240;
export const DEFAULT_FLOOR_LEVEL = 0;
export const PROJECT_SCHEMA_VERSION = 1;

export function defaultViewport(): ViewportState {
  return { x: 0, y: 0, zoom: 1, floorLevel: DEFAULT_FLOOR_LEVEL };
}

export function defaultFloorStyle(): FloorStyle {
  return {
    materialId: "default-wood",
    pattern: "solid",
    tint: "#c9c4b8",
    tintOpacity: 1,
    scale: 1,
    rotation: 0,
  };
}

export function createDefaultRoomMetadata(
  faceId: string | null,
  floorLevel: number,
  roomType: RoomType = "unspecified",
): RoomMetadata {
  return {
    id: createRoomMetadataId(),
    faceId,
    floorLevel,
    label: "Room",
    roomType,
    showLabel: true,
    showArea: true,
    floor: defaultFloorStyle(),
    state: faceId ? "ok" : "orphaned",
    userEdited: false,
  };
}

export function createEmptyProjectData(): ProjectData {
  const now = new Date().toISOString();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    graph: {
      nodes: {},
      edges: {},
    },
    roomMetadataMap: {},
    furniture: {},
    openings: {},
    annotations: {},
    viewport: defaultViewport(),
    meta: {
      title: "Untitled Summerhouse",
      createdAtIso: now,
      updatedAtIso: now,
    },
  };
}

export function createDefaultProjectData(): ProjectData {
  return createEmptyProjectData();
}
