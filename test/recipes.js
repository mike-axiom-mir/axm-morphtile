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

const withDef = (mesh, defMesh) => { const w = MT.createWorld('Compose');
  w.defs = { def_part: { id: 'def_part', name: 'Part', body: { facets: { mesh: defMesh || MT.PRESETS.mesh.spiral, material: { type: 'primitive', source: null, data: { color: [0.7, 0.7, 0.9] } } } } } };
  w.tiles.mt_x = MT.createTile({ id: 'mt_x', name: 'Built from parts', form_hints: ['game_asset'], facets: { mesh } }); return w; };
const ROW = { type: 'generated', source: null, data: { generator: 'recipe', vars: { n: 3, gap: 3 }, parts: [{ repeat: ['var', 'n'], as: 'i', body: [{ use: 'def_part', pos: [['*', ['var', 'gap'], ['var', 'i']], 0, 0], scale: 0.6 }] }] } };

test('invented shapes are built from invented shapes: a recipe part can be a whole other shape', () => {
  const w = withDef(ROW), m = MT.compileMesh(w.tiles.mt_x, w);
  assert.equal(m.hold, null); assert.equal(m.recipe_parts, 84, 'three copies of a 28-part spiral');
  assert.ok(MT.renderAsset(w, { width: 100, height: 80 }).stats.tris > 1500);
  assert.equal(MT.renderReceipt(MT.renderAsset(w, { width: 90, height: 70 })).sha256, MT.renderReceipt(MT.renderAsset(w, { width: 90, height: 70 })).sha256);
});
test('change the shape everything is made of, and everything made of it changes', () => {
  const w = withDef(ROW), before = MT.renderReceipt(MT.renderAsset(w, { width: 90, height: 70 })).sha256;
  w.defs.def_part.body.facets.mesh = MT.PRESETS.mesh.lattice;
  const after = MT.compileMesh(w.tiles.mt_x, w);
  assert.equal(after.recipe_parts, 111, 'three lattices now, not three spirals');
  assert.notEqual(MT.renderReceipt(MT.renderAsset(w, { width: 90, height: 70 })).sha256, before);
});
test('a shape cannot be made of itself, and a missing part is a visible hold', () => {
  const w = withDef(ROW, ROW.type ? { type: 'generated', source: null, data: { generator: 'recipe', parts: [{ use: 'def_part' }] } } : null);
  assert.equal(MT.compileMesh(w.tiles.mt_x, w).hold, 'HOLD_RECIPE_USES_ITSELF');
  const gone = withDef({ type: 'generated', source: null, data: { generator: 'recipe', parts: [{ use: 'def_nowhere' }] } });
  assert.equal(MT.compileMesh(gone.tiles.mt_x, gone).hold, 'HOLD_DEFINITION_NOT_HERE');
  assert.ok(MT.renderAsset(gone, { width: 60, height: 50 }).stats.holds.some((h) => h.status === 'HOLD_DEFINITION_NOT_HERE'), 'amber, like any other unresolved name');
  const alone = MT.createTile({ id: 'mt_a', name: 'Alone', facets: { mesh: { type: 'generated', source: null, data: { generator: 'recipe', parts: [{ use: 'def_part' }] } } } });
  assert.equal(MT.compileMesh(alone).hold, 'HOLD_NO_WORLD_TO_LOOK_IN', 'and a shape that needs to look something up says so when it cannot');
});
test('composition is bounded: a deep or greedy chain stops at the budget it was given', () => {
  const w = MT.createWorld('Deep'); w.defs = {};
  for (let i = 0; i < 6; i++) w.defs['def_' + i] = { id: 'def_' + i, name: 'L' + i, body: { facets: { mesh: i === 0 ? MT.PRESETS.mesh.box : { type: 'generated', source: null, data: { generator: 'recipe', parts: [{ repeat: 2, as: 'k', body: [{ use: 'def_' + (i - 1), pos: [['var', 'k'], 0, 0] }] }] } } } } };
  w.tiles.mt_x = MT.createTile({ id: 'mt_x', name: 'Chain', form_hints: ['game_asset'], facets: { mesh: { type: 'generated', source: null, data: { generator: 'recipe', parts: [{ use: 'def_5' }] } } } });
  const t0 = Date.now(), m = MT.compileMesh(w.tiles.mt_x, w), ms = Date.now() - t0;
  assert.equal(m.hold, 'HOLD_RECIPE_TOO_DEEP'); assert.ok(ms < 1000, 'stopped in ' + ms + 'ms');
  w.tiles.mt_x.facets.mesh.data.parts = [{ use: 'def_3' }];
  assert.equal(MT.compileMesh(w.tiles.mt_x, w).hold, null, 'a chain within reach is fine');
});
test('a composed shape is ordinary matter: text, files and depth all carry it', () => {
  const ws = MT.createWorkspace(withDef(ROW));
  assert.deepEqual(MT.fromText(ws.live, MT.toText(ws.live)).ops, []);
  const back = MT.importWorkspace(JSON.parse(JSON.stringify(MT.exportWorkspace(ws))));
  assert.equal(back.import_check.status, 'VERIFIED'); assert.equal(MT.compileMesh(back.live.tiles.mt_x, back.live).recipe_parts, 84);
  const c = MT.cloneBody(ws); assert.ok(MT.editCandidate(ws, c, { op: 'tile.collapse', ids: ['mt_x'], id: 'mt_case', name: 'Case' }).ok);
  assert.ok(MT.commitPlan(ws, MT.planMerge(ws, [c]).id).ok);
  assert.ok(MT.renderAsset(ws.live, { width: 80, height: 60 }).order.includes('mt_case/mt_x'));
});

