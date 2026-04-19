# Summerhouse Floorplanner Architecture (v0 Foundation)

## 1) Product restatement in plain terms

This product is a precision drawing editor where users construct buildings by drawing and editing **wall graphs**.

- Structural truth: only `Node` + `WallEdge` graph
- Derived truth: `Face` topology from graph
- Room/floor: metadata attached to faces, never independent geometry
- Editing rule: preview while interacting, commit once on finish

The user experience target is "predictable precision": no jitter, no hidden rebinding, and no surprise mode behavior.

## 2) Prompt weaknesses / ambiguities

1. **Face definition under thickness**
   - The prompt defines walls with thickness but does not state whether topology faces are centerline-based or finish-line based.
   - Decision: v1 derives faces from centerline graph; render thickness separately.

2. **Room split ownership policy**
   - "Most logical continuation" is qualitative.
   - Decision: deterministic owner selection = highest overlap score + continuity score + userEdited preference.

3. **Opening rebind rules under edge split/merge**
   - Required deterministic behavior but exact tie-break not defined.
   - Decision: preserve via host lineage (`sourceEdgeId` history + projected world anchor + local offset fallback).

4. **Multi-floor connectivity**
   - Inter-floor structures (stairs/open-to-below) are listed in library but structural graph constraints across floors are not defined.
   - Decision: graph topology is floor-local in v1; cross-floor semantics deferred.

5. **Snap priority conflict resolution**
   - Priority order is defined, but tie-break and hysteresis thresholds are not.
   - Decision: explicit score model with lock window and minimum switch delta.

## 3) Missing requirements / edge cases to define now

- Minimum wall length threshold and reject behavior
- Degenerate merge behavior for three+ nodes near collapse
- Self-intersecting polyline draw attempts
- Handling duplicate edges between same node pair
- Room metadata behavior when face vanishes temporarily (open state)
- Precision tolerance constants centralized in one config module
- Recovery UX for invalid topology (highlight and actionable suggestions)

## 4) Concrete improvements for high-end behavior

1. **Single interaction pipeline**
   - `beginInteraction` -> `updatePreview` -> `commitInteraction` / `cancelInteraction`
   - All tools share this contract.

2. **Deterministic graph operations**
   - Explicit operations: `splitEdge`, `mergeNodes`, `insertNodeOnEdge`, `reconnectEdgeEndpoint`.
   - No implicit "magic cleanup."

3. **Authoritative reconciliation service**
   - One module owns face matching + room metadata migration.
   - No secondary rebinding logic in UI/render layers.

4. **Stable snapping**
   - Candidate ranking + hysteresis + lock expiration + detach threshold.

5. **Invariant validation after every commit**
   - Hard fail in dev builds, soft-safe marks in production.

## 5) Improved build prompt (execution-focused)

Build a desktop-first 2D floorplanner with one structural source of truth: a floor-scoped wall graph (`Node`, `WallEdge`).  
Derive faces from graph topology only.  
Persist room/floor semantics exclusively as metadata linked to derived face IDs via deterministic reconciliation.  
All editing interactions must run through preview-then-commit pipeline with commit-based undo/redo.  
Snap must be deterministic with hysteresis and snap lock from committed baseline.  
No topology recompute during preview; recompute only on commit.  
No centroid-only identity for room persistence; centroid may only assist scoring.  
Implement modular architecture with isolated geometry, topology, reconciliation, validation, state, rendering, and persistence layers.

## 6) Exact file structure (initial)

```text
src/
  app/
    App.tsx
    bootstrap.tsx
  core/
    constants/
      tolerances.ts
    model/
      projectTypes.ts
      ids.ts
      defaults.ts
    graph/
      graphOps.ts
      graphQueries.ts
    topology/
      faceDetection.ts
      faceFingerprint.ts
    reconciliation/
      faceReconciliation.ts
      roomMetadataReconciliation.ts
    snap/
      snapTypes.ts
      snapEngine.ts
      hysteresis.ts
    drag/
      dragSessionTypes.ts
      interactionPipeline.ts
    history/
      historyTypes.ts
      historyStore.ts
    validation/
      invariants.ts
      validationErrors.ts
    persistence/
      storage.ts
      migrations.ts
    library/
      catalogTypes.ts
      catalogData.ts
  store/
    createStore.ts
    slices/
      graphSlice.ts
      topologySlice.ts
      roomSlice.ts
      openingSlice.ts
      furnitureSlice.ts
      annotationSlice.ts
      selectionSlice.ts
      viewportSlice.ts
      dragSlice.ts
      historySlice.ts
      persistenceSlice.ts
      debugSlice.ts
  ui/
    canvas/
      FloorCanvas.tsx
      layers/
        WallLayer.tsx
        RoomLayer.tsx
        OpeningLayer.tsx
        FurnitureLayer.tsx
        GuideLayer.tsx
    panels/
      InspectorPanel.tsx
      ToolPanel.tsx
      LibraryPanel.tsx
  tests/
    unit/
    integration/
```

