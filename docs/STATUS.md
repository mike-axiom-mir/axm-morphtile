# STATUS — what to trust (v0.3, 2026-09-19, third pass by Fable)

Read `docs/PRINCIPLES.md` first: three principles from Mike that outrank everything here.

Evidence words used here: **PROVEN** = a test in `test/run.js` asserts it. **WORKS** = exercised
by hand / headless browser, no assertion yet. **STUB** = shape exists, behavior thin.
**ASPIRATION** = on the posters, not in the code.

## PROVEN (67/67 tests pass: `test/run.js` 16, `test/depth.js` 11, `test/blocks.js` 10, `test/text.js` 6, `test/instances.js` 6, `test/sleeping.js` 11, `test/recipes.js` 5, `test/licensing.js` 2)
- **Invented shapes (v0.3).** A recipe mesh turns loops, conditions and expressions into real geometry: a spiral from four numbers, a lattice shell from three, neither of them known to the engine. Deterministic. One control turns a recipe into a family of shapes and rolls back exactly. A runaway recipe stops at its budget in milliseconds and shows amber like any other hold; nesting deeper than 8 is held too. Recipes travel through text, files, definitions and depth.
- **Capability by name (v0.3).** A node can carry a definition by reference at a fraction of the bytes of a copy, resolved into real tiles only when it wakes. An unresolvable name is a visible HOLD (amber in every form), never an empty room.
- **The world activates itself.** `pendingWakes` answers by nearness, by a value crossing a line, or at a moment — and asking changes nothing (world hash identical). 500 nodes each carrying a whole block stay at 510 tiles until you walk up: then only the nine within reach build themselves, and they sleep again when you leave. Every waking and sleeping is in the ledger and replays.
- **Hold far more than you draw.** A 4000-tile world drawn `within: 14` considers ~22 tiles instead of 4000, takes about a quarter of the time, and produces the *identical picture* — what was skipped was never on screen.
- **Sleeping capabilities (v0.3).** A tile carrying a whole workshop renders the identical pixel hash, tile count and state as one without it, and stores nothing, until it is called for. Waking changes no matter (matter hash identical); it is sparse state keyed by path. What wakes is ordinary matter with ordinary state that signals, renders and replays. It can sleep again keeping its state, or let it go on purpose. 1000 loaded-but-sleeping nodes draw in well under a second and count as 1000 tiles, not 3000. A tile's own rule can wake a capability. Capabilities travel through text, files, definitions and collapse; instances wake independently.
- **Instancing (v0.3).** Instances of a definition have identical bodies and their own id, name, place, wires and state. Promoting one change to the definition reaches every instance, visible as units in the receipt and reversible as one rollback. An instance may be edited alone: the drift is named, never silently corrected, and syncing is an explicit choice (all, or only some). `def.detach` keeps the body and state and stops following. Definitions survive replay, files and the text surface.
- **Text surface (v0.3).** The world writes out as readable lines and reads back with zero ops — through depth, controls, ports and bridges. Writing text builds real tiles, wires, logic and controls that run and render. A one-word edit yields exactly one merge unit and rolls back exactly. State, provenance and history are carried across, never overwritten. Bad text is refused with a line number, world untouched. Text can be scoped to one tile's interior, and additive mode adds without removing.
- **Portable evidence (v0.3).** A workspace file states the live hash, struct hash, event count and tile count that replaying it must produce; opening it replays and checks. A doctored file is HELD, an older file without a claim is loaded and labelled READ_UNVERIFIED.
- A world exports on its own, verifies by struct hash on the way back in, and still runs; a tampered or structurally broken world file is held.
- **Building blocks (v0.3).** A control on a tile writes into real facet data at any depth and stores no value of its own; using a shell's control gives the same world hash as editing the inner tile directly.
- One control can drive several places at once through an expression (tower levels also moves its roof socket).
- A control whose place is gone goes dormant instead of blocking the edit, and wakes when the place returns.
- Full-depth copies (`tile.stamp`) run independently: same matter inside, separate state, origin recorded, original untouched.
- A hand-edited whole tile (`tile.replace`) becomes fine-grained merge units at whatever depth actually changed; a pasted tile is renamed on id collision, never overwriting.
- **Recursive matter (v0.2).** Collapse N tiles into one tile and reopen: structure, state, provenance, ledger all return exactly.
- A world collapsed 2 levels deep gives the same state per tile and the **same pixel hash** as the flat world.
- Signals go down through 6 nested shells and back out. A facet 6 levels deep is its own merge unit: edit, version bump, exact rollback.
- Two callers edit different tiles inside one shell with no conflict; same tile -> HELD_CONFLICT. A collapse merges whole or not at all (HELD_ATOMIC).
- A collapsed tile is one portable JSON object that runs alone in an empty world. `port.add` extends a closed shell's capability.
- Views never write: world hash is unchanged after all three forms read it. Shell control == deep control (same resulting state).
- A shell may show a stand-in mesh; its interior hash is unchanged and still drivable.
- sha256 (pure JS) equals the platform implementation.
- Tile create / validate / stable content hash; bridges optional.
- Same tile -> game_asset pixels AND ui_panel button AND website section. `form_hints` gate who appears in which form.
- Signals travel the graph (switch -> tower -> core) deterministically.
- Six hours of offline time = 1 event, 0 simulation steps, 0 persisted values; rebuilt hash == live hash.
- Checkpoints shorten replay and land on the same hash as replay from genesis.
- Clone never touches live; commit -> receipt; rollback exact; rollback refuses after drift.
- Conflicting candidates (human vs AI) are HELD, independent edits in the same plan still merge.
- Graph-breaking edits (attach cycle, in->in signal) are rejected inside the clone.
- Rearranging: rewire switch -> rover, and the rover drives, wheels turn, tower stays dark.
- Real `axm-material-offer` fixtures: valid -> portable-verified, mismatch -> HOLD_HASH_MISMATCH, missing bytes -> hold. Weakest-evidence rule.
- Registry: advertised capability is inert until bound.
- Human and AI callers produce identical state hash and identical pixel hash.
- Workspace export -> import rebuilds live state by replay, never by trusting the file.

