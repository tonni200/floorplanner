import { SNAP_SWITCH_MIN_DELTA } from "../constants/tolerances";
import type { SnapCandidate, SnapLock } from "./snapTypes";

export const resolveSnapWithHysteresis = (
  candidates: SnapCandidate[],
  currentLock: SnapLock | null,
): SnapCandidate | null => {
  if (candidates.length === 0) {
    return null;
  }

  const sortedCandidates = [...candidates].sort((a, b) => b.score - a.score);
  const best = sortedCandidates[0];
  if (!best) {
    return null;
  }

  if (!currentLock) {
    return best;
  }

  const locked = sortedCandidates.find((candidate) => candidate.id === currentLock.candidateId);
  if (!locked) {
    return best;
  }

  if (locked.id === best.id) {
    return locked;
  }

  if (best.score - locked.score < SNAP_SWITCH_MIN_DELTA) {
    return locked;
  }

  return best;
};
