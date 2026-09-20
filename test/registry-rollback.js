const test = require('node:test'), assert = require('node:assert/strict');
const MT = require('../core/morphtile.js');

function commit(ws, ops) {
  const id = MT.cloneBody(ws);
  for (const op of ops) assert.equal(MT.editCandidate(ws, id, op).ok, true);
  const result = MT.commitPlan(ws, MT.planMerge(ws, [id]).id);
  assert.equal(result.ok, true); return result.receipt;
}
const additions = () => [
  { op: 'word.define', name: 'half', args: ['x'], body: ['/', ['var', 'x'], 2] },
  { op: 'def.put', id: 'station', body: MT.bodyOf(MT.createTile({ id: 'mt_station' })) },
  { op: 'child-world.put', id: 'annex', world_ref: 'local:annex' },
];

test('rollback preserves absent and explicit empty registry shapes as well as their contents', () => {
  for (const shape of ['new', 'empty', 'legacy']) {
    const world = MT.createWorld('Registry rollback');
    if (shape === 'empty') { world.words = {}; world.child_worlds = {}; }
    if (shape === 'legacy') delete world.defs;
    const ws = MT.createWorkspace(world), before = MT.clone(ws.live), hash = MT.hashOf(ws.live);
    const receipt = commit(ws, additions());
    assert.equal(MT.rollback(ws, receipt.rollback_token).exact, true);
    assert.deepEqual(ws.live, before, shape); assert.equal(MT.hashOf(ws.live), hash, shape);
    assert.equal(MT.act(ws, { do: 'reconstruct', fromGenesis: true }).matches_live, true);
  }
});

test('registry presence survives workspace transport and never permits rollback over later content', () => {
  const ws = MT.createWorkspace(MT.createWorld('Portable rollback')), before = MT.hashOf(ws.live);
  const receipt = commit(ws, additions());
  const restored = MT.importWorkspace(MT.clone(MT.exportWorkspace(ws)));
  assert.equal(restored.import_check.status, 'VERIFIED');
  assert.equal(MT.rollback(restored, receipt.rollback_token).exact, true);
  assert.equal(MT.hashOf(restored.live), before);
  assert.equal(MT.act(restored, { do: 'reconstruct', fromGenesis: true }).matches_live, true);
  commit(ws, [{ op: 'word.define', name: 'later', args: [], body: 42 }]);
  const later = MT.hashOf(ws.live);
  assert.equal(MT.rollback(ws, receipt.rollback_token).status, 'REFUSED_STATE_DRIFTED');
  assert.equal(MT.hashOf(ws.live), later); assert.equal(ws.live.words.later.body, 42);
});

test('receipts without registry-presence metadata retain their historical replay behavior', () => {
  const ws = MT.createWorkspace(MT.createWorld('Old receipt'));
  const receipt = commit(ws, [{ op: 'word.define', name: 'half', args: ['x'], body: ['/', ['var', 'x'], 2] }]);
  delete receipt.registry_presence; // The exact shape of a receipt written by an older engine.
  assert.equal(MT.rollback(ws, receipt.rollback_token).exact, true);
  assert.deepEqual(ws.live.words, {});
  assert.equal(MT.act(ws, { do: 'reconstruct', fromGenesis: true }).matches_live, true);
});