## WORKS (seen running in headless Chromium at phone size, no JS errors)
- v0.3 workshop: a Recipe card (a slider per named number, 'Make a control' to promote one, and the recipe itself as editable JSON), a 'What the world activates for itself' card (live count of asleep/awake, auto-settle toggle, draw-distance slider, settle-now), capability builder with wake-when-near and bring-by-name, Sleeping capabilities card (add one from a shelf tile, wake, let sleep, sleep-and-forget, remove) with the world note reporting how many sleep, Shared definitions card (make a definition, place another, bring back in step, make this the definition, let one go its own way), Text tab (read, edit, apply, revert, copy, save as .txt, scoped to the level you are in), sliders and choice controls in both Tiles and Panel, add-a-control builder, Make a copy, whole-tile editor with clipboard, paste, shelf (save/place/forget/save-as-file), workspace+world file save/open with the verification message, all driven headlessly on a 390px phone with no JS errors; no horizontal overflow down to 280px at 120% font.
- v0.2 workshop depth flow (collapse by checklist -> plan -> commit -> open shell -> scoped wires + ports -> open in panel -> AI collapses rover twice -> drive through 2 shells -> replay verified), dark mode, no JS errors.
- Workshop: form switch, orbit/tap-select, facet presets, raw facet JSON editing, wires add/rewire/remove,
  clone/plan/commit/rollback UI, time skip + replay check, bridge verification, AI door, localStorage save.

