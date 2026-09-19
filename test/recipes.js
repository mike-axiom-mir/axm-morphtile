// Shapes invented inside the world: a mesh described as matter, not chosen from a list the engine ships.
const test = require('node:test'), assert = require('node:assert');
const MT = require('../core/morphtile.js');
const world = (mesh, extra) => { const w = MT.createWorld('Bench'), t = MT.createTile(Object.assign({ id: 'mt_x', name: 'Invention', form_hints: ['game_asset', 'ui_panel'], facets: { mesh } }, extra || {})); w.tiles.mt_x = t; return w; };
const shot = (w) => MT.renderReceipt(MT.renderAsset(w, { width: 120, height: 100, camera: { yaw: 0.6, pitch: 0.3, dist: 9 } }));

test('a shape no one coded: a recipe of loops and expressions becomes real geometry', () => {
  const w = world(MT.PRESETS.mesh.spiral), m = MT.compileMesh(w.tiles.mt_x);
  assert.equal(m.hold, null); assert.equal(m.recipe_parts, 28, 'fourteen rungs and fourteen posts, from four numbers');
  assert.ok(MT.renderAsset(w, { width: 100, height: 80 }).stats.tris > 500);
  assert.equal(shot(w).sha256, shot(w).sha256, 'and it is deterministic');
  assert.ok(!/spiral/.test(MT.canonical(MT.PRESETS.mesh.box)), 'the engine ships no spiral: the world describes it');
});
test('the numbers are the shape: one control turns a recipe into a family of shapes', () => {
  const grow = { id: 'rungs', label: 'Rungs', type: 'number', min: 2, max: 40, step: 1, binds: [{ facet: 'mesh', at: 'data.vars.rungs' }] };
  const w = world(MT.clone(MT.PRESETS.mesh.spiral), { params: [grow] }), ws = MT.createWorkspace(w);
  assert.equal(MT.paramValue(ws.live.tiles.mt_x, grow), 14);
  const before = shot(ws.live).sha256;
  const c = MT.cloneBody(ws); assert.ok(MT.editCandidate(ws, c, { op: 'param.set', id: 'mt_x', param: 'rungs', value: 30 }).ok);
  assert.ok(MT.commitPlan(ws, MT.planMerge(ws, [c]).id).ok);
  assert.equal(MT.compileMesh(ws.live.tiles.mt_x).recipe_parts, 60); assert.notEqual(shot(ws.live).sha256, before);
  assert.ok(MT.rollback(ws, ws.receipts[0].rollback_token).exact);
  assert.equal(shot(ws.live).sha256, before, 'and it comes back exactly');
});
test('recipes nest: loops inside loops, with a condition, build a lattice from three numbers', () => {
  const w = world(MT.PRESETS.mesh.lattice);
  assert.equal(MT.compileMesh(w.tiles.mt_x).recipe_parts, 37, 'only the shell of a 4x4x4 grid');
  const bigger = MT.clone(MT.PRESETS.mesh.lattice); bigger.data.vars.n = 5;
  assert.equal(MT.compileMesh(MT.createTile({ id: 'mt_b', name: 'B', facets: { mesh: bigger } })).recipe_parts, 61);
});
test('a runaway recipe is stopped and says so, instead of hanging the world', () => {
  const huge = { type: 'generated', source: null, data: { generator: 'recipe', vars: { n: 99999 }, parts: [{ repeat: ['var', 'n'], as: 'i', body: [{ shape: 'box', pos: [0, ['var', 'i'], 0] }] }] } };
  const t0 = Date.now(), m = MT.compileMesh(MT.createTile({ id: 'mt_h', name: 'Runaway', facets: { mesh: huge } })), ms = Date.now() - t0;
  assert.equal(m.hold, 'HOLD_RECIPE_OVER_BUDGET'); assert.ok(ms < 1500, 'stopped in ' + ms + 'ms');
  const w = world(huge); assert.ok(MT.renderAsset(w, { width: 60, height: 50 }).stats.holds.some((h) => h.status === 'HOLD_RECIPE_OVER_BUDGET'), 'and it shows amber, like any other hold');
  const deep = { type: 'generated', source: null, data: { generator: 'recipe', parts: [{ body: [{ body: [{ body: [{ body: [{ body: [{ body: [{ body: [{ body: [{ body: [{ shape: 'box' }] }] }] }] }] }] }] }] }] }] } };
  assert.equal(MT.compileMesh(MT.createTile({ id: 'mt_d', name: 'Deep', facets: { mesh: deep } })).hold, 'HOLD_RECIPE_TOO_DEEP');
});
test('an invented shape is ordinary matter: it travels through text, files, definitions and depth', () => {
  const ws = MT.createWorkspace(world(MT.PRESETS.mesh.spiral));
  assert.deepEqual(MT.fromText(ws.live, MT.toText(ws.live)).ops, [], 'the text surface round trips a recipe unchanged');
  const back = MT.importWorkspace(JSON.parse(JSON.stringify(MT.exportWorkspace(ws))));
  assert.equal(back.import_check.status, 'VERIFIED');
  assert.equal(MT.compileMesh(back.live.tiles.mt_x).recipe_parts, 28);
  const c = MT.cloneBody(ws); assert.ok(MT.editCandidate(ws, c, { op: 'tile.collapse', ids: ['mt_x'], id: 'mt_box', name: 'Case' }).ok);
  assert.ok(MT.commitPlan(ws, MT.planMerge(ws, [c]).id).ok);
  assert.ok(MT.renderAsset(ws.live, { width: 80, height: 60 }).order.includes('mt_box/mt_x'), 'and renders the same from inside a collapsed tile');
});