## 7) Exact data model (v1)

- `ProjectData` (root persisted object)
  - `schemaVersion`
  - `graph: WallGraph`
  - `roomMetadataMap: Record<RoomMetadataId, RoomMetadata>`
  - `openings: Record<OpeningId, OpeningObject>`
  - `furniture: Record<FurnitureId, FurnitureObject>`
  - `annotations: Record<AnnotationId, AnnotationObject>`
  - `viewport`
  - `meta`

- `WallGraph`
  - `nodes: Record<NodeId, Node>`
  - `edges: Record<EdgeId, WallEdge>`

- `Face` (derived, non-persisted except optional cache)
  - `id`, `polygon`, `centroid`, `area`, `edgeIds`, `fingerprint`, `floorLevel`

- `RoomMetadata`
  - persistent metadata, contains `faceId | null`, state enum and floor material settings.

## 8) Exact topology + face reconciliation strategy

### Face detection (commit-time only)

1. Build directed half-edge adjacency from graph (per floor).
2. Sort outgoing neighbors at each node by polar angle.
3. Traverse "left-most next edge" to detect simple cycles.
4. Filter duplicates by canonical edge-cycle signature.
5. Compute polygon metrics (area, centroid, orientation).
6. Reject invalid/self-intersecting/degenerate cycles.

### Face reconciliation

For each old/new face set on same floor:

1. Fingerprint exact match => preserve face ID.
2. Else compute continuity score:
   - centroid containment (helper, not sole criteria)
   - area similarity
   - boundary overlap ratio
3. Assign best one-to-one matches with stable tie-breakers.
4. Unmatched old face IDs -> room metadata becomes `orphaned` with `faceId: null`.
5. Unmatched new faces -> generate new face IDs and default room metadata.

Single module exports the only reconciliation API used by the store.

## 9) Exact drag session + commit pipeline

```text
startInteraction(intent, targetIds, startWorld):
  snapshotCommittedState()
  drag.active = true
  drag.snapLock = null

updateInteraction(pointerWorld, modifiers):
  candidates = snapEngine(committedSnapshot, pointerWorld, drag.snapLock)
  snapResult = hysteresisResolve(candidates, drag.snapLock)
  preview = toolPreview(intent, committedSnapshot, snapResult)
  render(preview) // no persistent mutation

commitInteraction():
  nextState = materialize(preview, committedSnapshot)
  validateInvariants(nextState)
  recomputeTopology(nextState.graph)
  reconcileFacesAndRooms(nextState)
  saveHistoryEntry(previousCommitted, nextCommitted)
  persist(nextCommitted)
  clearDragSession()

cancelInteraction():
  discardPreview()
  restoreCommittedSnapshotView()
  clearDragSession()
```

## 10) Key risks and tradeoffs

- **Cycle extraction complexity:** robust planar cycle detection is non-trivial. Mitigation: keep graph operations constrained and heavily tested.
- **Performance vs correctness:** commit-time topology only simplifies interactions but may produce delayed feedback. Mitigation: lightweight visual heuristics in preview.
- **Edge split lineage for openings:** deterministic rebinding needs lineage metadata. Tradeoff is additional bookkeeping cost.
- **Strict invariants can block edits:** safer model but can frustrate users if failure messages are weak. Mitigation: explicit, actionable error states.

## 11) Phased implementation plan

- **Phase A (this PR):** strict model, graph ops, validation, modular Zustand store scaffolding, architecture doc.
- **Phase B:** topology engine + face fingerprint + reconciliation + room metadata binding.
- **Phase C:** drag session + snap engine + node/wall editing interactions.
- **Phase D:** wall drawing toolset (polyline, interior walls, split-from-edge, auto tool exit, measurements).
- **Phase E:** openings hosting, furniture attachments, selection/marquee, library foundations.
- **Phase F:** persistence UX, integration tests, performance/stability pass.
