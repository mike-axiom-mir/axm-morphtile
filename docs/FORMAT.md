# MorphTile format — v0.4

Everything below is plain JSON. This document is written so another system (UC, an agent, another language)
can read, write or re-implement MorphTile matter **without reading `core/morphtile.js`**. Where a claim needs
proving, `conformance/vectors.json` gives worlds and the answers a correct implementation must produce
(`npm test` runs them against this engine; anyone else can run the same checks).

## 1. A tile

```json
{ "id": "mt_tower", "kind": "morphtile", "version": "0.1", "name": "Beacon tower",
  "form_hints": ["game_asset", "ui_panel", "website"],
  "facets": { "mesh": {...}, "material": {...}, "behavior": {...}, "logic": {...}, "connect": {...} },
  "params": [...], "capabilities": [...], "view": {...}, "presentation": {...}, "interior": {...},
  "provenance": { "created_by": "human", "bridges": [], "sha256": "…" },
  "state": { "version": 1, "mutable": true, "last_transform": null } }
```

- `id` is `[A-Za-z0-9_-]+` and unique within its container. A tile is addressed by **path**: `mt_a/mt_b/mt_c`.
- `form_hints` say what a tile may be *read as*, never what it is. An interpreter draws only the tiles that name its form.
- `provenance.sha256` is `sha256(canonical(id, kind, version, name, facets, form_hints, interior, params, capabilities, view, presentation))`.
- `canonical(v)` is JSON with object keys sorted, `undefined` dropped, no whitespace. Every hash in this format uses it.
- `state` is history, not shape. It is never part of a shared body (§6) and never carried by text (§8).

### Facets
- **mesh** `{type: "primitive"|"generated"|"reference"|"interior", source, data}`
- **material** `{type, source, data}` — `data.color` `[r,g,b]` 0..1, optional `emissive` (a number or an expression),
  `pattern` (`checker`|`stripes`|`noise`) + `scale`, `glow`, and `paint` (§4).
- **behavior** `{type: "none"|"scripted"|"reference", data}` — `data.ops` (ready-made moves) and/or `data.motion` (§4).
- **logic** `{type: "none"|"rule"|"reference", data}` — `data.vars` and `data.rules` (§3).
- **connect** `{sockets: [...], bridges: [...], place: [x,y,z], rotation: [rx,ry,rz]}`. Rotation is optional and defaults to identity.

### Sockets and wires
A socket is `{id, kind: "attach"|"signal", pos}` or `{id, kind: "signal", dir: "in"|"out", signal, label}`.
A wire is `{id, kind, from: {tile, socket}, to: {tile, socket}}` in its container's `edges`.
Attach wires place a tile in space *and* nest it in panel form; a tile may have at most one attach parent, and
cycles are invalid. Signal wires run `out → in`.

## 2. A world, and containers
```json
{ "kind": "morphtile-world", "version": "0.1", "name": "Skyhold",
  "spatial_root": {"origin":[0,0,0], "rotation":[0,0,0]},
  "tiles": {...}, "edges": {...}, "vars": {...}, "awake": {...}, "defs": {...}, "words": {...}, "time": 0 }
```
A tile may hold a whole graph in `interior: {tiles, edges, ports}`. The world and every interior are the same kind
of container. A **port** `{id, tile, socket}` exposes an inner socket on the shell, unchanged in both directions.
`spatial_root` is always the identity frame. Old worlds may omit it and resolve identically. Content is placed through
tile-local frames, so a world root never implies terrain, borders or a visible object. `structHash` includes
`spatial_root` only when the file explicitly carries it, preserving verification of old files that omitted the field.

## 3. The expression language
An expression is a literal or `[op, ...args]`. 26 built-in words:
`var t + - * / % min max floor abs sqrt pow sin cos wrap == != < > <= >= and or not if`.
`["var", "n"]` reads a name in scope; `["t"]` is logical time. **An unknown word evaluates to `null` and does
nothing** — expressions never throw. A world may add words (§7).

