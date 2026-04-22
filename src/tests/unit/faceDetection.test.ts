import { describe, expect, it } from "vitest";

import { addEdge, addNode } from "../../core/graph/graphOps";
import { createDefaultProjectData } from "../../core/model/defaults";
import type { WallGraph } from "../../core/model/projectTypes";
import { detectFacesFromGraph } from "../../core/topology/faceDetection";

function rectangleGraph(): WallGraph {
  const graph = createDefaultProjectData().graph;
  const a = addNode(graph, { x: 0, y: 0, floorLevel: 0 });
  const b = addNode(graph, { x: 400, y: 0, floorLevel: 0 });
  const c = addNode(graph, { x: 400, y: 300, floorLevel: 0 });
  const d = addNode(graph, { x: 0, y: 300, floorLevel: 0 });
  addEdge(graph, { nodeAId: a, nodeBId: b, wallType: "outer", floorLevel: 0 });
  addEdge(graph, { nodeAId: b, nodeBId: c, wallType: "outer", floorLevel: 0 });
  addEdge(graph, { nodeAId: c, nodeBId: d, wallType: "outer", floorLevel: 0 });
  addEdge(graph, { nodeAId: d, nodeBId: a, wallType: "outer", floorLevel: 0 });
  return graph;
}

describe("face detection", () => {
  it("detects a single rectangle face", () => {
    const faces = detectFacesFromGraph(rectangleGraph());
    expect(faces).toHaveLength(1);
    expect(Math.round(faces[0]!.area)).toBe(120000);
  });
});
