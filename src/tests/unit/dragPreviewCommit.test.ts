import { describe, expect, it } from "vitest";
import { useFloorplannerStore } from "../../store/createStore";
import { createDefaultProjectData } from "../../core/model/defaults";
import { addEdge, addNode } from "../../core/graph/graphOps";

describe("drag preview/commit pipeline", () => {
  it("does not mutate committed graph during preview", () => {
    useFloorplannerStore.getState().replaceProject(createDefaultProjectData());

    const project = createDefaultProjectData();
    const a = addNode(project.graph, { x: 100, y: 100, floorLevel: 0 });
    const b = addNode(project.graph, { x: 300, y: 100, floorLevel: 0 });
    addEdge(project.graph, { nodeAId: a, nodeBId: b, floorLevel: 0 });
    useFloorplannerStore.getState().replaceProject(project);

    const beforeX = useFloorplannerStore.getState().project.graph.nodes[a]?.x;
    expect(beforeX).toBe(100);

    useFloorplannerStore.getState().beginInteraction("move-node", [a], { x: 100, y: 100 });
    useFloorplannerStore.getState().updateInteractionPreview({ x: 160, y: 160 });

    // committed graph remains unchanged during preview
    const duringX = useFloorplannerStore.getState().project.graph.nodes[a]?.x;
    expect(duringX).toBe(100);
    expect(useFloorplannerStore.getState().drag.previewPatch).not.toBeNull();

    useFloorplannerStore.getState().commitInteraction();
    const after = useFloorplannerStore.getState().project.graph.nodes[a];
    expect(after?.x).toBe(160);
    expect(after?.y).toBe(160);
  });

  it("keeps topology timestamp stable during preview, updates on commit", () => {
    const state = useFloorplannerStore.getState();
    state.replaceProject(createDefaultProjectData());
    const project = createDefaultProjectData();
    const a = addNode(project.graph, { x: 0, y: 0, floorLevel: 0 });
    const b = addNode(project.graph, { x: 200, y: 0, floorLevel: 0 });
    addEdge(project.graph, { nodeAId: a, nodeBId: b, floorLevel: 0 });
    state.replaceProject(project);

    const before = useFloorplannerStore.getState().topology.lastDerivedAt;
    state.beginInteraction("move-node", [a], { x: 0, y: 0 });
    state.updateInteractionPreview({ x: 20, y: 20 });
    const previewTs = useFloorplannerStore.getState().topology.lastDerivedAt;
    expect(previewTs).toBe(before);

    state.commitInteraction();
    const after = useFloorplannerStore.getState().topology.lastDerivedAt;
    expect(after).toBeGreaterThanOrEqual(before);
  });
});