Logic rules: `{on: "<signal>", if: <expr>, do: [{set: ["name", <expr>]} | {emit: "<signal>"} | {wake: "<cap>"} | {sleep: "<cap>"}]}`.
Variables are either plain values or **accruals** `{accrue: {rate: <expr>, cap}, base}` whose value is
`base + rate × (t − t0)` — closed form, so six offline hours cost one event and zero simulation steps.
Only mutations are stored (`world.vars[path][name]`); untouched values are derived from the definition.

## 4. Shape, colour and motion as data
- **Recipe mesh**: `{type: "generated", data: {generator: "recipe", vars, budget, parts}}`.
  A part is `{shape, size, pos, rot, color, segments, taper, sub}` (any number may be an expression),
  or `{repeat: <expr>, as: "i", body: [...]}` (loop; `i`, `i_of`, `i_at` are in scope),
  or `{when: <expr>, ...}`, or `{use: "<def>", with: {…}, pos, rot, scale, color}` (another shape, §6).
  Budget defaults to 4000 parts and is shared across a whole composition; exceeding it, or nesting past
  depth 8 (or 4 for `use`), yields a **hold** rather than a hang.
- **Paint**: `material.data.paint = {vars, color: [<expr>, <expr>, <expr>]}` evaluated per triangle with
  `x, y, z` (its centre), `nx, ny, nz` (its facing) and `up` (how much it faces the sky). Out-of-range or
  unreadable values are ignored and the shape keeps its own colours.
- **Motion**: `behavior.data.motion = {vars, pos: [expr,expr,expr], rot: [...], glow: <expr>}` over `["t"]`,
  its own numbers and the tile's own values. It adds to `data.ops` rather than replacing them.

## 4b. A tile's own interface
`view = {title, accent, width, body: [...]}`. A body node is one of:
`{text, strong}`, `{value: "<var>", label}`, `{meter: <expr>, min, max, label}`, `{button: "<signal socket>", label}`,
`{control: "<param id>", label}`, `{tile: "<id or full/path>"}`, `{row: [...]}`, `{group: [...]}`,
`{repeat: <expr>, as: "i", body: [...]}` — any node may carry `{when: <expr>}`. Values in `title`, `text`, `label`,
`meter`, `min`, `max`, `repeat` and `when` may be expressions over the tile's own values.
A view is read-only and produces controls addressed to the real tile path; embedding is capped at depth 6 and a view
that presents itself is refused. A tile without a view gets the interpreter's default card.

`presentation = {mode, dock?, anchor?, preferred_size?, preferred_position?, user_adjustable?}` declares where that
view belongs. `mode` is `screen|docked|floating|fullscreen|embedded|world|tile`; `dock` is
`left|right|top|bottom`. `world` resolves to the canonical root; `tile` resolves the named tile's real spatial frame.
The canonical descriptor travels with the tile. A host may apply a per-user/session override only when
`user_adjustable` is true; that resolved override is never written into shared matter unless submitted through an
explicit `presentation.set` edit. Missing anchors and unsupported host modes are visible HOLDs.

## 5. Holds
Anything unresolved or unverifiable is a **hold**, never a guess: `HOLD_SOURCE_INCOMPLETE`,
`HOLD_HASH_MISMATCH`, `HOLD_DEFINITION_NOT_HERE`, `HOLD_RECIPE_OVER_BUDGET`, `HOLD_RECIPE_TOO_DEEP`,
`HOLD_RECIPE_USES_ITSELF`, `HOLD_SETTINGS_NOT_ACCEPTED`, `HOLD_NO_WORLD_TO_LOOK_IN`. A held facet renders amber.
Evidence classes, weakest-link first: `inferred_candidate_not_tested` < `structurally_possible_not_tested` <
`declared_contract_match_not_tested` < `verified_payload_sha256`.

## 6. Definitions, instances, capabilities
- `defs[id] = {id, name, body, created_by}` where `body` is `{facets, form_hints, params, interior, capabilities, view, presentation}`
  with every tile's `state` and `provenance` stripped, and no instance-local `connect.place` or `connect.rotation`.
