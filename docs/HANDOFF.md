# HANDOFF — pick up here

Ground rules that are already true and should stay true:
1. `core/morphtile.js` has zero dependencies and no I/O. Keep it that way; adapters live outside it.
2. The live world changes only through `record()` events. Structural change only through clone -> plan -> commit.
3. Never write `verified_*` evidence without re-checking bytes. Unknown = HOLD, and HOLD must be visible in every form.
4. Every new claim gets a test whose name states the claim.
5. Ops and merge-unit keys address tiles by PATH. Never add an API that only works at the root.
6. A form may stop descending (a simple view). It may never keep its own reduced copy of the world.

**If you are the next model picking this up: read `docs/PRINCIPLES.md`, then run `npm test` (72 tests). Every test name is a claim; if one fails, that claim is what broke.** The workshop is `npm run build` -> `dist/axiomatter-workshop.html`, one file, no server.

Priority order changed on 2026-09-19 by Mike's principle 1: **deepen native matter before adding bridges.** Items 1-2 below (bridges) now come AFTER the depth list.

Mike's direction, 2026-09-19: **build the software side first** — a fully adjustable world whose only limit is your own ideas,
because software has no physics. States activate only when needed; capabilities sleep in nodes until called for. The glove,
the live website and outside bridges come after that. v0.3 implements the sleeping-capability half of this (`test/sleeping.js`).

Depth list (do these first):
- ~~**D10 Recipes that compose.**~~ **Done in v0.3** (`{use: <def>}` with shared budget, cycle and depth guards). Per-use settings (`with`) are done too. Next: `use` a plain tile or a shelf entry as well as a definition.
- **D11 Recipes for the other facets.** Materials are done (`paint`). Still to do: behavior as a recipe (motion written as expressions rather than chosen from spin/bob/orbit/pulse), and painting that can read a surface's direction, not only its position.
- ~~**D7 More ways to wake.**~~ **Done in v0.3**: `signal`, `near` (with hysteresis), `value`, `time`, `manual`, via the pure `pendingWakes` + `settle`. Next: waking because a *form* needs it (a panel opening, a website compiling), and a schedule.
- ~~**D8 Capability from anywhere.**~~ **Done in v0.3** for definitions (`grants_ref`), with HOLD on an unresolvable name. Next: references to a shelf entry, a file, or a bridged package — the resolver is one function (`grantsOf`), so add cases there and keep the evidence labels.
- **D9 Nothing computed unless read.** `renderAsset({within})` is done and proven. Still linear: add a spatial index (a grid keyed by place) so `leaves()` and `pendingWakes` stop touching every tile, and cache `leaves()` per structure hash.
- ~~**D1 Instancing.**~~ **Done in v0.3** as shared-by-value definitions (`world.defs`, `def.create/instance/update/sync/detach`, drift reporting). Next within it: a definition library shared across worlds, and instances that carry per-instance parameter overrides without counting as drift.
- ~~**D2 Parameters.**~~ **Done in v0.3** (`params`, `param.add/set/remove`, dormancy). Next within it: choice-control builder in the workshop UI, and controls that bind to a *port* rather than a facet place.
- ~~**D3 Tile library.**~~ **Done in v0.3**: copy/paste, id-collision renaming, browser shelf, tile/world/workspace files with verification on open. Still missing: a shared/remote library, and a shelf that survives clearing browser storage (export it as files).
- ~~**D4 Code surface.**~~ **Done in v0.3** (`toText`/`parseText`/`fromText`, Text tab, 6 tests). Next within it: collapse/expand as text verbs, a facet-data syntax nicer than inline JSON, and error underlining in the editor.
- **D5 Multi-anchor collapse** (bake + remember) so any selection can collapse, still exactly reversible.
- **D6 Live website form**: emit the same signal addresses so the exported page is a control surface, not just a picture.

Bridge and other steps (after the depth list):
1. **Real UC read.** Add `bridges/uc.js` (outside core) that reads one asset package from `axm-universal-creation`
   at a pinned commit, records sha256, and resolves a `mesh.type: "reference"` into parts. Bind `uc:asset_package_read`.
2. **Import the real parallel-capability contracts.** Compare its manifest/receipt JSON with `planMerge`/`commitPlan`
   output; write an adapter or rename fields so receipts are interchangeable. Label the edge per `axm-monolith` classes.
3. **Finer merge units** (JSON-pointer paths inside a facet) so human + AI can co-edit one facet.
4. **Governance**: derive "who may commit what" from state (Directional State Fabric) inside `planMerge` as a new HELD reason.
5. **More forms**: `tool` (a tile graph as a runnable pipeline — signals already are one), `glb` export of `compileMesh` output.
6. **Glove**: a `HandState` -> ops adapter (grab = select, move together = edge.add, rotate = facet.swap of `rot`). Core needs no change.
7. **Schema 0.2** + a protocol-evolution style test that proves meaning survives 0.1 -> 0.2, not just parsing.

Known rough edges: mesh cache keyed by JSON string; rasterizer has no near-plane clipping (triangles crossing the
camera are dropped); `orbit` facing assumes +z is forward; workshop re-renders whole panes (fine at this size).
