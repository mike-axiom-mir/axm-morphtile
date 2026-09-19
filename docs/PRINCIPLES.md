# PRINCIPLES — from Mike (Axiom/Mir), 2026-09-19. These outrank every other document in this repo.

## 1. Depth before bridges

> Prioritize deepening MorphTile's native computational matter over adding bridges: prove that complexity can
> recursively collapse into a simple tile and reopen to arbitrary internal depth without losing capability,
> state, provenance, or editability.

How the code holds to it (all in `core/morphtile.js`, all asserted in `test/depth.js`):

| Must not be lost | Mechanism | Test that proves it |
|---|---|---|
| **Structure** | `tile.collapse` moves tiles and their wires, unchanged, into `tile.interior`. `tile.expand` is its exact inverse. | collapse then expand is lossless |
| **Capability** | Wires crossing the boundary become *ports*: sockets on the shell that pass signals inward and outward untouched. Attach ports resolve to the real inner socket, so placement follows inner motion. Free inputs stay reachable. `port.add` exposes more later. | collapsed world behaves identically (same state per tile, **same pixels**); signals pass through 6 shells and back; reopening can ADD capability |
| **State** | Runtime state is keyed by path. Collapse/expand emit `rekeys` that move state with the tile, before any address disappears. Values (including accrual `t0`) are never touched. | state moved with the tile; rolling back a collapse restores state exactly |
| **Provenance** | Inner tiles keep their own `provenance` and `sha256` byte-for-byte. The shell records `collapsed_from`. A tile that merely moved keeps its `state.version`. | inner provenance untouched |
| **Editability** | Every op takes a path (`mt_a/mt_b/mt_c`). Merge units carry full paths, so a facet six levels down is its own unit: it merges, conflicts, versions and rolls back alone. | 6 levels deep stays editable, versioned, rollback-exact; two callers inside one shell |
| **Portability** | A collapsed tile is one JSON object. Dropped alone into an empty world it validates, renders and runs. | one portable JSON object |
| **Honesty** | If a collapse cannot be represented exactly (two outside attach parents) it refuses. It never approximates. A collapse merges whole or not at all (`HELD_ATOMIC`). | refuses what it cannot represent; merges whole or not at all |

**v0.3 deepens it further — a collapsed tile becomes a building block, not just a folder:**

| Added | Mechanism | Test |
|---|---|---|
| **Simple control over depth** | `params`: a control on a tile that writes into real facet data — its own, or any tile inside it at any depth, through any number of bindings (one may drive several places, with an expression). It **stores no value**; its value is read back from the matter. | a parameter is a surface, not a copy; a closed shell gets a control that reaches inside |
| **Equivalence** | Using a shell's control produces the *same world hash* as editing the inner tile directly, and the same single merge unit. | control equals editing the inner tile directly |
| **No capability cap** | If matter is reshaped so a control's place no longer exists, the control goes **dormant** and says so; it never blocks or reverts the edit, and wakes when the place returns. | reshaping matter never gets blocked by a control |
| **Reuse** | `tile.stamp`: a full-depth copy that is its own tile — fresh state, `stamped_from` origin recorded, original untouched. Copies run independently because state is path-keyed. | stamping makes independent building blocks |
| **Matter as a surface** | `tile.replace` accepts a hand-edited whole tile at any depth and diffs it into fine-grained units. `tile.add` with `rename` pastes a tile from anywhere without overwriting. | the raw matter is an editable surface too; a pasted tile lands safely |
| **Many places, one thing** | `defs`: a shared body (facets, form_hints, params, interior) stored once. Each instance is a real tile with its own id, name, place, wires and state. `def.update` promotes an instance's body; `def.sync` rewrites every instance — as ordinary merge units, so propagation is planned, receipted and rolled back like anything else. `defDrift` names instances that differ; `def.detach` lets one leave, keeping everything. | fix it once, fix it everywhere; drift is visible and syncing is an explicit choice; an instance can leave |
| **Capability sleeps in the node** | `tile.capabilities`: bundles of matter (facets, sockets, controls, a whole interior) that are inert until needed — no geometry, no rules, no state, no cost. Waking is sparse runtime state in `world.awake`, keyed by path: the matter is byte-identical awake or asleep, a capability wakes per instance, and it follows a tile that moves deeper. It can wake on a signal, or because a rule said so (`{wake: 'id'}`). | a sleeping capability costs nothing; it wakes when called for; a thousand sleeping nodes cost nothing; a world can arm itself |
| **Carry what you do not hold** | A capability may name a shared definition (`grants_ref`) instead of carrying matter inline: the node holds a name, and the definition is resolved only at the moment of waking. A name that cannot be resolved is a visible HOLD in every form, never a silently empty room. | a node can carry what it does not hold; an unresolvable reference is a visible hold |
| **The world activates itself** | `pendingWakes(world, {from, t})` is a pure read that answers "what would you wake or sleep right now?" — by nearness, by a value crossing a line, or at a moment. The caller records the answer as ordinary events, so nothing watches continuously and nothing wakes behind the ledger's back. `renderAsset({within})` holds far more than it draws. | the world says what it wants woken, and asking is pure; a world can hold far more than it draws |
| **The engine's list is not the limit** | `mesh.generator: "recipe"` — a shape described *as matter*: loops, conditions and expressions over named numbers, run by the same little expression language the rest of the world uses. A world invents forms the engine never shipped, drives them with ordinary controls, and a runaway recipe is stopped at a stated budget and shown in amber. | a shape no one coded; the numbers are the shape; a runaway recipe is stopped and says so |
| **Shapes made of shapes** | A recipe part may be `{use: <definition>}`: another invented shape, transformed and folded in at compile time. Change the definition and everything built from it changes. A shape cannot be made of itself (held), a missing part is amber, depth and budget are shared and bounded. | invented shapes are built from invented shapes; change the shape everything is made of; a shape cannot be made of itself |
| **Appearance is matter too** | `material.data.paint`: three expressions of `x, y, z` and named numbers, evaluated per piece of the shape. Colour becomes a function, not a swatch — gradients, rings, anything sayable in the same little language. A painting it cannot read is inert: the shape keeps its own colours and nothing breaks. | appearance is matter too |
| **One shape, many settings** | `{use: <def>, with: {…}}` — the same definition compiled at different numbers in the same recipe, leaving the definition untouched. A shape with no numbers to set says so (`HOLD_SETTINGS_NOT_ACCEPTED`) rather than pretending. | one definition, used at different settings |
| **Leaving is not losing** | `exportWorkspace` / `exportWorld` write plain JSON that carries a claim of what it must produce; opening one replays and **checks** the claim, holding anything that does not match. A shelf entry is a whole tile, not a preview. | a saved file carries what its replay must produce; a world can be handed over on its own |

