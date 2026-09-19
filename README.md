# axm-morphtile — MorphTile / AxioMatter v0.3

Software as matter. One tile schema (mesh, material, behavior, logic, connect) that is
**read as different forms** — a 3D world, a working interface, a static website — from the
same JSON. Its own small world with the door open: it depends on nothing (not UC, not any
fabric repo, not a CDN, not npm) and anything may bridge in or out.

    npm test          # 62 behavioral and licence-contract tests, Node >= 18, zero dependencies
    npm run build     # -> dist/axiomatter-workshop.html  (one file, opens on a phone)
    npm run shot      # -> evidence/world.png rendered by the built-in rasterizer

Open `dist/axiomatter-workshop.html` in any browser. No server, no install.

## Licence and creator freedom

MorphTile itself uses the **PolyForm Noncommercial License 1.0.0**. People may
use, modify, and redistribute the engine noncommercially. A separate
**Creator Output Permission** allows commercial use of MorphTile to create,
export, licence, and sell games, assets, websites, worlds, applications, and
other Creator Output.

Creator Output is portable matter, not a locked child of the workshop. The
creator chooses its licence, and MorphTile claims no ownership merely because
the output was made here. Commercial exploitation of the MorphTile engine
itself—such as selling it, monetizing a fork, charging for hosted access, or
commercially bundling or redistributing it—requires separate written
permission after a grounded use case is presented.

> **Earning with MorphTile is permitted. Earning from MorphTile requires a
> grounded case and separate written permission.**

See [`LICENSE`](LICENSE),
[`CREATOR_OUTPUT_PERMISSION.md`](CREATOR_OUTPUT_PERMISSION.md), and the
[plain-language licensing map](docs/LICENSING.md).

## What is where

| Path | What it is |
|---|---|
| `core/morphtile.js` | The whole engine, one dependency-free file, Node + browser. 11 commented sections. |
| `workshop/template.html` | Phone-first workshop UI. `tools/build.js` inlines core + fixtures into `dist/`. |
| `test/run.js` | Behavioral tests. Each test name states the claim it proves. |
| `bridges/fixtures/` | Byte copies of real `axm-material-offer` packets from `axm-material-surface-fabric`, with `SOURCE.json` pinning repo + commit + sha256. |
| `docs/PRINCIPLES.md` | **Read this first.** Mike's three founding principles and exactly how the code and tests hold to them. |
| `docs/LICENSING.md` | The no-lock boundary between the MorphTile engine and portable Creator Output. |
| `test/sleeping.js` | Capabilities that sleep in a node until needed: zero cost, waking, sleeping again, 1000 loaded nodes. |
| `test/instances.js` | Definitions and instances: shared bodies, one-change propagation, visible drift, detaching. |
| `test/text.js` | The text surface: round trips, one-word edits, refusals with line numbers. |
| `test/blocks.js` | v0.3 proofs: controls over depth, dormancy, independent copies, editable raw matter. |
| `test/depth.js` | The proofs for those principles: lossless collapse/expand, identical pixels, 6-deep editing, views never fork. |
| `docs/STATUS.md` | What is real, what is stubbed, what is only aspiration. |
| `docs/HANDOFF.md` | Where the next model (Codex / Claude / anyone) should pick up. |

## The five ideas, in one paragraph each

**Tile.** JSON, schema from the founding brief section 2, extended only where a real need appeared
(`name`, `connect.place`, socket shape). A tile with zero bridges is valid. `form_hints` say what a
tile may be *read as*, never what it *is*.

**Recursive matter (v0.2).** Any set of tiles collapses into one tile that *still is* those tiles: they move, unchanged, into
`tile.interior` with their wires; boundary wires become ports; state follows by path; `tile.expand` is the exact inverse. Works to
any depth, every op and merge unit is path-addressed (`mt_a/mt_b/mt_c`), and a collapsed tile is one portable JSON object.

**Building blocks (v0.3).** A tile can carry `params`: simple controls that write into real facet data — its own, or a tile inside
it at any depth. A control stores no value; it reads the matter back, so editing the same place any other way keeps it honest, and if
the matter is reshaped so its place is gone it goes dormant rather than blocking the edit. `tile.stamp` makes a full-depth copy that
runs independently, and any tile is one JSON object you can copy out and paste into any world.

