import { describe, expect, it } from "vitest";

import { resolveSnapWithHysteresis } from "../../core/snap/hysteresis";
import type { SnapCandidate, SnapLock } from "../../core/snap/snapTypes";

const makeCandidate = (
  id: string,
  kind: SnapCandidate["kind"],
  score: number,
): SnapCandidate => ({
  id,
  kind,
  x: 0,
  y: 0,
  score,
});

describe("snap hysteresis", () => {
  it("keeps lock unless another candidate beats switch threshold", () => {
    const lock: SnapLock = {
      candidateId: "node-1",
      kind: "node",
      lockScore: 0.9,
    };
    const candidates = [makeCandidate("node-1", "node", 0.89), makeCandidate("wall-1", "wall", 0.91)];
    const chosen = resolveSnapWithHysteresis(candidates, lock);
    expect(chosen).not.toBeNull();
    expect(chosen?.id).toBe("node-1");
  });

  it("switches when a significantly better candidate appears", () => {
    const lock: SnapLock = {
      candidateId: "node-1",
      kind: "node",
      lockScore: 0.65,
    };
    const candidates = [makeCandidate("node-1", "node", 0.65), makeCandidate("node-2", "node", 0.9)];
    const chosen = resolveSnapWithHysteresis(candidates, lock);
    expect(chosen).not.toBeNull();
    expect(chosen?.id).toBe("node-2");
  });
});
