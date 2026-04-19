import type { ProjectData } from "../model/projectTypes";
import { migrateProjectData } from "./migrations";

const STORAGE_KEY = "summerhouse-floorplanner-project";

export function saveProject(project: ProjectData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}

export function loadProject(): ProjectData | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return migrateProjectData(parsed);
  } catch {
    return null;
  }
}
