import { createDefaultRoomMetadata } from "../model/defaults";
import type { Face, RoomMetadata, RoomMetadataId } from "../model/projectTypes";
import type { FaceReconciliationResult } from "./faceReconciliation";

export function reconcileRoomMetadata(
  oldRooms: Record<RoomMetadataId, RoomMetadata>,
  oldFaces: Face[],
  reconciliation: FaceReconciliationResult,
): Record<RoomMetadataId, RoomMetadata> {
  const nextRooms: Record<RoomMetadataId, RoomMetadata> = {};
  const oldFaceSet = new Set(oldFaces.map((face) => face.id));

  for (const room of Object.values(oldRooms)) {
    if (!room.faceId || !oldFaceSet.has(room.faceId)) {
      nextRooms[room.id] = {
        ...room,
        faceId: null,
        state: "orphaned",
      };
      continue;
    }

    const nextFaceId = reconciliation.oldToNewFaceId[room.faceId];
    if (!nextFaceId) {
      nextRooms[room.id] = {
        ...room,
        faceId: null,
        state: "orphaned",
      };
      continue;
    }

    const face = reconciliation.nextFaces.find((candidate) => candidate.id === nextFaceId);
    if (!face) {
      nextRooms[room.id] = {
        ...room,
        faceId: null,
        state: "orphaned",
      };
      continue;
    }

    nextRooms[room.id] = {
      ...room,
      faceId: face.id,
      floorLevel: face.floorLevel,
      state: "ok",
    };
  }

  for (const face of reconciliation.nextFaces) {
    const hasRoom = Object.values(nextRooms).some((room) => room.faceId === face.id);
    if (hasRoom) {
      continue;
    }
    const room = createDefaultRoomMetadata(face.id, face.floorLevel);
    nextRooms[room.id] = room;
  }

  return nextRooms;
}
