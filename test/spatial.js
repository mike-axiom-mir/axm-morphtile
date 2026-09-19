const test = require('node:test'), assert = require('node:assert');
const MT = require('../core/morphtile.js');

const close = (a, b, eps = 1e-9) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= eps);
const pos = (w, path) => MT.tileMatrix(w, path, 0, {}).t;
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const tile = (id, place) => MT.createTile({ id, name: id, form_hints: ['game_asset', 'ui_panel'], facets: { connect: {
  sockets: [{ id: 'out', kind: 'attach', pos: [1, 0, 0] }, { id: 'in', kind: 'attach', pos: [0, 0, 0] }], bridges: [], place: place || [0, 0, 0],
} } });
const edge = (id, from, to) => ({ id, kind: 'attach', from: { tile: from, socket: 'out' }, to: { tile: to, socket: 'in' } });
const commit = (ws, ops) => { const c = MT.cloneBody(ws); for (const op of ops) assert.ok(MT.editCandidate(ws, c, op).ok); const p = MT.planMerge(ws, [c]); return MT.commitPlan(ws, p.id).receipt; };

test('old worlds without explicit spatial_root resolve exactly like the identity-root contract', () => {
  const explicit = MT.seedWorld(), old = MT.clone(explicit); delete old.spatial_root;
  assert.deepEqual(MT.validateWorld(old).errors, []);
  assert.deepEqual(MT.spatialRootOf(old), { origin: [0, 0, 0], rotation: [0, 0, 0], explicit: false });
  assert.equal(MT.renderReceipt(MT.renderAsset(old, { width: 100, height: 80 })).sha256, MT.renderReceipt(MT.renderAsset(explicit, { width: 100, height: 80 })).sha256);
  const displaced = MT.clone(explicit); displaced.spatial_root.origin = [1, 0, 0];
  assert.match(MT.validateWorld(displaced).errors.join('\n'), /spatial_root is the canonical identity frame/);
});

test('moving a root frame moves every descendant without rewriting descendant-local matter', () => {
  const w = MT.createWorld('Nested frames');
  for (const [id, p] of [['resort', [3, 2, -1]], ['hotel', [0, 0, 0]], ['room', [0, 0, 0]], ['machine', [0, 0, 0]], ['part', [0, 0, 0]]]) w.tiles[id] = tile(id, p);
  for (const [i, a, b] of [['e1', 'resort', 'hotel'], ['e2', 'hotel', 'room'], ['e3', 'room', 'machine'], ['e4', 'machine', 'part']]) w.edges[i] = edge(i, a, b);
  const local = MT.canonical({ hotel: w.tiles.hotel.facets.connect, room: w.tiles.room.facets.connect, machine: w.tiles.machine.facets.connect, part: w.tiles.part.facets.connect });
  const before = Object.fromEntries(['resort', 'hotel', 'room', 'machine', 'part'].map((id) => [id, pos(w, id)]));
  MT.applyStructOp(w, { op: 'frame.set', id: 'resort', place: [13, -2, 4] });
  const delta = [10, -4, 5];
  for (const id of Object.keys(before)) assert.ok(close(pos(w, id), before[id].map((v, i) => v + delta[i])), id);
  assert.equal(MT.canonical({ hotel: w.tiles.hotel.facets.connect, room: w.tiles.room.facets.connect, machine: w.tiles.machine.facets.connect, part: w.tiles.part.facets.connect }), local);
});

