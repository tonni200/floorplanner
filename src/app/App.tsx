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

  return (
    <main style={{ padding: 16, fontFamily: "Inter, Arial, sans-serif" }}>
      <h1>Summerhouse Floorplanner (Foundation)</h1>
      <p>Single structural truth: wall graph (nodes + edges).</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={seedRectangle}>Seed rectangle</button>
        <button onClick={state.undo}>Undo</button>
        <button onClick={state.redo}>Redo</button>
      </div>
      <ul>
        <li>Nodes: {summary.nodeCount}</li>
        <li>Edges: {summary.edgeCount}</li>
        <li>Faces: {summary.faceCount}</li>
        <li>Rooms: {summary.roomCount}</li>
      </ul>
      <pre>{JSON.stringify(state.debug.lastValidationErrors, null, 2)}</pre>
    </main>
  );
}
