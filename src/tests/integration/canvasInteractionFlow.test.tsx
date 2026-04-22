import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../../app/App";
import { useFloorplannerStore } from "../../store/createStore";
import { createDefaultProjectData } from "../../core/model/defaults";
import { addEdge, addNode } from "../../core/graph/graphOps";

function worldToClient(svg: SVGSVGElement, world: { x: number; y: number }) {
  const viewBox = svg.viewBox.baseVal;
  const rect = svg.getBoundingClientRect();
  const x = rect.left + (world.x / Math.max(viewBox.width, 1)) * rect.width;
  const y = rect.top + (world.y / Math.max(viewBox.height, 1)) * rect.height;
  return { x, y };
}

function mockCanvasBounds(svg: SVGSVGElement) {
  Object.defineProperty(svg, "getBoundingClientRect", {
    configurable: true,
    value: () =>
      ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: CANVAS_WIDTH,
        bottom: CANVAS_HEIGHT,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        toJSON: () => ({}),
      }) as DOMRect,
  });
}

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;

describe("canvas interaction flow", () => {
  afterEach(() => {
    cleanup();
  });

  it("selects node on canvas click and drags with preview+commit", () => {
    const project = createDefaultProjectData();
    const a = addNode(project.graph, { x: 100, y: 100, floorLevel: 0 });
    const b = addNode(project.graph, { x: 300, y: 100, floorLevel: 0 });
    addEdge(project.graph, { nodeAId: a, nodeBId: b, floorLevel: 0, wallType: "inner" });
    useFloorplannerStore.getState().replaceProject(project);

    const { getByTestId } = render(<App />);

    const canvas = getByTestId("floor-canvas") as unknown as SVGSVGElement;
    mockCanvasBounds(canvas);
    const nodePoint = worldToClient(canvas, { x: 100, y: 100 });
    fireEvent.click(canvas, { clientX: nodePoint.x, clientY: nodePoint.y });
    expect(useFloorplannerStore.getState().selection.nodeIds).toEqual([a]);

    fireEvent.pointerDown(canvas, { clientX: nodePoint.x, clientY: nodePoint.y });
    const dragPoint = worldToClient(canvas, { x: 180, y: 108 });
    fireEvent.pointerMove(canvas, { clientX: dragPoint.x, clientY: dragPoint.y });

    // During drag we should be in move-node preview session.
    expect(useFloorplannerStore.getState().drag.intent).toBe("move-node");
    expect(useFloorplannerStore.getState().drag.previewPatch).not.toBeNull();
    // Committed graph remains unchanged until pointer up/commit.
    expect(useFloorplannerStore.getState().project.graph.nodes[a]?.x).toBe(100);

    fireEvent.pointerUp(canvas, { clientX: dragPoint.x, clientY: dragPoint.y });
    expect(useFloorplannerStore.getState().drag.active).toBe(false);
    expect(useFloorplannerStore.getState().project.graph.nodes[a]?.x).toBeGreaterThan(100);
  });

  it("starts draw-wall from wall midpoint by clicking edge in draw mode", () => {
    const project = createDefaultProjectData();
    const a = addNode(project.graph, { x: 120, y: 120, floorLevel: 0 });
    const b = addNode(project.graph, { x: 320, y: 120, floorLevel: 0 });
    const hostEdgeId = addEdge(project.graph, { nodeAId: a, nodeBId: b, floorLevel: 0, wallType: "inner" });
    useFloorplannerStore.getState().replaceProject(project);

    const { getByTestId } = render(<App />);
    fireEvent.click(getByTestId("tool-draw-wall"));

    const canvas = getByTestId("floor-canvas") as unknown as SVGSVGElement;
    mockCanvasBounds(canvas);
    const midpoint = worldToClient(canvas, { x: 220, y: 120 });
    fireEvent.click(canvas, { clientX: midpoint.x, clientY: midpoint.y });

    const current = useFloorplannerStore.getState();
    expect(current.drag.active).toBe(true);
    expect(current.drag.intent).toBe("draw-wall");
    expect(current.project.graph.edges[hostEdgeId]).toBeUndefined();
  });
});
