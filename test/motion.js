// Motion written, not chosen: the last facet whose vocabulary was the engine's list.
const test = require('node:test'), assert = require('node:assert');
const MT = require('../core/morphtile.js');
const world = (behavior, extra) => { const w = MT.createWorld('Bench');
  w.tiles.mt_x = MT.createTile(Object.assign({ id: 'mt_x', name: 'Mover', form_hints: ['game_asset', 'ui_panel'], facets: { mesh: { type: 'primitive', source: null, data: { shape: 'box', size: [1, 1, 1] } }, behavior } }, extra || {})); return w; };
const shot = (w, t) => MT.renderReceipt(MT.renderAsset(w, { width: 90, height: 70, t, camera: { yaw: 0.6, pitch: 0.35, dist: 12 } })).sha256;

test('a motion no one coded: a figure eight written as expressions of time', () => {
  const w = world(MT.PRESETS.behavior['written: figure eight']);
  const at = (t) => { const m = {}; return MT.clone(MT.compileMesh(w.tiles.mt_x)) && MT.renderAsset(w, { width: 40, height: 30, t }).stats.tiles; };
  assert.equal(at(0), 1);
  const a = shot(w, 0), b = shot(w, 1.1), c = shot(w, 2.2);
  assert.notEqual(a, b); assert.notEqual(b, c); assert.equal(shot(w, 1.1), b, 'and it is deterministic at any moment');
  const spin = world(MT.PRESETS.behavior.spin);
  assert.notEqual(shot(spin, 1.1), b, 'it is not one of the ready-made moves');
  assert.ok(!/figure/.test(MT.canonical(MT.PRESETS.behavior.spin)), 'the engine ships no figure eight: the world writes it');
});
test('written motion can read the tile\u2019s own state, so movement follows what is true', () => {
  const w = world({ type: 'scripted', data: { motion: { pos: [['*', ['var', 'open'], 2.5], 0, 0] } } }, {
    facets: { mesh: { type: 'primitive', source: null, data: { shape: 'box', size: [1, 1, 1] } }, behavior: { type: 'scripted', data: { motion: { pos: [['*', ['var', 'open'], 2.5], 0, 0] } } },
      logic: { type: 'rule', data: { vars: { open: 0 }, rules: [{ on: 'toggle', do: [{ set: ['open', ['-', 1, ['var', 'open']]] }] }] } },
      connect: { sockets: [{ id: 'toggle', kind: 'signal', dir: 'in', signal: 'toggle' }], bridges: [] } } });
  const ws = MT.createWorkspace(w), closed = shot(ws.live, 0);
  MT.act(ws, { do: 'signal', tile: 'mt_x', name: 'toggle' });
  assert.equal(MT.readVars(ws.live, 'mt_x', 0).open, 1);
  assert.notEqual(shot(ws.live, 0), closed, 'the door slid because the value changed, not because time passed');
  MT.act(ws, { do: 'signal', tile: 'mt_x', name: 'toggle' });
  assert.equal(shot(ws.live, 0), closed, 'and back exactly');
});
test('the numbers are the motion, and a motion it cannot read is inert', () => {
  const grow = { id: 'reach', label: 'Reach', type: 'number', min: 0, max: 6, step: 0.1, binds: [{ facet: 'behavior', at: 'data.motion.vars.reach' }] };
  const w = world(MT.clone(MT.PRESETS.behavior['written: figure eight']), { params: [grow] }), ws = MT.createWorkspace(w);
  const before = shot(ws.live, 1.4);
  const c = MT.cloneBody(ws); assert.ok(MT.editCandidate(ws, c, { op: 'param.set', id: 'mt_x', param: 'reach', value: 5 }).ok);
  assert.ok(MT.commitPlan(ws, MT.planMerge(ws, [c]).id).ok);
  assert.notEqual(shot(ws.live, 1.4), before); assert.ok(MT.rollback(ws, ws.receipts[0].rollback_token).exact);
  assert.equal(shot(ws.live, 1.4), before);
  const junk = world({ type: 'scripted', data: { motion: { pos: [['frobnicate', 3], ['/', 1, 0], 0] } } });
  assert.equal(shot(junk, 2), shot(world({ type: 'none', data: {} }), 2), 'nonsense simply does not move it, and nothing breaks');
});
test('written motion and ready-made moves combine, and both travel as matter', () => {
  const both = { type: 'scripted', data: { motion: { vars: { lift: 0.6, rate: 1.3 }, pos: [0, ['*', ['var', 'lift'], ['sin', ['*', ['var', 'rate'], ['t']]]], 0] }, ops: [{ op: 'spin', axis: 'y', rate: 0.9 }] } };
  const w = world(both), ws = MT.createWorkspace(w);
  assert.notEqual(shot(ws.live, 0.5), shot(world({ type: 'scripted', data: { ops: [{ op: 'spin', axis: 'y', rate: 0.9 }] } }), 0.5), 'the written part adds to the ready-made part');
  assert.deepEqual(MT.fromText(ws.live, MT.toText(ws.live)).ops, [], 'it round trips as text');
  const back = MT.importWorkspace(JSON.parse(JSON.stringify(MT.exportWorkspace(ws))));
  assert.equal(back.import_check.status, 'VERIFIED');
  assert.deepEqual(back.live.tiles.mt_x.facets.behavior.data.motion.vars, { lift: 0.6, rate: 1.3 });
});
