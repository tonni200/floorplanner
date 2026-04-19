import { describe, expect, it } from "vitest";
import { useFloorplannerStore } from "../../store/createStore";
import { createDefaultProjectData } from "../../core/model/defaults";
import { addEdge, addNode } from "../../core/graph/graphOps";

describe("draw from wall point", () => {
  it("splits host wall and creates a new connected edge", () => {
    const state = useFloorplannerStore.getState();
    state.replaceProject(createDefaultProjectData());

    const project = createDefaultProjectData();
    const a = addNode(project.graph, { x: 0, y: 0, floorLevel: 0 });
    const b = addNode(project.graph, { x: 400, y: 0, floorLevel: 0 });
    const c = addNode(project.graph, { x: 400, y: 200, floorLevel: 0 });
    const hostEdgeId = addEdge(project.graph, { nodeAId: a, nodeBId: b, floorLevel: 0 });
    state.replaceProject(project);

    const result = state.startWallFromEdgePoint(
      hostEdgeId,
      { x: 200, y: 0 },
      { targetPoint: { x: 400, y: 200 } },
    );

    expect(result).not.toBeNull();
    if (!result) {
      return;
    }
    const after = useFloorplannerStore.getState().project.graph;

    // Host edge replaced by two edges + continuation edge.
    expect(after.edges[hostEdgeId]).toBeUndefined();
    expect(after.nodes[result.startNodeId]).toBeDefined();
    expect(after.edges[result.newEdgeId]).toBeDefined();
    expect(after.edges[result.newEdgeId]?.nodeAId).toBe(result.startNodeId);

    const continuation = after.edges[result.newEdgeId];
    const continuationEndId =
      continuation?.nodeAId === result.startNodeId ? continuation.nodeBId : continuation?.nodeAId;
    expect(continuationEndId).toBeDefined();
    expect(after.nodes[continuationEndId ?? ""]).toBeDefined();
    expect(after.nodes[continuationEndId ?? ""]?.x).toBe(400);
  });

  it("returns split-only result when no continuation target is provided", () => {
    const state = useFloorplannerStore.getState();
    state.replaceProject(createDefaultProjectData());

    const project = createDefaultProjectData();
    const a = addNode(project.graph, { x: 0, y: 0, floorLevel: 0 });
    const b = addNode(project.graph, { x: 300, y: 0, floorLevel: 0 });
    const hostEdgeId = addEdge(project.graph, { nodeAId: a, nodeBId: b, floorLevel: 0 });
    state.replaceProject(project);

    const result = state.startWallFromEdgePoint(hostEdgeId, { x: 120, y: 0 });
    expect(result).not.toBeNull();
    if (!result) {
      return;
    }

    const after = useFloorplannerStore.getState().project.graph;
    expect(after.edges[hostEdgeId]).toBeUndefined();
    expect(result.newEdgeId).toBeNull();
  });
});