test('one definition, used at different settings, without changing the definition', () => {
  const w = withDef({ type: 'generated', source: null, data: { generator: 'recipe', parts: [
    { use: 'def_part', pos: [0, 0, 0], with: { rungs: 6 } }, { use: 'def_part', pos: [3, 0, 0], with: { rungs: 20 } }] } });
  const m = MT.compileMesh(w.tiles.mt_x, w);
  assert.equal(m.hold, null); assert.equal(m.recipe_parts, 52, 'six rungs and twenty, from one shape');
  assert.equal(w.defs.def_part.body.facets.mesh.data.vars.rungs, 14, 'the definition itself is untouched');
  const plain = withDef({ type: 'generated', source: null, data: { generator: 'recipe', parts: [{ use: 'def_part' }, { use: 'def_part', pos: [3, 0, 0] }] } });
  assert.equal(MT.compileMesh(plain.tiles.mt_x, plain).recipe_parts, 56, 'and without settings it is the definition as written');
  const notARecipe = withDef({ type: 'generated', source: null, data: { generator: 'recipe', parts: [{ use: 'def_part', with: { n: 2 } }] } }, MT.PRESETS.mesh.box);
  assert.equal(MT.compileMesh(notARecipe.tiles.mt_x, notARecipe).hold, 'HOLD_SETTINGS_NOT_ACCEPTED', 'a shape with no numbers to set says so');
});
test('appearance is matter too: colour written as an expression of where you are on the shape', () => {
  const w = MT.createWorld('Paint');
  w.tiles.mt_x = MT.createTile({ id: 'mt_x', name: 'Painted', form_hints: ['game_asset'], facets: { mesh: MT.PRESETS.mesh.tower, material: MT.PRESETS.material['painted: height gradient'] } });
  const m = MT.compileMesh(w.tiles.mt_x);
  assert.ok(m.K[0] && m.K[m.K.length - 1], 'every triangle got its own colour');
  assert.notDeepEqual(m.K[0], m.K[m.K.length - 1], 'and the colour changes with height');
  assert.ok(m.K.every((c) => c.every((v) => v >= 0 && v <= 1)), 'always a real colour');
  assert.equal(MT.renderReceipt(MT.renderAsset(w, { width: 90, height: 70 })).sha256, MT.renderReceipt(MT.renderAsset(w, { width: 90, height: 70 })).sha256);
  const rings = MT.clone(w.tiles.mt_x); rings.facets.material = MT.PRESETS.material['painted: rings'];
  assert.notDeepEqual(MT.compileMesh(rings).K[10], m.K[10], 'a different painting gives a different shape of colour');
  const nonsense = MT.clone(w.tiles.mt_x); nonsense.facets.material = { type: 'generated', source: null, data: { color: [0.5, 0.5, 0.5], paint: { color: [['frobnicate', 2], 0.5, 0.5] } } };
  const plainMat = MT.clone(w.tiles.mt_x); plainMat.facets.material = { type: 'primitive', source: null, data: { color: [0.5, 0.5, 0.5] } };
  assert.deepEqual(MT.compileMesh(nonsense).K, MT.compileMesh(plainMat).K, 'a painting it cannot read is inert: the shape keeps its own colours, nothing breaks');
});
