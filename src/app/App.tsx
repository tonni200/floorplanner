import { useEffect, useMemo, useRef, useState } from "react";
import { useFloorplannerStore } from "../store/createStore";
import { createEmptyProjectData } from "../core/model/defaults";
import { addEdge, addNode, splitEdgeAtPoint } from "../core/graph/graphOps";
import { createOpeningId } from "../core/model/ids";
import { loadProject, saveProject } from "../core/persistence/storage";
import type { EdgeId, Face, NodeId, Point2D, WallGraph } from "../core/model/projectTypes";
import type { SelectionState } from "../store/types";

const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;
const NODE_HIT_RADIUS_CM = 14;
const EDGE_HIT_TOLERANCE_CM = 12;

type CanvasTool = "select" | "draw-wall" | "place-opening";

function mergedUnique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function emptySelection(): SelectionState {
  return {
    nodeIds: [],
    edgeIds: [],
    roomIds: [],
    openingIds: [],
    furnitureIds: [],
    annotationIds: [],
    marquee: null,
  };
}

function distanceToSegment(
  p: Point2D,
  a: Point2D,
  b: Point2D,
): { distance: number; projection: Point2D } {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const lengthSq = vx * vx + vy * vy;
  if (lengthSq === 0) {
    return { distance: Math.hypot(p.x - a.x, p.y - a.y), projection: { x: a.x, y: a.y } };
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / lengthSq));
  const projection = { x: a.x + vx * t, y: a.y + vy * t };
  return { distance: Math.hypot(p.x - projection.x, p.y - projection.y), projection };
}

function pointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    if (!pi || !pj) {
      continue;
    }
    const intersects =
      (pi.y > point.y) !== (pj.y > point.y) &&
      point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y + Number.EPSILON) + pi.x;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function hitTestNode(graph: WallGraph, point: Point2D): NodeId | null {
  let bestNodeId: NodeId | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const node of Object.values(graph.nodes)) {
    const d = Math.hypot(point.x - node.x, point.y - node.y);
    if (d <= NODE_HIT_RADIUS_CM && d < bestDistance) {
      bestDistance = d;
      bestNodeId = node.id;
    }
  }
  return bestNodeId;
}

function hitTestEdge(graph: WallGraph, point: Point2D): { edgeId: EdgeId; projection: Point2D } | null {
  let best: { edgeId: EdgeId; projection: Point2D; distance: number } | null = null;
  for (const edge of Object.values(graph.edges)) {
    const a = graph.nodes[edge.nodeAId];
    const b = graph.nodes[edge.nodeBId];
    if (!a || !b) {
      continue;
    }
    const { distance, projection } = distanceToSegment(point, a, b);
    if (distance > EDGE_HIT_TOLERANCE_CM) {
      continue;
    }
    if (!best || distance < best.distance) {
      best = { edgeId: edge.id, projection, distance };
    }
  }
  return best ? { edgeId: best.edgeId, projection: best.projection } : null;
}

function hitTestFace(faces: Face[], point: Point2D): Face | null {
  for (const face of faces) {
    if (pointInPolygon(point, face.polygon)) {
      return face;
    }
  }
  return null;
}

