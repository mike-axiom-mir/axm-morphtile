// Definitions and instances: many tiles that ARE the same thing, without any of them becoming a lesser copy.
const test = require('node:test'), assert = require('node:assert');
const MT = require('../core/morphtile.js');
const fresh = () => MT.createWorkspace(MT.seedWorld());
const commit = (ws, ops, by) => { const c = MT.cloneBody(ws, 'c', by); for (const op of ops) { const r = MT.editCandidate(ws, c, op); assert.ok(r.ok, op.op + ': ' + r.error); } const res = MT.commitPlan(ws, MT.planMerge(ws, [c]).id, by); assert.ok(res.ok, JSON.stringify(res)); return res.receipt; };
const UNIT = { op: 'tile.collapse', ids: ['mt_rover', 'mt_wheel_fl', 'mt_wheel_fr', 'mt_wheel_rl', 'mt_wheel_rr'], id: 'mt_unit', name: 'Rover unit' };
const setup = (n) => { const ws = fresh(), ops = [UNIT, { op: 'def.create', id: 'mt_unit', as: 'def_rover', name: 'Rover' }];
  for (let i = 1; i < n; i++) ops.push({ op: 'def.instance', def: 'def_rover', as: 'mt_unit_' + i, place: [0, 2.4 * i, 0], by: 'human' });
  commit(ws, ops); return ws; };
const body = (ws, p) => MT.bodyHash(MT.bodyOf(MT.resolveTile(ws.live, p)));