**Capability sleeps in the node.** A tile can carry a whole workshop — tiles, wires, behavior, logic, controls — that is inert
until something calls for it: no geometry, no rules, no state, no cost. A world with 1000 such nodes counts 1000 tiles and draws
in well under a second. Waking is sparse state, not a rewrite: the matter is byte-identical asleep or awake, each instance wakes
on its own, and a tile's own rule can wake it (`{"wake": "bay"}`). It sleeps again keeping its state, or lets it go on purpose.

**The world activates itself.** A capability can name a shared definition instead of carrying a copy, so a node holds a *name* and
builds the thing only when it wakes. Asking the world what it wants woken — by nearness, by a value crossing a line, or at a moment —
is a pure read; the answer is recorded as ordinary events. 500 nodes each carrying a whole city block stay at 510 tiles until you walk
up: then only the nine within reach build themselves, and they sleep again when you leave. And `renderAsset({within})` lets a
4000-tile world draw the identical picture while considering 22 tiles.

**Many places, one thing.** A tile can become a shared definition; other tiles are *instances* of it. Each instance keeps its own
id, name, position, wires and state, but the body is one thing: promote a change to the definition and every instance follows — as
ordinary merge units in the receipt, reversible in one rollback. Edit an instance alone and the drift is named rather than silently
corrected; syncing is an explicit choice, and an instance can detach and keep everything it had.

**Text is the fourth surface.** The same matter writes out as readable lines and reads back as ordinary edits:

    tile mt_lamp "Lamp" as game_asset ui_panel
      mesh primitive {"shape": "sphere", "size": [0.8, 0.8, 0.8]}
      logic rule {"vars": {"on": 0}, "rules": [{"on": "flick", "do": [{"set": ["on", ["-", 1, ["var", "on"]]]}]}]}
      socket flick signal in
    wire a_lamp attach mt_base.top -> mt_lamp.foot

Writing the whole world out and reading it back produces **zero changes**. Editing one word produces exactly one merge unit.
Text has no privileges the other surfaces lack: it proposes ops that go through the same clone → plan → commit path, it is
refused with a line number if it is wrong, and it never overwrites what it cannot express.

**Nothing is trapped.** Any tile goes on a shelf or out as a `.json` file. The whole workspace saves as one file carrying a claim of
what replaying it must produce — reopening it replays from genesis and checks that claim, holding anything that does not match. A
world exports on its own for handing to another system. No server, no account, no lock-in anywhere in the stack.

**Forms are interpreters.** `renderAsset` (game_asset / vehicle / world), `compilePanel`
(ui_panel) and `compileWebsite` (website) all read the same world. The Beacon tower is a lit
3D tower, a panel with a Toggle button and a live readout, and a page section — one object.

**Graph.** Attach wires place tiles in space *and* nest them in the panel. Signal wires carry
events between logic facets. Rewire either and every form follows.

**State** (`axm-global-state` pattern). genesis + ordered events + logical time + closed-form
rules + sparse mutations. Accruing values are `base + rate x (t - t0)`; six offline hours is one
`tick` event and zero simulation steps. Replay from genesis or a checkpoint must reproduce
the live hash, and the workshop lets you check that.

**Safety** (`axm-parallel-capability` pattern). No edit touches the live world. Edits land on
disposable clones -> `planMerge` (three-way, per facet; conflicts and drifted bases are HELD,
invalid results refuse) -> `commitPlan` writes a receipt -> `rollback(token)` restores exactly,
and refuses once the structure has drifted. Commits and rollbacks are ledger events too.

**Bridges** (`axm-monolith` evidence discipline + material exchange protocol). Evidence classes
are ordered; a pipeline inherits its weakest link; `verified_payload_sha256` is only ever
assigned after re-hashing the actual payload bytes. Unverified material stays an amber HOLD in
every form. Capability manifests are inert until bound to a local executor.

**One door.** `MorphTile.act(ws, op, by)` is the single JSON contract. The workshop buttons, the
"AI door" tab, `window.MorphTileWorkshop.act(...)` and the tests all use it. Same ops + same
order = same state hash and same pixels, whoever the caller is.