export function App() {
  const state = useFloorplannerStore((s) => s);
  const canvasRef = useRef<SVGSVGElement | null>(null);
  const pendingNodeDragRef = useRef<{
    nodeId: NodeId;
    startWorld: Point2D;
    pointerStartClient: { x: number; y: number };
    moved: boolean;
  } | null>(null);
  const suppressNextClickRef = useRef(false);
  const [activeTool, setActiveTool] = useState<CanvasTool>("select");
  const [openingPreview, setOpeningPreview] = useState<{
    edgeId: EdgeId;
    x: number;
    y: number;
    valid: boolean;
    offsetOnEdge: number;
  } | null>(null);
  const [wallPreview, setWallPreview] = useState<{
    from: { x: number; y: number };
    to: { x: number; y: number };
    lengthCm: number;
  } | null>(null);
  const [openingEditWidthCm, setOpeningEditWidthCm] = useState<number>(90);
  const [lastSaveMessage, setLastSaveMessage] = useState<string>("");

  const summary = useMemo(
    () => ({
      nodeCount: Object.keys(state.project.graph.nodes).length,
      edgeCount: Object.keys(state.project.graph.edges).length,
      faceCount: state.topology.faces.length,
      roomCount: Object.keys(state.project.roomMetadataMap).length,
    }),
    [state.project, state.topology.faces],
  );

  const isDrawWallSessionActive = state.drag.active && state.drag.intent === "draw-wall";
  const isMoveNodeSessionActive = state.drag.active && state.drag.intent === "move-node";
  const renderedGraph = state.drag.previewPatch?.graph ?? state.project.graph;
  const roomByFaceId = useMemo(() => {
    const map = new Map<string, { id: string; label: string; state: string }>();
    for (const room of Object.values(state.project.roomMetadataMap)) {
      if (!room.faceId) {
        continue;
      }
      map.set(room.faceId, {
        id: room.id,
        label: room.label,
        state: room.state,
      });
    }
    return map;
  }, [state.project.roomMetadataMap]);
  const renderedOpenings = useMemo(
    () =>
      Object.values(state.project.openings).map((opening) => {
        const edge = renderedGraph.edges[opening.hostEdgeId];
        if (!edge) {
          return null;
        }
        const a = renderedGraph.nodes[edge.nodeAId];
        const b = renderedGraph.nodes[edge.nodeBId];
        if (!a || !b) {
          return null;
        }
        const edgeLength = Math.hypot(b.x - a.x, b.y - a.y);
        if (edgeLength <= 0) {
          return null;
        }
        const t = Math.max(0, Math.min(1, opening.offsetOnEdge / edgeLength));
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        return { opening, x, y, angle };
      }),
    [state.project.openings, renderedGraph.edges, renderedGraph.nodes],
  );

  useEffect(() => {
    if (!isDrawWallSessionActive && !isMoveNodeSessionActive && activeTool !== "place-opening") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const liveState = useFloorplannerStore.getState();
      const drawActive = liveState.drag.active && liveState.drag.intent === "draw-wall";
      const moveNodeActive = liveState.drag.active && liveState.drag.intent === "move-node";
      const openingActive = activeTool === "place-opening";
      if (!drawActive && !moveNodeActive && !openingActive) {
        return;
      }

      if (event.key === "Enter" && drawActive) {
        event.preventDefault();
        liveState.finishWallPolyline();
        setActiveTool("select");
        setWallPreview(null);
      } else if (event.key === "Escape") {
        event.preventDefault();
        liveState.cancelInteraction();
        pendingNodeDragRef.current = null;
        setActiveTool("select");
        setWallPreview(null);
        setOpeningPreview(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeTool, isDrawWallSessionActive, isMoveNodeSessionActive]);

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

  const setSelectionExclusive = (
    kind: "node" | "edge" | "room" | "opening" | "none",
    id?: string,
  ) => {
    const selection = emptySelection();
    if (kind === "node" && id) {
      selection.nodeIds = [id];
    } else if (kind === "edge" && id) {
      selection.edgeIds = [id];
    } else if (kind === "room" && id) {
      selection.roomIds = [id];
    } else if (kind === "opening" && id) {
      selection.openingIds = [id];
    }
    state.setSelection(selection);
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const world = toWorldPoint(event);
    const pendingDrag = pendingNodeDragRef.current;
    if (pendingDrag && activeTool === "select") {
      const movedClientDistance = Math.hypot(
        event.clientX - pendingDrag.pointerStartClient.x,
        event.clientY - pendingDrag.pointerStartClient.y,
      );
      if (movedClientDistance > 2) {
        if (!state.drag.active) {
          state.beginInteraction("move-node", [pendingDrag.nodeId], pendingDrag.startWorld);
        }
        state.updateInteractionPreview(world);
        pendingDrag.moved = true;
      }
      return;
    }

    if (activeTool === "draw-wall" && isDrawWallSessionActive) {
      const preview = state.previewWallPolyline(world);
      setWallPreview(preview);
      setOpeningPreview(null);
      return;
    }

    if (activeTool === "place-opening") {
      const edgeHit = hitTestEdge(state.project.graph, world);
      if (!edgeHit) {
        setOpeningPreview(null);
        return;
      }
      const edge = state.project.graph.edges[edgeHit.edgeId];
      if (!edge) {
        setOpeningPreview(null);
        return;
      }
      const a = state.project.graph.nodes[edge.nodeAId];
      const b = state.project.graph.nodes[edge.nodeBId];
      if (!a || !b) {
        setOpeningPreview(null);
        return;
      }
      const edgeLength = Math.hypot(b.x - a.x, b.y - a.y);
      if (edgeLength <= 0) {
        setOpeningPreview(null);
        return;
      }
      const offsetOnEdge = Math.hypot(edgeHit.projection.x - a.x, edgeHit.projection.y - a.y);
      const openingWidth = 90;
      const half = openingWidth / 2;
      const valid = offsetOnEdge >= half && offsetOnEdge <= edgeLength - half;
      setOpeningPreview({
        edgeId: edgeHit.edgeId,
        x: edgeHit.projection.x,
        y: edgeHit.projection.y,
        valid,
        offsetOnEdge,
      });
    }
  };

  const handleCanvasClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }

    const world = toWorldPoint(event);
    const appendToSelection = event.shiftKey && activeTool === "select";
    if (activeTool === "draw-wall" || isDrawWallSessionActive) {
      if (!isDrawWallSessionActive) {
        const edgeHit = hitTestEdge(state.project.graph, world);
        if (edgeHit) {
          state.startWallPolylineFromEdgePoint(edgeHit.edgeId, edgeHit.projection, 0);
        } else {
          state.startWallPolyline(world, 0);
        }
        setSelectionExclusive("none");
        setWallPreview(null);
        return;
      }

      if (event.detail > 1) {
        return;
      }

      state.previewWallPolyline(world);
      const result = state.confirmWallPolylinePreview() ?? state.addWallPolylinePoint(world);
      if (!result || result.closedLoop) {
        setActiveTool("select");
        setWallPreview(null);
        return;
      }
      setWallPreview(null);
      return;
    }

    if (activeTool === "place-opening") {
      const preview = openingPreview;
      if (!preview || !preview.valid) {
        return;
      }
      const host = state.project.graph.edges[preview.edgeId];
      if (!host) {
        return;
      }
      state.upsertOpening({
        id: createOpeningId(),
        subtype: "interior_door",
        hostEdgeId: preview.edgeId,
        offsetOnEdge: preview.offsetOnEdge,
        width: 90,
        height: 210,
        floorLevel: host.floorLevel,
        swing: "left",
      });
      setSelectionExclusive("none");
      setOpeningPreview(null);
      setActiveTool("select");
      return;
    }

    if (activeTool !== "select" || isMoveNodeSessionActive) {
      return;
    }

    const openingHit = renderedOpenings.find((candidate) => {
      if (!candidate) {
        return false;
      }
      return Math.hypot(candidate.x - world.x, candidate.y - world.y) <= 14;
    });
    if (openingHit) {
      if (appendToSelection) {
        state.setSelection({
          ...state.selection,
          openingIds: mergedUnique([...state.selection.openingIds, openingHit.opening.id]),
          nodeIds: [],
          edgeIds: [],
          roomIds: [],
        });
      } else {
        setSelectionExclusive("opening", openingHit.opening.id);
      }
      setOpeningEditWidthCm(openingHit.opening.width);
      return;
    }

    const nodeHit = hitTestNode(state.project.graph, world);
    if (nodeHit) {
      if (appendToSelection) {
        state.setSelection({
          ...state.selection,
          nodeIds: mergedUnique([...state.selection.nodeIds, nodeHit]),
          edgeIds: [],
          roomIds: [],
          openingIds: [],
        });
      } else {
        setSelectionExclusive("node", nodeHit);
      }
      return;
    }

    const edgeHit = hitTestEdge(state.project.graph, world);
    if (edgeHit) {
      if (appendToSelection) {
        state.setSelection({
          ...state.selection,
          edgeIds: mergedUnique([...state.selection.edgeIds, edgeHit.edgeId]),
          nodeIds: [],
          roomIds: [],
          openingIds: [],
        });
      } else {
        setSelectionExclusive("edge", edgeHit.edgeId);
      }
      return;
    }

    const faceHit = hitTestFace(state.topology.faces, world);
    if (faceHit) {
      const room = roomByFaceId.get(faceHit.id);
      if (room) {
        if (appendToSelection) {
          state.setSelection({
            ...state.selection,
            roomIds: mergedUnique([...state.selection.roomIds, room.id]),
            nodeIds: [],
            edgeIds: [],
            openingIds: [],
          });
        } else {
          setSelectionExclusive("room", room.id);
        }
      } else {
        setSelectionExclusive("none");
      }
      return;
    }

    setSelectionExclusive("none");
  };

  const handleCanvasDoubleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawWallSessionActive) {
      return;
    }
    event.preventDefault();
    state.finishWallPolyline();
    setActiveTool("select");
    setWallPreview(null);
  };

  const handleCanvasContextMenu = (event: React.MouseEvent<SVGSVGElement>) => {
    event.preventDefault();
    if (activeTool !== "select" || isDrawWallSessionActive || isMoveNodeSessionActive) {
      return;
    }
    const world = toWorldPoint(event);
    const edgeHit = hitTestEdge(state.project.graph, world);
    if (!edgeHit) {
      return;
    }

    let insertedNodeId: string | null = null;
    state.runGraphCommit((graph) => {
      const edge = graph.edges[edgeHit.edgeId];
      if (!edge) {
        return graph;
      }
      const a = graph.nodes[edge.nodeAId];
      const b = graph.nodes[edge.nodeBId];
      if (!a || !b) {
        return graph;
      }
      const distanceToA = Math.hypot(edgeHit.projection.x - a.x, edgeHit.projection.y - a.y);
      const distanceToB = Math.hypot(edgeHit.projection.x - b.x, edgeHit.projection.y - b.y);
      if (distanceToA < 1 || distanceToB < 1) {
        return graph;
      }
      insertedNodeId = splitEdgeAtPoint(graph, edgeHit.edgeId, edgeHit.projection).insertedNodeId;
      return graph;
    });
    if (insertedNodeId) {
      setSelectionExclusive("node", insertedNodeId);
    }
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (activeTool !== "select") {
      return;
    }
    const world = toWorldPoint(event);
    const nodeHit = hitTestNode(state.project.graph, world);
    if (!nodeHit) {
      pendingNodeDragRef.current = null;
      return;
    }
    const node = state.project.graph.nodes[nodeHit];
    if (!node) {
      pendingNodeDragRef.current = null;
      return;
    }
    pendingNodeDragRef.current = {
      nodeId: nodeHit,
      startWorld: { x: node.x, y: node.y },
      pointerStartClient: { x: event.clientX, y: event.clientY },
      moved: false,
    };
  };

  const handleCanvasPointerUp = () => {
    const pendingDrag = pendingNodeDragRef.current;
    if (!pendingDrag) {
      return;
    }
    if (state.drag.active && state.drag.intent === "move-node") {
      state.commitInteraction();
      setSelectionExclusive("node", pendingDrag.nodeId);
      suppressNextClickRef.current = true;
    } else if (!pendingDrag.moved) {
      setSelectionExclusive("node", pendingDrag.nodeId);
    }
    pendingNodeDragRef.current = null;
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
  const selectedOpeningId = state.selection.openingIds[0] ?? null;
  const selectedOpening = selectedOpeningId ? state.project.openings[selectedOpeningId] : null;
  const handleSaveProject = () => {
    saveProject(state.project);
    state.markSaved();
    setLastSaveMessage("Saved");
  };
  const handleLoadProject = () => {
    const loaded = loadProject();
    if (!loaded) {
      setLastSaveMessage("No saved project");
      return;
    }
    state.replaceProject(loaded);
    state.markSaved();
    setActiveTool("select");
    setWallPreview(null);
    setOpeningPreview(null);
    setLastSaveMessage("Loaded");
  };
  const handleNewProject = () => {
    state.replaceProject(createEmptyProjectData());
    setActiveTool("select");
    setWallPreview(null);
    setOpeningPreview(null);
    setLastSaveMessage("New project");
  };
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
  const handleApplyOpeningWidth = () => {
    if (!selectedOpening) {
      return;
    }
    const clamped = Math.max(40, Math.min(400, openingEditWidthCm));
    state.upsertOpening({
      ...selectedOpening,
      width: clamped,
    });
    setOpeningEditWidthCm(clamped);
  };
  const handleDeleteSelectedOpening = () => {
    if (!selectedOpeningId) {
      return;
    }
    const nextOpenings = { ...state.project.openings };
    delete nextOpenings[selectedOpeningId];
    state.replaceProject({
      ...state.project,
      openings: nextOpenings,
    });
    setSelectionExclusive("none");
  };

  return (
    <main style={{ padding: 16, fontFamily: "Inter, Arial, sans-serif" }}>
      <h1>Summerhouse Floorplanner (Beta)</h1>
      <p>Wall graph is the single source of structural truth.</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          data-testid="tool-select"
          onClick={() => {
            setActiveTool("select");
            setWallPreview(null);
            setOpeningPreview(null);
          }}
          style={{ opacity: activeTool === "select" ? 1 : 0.7 }}
        >
          Select
        </button>
        <button
          data-testid="tool-draw-wall"
          onClick={() => {
            setActiveTool("draw-wall");
            setOpeningPreview(null);
          }}
          style={{ opacity: activeTool === "draw-wall" ? 1 : 0.7 }}
        >
          Draw wall
        </button>
        <button
          data-testid="tool-place-opening"
          onClick={() => {
            setActiveTool("place-opening");
            setWallPreview(null);
          }}
          style={{ opacity: activeTool === "place-opening" ? 1 : 0.7 }}
        >
          Place opening
        </button>
        <button onClick={seedRectangle}>Seed rectangle</button>
        <button data-testid="save-project" onClick={handleSaveProject}>
          Save
        </button>
        <button data-testid="load-project" onClick={handleLoadProject}>
          Load
        </button>
        <button data-testid="new-project" onClick={handleNewProject}>
          New
        </button>
        <button
          onClick={() => {
            const firstNodeId = Object.keys(renderedGraph.nodes)[0];
            if (!firstNodeId) {
              return;
            }
            setSelectionExclusive("node", firstNodeId);
          }}
        >
          Select first node
        </button>
        <button onClick={() => nudgeSelectedNode(20, 0)} disabled={!selectedNode}>
          Nudge +20cm X
        </button>
        <button data-testid="undo" onClick={state.undo}>
          Undo
        </button>
        <button data-testid="redo" onClick={state.redo}>
          Redo
        </button>
        <button
          data-testid="delete-opening"
          onClick={handleDeleteSelectedOpening}
          disabled={!selectedOpeningId}
        >
          Delete opening
        </button>
      </div>
      <p>
        Select mode: click to select, drag node handles to reshape walls. Draw mode: click to draw, Enter or
        double-click to finish, Esc to cancel. Place opening mode: hover walls for valid host preview, click to
        place.
      </p>
      {selectedOpening ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <label htmlFor="opening-width-input">Opening width (cm)</label>
          <input
            id="opening-width-input"
            data-testid="opening-width-input"
            type="number"
            min={40}
            max={400}
            value={openingEditWidthCm}
            onChange={(event) => setOpeningEditWidthCm(Number(event.target.value))}
          />
          <button data-testid="apply-opening-width" onClick={handleApplyOpeningWidth}>
            Apply width
          </button>
        </div>
      ) : null}
      <div className="canvas" style={{ height: 520, border: "1px solid #2a2e3c", borderRadius: 8 }}>
        <svg
          data-testid="floor-canvas"
          ref={canvasRef}
          viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onContextMenu={handleCanvasContextMenu}
          onClick={handleCanvasClick}
          onDoubleClick={handleCanvasDoubleClick}
        >
          {state.topology.faces.map((face) => {
            const room = roomByFaceId.get(face.id);
            const isRoomSelected = room ? state.selection.roomIds.includes(room.id) : false;
            const stateColor =
              room?.state === "invalid" || room?.state === "orphaned"
                ? "rgba(255, 107, 107, 0.20)"
                : "rgba(112, 227, 196, 0.14)";
            return (
              <g key={face.id} pointerEvents="none">
                <polygon
                  points={face.polygon.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill={isRoomSelected ? "rgba(255, 209, 102, 0.24)" : stateColor}
                  stroke={isRoomSelected ? "#ffd166" : "rgba(112, 227, 196, 0.45)"}
                  strokeWidth={1.5}
                />
                <text
                  x={face.centroid.x}
                  y={face.centroid.y}
                  fill="#e6f7f2"
                  fontSize={14}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {room?.label ?? "Room"} ({(face.area / 10000).toFixed(2)} m²)
                </text>
              </g>
            );
          })}
          {Object.values(renderedGraph.edges).map((edge) => {
            const a = renderedGraph.nodes[edge.nodeAId];
            const b = renderedGraph.nodes[edge.nodeBId];
            if (!a || !b) {
              return null;
            }
            const selected = state.selection.edgeIds.includes(edge.id);
            return (
              <line
                key={edge.id}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={selected ? "#ffd166" : "#b5c0ff"}
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
          {openingPreview ? (
            <g pointerEvents="none">
              <circle
                cx={openingPreview.x}
                cy={openingPreview.y}
                r={8}
                fill={openingPreview.valid ? "rgba(112, 227, 196, 0.7)" : "rgba(255, 107, 107, 0.7)"}
                stroke={openingPreview.valid ? "#70e3c4" : "#ff6b6b"}
                strokeWidth={2}
              />
            </g>
          ) : null}
          {renderedOpenings.map((candidate) => {
            if (!candidate) {
              return null;
            }
            const selected = state.selection.openingIds.includes(candidate.opening.id);
            return (
              <g
                key={candidate.opening.id}
                transform={`translate(${candidate.x} ${candidate.y}) rotate(${candidate.angle})`}
                pointerEvents="none"
              >
                <rect
                  x={-candidate.opening.width / 2}
                  y={-4}
                  width={candidate.opening.width}
                  height={8}
                  fill={selected ? "rgba(255, 107, 107, 0.9)" : "rgba(255, 209, 102, 0.85)"}
                  stroke={selected ? "#ff6b6b" : "#ffb703"}
                  strokeWidth={1.5}
                  rx={2}
                />
              </g>
            );
          })}
          {Object.values(renderedGraph.nodes).map((node) => (
            <circle
              key={node.id}
              cx={node.x}
              cy={node.y}
              r={7}
              fill={state.selection.nodeIds.includes(node.id) ? "#ffd166" : "#f5f8ff"}
              stroke={state.selection.nodeIds.includes(node.id) ? "#ffb703" : "#384057"}
              strokeWidth={2}
            />
          ))}
        </svg>
      </div>
      <ul>
        <li>Nodes: {summary.nodeCount}</li>
        <li>Edges: {summary.edgeCount}</li>
        <li>Faces: {summary.faceCount}</li>
        <li>Rooms: {summary.roomCount}</li>
        <li>Active tool: {activeTool}</li>
        <li>Drag active: {state.drag.active ? "yes" : "no"}</li>
        <li>Draw-wall active: {isDrawWallSessionActive ? "yes" : "no"}</li>
        <li>Preview active: {state.drag.previewPatch ? "yes" : "no"}</li>
        <li>Openings: {Object.keys(state.project.openings).length}</li>
        <li>Persistence dirty: {state.persistence.dirty ? "yes" : "no"}</li>
        <li>Last save status: {lastSaveMessage || "idle"}</li>
      </ul>
      <pre>{JSON.stringify(state.debug.lastValidationErrors, null, 2)}</pre>
    </main>
  );
}
