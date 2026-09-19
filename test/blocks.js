// v0.3: a tile as a building block — parameters that reach into depth, full-depth copies, editable matter.
const test = require('node:test'), assert = require('node:assert');
const MT = require('../core/morphtile.js');
const fresh = () => MT.createWorkspace(MT.seedWorld());
const commit = (ws, ops, by) => { const c = MT.cloneBody(ws, 'c', by); for (const op of ops) { const r = MT.editCandidate(ws, c, op); assert.ok(r.ok, JSON.stringify(r)); } const res = MT.commitPlan(ws, MT.planMerge(ws, [c]).id, by); assert.ok(res.ok, JSON.stringify(res)); return res.receipt; };
const RIG = (id) => ({ op: 'tile.collapse', ids: ['mt_rover', 'mt_wheel_fl', 'mt_wheel_fr', 'mt_wheel_rl', 'mt_wheel_rr'], name: 'Rover unit', id });
const ORBIT = { id: 'orbit', label: 'Orbit radius', type: 'number', min: 6, max: 14, step: 0.2, binds: [{ tile: 'mt_rover', facet: 'behavior', at: 'data.ops.0.radius' }] };

test('a parameter is a surface, not a copy: it stores no value and writes into the real facet', () => {
  const ws = fresh(), tower = () => ws.live.tiles.mt_tower, p = tower().params[0];
  assert.ok(!('value' in p)); assert.equal(MT.paramValue(tower(), p), 3);
  const rc = commit(ws, [{ op: 'param.set', id: 'mt_tower', param: 'levels', value: 5 }]);
  assert.equal(tower().facets.mesh.data.levels, 5); assert.equal(MT.paramValue(tower(), p), 5);
  assert.ok(Math.abs(MT.findSocket(tower(), 'roof').pos[1] - 7.1) < 1e-9, 'one parameter drove a second facet through an expression');
  assert.deepEqual(rc.units.map((u) => u.key).sort(), ['tile:mt_tower#facet.connect', 'tile:mt_tower#facet.mesh'], 'the merge units are the real facets; the parameter itself did not change');
  commit(ws, [{ op: 'facet.swap', id: 'mt_tower', facet: 'mesh', value: MT.PRESETS.mesh['tall tower'] }]);
  assert.equal(MT.paramValue(tower(), p), 5, 'edit the matter another way and the parameter simply reads the new truth');
  assert.ok(MT.rollback(ws, ws.receipts[1].rollback_token).exact);
});
test('a closed shell gets a simple control that reaches a tile inside it; using it equals editing the inner tile directly', () => {
  const a = fresh(), b = fresh(); commit(a, [RIG('mt_unit'), { op: 'param.add', id: 'mt_unit', param: ORBIT }]); commit(b, [RIG('mt_unit'), { op: 'param.add', id: 'mt_unit', param: ORBIT }]);
  const rc = commit(a, [{ op: 'param.set', id: 'mt_unit', param: 'orbit', value: 11 }]);
  const beh = MT.clone(b.live.tiles.mt_unit.interior.tiles.mt_rover.facets.behavior); beh.data.ops[0].radius = 11; commit(b, [{ op: 'facet.swap', id: 'mt_unit/mt_rover', facet: 'behavior', value: beh }]);
  assert.equal(MT.structHash(a.live), MT.structHash(b.live)); assert.deepEqual(rc.units.map((u) => u.key), ['tile:mt_unit/mt_rover#facet.behavior']);
  assert.equal(MT.paramValue(a.live.tiles.mt_unit.interior.tiles.mt_rover, a.live.tiles.mt_unit.interior.tiles.mt_rover.params[0]), 11, 'the inner tile’s own parameter agrees, because both read the same matter');
  const html = MT.vnodeToHTML(MT.compilePanel(a.live).root); assert.ok(html.includes('data-param="mt_unit:orbit"') && html.includes('value="11"'), 'the panel form shows the control with its real address');
  assert.equal(commit(a, [{ op: 'param.set', id: 'mt_unit', param: 'orbit', value: 99 }]).units.length, 1); assert.equal(MT.paramValue(a.live.tiles.mt_unit, ORBIT), 14, 'clamped to its range');
});
test('parameters refuse to point at nothing, and a shell with parameters refuses to be expanded away silently', () => {
  const ws = fresh(), c = MT.cloneBody(ws); assert.ok(MT.editCandidate(ws, c, RIG('mt_unit')).ok);
  assert.ok(!MT.editCandidate(ws, c, { op: 'param.add', id: 'mt_unit', param: Object.assign({}, ORBIT, { binds: [{ tile: 'mt_nope', facet: 'behavior', at: 'data' }] }) }).ok);
  assert.ok(!MT.editCandidate(ws, c, { op: 'param.add', id: 'mt_unit', param: Object.assign({}, ORBIT, { binds: [{ tile: 'mt_rover', facet: 'behavior', at: 'data.ops.9.radius' }] }) }).ok);
  assert.ok(MT.editCandidate(ws, c, { op: 'param.add', id: 'mt_unit', param: ORBIT }).ok);
  const r = MT.editCandidate(ws, c, { op: 'tile.expand', id: 'mt_unit' }); assert.ok(!r.ok && /parameters/.test(r.error));
});
test('reshaping matter never gets blocked by a control: the control goes dormant and wakes when its place returns', () => {
  const ws = fresh(); commit(ws, [{ op: 'facet.swap', id: 'mt_tower', facet: 'mesh', value: MT.PRESETS.mesh.sphere }]);
  assert.equal(MT.paramValue(ws.live.tiles.mt_tower, ws.live.tiles.mt_tower.params[0]), undefined); assert.ok(MT.vnodeToHTML(MT.compilePanel(ws.live).root).includes('dormant'));
  const c = MT.cloneBody(ws); assert.ok(/dormant/.test(MT.editCandidate(ws, c, { op: 'param.set', id: 'mt_tower', param: 'levels', value: 4 }).error));
  commit(ws, [{ op: 'facet.swap', id: 'mt_tower', facet: 'mesh', value: MT.PRESETS.mesh.tower }, { op: 'param.set', id: 'mt_tower', param: 'levels', value: 4 }]); assert.equal(ws.live.tiles.mt_tower.facets.mesh.data.levels, 4);
});
test('a choice parameter can swap a whole facet deep inside', () => {
  const ws = fresh(); commit(ws, [{ op: 'tile.collapse', ids: ['mt_tower', 'mt_core'], id: 'mt_asm', name: 'Beacon' }, { op: 'param.add', id: 'mt_asm', param: { id: 'core', label: 'Core motion', type: 'choice', options: [{ label: 'hover', value: MT.PRESETS.behavior.hover }, { label: 'spin', value: MT.PRESETS.behavior.spin }, { label: 'still', value: MT.PRESETS.behavior.still }], binds: [{ tile: 'mt_core', facet: 'behavior', at: '' }] } }]);
  commit(ws, [{ op: 'param.set', id: 'mt_asm', param: 'core', value: 'still' }]); assert.deepEqual(ws.live.tiles.mt_asm.interior.tiles.mt_core.facets.behavior, MT.PRESETS.behavior.still);
});
test('stamping makes independent building blocks: same matter inside, separate state, recorded origin', () => {
  const ws = fresh(); commit(ws, [RIG('mt_unit'), { op: 'param.add', id: 'mt_unit', param: ORBIT }, { op: 'tile.stamp', id: 'mt_unit', as: 'mt_unit_b', by: 'ai:fable' }, { op: 'param.set', id: 'mt_unit_b', param: 'orbit', value: 10 }, { op: 'tile.stamp', id: 'mt_unit', as: 'mt_unit_c' }, { op: 'param.set', id: 'mt_unit_c', param: 'orbit', value: 12.4 }], 'ai:fable');
  assert.deepEqual(MT.validateWorld(ws.live).errors, []); assert.equal(MT.countTiles(ws.live), 4 + 3 * 6);
  assert.equal(ws.live.tiles.mt_unit_b.provenance.stamped_from.path, 'mt_unit'); assert.equal(ws.live.tiles.mt_unit_b.provenance.created_by, 'ai:fable');
  assert.equal(ws.live.tiles.mt_unit.interior.tiles.mt_rover.facets.behavior.data.ops[0].radius, 7.6, 'the original is untouched by changes to its copies');
  MT.act(ws, { do: 'signal', tile: 'mt_unit_b', name: 'drive' }); MT.act(ws, { do: 'tick', dt: 8 });
  const v = (u) => MT.readVars(ws.live, u + '/mt_rover', ws.live.time); assert.equal(v('mt_unit_b').odometer, 8); assert.equal(v('mt_unit').moving, 0); assert.equal(v('mt_unit_c').moving, 0);
  assert.equal(MT.readVars(ws.live, 'mt_unit_b/mt_wheel_fl', ws.live.time).turns, 8, 'inner ids repeat across copies; paths keep them apart');
  assert.ok(MT.act(ws, { do: 'reconstruct', fromGenesis: true }).matches_live);
});
test('the raw matter is an editable surface too: a hand-edited tile becomes fine-grained merge units', () => {
  const ws = fresh(); commit(ws, [{ op: 'tile.collapse', ids: ['mt_tower', 'mt_core'], id: 'mt_asm' }]);
  const json = JSON.parse(JSON.stringify(ws.live.tiles.mt_asm)); json.interior.tiles.mt_core.facets.material.data.color = [1, 0.2, 0.2]; json.name = 'Red beacon';
  const rc = commit(ws, [{ op: 'tile.replace', id: 'mt_asm', tile: json }]);
  assert.deepEqual(rc.units.map((u) => u.key).sort(), ['tile:mt_asm#meta', 'tile:mt_asm/mt_core#facet.material']);
  const c = MT.cloneBody(ws); assert.ok(!MT.editCandidate(ws, c, { op: 'tile.replace', id: 'mt_asm', tile: Object.assign({}, json, { id: 'mt_other' }) }).ok);
});
test('a tile pasted from anywhere lands safely: id collisions are renamed, never overwritten', () => {
  const ws = fresh(), tile = JSON.parse(JSON.stringify(ws.live.tiles.mt_core)); commit(ws, [{ op: 'tile.add', tile, rename: true }]);
  assert.ok(ws.live.tiles.mt_core && ws.live.tiles.mt_core_2); const c = MT.cloneBody(ws); assert.ok(!MT.editCandidate(ws, c, { op: 'tile.add', tile }).ok);
});

