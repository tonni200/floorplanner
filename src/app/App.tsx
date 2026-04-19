import { useMemo } from "react";
import { useFloorplannerStore } from "../store/createStore";
import { createEmptyProjectData } from "../core/model/defaults";
import { addEdge, addNode } from "../core/graph/graphOps";

export function App() {
  const state = useFloorplannerStore((s) => s);

  const summary = useMemo(
    () => ({
      nodeCount: Object.keys(state.project.graph.nodes).length,
      edgeCount: Object.keys(state.project.graph.edges).length,
      faceCount: state.topology.faces.length,
      roomCount: Object.keys(state.project.roomMetadataMap).length,
    }),
    [state.project, state.topology.faces],
  );

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
      <ul>
        <li>Nodes: {summary.nodeCount}</li>
        <li>Edges: {summary.edgeCount}</li>
        <li>Faces: {summary.faceCount}</li>
        <li>Rooms: {summary.roomCount}</li>
        <li>Drag active: {state.drag.active ? "yes" : "no"}</li>
        <li>Preview active: {state.drag.previewPatch ? "yes" : "no"}</li>
      </ul>
      <pre>{JSON.stringify(state.debug.lastValidationErrors, null, 2)}</pre>
    </main>
  );
}