test('instances are the same thing: identical bodies, their own id, name, place and state', () => {
  const ws = setup(3);
  assert.deepEqual(MT.instancesOf(ws.live, 'def_rover').map((e) => e.path), ['mt_unit', 'mt_unit_1', 'mt_unit_2']);
  assert.equal(body(ws, 'mt_unit'), body(ws, 'mt_unit_1')); assert.equal(body(ws, 'mt_unit'), body(ws, 'mt_unit_2'));
  assert.deepEqual(MT.defDrift(ws.live, 'def_rover'), []);
  assert.deepEqual(ws.live.tiles.mt_unit_2.facets.connect.place, [0, 4.8, 0], 'place is the instance\u2019s own');
  assert.notEqual(ws.live.tiles.mt_unit_1.name, ws.live.tiles.mt_unit_2.name);
  MT.act(ws, { do: 'signal', tile: 'mt_unit_1', name: 'drive' }); MT.act(ws, { do: 'tick', dt: 6 });
  assert.equal(MT.readVars(ws.live, 'mt_unit_1/mt_rover', ws.live.time).odometer, 6);
  assert.equal(MT.readVars(ws.live, 'mt_unit_2/mt_rover', ws.live.time).odometer, 0, 'state is per instance');
  assert.equal(MT.countTiles(ws.live), 4 + 3 * 6); assert.deepEqual(MT.validateWorld(ws.live).errors, []);
});
test('fix it once, fix it everywhere: an edit promoted to the definition reaches every instance, as ordinary merge units', () => {
  const ws = setup(3), before = MT.renderReceipt(MT.renderAsset(ws.live, { width: 100, height: 80 })).sha256;
  const beh = MT.clone(ws.live.tiles.mt_unit.interior.tiles.mt_rover.facets.behavior); beh.data.ops[0].radius = 11;
  const rc = commit(ws, [{ op: 'facet.swap', id: 'mt_unit/mt_rover', facet: 'behavior', value: beh }, { op: 'def.update', id: 'mt_unit' }, { op: 'def.sync', def: 'def_rover' }], 'ai:fable');
  for (const p of ['mt_unit', 'mt_unit_1', 'mt_unit_2']) assert.equal(MT.resolveTile(ws.live, p).interior.tiles.mt_rover.facets.behavior.data.ops[0].radius, 11);
  assert.deepEqual(MT.defDrift(ws.live, 'def_rover'), []);
  assert.ok(rc.units.some((u) => u.key === 'def:def_rover') && rc.units.some((u) => u.key === 'tile:mt_unit_2/mt_rover#facet.behavior'), 'nothing happens invisibly: the definition and every instance are units in the receipt');
  assert.notEqual(MT.renderReceipt(MT.renderAsset(ws.live, { width: 100, height: 80 })).sha256, before);
  assert.ok(MT.rollback(ws, rc.rollback_token).exact, 'and the whole propagation rolls back as one');
  assert.equal(ws.live.tiles.mt_unit_2.interior.tiles.mt_rover.facets.behavior.data.ops[0].radius, 7.6);
});
test('an instance can still be edited on its own; the drift is visible and syncing is an explicit choice', () => {
  const ws = setup(3);
  commit(ws, [{ op: 'facet.swap', id: 'mt_unit_1/mt_rover', facet: 'material', value: MT.PRESETS.material.ember }]);
  assert.deepEqual(MT.defDrift(ws.live, 'def_rover'), ['mt_unit_1'], 'the one that differs is named, not silently corrected');
  assert.equal(body(ws, 'mt_unit'), body(ws, 'mt_unit_2'), 'the others are untouched');
  commit(ws, [{ op: 'def.sync', def: 'def_rover', only: ['mt_unit_1'] }]);
  assert.deepEqual(MT.defDrift(ws.live, 'def_rover'), []); assert.equal(body(ws, 'mt_unit_1'), body(ws, 'mt_unit'));
});
test('an instance can leave: detaching keeps everything and records where it came from', () => {
  const ws = setup(2), had = body(ws, 'mt_unit_1');
  MT.act(ws, { do: 'signal', tile: 'mt_unit_1', name: 'drive' }); MT.act(ws, { do: 'tick', dt: 4 });
  commit(ws, [{ op: 'def.detach', id: 'mt_unit_1' }]);
  assert.equal(body(ws, 'mt_unit_1'), had, 'it keeps the body it had');
  assert.equal(ws.live.tiles.mt_unit_1.provenance.was_instance_of, 'def_rover');
  assert.equal(MT.readVars(ws.live, 'mt_unit_1/mt_rover', ws.live.time).odometer, 4, 'and its state');
  const beh = MT.clone(ws.live.tiles.mt_unit.interior.tiles.mt_rover.facets.behavior); beh.data.ops[0].radius = 13;
  commit(ws, [{ op: 'facet.swap', id: 'mt_unit/mt_rover', facet: 'behavior', value: beh }, { op: 'def.update', id: 'mt_unit' }, { op: 'def.sync', def: 'def_rover' }]);
  assert.equal(ws.live.tiles.mt_unit_1.interior.tiles.mt_rover.facets.behavior.data.ops[0].radius, 7.6, 'a detached tile stops following');
  assert.deepEqual(MT.instancesOf(ws.live, 'def_rover').map((e) => e.path), ['mt_unit']);
});
test('a control on the definition works on every instance, each writing its own matter', () => {
  const ws = setup(3), ORBIT = { id: 'orbit', label: 'Orbit radius', type: 'number', min: 6, max: 14, step: 0.2, binds: [{ tile: 'mt_rover', facet: 'behavior', at: 'data.ops.0.radius' }] };
  commit(ws, [{ op: 'param.add', id: 'mt_unit', param: ORBIT }, { op: 'def.update', id: 'mt_unit' }, { op: 'def.sync', def: 'def_rover' }]);
  for (const p of ['mt_unit_1', 'mt_unit_2']) assert.equal(MT.paramValue(MT.resolveTile(ws.live, p), ORBIT), 7.6);
  commit(ws, [{ op: 'param.set', id: 'mt_unit_1', param: 'orbit', value: 12 }]);
  assert.equal(MT.paramValue(ws.live.tiles.mt_unit_1, ORBIT), 12); assert.equal(MT.paramValue(ws.live.tiles.mt_unit_2, ORBIT), 7.6);
  assert.deepEqual(MT.defDrift(ws.live, 'def_rover'), ['mt_unit_1'], 'using a control on one instance is an edit like any other, and shows as drift');
});
test('definitions travel with the world and survive replay, files and text', () => {
  const ws = setup(2); MT.act(ws, { do: 'tick', dt: 30 });
  assert.ok(MT.act(ws, { do: 'reconstruct', fromGenesis: true }).matches_live, 'replayed from genesis');
  const back = MT.importWorkspace(JSON.parse(JSON.stringify(MT.exportWorkspace(ws))));
  assert.equal(back.import_check.status, 'VERIFIED'); assert.deepEqual(Object.keys(back.live.defs), ['def_rover']);
  const wf = MT.importWorld(JSON.parse(JSON.stringify(MT.exportWorld(ws.live))));
  assert.equal(wf.status, 'VERIFIED'); assert.deepEqual(MT.instancesOf(wf.world, 'def_rover').map((e) => e.path), ['mt_unit', 'mt_unit_1']);
  assert.deepEqual(MT.fromText(ws.live, MT.toText(ws.live)).ops, [], 'the text surface round trips a world with instances unchanged');
  const c = MT.cloneBody(ws); assert.ok(!MT.editCandidate(ws, c, { op: 'def.instance', def: 'def_nope' }).ok);
});
