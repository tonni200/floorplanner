import { describe, expect, it } from "vitest";
import { createDefaultProjectData } from "../../core/model/defaults";
import { addEdge, addNode, mergeNodes, splitEdgeAtPoint } from "../../core/graph/graphOps";

describe("graphOps", () => {
  it("splits an edge into two edges", () => {
    const project = createDefaultProjectData();
    const a = addNode(project.graph, { x: 0, y: 0, floorLevel: 0 });
    const b = addNode(project.graph, { x: 500, y: 0, floorLevel: 0 });
    const edgeId = addEdge(project.graph, {
      nodeAId: a,
      nodeBId: b,
      floorLevel: 0,
      thickness: 20,
      wallType: "inner",
    });

    const split = splitEdgeAtPoint(project.graph, edgeId, { x: 250, y: 0 });
    expect(split).toBeTruthy();
    expect(Object.keys(project.graph.edges)).toHaveLength(2);
    expect(project.graph.nodes[split.insertedNodeId]?.x).toBe(250);
  });

  it("merges two nodes and rewires edges", () => {
    const project = createDefaultProjectData();
    const a = addNode(project.graph, { x: 0, y: 0, floorLevel: 0 });
    const b = addNode(project.graph, { x: 0, y: 0, floorLevel: 0 });
    const c = addNode(project.graph, { x: 500, y: 500, floorLevel: 0 });
    addEdge(project.graph, {
      nodeAId: b,
      nodeBId: c,
      floorLevel: 0,
      thickness: 20,
      wallType: "inner",
    });

    mergeNodes(project.graph, b, a);
    expect(project.graph.nodes[b]).toBeUndefined();
    const allEdgeNodeIds = Object.values(project.graph.edges).flatMap((e) => [e.nodeAId, e.nodeBId]);
    expect(allEdgeNodeIds).not.toContain(b);
  });
});
