import { describe, expect, it } from "vitest";
import { useFloorplannerStore } from "../../store/createStore";
import { createDefaultProjectData } from "../../core/model/defaults";
import { addNode } from "../../core/graph/graphOps";

describe("orthogonal guidance", () => {
  it("snaps move-node preview to horizontal near 0°", () => {
    useFloorplannerStore.getState().replaceProject(createDefaultProjectData());
    const project = createDefaultProjectData();
    const nodeId = addNode(project.graph, { x: 100, y: 100, floorLevel: 0 });
    useFloorplannerStore.getState().replaceProject(project);

    useFloorplannerStore.getState().beginInteraction("move-node", [nodeId], { x: 100, y: 100 });
    useFloorplannerStore.getState().updateInteractionPreview({ x: 200, y: 108 }); // near horizontal

    const preview = useFloorplannerStore.getState().drag.previewPatch;
    expect(preview).not.toBeNull();
    expect(preview?.graph.nodes[nodeId]?.x).toBe(200);
    expect(preview?.graph.nodes[nodeId]?.y).toBe(100);
  });

  it("snaps move-node preview to vertical near 90°", () => {
    useFloorplannerStore.getState().replaceProject(createDefaultProjectData());
    const project = createDefaultProjectData();
    const nodeId = addNode(project.graph, { x: 250, y: 250, floorLevel: 0 });
    useFloorplannerStore.getState().replaceProject(project);

    useFloorplannerStore.getState().beginInteraction("move-node", [nodeId], { x: 250, y: 250 });
    useFloorplannerStore.getState().updateInteractionPreview({ x: 258, y: 340 }); // near vertical

    const preview = useFloorplannerStore.getState().drag.previewPatch;
    expect(preview).not.toBeNull();
    expect(preview?.graph.nodes[nodeId]?.x).toBe(250);
    expect(preview?.graph.nodes[nodeId]?.y).toBe(340);
  });
});
