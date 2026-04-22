import type { ProjectData } from "../model/projectTypes";
import type { HistoryState } from "./historyTypes";

export function createInitialHistory(initial: ProjectData): HistoryState {
  return {
    past: [],
    present: structuredClone(initial),
    future: [],
  };
}

export function pushHistory(state: HistoryState, next: ProjectData): HistoryState {
  return {
    past: [...state.past, structuredClone(state.present)],
    present: structuredClone(next),
    future: [],
  };
}

export function undoHistory(state: HistoryState): HistoryState {
  const last = state.past[state.past.length - 1];
  if (!last) {
    return state;
  }

  return {
    past: state.past.slice(0, -1),
    present: structuredClone(last),
    future: [structuredClone(state.present), ...state.future],
  };
}

export function redoHistory(state: HistoryState): HistoryState {
  const next = state.future[0];
  if (!next) {
    return state;
  }

  return {
    past: [...state.past, structuredClone(state.present)],
    present: structuredClone(next),
    future: state.future.slice(1).map((snapshot) => structuredClone(snapshot)),
  };
}