- A tile with `provenance.instance_of` is an instance: its body follows that definition, its id, name, place,
  wires and state are its own. Syncing rewrites instances through ordinary edits.
- `capabilities[]` = `{id, name, wake, grants | grants_ref: {def}}`. Asleep it costs nothing — no geometry, no
  rules, no state. Waking is `world.awake[path][id] = true`; **matter is byte-identical awake or asleep**.
  `wake.on` is `manual` | `signal` (`name`) | `near` (`within`, `hysteresis`) | `value` (`tile`, `var`, `over`/`under`) | `time` (`after`).

## 7. World-defined words
`words[name] = {name, args: ["x"], body: <expr>, note}`. Usable everywhere an expression is. The 26 built-ins
cannot be redefined; recursion stops at depth 12 and yields `null`.

## 8. Files
| Format | Carries | Checked by |
|---|---|---|
| `morphtile-workspace` | genesis + every event | replaying must reproduce `expect.live_hash` |
| `morphtile-world` | one world as it stands | `expect.struct_hash` |
| `morphtile-kit` | a tile + the defs and words it needs | `expect.sha256`; a conflict holds the whole import |
| `morphtile-words` | a vocabulary | `expect.sha256`; same name, different body → held |
| `morphtile-conformance` | worlds + required answers | this document's test suite |

Text form (§ the `Text` surface) writes `world`, `word`, `tile`, `at`, `rotate`, facet lines, `socket`, `control`, `capability`, `view`, `presentation`,
`inside`/`port`/`end`, and `wire`. It never carries state, provenance or history; reading it back produces edits
only where the matter genuinely differs.

## 9. The one door
Every caller — human, agent, script — goes through `act(workspace, op, by)`:
`signal`, `tick`, `wake`, `sleep`, `settle`, `clone`, `edit`, `discard`, `plan`, `commit`, `rollback`, `reconstruct`.
Structural ops (inside `edit`) are `tile.add/remove/replace/meta/stamp/collapse/expand`, `facet.swap`, `edge.add/remove/rewire`,
`port.add`, `param.add/set/remove`, `cap.add/remove`, `view.set`, `presentation.set`, `frame.set`, `def.create/instance/update/sync/detach/put`, `word.define/remove`,
`bridge.attach`. Nothing edits a live world directly: edits land on a clone, a plan says what would merge and what is
held, a commit writes a receipt, and a rollback restores exactly until the world has drifted.


## 12. Profile saves and child-world references

A world may declare a save contract, but **profile data and save payloads are not world matter**.

```json
"save_policy": { "mode": "profile", "ai_bridge": true }
```

`mode` is `none|profile`. `ai_bridge` only says whether a profile-owned save may be exposed by reference to a connected AI instance. A world never contains profile identities, save slots, AI credentials or save payloads.

A world may expose lazy child worlds by reference:

```json
"child_worlds": {
  "dungeon": {
    "id": "dungeon",
    "world_ref": "local:worlds/dungeon-01",
    "activation": "lazy",
    "via": { "tile": "house/door", "action": "open" }
  }
}
```

A child descriptor contains no child-world bytes. The host resolves `world_ref` only when that child becomes active. Each loaded child world may define its own `child_worlds`, so the graph may continue to arbitrary depth without embedding an entire multiverse into the parent world.

`world.save-policy.set`, `child-world.put` and `child-world.remove` are ordinary candidate operations. Their changes become merge units (`world:save_policy`, `childworld:<id>`) with normal receipt and rollback behavior.

Profile categories, world slots, save slots, cross-profile world links and AI connections are defined by the separate zero-I/O profile store in `profiles/profile-store.js`. Multiple profiles may point at the same opaque `world_ref` without copying world memory. A save payload is opaque JSON: a checkpoint, RPG progression, editor state or another application-defined shape are all equally valid.

Runtime navigation is separate again: `runtime/world-session.js` carries exactly one `active_world_ref` plus a return stack. Entering a child returns the one reference the host should load; it does not mutate either world and it does not preload sibling children.
