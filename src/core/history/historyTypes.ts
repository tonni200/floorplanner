import type { ProjectData } from "../model/projectTypes";

export interface HistoryState {
  past: ProjectData[];
  present: ProjectData;
  future: ProjectData[];
}