test('a portable nested kit accepts a new destination anchor without rewriting descendants', () => {
  const a = MT.createWorld('A'), shell = tile('resort', [300, 20, -80]);
  shell.facets.mesh = { type: 'interior', source: null, data: {} };
  shell.interior = { tiles: { hotel: tile('hotel', [2, 0, 1]), room: tile('room', [0, 0, 0]) }, edges: { inside: edge('inside', 'hotel', 'room') }, ports: [] };
  shell.provenance.sha256 = MT.contentHash(shell); a.tiles.resort = shell;
  const locals = MT.canonical(shell.interior), kit = MT.exportKit(a, 'resort'), b = MT.createWorld('B');
  const r = MT.importKit(b, kit, { anchor: { position: [-40, 5, 900], rotation: [0, Math.PI / 2, 0] } });
  assert.equal(r.status, 'READY'); assert.equal(r.placement.descendants_rewritten, false);
  for (const op of r.ops) MT.applyStructOp(b, op);
  assert.deepEqual(b.tiles.resort.facets.connect.place, [-40, 5, 900]);
  assert.ok(close(b.tiles.resort.facets.connect.rotation, [0, Math.PI / 2, 0]));
  assert.equal(MT.canonical(b.tiles.resort.interior), locals);
  const sourceDistance = distance(pos(a, 'resort/hotel'), pos(a, 'resort/room'));
  assert.ok(Math.abs(distance(pos(b, 'resort/hotel'), pos(b, 'resort/room')) - sourceDistance) < 1e-9);
  const held = MT.importKit(MT.createWorld('C'), kit, { anchor: { position: [0, 0], rotation: [0, 0, 0] } });
  assert.equal(held.status, 'HOLD_INVALID_DESTINATION_ANCHOR');
});

test('rotated collapse and expand preserve visible world frames', () => {
  const w = MT.createWorld('Round trip'); w.tiles.a = tile('a', [1, 0, 0]); w.tiles.b = tile('b', [-2, 0, 3]);
  MT.applyStructOp(w, { op: 'tile.collapse', ids: ['a', 'b'], id: 'group' });
  MT.applyStructOp(w, { op: 'frame.set', id: 'group', place: [7, 1, -4], rotation: [0.2, 0.5, -0.1] });
  const before = { a: MT.tileMatrix(w, 'group/a', 0, {}).t, b: MT.tileMatrix(w, 'group/b', 0, {}).t };
  MT.applyStructOp(w, { op: 'tile.expand', id: 'group' });
  assert.ok(close(pos(w, 'a'), before.a)); assert.ok(close(pos(w, 'b'), before.b));
});

test('definition placement stays instance-local and frame edits roll back exactly', () => {
  const ws = MT.createWorkspace(MT.createWorld('Instances')); ws.live.tiles.unit = tile('unit', [0, 0, 0]); ws.ledger.genesis = MT.clone(ws.live);
  commit(ws, [{ op: 'def.create', id: 'unit', as: 'def_unit' }, { op: 'def.instance', def: 'def_unit', as: 'unit_far', place: [50, 0, 0], rotation: [0, 1, 0] }]);
  const def = MT.canonical(ws.live.defs.def_unit.body), far = MT.canonical(ws.live.tiles.unit_far.facets.connect);
  const receipt = commit(ws, [{ op: 'frame.set', id: 'unit', place: [4, 3, 2], rotation: [0.1, 0.2, 0.3] }]);
  assert.equal(MT.canonical(ws.live.defs.def_unit.body), def); assert.equal(MT.canonical(ws.live.tiles.unit_far.facets.connect), far);
  assert.ok(MT.rollback(ws, receipt.rollback_token).exact); assert.deepEqual(ws.live.tiles.unit.facets.connect.place, [0, 0, 0]);
});

test('non-spatial forms remain semantic views when only a spatial frame moves', () => {
  const w = MT.seedWorld(), panel = MT.vnodeToHTML(MT.compilePanel(w).root), site = MT.compileWebsite(w).html;
  MT.applyStructOp(w, { op: 'frame.set', id: 'mt_island', place: [20, 0, 10], rotation: [0, 0.4, 0] });
  assert.equal(MT.vnodeToHTML(MT.compilePanel(w).root), panel);
  assert.equal(MT.compileWebsite(w).html.replace(/Structure hash [a-f0-9]+/, 'Structure hash'), site.replace(/Structure hash [a-f0-9]+/, 'Structure hash'));
  assert.match(MT.toText(w), /at 20 0 10/);
});
