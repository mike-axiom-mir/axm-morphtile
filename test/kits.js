// A tile that can be itself somewhere else: it takes what it needs with it, and says so when it cannot.
const test = require('node:test'), assert = require('node:assert');
const MT = require('../core/morphtile.js');
const commit = (ws, ops, by) => { const c = MT.cloneBody(ws, 'c', by); for (const op of ops) { const r = MT.editCandidate(ws, c, op); assert.ok(r.ok, op.op + ': ' + r.error); } const res = MT.commitPlan(ws, MT.planMerge(ws, [c]).id, by); assert.ok(res.ok, JSON.stringify(res)); return res.receipt; };
const EASE = { op: 'word.define', name: 'ease', args: ['x'], body: ['*', ['var', 'x'], ['var', 'x']] };
const ROW = { type: 'generated', source: null, data: { generator: 'recipe', vars: { n: 3 }, parts: [{ repeat: ['var', 'n'], as: 'i', body: [{ use: 'def_s', pos: [['*', 3, ['ease', ['var', 'i_at']]], 0, 0] }] }] } };
function sender() {
  const ws = MT.createWorkspace(MT.seedWorld());
  commit(ws, [EASE, { op: 'facet.swap', id: 'mt_tower', facet: 'mesh', value: MT.PRESETS.mesh.spiral }, { op: 'def.create', id: 'mt_tower', as: 'def_s', name: 'Spiral' },
    { op: 'tile.add', tile: MT.createTile({ id: 'mt_row', name: 'Row of spirals', form_hints: ['game_asset'], facets: { mesh: ROW, connect: { sockets: [], bridges: [], place: [0, 4, 0] } } }) }]);
  return ws;
}
const apply = (ws, ops) => commit(ws, ops);

test('a kit gathers what the tile needs: the shapes it names and the words it is written in', () => {
  const ws = sender(), kit = MT.exportKit(ws.live, 'mt_row');
  assert.equal(kit.format, 'morphtile-kit'); assert.deepEqual(Object.keys(kit.defs), ['def_s']); assert.deepEqual(Object.keys(kit.words), ['ease']);
  assert.deepEqual(kit.expect.missing, []); assert.equal(kit.expect.defs, 1);
  const bare = MT.exportKit(ws.live, 'mt_switch');
  assert.deepEqual([Object.keys(bare.defs), Object.keys(bare.words)], [[], []], 'a tile that needs nothing carries nothing');
});
test('the kit works somewhere else: dropped into a fresh world it renders the same', () => {
  const ws = sender(), kit = JSON.parse(JSON.stringify(MT.exportKit(ws.live, 'mt_row')));
  const here = MT.compileMesh(ws.live.tiles.mt_row, ws.live);
  const other = MT.createWorkspace(MT.createWorld('Elsewhere'));
  const r = MT.importKit(other.live, kit);
  assert.equal(r.status, 'READY'); assert.equal(r.evidence, 'verified_payload_sha256');
  assert.deepEqual(r.ops.map((o) => o.op), ['word.define', 'def.put', 'tile.add']);
  apply(other, r.ops);
  assert.deepEqual(MT.validateWorld(other.live).errors, []);
  const there = MT.compileMesh(other.live.tiles.mt_row, other.live);
  assert.equal(there.hold, null); assert.equal(there.recipe_parts, here.recipe_parts);
  assert.equal(MT.canonical(there.P.slice(0, 60)), MT.canonical(here.P.slice(0, 60)), 'the same geometry, not an approximation of it');
});
test('without its kit the same tile arrives honest, not broken', () => {
  const ws = sender(), lone = MT.createWorkspace(MT.createWorld('Bare'));
  apply(lone, [{ op: 'tile.add', tile: MT.clone(ws.live.tiles.mt_row) }]);
  const m = MT.compileMesh(lone.live.tiles.mt_row, lone.live);
  assert.equal(m.hold, 'HOLD_DEFINITION_NOT_HERE', 'it says what it is missing');
  assert.ok(MT.renderAsset(lone.live, { width: 60, height: 50 }).stats.holds.length, 'and shows amber rather than pretending');
});
test('a kit never silently overwrites what the other world already has', () => {
  const ws = sender(), kit = JSON.parse(JSON.stringify(MT.exportKit(ws.live, 'mt_row')));
  const other = MT.createWorkspace(MT.createWorld('Busy'));
  apply(other, [{ op: 'def.put', id: 'def_s', name: 'Something else', body: { facets: { mesh: MT.PRESETS.mesh.box, material: { type: 'primitive', source: null, data: { color: [1, 0, 0] } } } } }]);
  const held = MT.importKit(other.live, kit);
  assert.equal(held.status, 'HELD_INCOMPLETE'); assert.deepEqual(held.ops, []);
  assert.deepEqual(held.conflicts.map((c) => c.name), ['def_s']);
  assert.ok(/without something it needs/.test(held.detail), 'and nothing is applied, so the tile never arrives half-built');
  const forced = MT.importKit(other.live, kit, { overwrite: true });
  assert.equal(forced.status, 'READY'); assert.ok(forced.ops.some((o) => o.op === 'def.put'), 'unless you say so plainly');
  const partial = MT.importKit(other.live, kit, { partial: true });
  assert.equal(partial.status, 'PARTIAL_HELD'); assert.ok(partial.ops.some((o) => o.op === 'tile.add'), 'or accept it arriving incomplete, on purpose');
});
test('a kit is checked like anything else that arrives from outside', () => {
  const ws = sender(), kit = JSON.parse(JSON.stringify(MT.exportKit(ws.live, 'mt_row'))), other = MT.createWorkspace(MT.createWorld('Careful'));
  const tampered = JSON.parse(JSON.stringify(kit)); tampered.defs.def_s.body.facets.mesh.data.vars.rungs = 99;
  assert.equal(MT.importKit(other.live, tampered).status, 'HOLD_HASH_MISMATCH');
  assert.equal(MT.importKit(other.live, { hello: 1 }).status, 'HOLD_NOT_A_KIT');
  apply(other, MT.importKit(other.live, kit).ops);
  const again = MT.importKit(other.live, kit);
  assert.deepEqual(again.already.sort(), ['def_s', 'ease'], 'arriving twice adds the tile again but not its parts');
  assert.deepEqual(again.ops.map((o) => o.op), ['tile.add']);
  apply(other, again.ops);
  assert.deepEqual(Object.keys(other.live.tiles).sort(), ['mt_row', 'mt_row_2'], 'and the second copy is renamed, never overwriting the first');
});
