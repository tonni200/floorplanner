import { useEffect, useMemo, useRef, useState } from "react";
import { useFloorplannerStore } from "../store/createStore";
import { createEmptyProjectData } from "../core/model/defaults";
import { addEdge, addNode } from "../core/graph/graphOps";

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;

export function App() {
  const state = useFloorplannerStore((s) => s);
  const canvasRef = useRef<SVGSVGElement | null>(null);
  const [wallPreview, setWallPreview] = useState<{
    from: { x: number; y: number };
    to: { x: number; y: number };
    lengthCm: number;
  } | null>(null);

  const summary = useMemo(
    () => ({
      nodeCount: Object.keys(state.project.graph.nodes).length,
      edgeCount: Object.keys(state.project.graph.edges).length,
      faceCount: state.topology.faces.length,
      roomCount: Object.keys(state.project.roomMetadataMap).length,
    }),
    [state.project, state.topology.faces],
  );

  const isDrawWallActive = state.drag.active && state.drag.intent === "draw-wall";

  useEffect(() => {
    if (!isDrawWallActive) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const liveState = useFloorplannerStore.getState();
      const active = liveState.drag.active && liveState.drag.intent === "draw-wall";
      if (!active) {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        liveState.finishWallPolyline();
        setWallPreview(null);
      } else if (event.key === "Escape") {
        event.preventDefault();
        liveState.cancelInteraction();
        setWallPreview(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isDrawWallActive]);

  const toWorldPoint = (event: React.MouseEvent<SVGSVGElement>): { x: number; y: number } => {
    const svg = canvasRef.current;
    if (!svg) {
      return { x: 0, y: 0 };
    }

    const bounds = svg.getBoundingClientRect();
    const normalizedX = (event.clientX - bounds.left) / Math.max(bounds.width, 1);
    const normalizedY = (event.clientY - bounds.top) / Math.max(bounds.height, 1);
    return {
      x: normalizedX * CANVAS_WIDTH,
      y: normalizedY * CANVAS_HEIGHT,
    };
  };

  const handleCanvasMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawWallActive) {
      return;
    }
    const world = toWorldPoint(event);
    const preview = state.previewWallPolyline(world);
    setWallPreview(preview);
  };

  const handleCanvasClick = (event: React.MouseEvent<SVGSVGElement>) => {
    const world = toWorldPoint(event);
    if (!isDrawWallActive) {
      state.startWallPolyline(world, 0);
      setWallPreview(null);
      return;
    }

    if (event.detail > 1) {
      return;
    }

    state.previewWallPolyline(world);
    const result = state.confirmWallPolylinePreview() ?? state.addWallPolylinePoint(world);
    if (!result || result.closedLoop) {
      setWallPreview(null);
      return;
    }
    setWallPreview(null);
  };

  const handleCanvasDoubleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawWallActive) {
      return;
    }
    event.preventDefault();
    state.finishWallPolyline();
    setWallPreview(null);
  };

  const seedRectangle = () => {
    const project = createEmptyProjectData();
    const floorLevel = 0;
    const a = addNode(project.graph, { x: 200, y: 200, floorLevel });
    const b = addNode(project.graph, { x: 600, y: 200, floorLevel });
    const c = addNode(project.graph, { x: 600, y: 500, floorLevel });
    const d = addNode(project.graph, { x: 200, y: 500, floorLevel });

    addEdge(project.graph, { nodeAId: a, nodeBId: b, floorLevel, wallType: "outer" });
    addEdge(project.graph, { nodeAId: b, nodeBId: c, floorLevel, wallType: "outer" });
    addEdge(project.graph, { nodeAId: c, nodeBId: d, floorLevel, wallType: "outer" });
    addEdge(project.graph, { nodeAId: d, nodeBId: a, floorLevel, wallType: "outer" });

    state.replaceProject(project);
  };

  const selectedNodeId = state.selection.nodeIds[0] ?? null;
  const selectedNode = selectedNodeId ? state.project.graph.nodes[selectedNodeId] : null;
  const nudgeSelectedNode = (dx: number, dy: number) => {
    if (!selectedNodeId || !selectedNode) {
      return;
    }
    state.beginInteraction(
      "move-node",
      [selectedNodeId],
      { x: selectedNode.x, y: selectedNode.y },
    );
    state.updateInteractionPreview({ x: selectedNode.x + dx, y: selectedNode.y + dy });
    state.commitInteraction();
  };

  return (
    <main style={{ padding: 16, fontFamily: "Inter, Arial, sans-serif" }}>
      <h1>Summerhouse Floorplanner (Foundation)</h1>
      <p>Single structural truth: wall graph (nodes + edges).</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={seedRectangle}>Seed rectangle</button>
        <button
          onClick={() => {
            const firstNodeId = Object.keys(state.project.graph.nodes)[0];
            if (!firstNodeId) {
              return;
            }
            state.setSelection({
              nodeIds: [firstNodeId],
              edgeIds: [],
              roomIds: [],
              openingIds: [],
              furnitureIds: [],
              annotationIds: [],
              marquee: null,
            });
          }}
        >
          Select first node
        </button>
        <button onClick={() => nudgeSelectedNode(20, 0)} disabled={!selectedNode}>
          Nudge +20cm X
        </button>
        <button onClick={state.undo}>Undo</button>
        <button onClick={state.redo}>Redo</button>
      </div>
      <p>
        Click canvas to start/continue walls. Double-click or Enter finishes. Esc cancels current draw
        interaction.
      </p>
      <div className="canvas" style={{ height: 520, border: "1px solid #2a2e3c", borderRadius: 8 }}>
        <svg
          ref={canvasRef}
          viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
          onMouseMove={handleCanvasMouseMove}
          onClick={handleCanvasClick}
          onDoubleClick={handleCanvasDoubleClick}
        >
          {Object.values(state.project.graph.edges).map((edge) => {
            const a = state.project.graph.nodes[edge.nodeAId];
            const b = state.project.graph.nodes[edge.nodeBId];
            if (!a || !b) {
              return null;
            }
            return (
              <line
                key={edge.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#b5c0ff"
                strokeWidth={Math.max(edge.thickness / 10, 2)}
                strokeLinecap="round"
              />
            );
          })}
          {wallPreview ? (
            <g>
              <line
                x1={wallPreview.from.x}
                y1={wallPreview.from.y}
                x2={wallPreview.to.x}
                y2={wallPreview.to.y}
                stroke="#70e3c4"
                strokeWidth={2}
                strokeDasharray="8 6"
              />
              <text
                x={(wallPreview.from.x + wallPreview.to.x) / 2 + 6}
                y={(wallPreview.from.y + wallPreview.to.y) / 2 - 6}
                fill="#70e3c4"
                fontSize={16}
                fontWeight={600}
              >
                {wallPreview.lengthCm.toFixed(1)} cm
              </text>
            </g>
          ) : null}
          {Object.values(state.project.graph.nodes).map((node) => (
            <circle
              key={node.id}
              cx={node.x}
              cy={node.y}
              r={6}
              fill={state.selection.nodeIds.includes(node.id) ? "#ffd166" : "#f5f8ff"}
            />
          ))}
        </svg>
      </div>
      <ul>
        <li>Nodes: {summary.nodeCount}</li>
        <li>Edges: {summary.edgeCount}</li>
        <li>Faces: {summary.faceCount}</li>
        <li>Rooms: {summary.roomCount}</li>
        <li>Drag active: {state.drag.active ? "yes" : "no"}</li>
        <li>Draw-wall active: {isDrawWallActive ? "yes" : "no"}</li>
        <li>Preview active: {state.drag.previewPatch ? "yes" : "no"}</li>
      </ul>
      <pre>{JSON.stringify(state.debug.lastValidationErrors, null, 2)}</pre>
    </main>
  );
}
