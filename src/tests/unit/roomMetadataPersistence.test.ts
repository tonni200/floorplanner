import { describe, expect, it } from "vitest";

import { addEdge, addNode } from "../../core/graph/graphOps";
import { createDefaultProjectData } from "../../core/model/defaults";
import { useFloorplannerStore } from "../../store/createStore";

describe("room metadata persistence across reshape", () => {
  it("keeps room metadata linked after small geometry changes", () => {
    const project = createDefaultProjectData();
    const a = addNode(project.graph, { x: 0, y: 0, floorLevel: 0 });
    const b = addNode(project.graph, { x: 200, y: 0, floorLevel: 0 });
    const c = addNode(project.graph, { x: 200, y: 200, floorLevel: 0 });
    const d = addNode(project.graph, { x: 0, y: 200, floorLevel: 0 });
    addEdge(project.graph, { nodeAId: a, nodeBId: b, floorLevel: 0 });
    addEdge(project.graph, { nodeAId: b, nodeBId: c, floorLevel: 0 });
    addEdge(project.graph, { nodeAId: c, nodeBId: d, floorLevel: 0 });
    addEdge(project.graph, { nodeAId: d, nodeBId: a, floorLevel: 0 });

    useFloorplannerStore.getState().replaceProject(project);
    const beforeRooms = Object.values(useFloorplannerStore.getState().project.roomMetadataMap);
    expect(beforeRooms.length).toBeGreaterThanOrEqual(1);

    useFloorplannerStore.getState().runGraphCommit((graph) => {
      const node = graph.nodes[b];
      if (!node) {
        return graph;
      }
      node.x = 220;
      node.y = 0;
      return graph;
    });
    const rooms = Object.values(useFloorplannerStore.getState().project.roomMetadataMap);
    expect(rooms.length).toBeGreaterThanOrEqual(1);
    expect(rooms[0]?.faceId).toBeTruthy();
    expect(rooms[0]?.state).toBe("ok");
  });
});
