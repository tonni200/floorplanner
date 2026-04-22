import { describe, expect, test } from "vitest";

import { createDefaultProjectData } from "../../core/model/defaults";
import { addEdge, addNode } from "../../core/graph/graphOps";
import { detectFacesFromGraph } from "../../core/topology/faceDetection";
import { reconcileFaces } from "../../core/reconciliation/faceReconciliation";
import { computeFaceFingerprint } from "../../core/topology/faceFingerprint";

function buildRectangleFaces() {
  const project = createDefaultProjectData();
  const a = addNode(project.graph, { x: 0, y: 0, floorLevel: 0 });
  const b = addNode(project.graph, { x: 400, y: 0, floorLevel: 0 });
  const c = addNode(project.graph, { x: 400, y: 300, floorLevel: 0 });
  const d = addNode(project.graph, { x: 0, y: 300, floorLevel: 0 });
  addEdge(project.graph, { nodeAId: a, nodeBId: b, floorLevel: 0, wallType: "outer" });
  addEdge(project.graph, { nodeAId: b, nodeBId: c, floorLevel: 0, wallType: "outer" });
  addEdge(project.graph, { nodeAId: c, nodeBId: d, floorLevel: 0, wallType: "outer" });
  addEdge(project.graph, { nodeAId: d, nodeBId: a, floorLevel: 0, wallType: "outer" });

  return detectFacesFromGraph(project.graph).map((face) => ({
    ...face,
    fingerprint: computeFaceFingerprint(face),
  }));
}

describe("face reconciliation", () => {
  test("preserves stable face id for unchanged geometry", () => {
    const previous = buildRectangleFaces();
    const next = buildRectangleFaces();
    const previousId = previous[0]?.id;
    expect(previousId).toBeTruthy();

    const reconciled = reconcileFaces(previous, next);
    expect(reconciled.nextFaces).toHaveLength(1);
    expect(reconciled.nextFaces[0]?.id).toBe(previousId);
  });
});
