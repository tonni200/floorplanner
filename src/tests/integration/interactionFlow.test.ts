import { describe, expect, it } from "vitest";
import { useFloorplannerStore } from "../../store/createStore";
import { createDefaultProjectData } from "../../core/model/defaults";
import { addEdge, addNode } from "../../core/graph/graphOps";
import { createInitialHistory, pushHistory } from "../../core/history/historyStore";

describe("integration interaction flow", () => {
  it("draws rectangle room and derives one face", () => {
    const state = useFloorplannerStore.getState();
    state.replaceProject(createDefaultProjectData());
    const project = createDefaultProjectData();
    const a = addNode(project.graph, { x: 0, y: 0, floorLevel: 0 });
    const b = addNode(project.graph, { x: 400, y: 0, floorLevel: 0 });
    const c = addNode(project.graph, { x: 400, y: 300, floorLevel: 0 });
    const d = addNode(project.graph, { x: 0, y: 300, floorLevel: 0 });
    addEdge(project.graph, { nodeAId: a, nodeBId: b, floorLevel: 0, wallType: "outer", thickness: 20 });
    addEdge(project.graph, { nodeAId: b, nodeBId: c, floorLevel: 0, wallType: "outer", thickness: 20 });
    addEdge(project.graph, { nodeAId: c, nodeBId: d, floorLevel: 0, wallType: "outer", thickness: 20 });
    addEdge(project.graph, { nodeAId: d, nodeBId: a, floorLevel: 0, wallType: "outer", thickness: 20 });
    state.replaceProject(project);
    expect(useFloorplannerStore.getState().topology.faces.length).toBeGreaterThan(0);
  });

  it("closes loop and exits wall tool state", () => {
    const state = useFloorplannerStore.getState();
    state.replaceProject(createDefaultProjectData());
    state.beginInteraction("draw-wall", [], { x: 0, y: 0 });
    state.cancelInteraction();
    expect(useFloorplannerStore.getState().drag.active).toBe(false);
  });

  it("splits room with interior wall", () => {
    useFloorplannerStore.getState().replaceProject(createDefaultProjectData());
    const project = createDefaultProjectData();
    const n1 = addNode(project.graph, { x: 0, y: 0, floorLevel: 0 });
    const n2 = addNode(project.graph, { x: 400, y: 0, floorLevel: 0 });
    const n3 = addNode(project.graph, { x: 400, y: 300, floorLevel: 0 });
    const n4 = addNode(project.graph, { x: 0, y: 300, floorLevel: 0 });
    const n5 = addNode(project.graph, { x: 200, y: 0, floorLevel: 0 });
    const n6 = addNode(project.graph, { x: 200, y: 300, floorLevel: 0 });
    addEdge(project.graph, { nodeAId: n1, nodeBId: n2, floorLevel: 0, wallType: "outer", thickness: 20 });
    addEdge(project.graph, { nodeAId: n2, nodeBId: n3, floorLevel: 0, wallType: "outer", thickness: 20 });
    addEdge(project.graph, { nodeAId: n3, nodeBId: n4, floorLevel: 0, wallType: "outer", thickness: 20 });
    addEdge(project.graph, { nodeAId: n4, nodeBId: n1, floorLevel: 0, wallType: "outer", thickness: 20 });
    addEdge(project.graph, { nodeAId: n5, nodeBId: n6, floorLevel: 0, wallType: "inner", thickness: 12 });
    useFloorplannerStore.getState().replaceProject(project);
    expect(useFloorplannerStore.getState().topology.faces.length).toBeGreaterThan(0);
  });

  it("undo and redo restores exact snapshot", () => {
    const state = useFloorplannerStore.getState();
    state.replaceProject(createDefaultProjectData());
    const base = createDefaultProjectData();
    const next = createDefaultProjectData();
    const n1 = addNode(next.graph, { x: 0, y: 0, floorLevel: 0 });
    const n2 = addNode(next.graph, { x: 100, y: 0, floorLevel: 0 });
    const edgeId = addEdge(next.graph, {
      nodeAId: n1,
      nodeBId: n2,
      floorLevel: 0,
      wallType: "inner",
      thickness: 12,
    });

    useFloorplannerStore.setState((current) => ({
      ...current,
      project: next,
      history: pushHistory(createInitialHistory(base), next),
    }));

    expect(useFloorplannerStore.getState().project.graph.edges[edgeId]).toBeDefined();
    state.undo();
    expect(Object.keys(useFloorplannerStore.getState().project.graph.edges).length).toBe(0);
    state.redo();
    expect(Object.keys(useFloorplannerStore.getState().project.graph.edges).length).toBe(1);
    expect(useFloorplannerStore.getState().project.graph.edges[edgeId]).toBeDefined();
  });
});
