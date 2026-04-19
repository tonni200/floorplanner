import type { ProjectData } from "../model/projectTypes";

export function migrateProjectData(input: unknown): ProjectData | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }
  const maybeProject = input as Partial<ProjectData>;
  if (typeof maybeProject.schemaVersion !== "number") {
    return null;
  }

  // v1 foundation: schema is current and strict, so pass-through.
  // Future versions should transform into latest ProjectData.
  return maybeProject as ProjectData;
}
