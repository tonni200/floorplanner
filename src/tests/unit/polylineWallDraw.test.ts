import { describe, expect, it } from "vitest";
import { useFloorplannerStore } from "../../store/createStore";
import { createDefaultProjectData } from "../../core/model/defaults";

describe("polyline wall draw flow", () => {
  it("creates connected walls over multiple points", () => {
    const state = useFloorplannerStore.getState();
    state.replaceProject(createDefaultProjectData());

    const started = state.startWallPolyline({ x: 100, y: 100 }, 0);
    expect(started).toBeTruthy();
    if (!started) {
      return;
    }

    const seg1 = state.addWallPolylinePoint({ x: 300, y: 100 });
    expect(seg1).toBeTruthy();
    const seg2 = state.addWallPolylinePoint({ x: 300, y: 260 });
    expect(seg2).toBeTruthy();
    const finished = state.finishWallPolyline();
    expect(finished).toBeTruthy();

    const graph = useFloorplannerStore.getState().project.graph;
    expect(Object.keys(graph.edges).length).toBe(2);
  });

  it("auto-exits wall tool when loop closes to starting node", () => {
    const state = useFloorplannerStore.getState();
    state.replaceProject(createDefaultProjectData());

    const started = state.startWallPolyline({ x: 50, y: 50 }, 0);
    expect(started).toBeTruthy();
    if (!started) {
      return;
    }

    state.addWallPolylinePoint({ x: 250, y: 50 });
    state.addWallPolylinePoint({ x: 250, y: 200 });
    const closing = state.addWallPolylinePoint({ x: 50, y: 50 });

    expect(closing).toBeTruthy();
    expect(closing?.closedLoop).toBe(true);
    expect(useFloorplannerStore.getState().drag.active).toBe(false);
    expect(useFloorplannerStore.getState().drag.intent).toBeNull();
  });
});