## STUB / thin
- **Depth limits.** Collapse needs the chosen tiles to share at most one outside attach parent (else it refuses). Removing an inner tile that is exposed through a port is refused rather than cascaded. Expanding a shell that was given its own behavior drops that behavior (its place is carried over). Signal depth guard is 48 hops.
- **Principle 2 gaps.** Website form is read-only. No spatial/glove surface yet.
- **Text notation limits.** It expresses tiles, facets, sockets, wires, `inside`/ports, controls and bridges; facet data is inline JSON rather than its own syntax. It cannot express state, history or receipts by design (those are carried across). `tile.collapse`/`expand` are not text verbs: writing an `inside` block on a tile that is currently flat replaces it rather than collapsing it, so use the Tiles tab for collapsing.
- **Controls.** Number and choice types only; the workshop's builder makes number controls (choice controls are set through the AI door or the JSON editor). A control is found by scanning a facet for numbers up to 3 levels deep. Multi-binding controls are supported but must be written as JSON.
- **Two ways to repeat a tile**, deliberately: `tile.stamp` makes an independent copy that never follows the original; `def.create` + `def.instance` makes instances that follow a shared definition. A body is shared by *value* (synced on demand) rather than by reference, so an instance is never blocked from being edited on its own — the cost is that `def.sync` must be run to bring drift back in step.
- **Granting an interior makes the tile a container**, so its own stand-in mesh stops being drawn while that capability is awake (this is the existing 'shown as its contents' rule). A capability that should keep the body visible has to grant a mesh and its own child tiles instead.
- **Wake conditions** are `signal`, `near` (with hysteresis so it does not flap at the boundary), `value` (over/under a var at this tile or one inside it), `time` (after a moment) and `manual`. Nearness is measured to the tile's own frame, and only where something is already being read.
- **Culling is by distance from the camera target**, not a real frustum or an index: it is a linear pass over the tile list, so a world of millions would need a spatial index next.
- **Definitions are per world.** There is no cross-world definition library yet; a world file carries its own defs.
- **Tile library**: the workshop has a shelf (this browser's storage, up to 40 whole tiles) plus tile/world/workspace files on disk. There is no shared or remote library, and the shelf is per-browser.
- **Bridge scope.** Proven against *conformance fixtures* copied from `axm-material-surface-fabric`
  (commit pinned in `bridges/fixtures/SOURCE.json`). Those payloads are truncated 1x1 PNGs: they prove
  byte verification, they are not decodable pictures, so the colour is derived from the verified hash.
  No read from `axm-universal-creation` yet. `uc:asset_package_read` and `form:glb_export` are advertised, unbound.
- **Parallel-capability is re-implemented as a pattern, not imported.** Same pipeline and status vocabulary,
  ~150 lines here. Not checked for contract compatibility with the real repo's manifests.
- **Directional State Fabric governance**: not started. Only `state.mutable === false` blocks a facet swap.
- **Protocol evolution**: `version: "0.1"` exists; there is no 0.2, so no adjacent-pair evidence yet.
- **Mesh**: primitives, two built-in generators (terrain, tower) and `recipe` — shapes described as matter. Recipe parts are the same primitives, so a recipe cannot yet invent a *new primitive* (only new arrangements), and it cannot read another tile's mesh. `type: reference` always renders as an amber HOLD box.
- **Material**: flat colour, 3 procedural patterns, emissive (may be a logic expression). No textures.
- **Behavior**: spin, bob, orbit, pulse — closed-form in time or in a logic var. No physics, no collisions.
- **Logic**: `set` + `emit`, small expression language. No timers other than accrual, no cross-tile reads.
- **website form** is a static export; its buttons are not live.
- **vehicle / character / world** hints are read by the game_asset interpreter. There is no character rig.
- Render receipts are deterministic per JS engine; trig rounding may differ across engines. State hashes use no trig.
- Merge granularity is one facet. Two people editing different keys inside the same facet still conflict.

## ASPIRATION (posters, not code)
Production-quality worlds/characters/vehicles, generated meshes from prompts, the sensor glove
(`HandState {x,y,z,rotation,grab,confidence}` would enter through `act()` as just another caller),
apps/tools forms, multiplayer, UC deep integration.