Consequence for priorities: no new bridge work until the native matter is deeper. Bridges stay as they are (one verified, labelled).

## 2. Every interface is a surface over the same matter

> Treat every interface—human, AI, visual, code, spatial—as a view/control surface over the same canonical
> matter; never create a simplified representation that becomes a less-capable fork of the underlying world.

Rules this repo follows, and a reviewer should reject changes that break them:

1. **One store.** The only state is `world` (tiles, edges, vars, time) and the ledger that explains it. Forms return pictures
   (`pixels`, `vnode`, `html`); they hold nothing. Test: reading the world as three forms leaves its hash unchanged.
2. **Controls are addresses.** Every button any form produces is `{signal, tile: <real path>, name}`. The shell's "Toggle beacon"
   and the inner tower's "Toggle" are proven to be the same control (identical resulting state).
3. **Simple is a lens, not a copy.** A closed shell is simple because the view stops descending, not because a reduced model
   was made. `opts.open` is view state owned by the host and never written into matter.
4. **Stand-ins are declared.** A shell's mesh may be swapped from "its contents" to a primitive: a derived view ("present only
   what matters"). The interior hash is unchanged and still reachable and drivable. Test: stand-in mesh.
5. **One door.** Human taps, AI ops, scripts and (later) the glove all call `act(ws, op, by)`. There is no privileged or
   reduced API for any caller. Test: human and AI runs give identical state and pixels.
6. **Reachability.** Every tile at every depth that declares a form is reachable in that form. Test: opened panel shows exactly
   the ui_panel tiles `leaves()` finds.
7. **Text is a surface, not a source.** `toText` only reads; `fromText` only *proposes ops*, which go through the same
   clone → plan → commit path as a tap. A round trip of the whole world produces **zero ops** — depth, controls, ports and
   bridges included. Editing one word yields exactly one merge unit. Anything the notation cannot express (state, provenance,
   history) is carried across from the tile already there, never overwritten, at every depth. Bad text is refused with a line
   number before anything is applied. Tests: `test/text.js`.

8. **Simple never caps capability.** A control is one more surface over the matter, so the matter stays editable by every other route
   at the same time (dormancy, above, is how that is enforced rather than locking the matter to fit the control).

Known places where principle 2 is still weak — see STATUS.md: the website form is read-only, and there is no code surface yet.
The workshop's preset dropdowns express less than the facet JSON editor, which in turn expresses less than the whole-tile editor —
but all three sit in the same screen and write to the same matter, so the simple path never becomes the only path.

## 3. Leaving means freedom, not merely export

> A game is combined matter: a larger asset made from tiles. It may leave
> MorphTile, run elsewhere, be edited elsewhere, and use a licence chosen by
> its creator. MorphTile does not own a creation merely because it presented
> the defaults used to build it.

The boundary is between **earning with MorphTile** and **earning from
MorphTile**. Creators may commercialize their exported creations. People may
also use, modify, and redistribute MorphTile noncommercially. Commercially
selling, hosting, bundling, or redistributing the engine itself crosses the
boundary and requires a grounded case plus separate written permission.

Implementation consequence: an export must not silently embed restricted
MorphTile engine code. Any runtime component needed by exports must be marked
with its own explicit redistributable licence.
