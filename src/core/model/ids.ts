import { v4 as uuidv4 } from "uuid";

export type NodeId = string;
export type EdgeId = string;
export type FaceId = string;
export type RoomMetadataId = string;
export type OpeningId = string;
export type FurnitureId = string;
export type AnnotationId = string;

export const makeId = (): string => uuidv4();

export const createNodeId = (): NodeId => makeId();
export const createEdgeId = (): EdgeId => makeId();
export const createFaceId = (): FaceId => makeId();
export const createRoomMetadataId = (): RoomMetadataId => makeId();
export const createOpeningId = (): OpeningId => makeId();
export const createFurnitureId = (): FurnitureId => makeId();
export const createAnnotationId = (): AnnotationId => makeId();
