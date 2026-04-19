import { describe, expect, it } from "vitest";

import { addEdge, addNode, splitEdgeAtPoint } from "../../core/graph/graphOps";
import { createDefaultProjectData } from "../../core/model/defaults";
import type { OpeningObject } from "../../core/model/projectTypes";

function rebindOpeningAfterEdgeSplit(
  opening: OpeningObject,
  split: { insertedNodeId: string; leftEdgeId: string; rightEdgeId: string },
): OpeningObject {
  // Deterministic rule for baseline: when splitting at opening midpoint, prefer left edge.
  return {
    ...opening,
    hostEdgeId: split.leftEdgeId,
  };
}

describe("opening host stability", () => {
  it("rebinds opening deterministically after edge split", () => {
    const project = createDefaultProjectData();
    const floorLevel = 0;

    const a = addNode(project.graph, { x: 0, y: 0, floorLevel });
    const b = addNode(project.graph, { x: 400, y: 0, floorLevel });
    const edgeId = addEdge(project.graph, {
      nodeAId: a,
      nodeBId: b,
      thickness: 20,
      wallType: "inner",
      floorLevel,
    });

    const opening: OpeningObject = {
      id: "o1",
      subtype: "interior_door",
      hostEdgeId: edgeId,
      offsetOnEdge: 200,
      width: 90,
      height: 210,
      floorLevel,
      swing: "left",
    };

    const split = splitEdgeAtPoint(project.graph, edgeId, { x: 200, y: 0 });
    const rebound = rebindOpeningAfterEdgeSplit(opening, split);
    expect([split.leftEdgeId, split.rightEdgeId]).toContain(rebound.hostEdgeId);
  });
});
