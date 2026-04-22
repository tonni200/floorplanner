import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../app/App";
import { useFloorplannerStore } from "../../store/createStore";
import { createDefaultProjectData } from "../../core/model/defaults";
import { addEdge, addNode } from "../../core/graph/graphOps";
import * as storage from "../../core/persistence/storage";

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

  it("merges node when dragged onto another node", () => {
    const project = createDefaultProjectData();
    const a = addNode(project.graph, { x: 120, y: 120, floorLevel: 0 });
    const b = addNode(project.graph, { x: 220, y: 120, floorLevel: 0 });
    const c = addNode(project.graph, { x: 320, y: 120, floorLevel: 0 });
    addEdge(project.graph, { nodeAId: a, nodeBId: b, floorLevel: 0, wallType: "inner" });
    addEdge(project.graph, { nodeAId: b, nodeBId: c, floorLevel: 0, wallType: "inner" });
    useFloorplannerStore.getState().replaceProject(project);

    const { getByTestId } = render(<App />);
    const canvas = getByTestId("floor-canvas") as unknown as SVGSVGElement;
    mockCanvasBounds(canvas);

    const from = worldToClient(canvas, { x: 120, y: 120 });
    const onto = worldToClient(canvas, { x: 220, y: 120 });

    fireEvent.pointerDown(canvas, { clientX: from.x, clientY: from.y });
    fireEvent.pointerMove(canvas, { clientX: onto.x, clientY: onto.y });
    fireEvent.pointerUp(canvas, { clientX: onto.x, clientY: onto.y });

    const graph = useFloorplannerStore.getState().project.graph;
    expect(graph.nodes[a]).toBeUndefined();
    expect(graph.nodes[b]).toBeDefined();
  });

  it("splits edge on right-click in select mode", () => {
    const project = createDefaultProjectData();
    const a = addNode(project.graph, { x: 200, y: 200, floorLevel: 0 });
    const b = addNode(project.graph, { x: 400, y: 200, floorLevel: 0 });
    const hostEdgeId = addEdge(project.graph, { nodeAId: a, nodeBId: b, floorLevel: 0, wallType: "inner" });
    useFloorplannerStore.getState().replaceProject(project);

    const { getByTestId } = render(<App />);
    const canvas = getByTestId("floor-canvas") as unknown as SVGSVGElement;
    mockCanvasBounds(canvas);
    const midpoint = worldToClient(canvas, { x: 300, y: 200 });
    fireEvent.contextMenu(canvas, { clientX: midpoint.x, clientY: midpoint.y });

    const graph = useFloorplannerStore.getState().project.graph;
    expect(graph.edges[hostEdgeId]).toBeUndefined();
    expect(Object.keys(graph.nodes).length).toBe(3);
  });

  it("places opening on valid wall preview in opening mode", () => {
    const project = createDefaultProjectData();
    const a = addNode(project.graph, { x: 200, y: 300, floorLevel: 0 });
    const b = addNode(project.graph, { x: 500, y: 300, floorLevel: 0 });
    addEdge(project.graph, { nodeAId: a, nodeBId: b, floorLevel: 0, wallType: "inner" });
    useFloorplannerStore.getState().replaceProject(project);

    const { getByTestId } = render(<App />);
    fireEvent.click(getByTestId("tool-place-opening"));
    const canvas = getByTestId("floor-canvas") as unknown as SVGSVGElement;
    mockCanvasBounds(canvas);
    const point = worldToClient(canvas, { x: 320, y: 300 });
    fireEvent.pointerMove(canvas, { clientX: point.x, clientY: point.y });
    fireEvent.click(canvas, { clientX: point.x, clientY: point.y });

    const openings = Object.values(useFloorplannerStore.getState().project.openings);
    expect(openings.length).toBe(1);
    expect(openings[0]?.hostEdgeId).toBeDefined();
  });

  it("blocks opening placement for invalid near-end preview", () => {
    const project = createDefaultProjectData();
    const a = addNode(project.graph, { x: 220, y: 340, floorLevel: 0 });
    const b = addNode(project.graph, { x: 520, y: 340, floorLevel: 0 });
    addEdge(project.graph, { nodeAId: a, nodeBId: b, floorLevel: 0, wallType: "inner" });
    useFloorplannerStore.getState().replaceProject(project);

    const { getByTestId } = render(<App />);
    fireEvent.click(getByTestId("tool-place-opening"));
    const canvas = getByTestId("floor-canvas") as unknown as SVGSVGElement;
    mockCanvasBounds(canvas);
    const nearEnd = worldToClient(canvas, { x: 224, y: 340 });
    fireEvent.pointerMove(canvas, { clientX: nearEnd.x, clientY: nearEnd.y });
    fireEvent.click(canvas, { clientX: nearEnd.x, clientY: nearEnd.y });

    const openings = Object.values(useFloorplannerStore.getState().project.openings);
    expect(openings.length).toBe(0);
  });

  it("saves and reloads project through toolbar persistence actions", () => {
    const saveSpy = vi.spyOn(storage, "saveProject").mockImplementation(() => undefined);
    const loadSpy = vi.spyOn(storage, "loadProject");

    const savedProject = createDefaultProjectData();
    const savedNodeA = addNode(savedProject.graph, { x: 100, y: 100, floorLevel: 0 });
    const savedNodeB = addNode(savedProject.graph, { x: 260, y: 100, floorLevel: 0 });
    addEdge(savedProject.graph, { nodeAId: savedNodeA, nodeBId: savedNodeB, floorLevel: 0, wallType: "inner" });
    loadSpy.mockReturnValue(savedProject);

    const workingProject = createDefaultProjectData();
    const a = addNode(workingProject.graph, { x: 200, y: 200, floorLevel: 0 });
    const b = addNode(workingProject.graph, { x: 420, y: 200, floorLevel: 0 });
    addEdge(workingProject.graph, { nodeAId: a, nodeBId: b, floorLevel: 0, wallType: "inner" });
    useFloorplannerStore.getState().replaceProject(workingProject);

    const { getByTestId } = render(<App />);
    fireEvent.click(getByTestId("save-project"));
    expect(saveSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(getByTestId("new-project"));
    expect(Object.keys(useFloorplannerStore.getState().project.graph.nodes).length).toBe(0);

    fireEvent.click(getByTestId("load-project"));
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(Object.keys(useFloorplannerStore.getState().project.graph.nodes).length).toBe(2);

    saveSpy.mockRestore();
    loadSpy.mockRestore();
  });

  it("undo and redo remain consistent after persistence save action", () => {
    const saveSpy = vi.spyOn(storage, "saveProject").mockImplementation(() => undefined);
    const project = createDefaultProjectData();
    const a = addNode(project.graph, { x: 180, y: 180, floorLevel: 0 });
    const b = addNode(project.graph, { x: 340, y: 180, floorLevel: 0 });
    addEdge(project.graph, { nodeAId: a, nodeBId: b, floorLevel: 0, wallType: "inner" });
    useFloorplannerStore.getState().replaceProject(project);

    const { getByTestId } = render(<App />);
    const canvas = getByTestId("floor-canvas") as unknown as SVGSVGElement;
    mockCanvasBounds(canvas);

    const from = worldToClient(canvas, { x: 180, y: 180 });
    const to = worldToClient(canvas, { x: 260, y: 180 });
    fireEvent.pointerDown(canvas, { clientX: from.x, clientY: from.y });
    fireEvent.pointerMove(canvas, { clientX: to.x, clientY: to.y });
    fireEvent.pointerUp(canvas, { clientX: to.x, clientY: to.y });
    expect(useFloorplannerStore.getState().project.graph.nodes[a]?.x).toBe(260);

    fireEvent.click(getByTestId("save-project"));
    expect(saveSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(getByTestId("undo"));
    expect(useFloorplannerStore.getState().project.graph.nodes[a]?.x).toBe(180);

    fireEvent.click(getByTestId("redo"));
    expect(useFloorplannerStore.getState().project.graph.nodes[a]?.x).toBe(260);

    saveSpy.mockRestore();
  });
});
