import type { Face } from "../model/projectTypes";

const round = (v: number): number => Math.round(v * 1000) / 1000;

export function computeFaceFingerprint(face: Pick<Face, "polygon" | "floorLevel">): string {
  const signature = face.polygon.map((p) => `${round(p.x)}:${round(p.y)}`).join("|");
  return `${face.floorLevel}:${signature}`;
}