test('a saved file carries what its replay must produce, and the checker refuses a doctored one', () => {
  const ws = fresh(); commit(ws, [RIG('mt_unit'), { op: 'param.add', id: 'mt_unit', param: ORBIT }, { op: 'tile.stamp', id: 'mt_unit', as: 'mt_unit_b' }]);
  MT.act(ws, { do: 'signal', tile: 'mt_unit_b', name: 'drive' }); MT.act(ws, { do: 'tick', dt: 90 });
  const file = JSON.parse(JSON.stringify(MT.exportWorkspace(ws)));
  assert.equal(file.expect.live_hash, MT.hashOf(ws.live)); assert.equal(file.expect.tiles, MT.countTiles(ws.live));
  const back = MT.importWorkspace(file); assert.equal(back.import_check.status, 'VERIFIED'); assert.equal(MT.hashOf(back.live), MT.hashOf(ws.live));
  assert.equal(MT.readVars(back.live, 'mt_unit_b/mt_rover', back.live.time).odometer, 90, 'state survived the round trip');
  const doctored = JSON.parse(JSON.stringify(file)); doctored.ledger.events.pop();
  assert.equal(MT.importWorkspace(doctored).import_check.status, 'HOLD_REPLAY_MISMATCH', 'a file whose events do not produce its claim is held, not trusted');
  const old = JSON.parse(JSON.stringify(file)); delete old.expect;
  assert.equal(MT.importWorkspace(old).import_check.status, 'READ_UNVERIFIED', 'an older file without a claim still loads, labelled honestly');
});
test('a world can be handed over on its own, verified, and still runs', () => {
  const ws = fresh(); commit(ws, [RIG('mt_unit'), { op: 'param.add', id: 'mt_unit', param: ORBIT }]); MT.act(ws, { do: 'tick', dt: 10 });
  const file = JSON.parse(JSON.stringify(MT.exportWorld(ws.live, 'Handover')));
  const r = MT.importWorld(file); assert.equal(r.status, 'VERIFIED'); assert.equal(r.evidence, 'verified_payload_sha256'); assert.equal(r.world.name, 'Handover');
  const ws2 = MT.createWorkspace(r.world); MT.act(ws2, { do: 'signal', tile: 'mt_unit', name: 'drive' }); MT.act(ws2, { do: 'tick', dt: 5 });
  assert.equal(MT.readVars(ws2.live, 'mt_unit/mt_rover', ws2.live.time).odometer, 5);
  const bad = JSON.parse(JSON.stringify(file)); bad.world.tiles.mt_island.name = 'Tampered';
  assert.equal(MT.importWorld(bad).status, 'HOLD_HASH_MISMATCH');
  const broken = JSON.parse(JSON.stringify(file)); broken.world.edges.a_tower.to.socket = 'nope'; delete broken.expect;
  assert.equal(MT.importWorld(broken).status, 'HOLD_INVALID_WORLD');
});
