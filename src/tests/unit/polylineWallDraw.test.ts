import { describe, expect, it } from "vitest";
import { useFloorplannerStore } from "../../store/createStore";
import { createDefaultProjectData } from "../../core/model/defaults";
import { addEdge, addNode } from "../../core/graph/graphOps";

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

  it("returns deterministic preview data and commits via confirm action", () => {
    const state = useFloorplannerStore.getState();
    state.replaceProject(createDefaultProjectData());

    const started = state.startWallPolyline({ x: 100, y: 100 }, 0);
    expect(started).toBeTruthy();
    if (!started) {
      return;
    }

    const preview = state.previewWallPolyline({ x: 220, y: 118 });
    expect(preview).toBeTruthy();
    expect(preview?.from).toEqual({ x: 100, y: 100 });
    expect(preview?.to.x).toBeGreaterThan(100);
    expect(preview?.lengthCm).toBeGreaterThan(0);

    const confirmed = state.confirmWallPolylinePreview();
    expect(confirmed).toBeTruthy();
    expect(confirmed?.closedLoop).toBe(false);
    expect(Object.keys(useFloorplannerStore.getState().project.graph.edges)).toHaveLength(1);
    expect(useFloorplannerStore.getState().drag.previewPatch).toBeNull();
  });

  it("does not confirm when no live preview exists", () => {
    const state = useFloorplannerStore.getState();
    state.replaceProject(createDefaultProjectData());

    state.startWallPolyline({ x: 10, y: 10 }, 0);
    const confirmed = state.confirmWallPolylinePreview();
    expect(confirmed).toBeNull();
  });

  it("reuses existing wall endpoint node when snapping near it", () => {
    const state = useFloorplannerStore.getState();
    const project = createDefaultProjectData();
    const a = addNode(project.graph, { x: 100, y: 100, floorLevel: 0 });
    const b = addNode(project.graph, { x: 300, y: 100, floorLevel: 0 });
    addEdge(project.graph, { nodeAId: a, nodeBId: b, floorLevel: 0, wallType: "inner" });
    state.replaceProject(project);

    const started = state.startWallPolyline({ x: 302, y: 102 }, 0);
    expect(started).toBeTruthy();
    expect(started?.startNodeId).toBe(b);

    const graph = useFloorplannerStore.getState().project.graph;
    expect(Object.keys(graph.nodes).length).toBe(2);
  });

  it("splits host wall when drawing into wall midpoint", () => {
    const state = useFloorplannerStore.getState();
    const project = createDefaultProjectData();
    const a = addNode(project.graph, { x: 100, y: 100, floorLevel: 0 });
    const b = addNode(project.graph, { x: 300, y: 100, floorLevel: 0 });
    const c = addNode(project.graph, { x: 300, y: 250, floorLevel: 0 });
    const hostEdgeId = addEdge(project.graph, { nodeAId: a, nodeBId: b, floorLevel: 0, wallType: "inner" });
    state.replaceProject(project);

    const started = state.startWallPolyline({ x: 200, y: 100 }, 0);
    expect(started).toBeTruthy();
    if (!started) {
      return;
    }

    const result = state.addWallPolylinePoint({ x: 300, y: 250 });
    expect(result).toBeTruthy();

    const graph = useFloorplannerStore.getState().project.graph;
    expect(graph.edges[hostEdgeId]).toBeUndefined();
    expect(Object.keys(graph.nodes).length).toBe(4);
    expect(Object.keys(graph.edges).length).toBe(3);
  });

  it("starts polyline deterministically from explicit edge point split", () => {
    const state = useFloorplannerStore.getState();
    const project = createDefaultProjectData();
    const a = addNode(project.graph, { x: 100, y: 100, floorLevel: 0 });
    const b = addNode(project.graph, { x: 300, y: 100, floorLevel: 0 });
    const hostEdgeId = addEdge(project.graph, { nodeAId: a, nodeBId: b, floorLevel: 0, wallType: "inner" });
    state.replaceProject(project);

    const started = state.startWallPolylineFromEdgePoint(hostEdgeId, { x: 180, y: 100 });
    expect(started).toBeTruthy();
    if (!started) {
      return;
    }

    const graph = useFloorplannerStore.getState().project.graph;
    expect(graph.edges[hostEdgeId]).toBeUndefined();
    expect(graph.nodes[started.startNodeId]).toBeDefined();
    expect(useFloorplannerStore.getState().drag.active).toBe(true);
    expect(useFloorplannerStore.getState().drag.intent).toBe("draw-wall");
  });

  it("anchors polyline start world to snapped start node", () => {
    const state = useFloorplannerStore.getState();
    const project = createDefaultProjectData();
    const a = addNode(project.graph, { x: 100, y: 100, floorLevel: 0 });
    const b = addNode(project.graph, { x: 300, y: 100, floorLevel: 0 });
    addEdge(project.graph, { nodeAId: a, nodeBId: b, floorLevel: 0, wallType: "inner" });
    state.replaceProject(project);

    const started = state.startWallPolyline({ x: 296, y: 104 }, 0);
    expect(started).toBeTruthy();
    if (!started) {
      return;
    }

    const drag = useFloorplannerStore.getState().drag;
    expect(drag.startWorld).toEqual({ x: 300, y: 100 });
  });
});
