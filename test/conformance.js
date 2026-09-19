// The engine must satisfy the vectors it publishes. Any other implementation can run exactly these checks.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const MT = require('../core/morphtile.js');
const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, '../conformance/vectors.json'), 'utf8'));
const round = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
const geomHash = (m) => MT.hashOf({ parts: m.recipe_parts || null, hold: m.hold || null, tris: m.T.length, points: Array.from(m.P).map(round), tint: Array.from(m.T).map(round), colors: m.K.map((c) => (c ? c.map(round) : null)) });
const find = (n) => vectors.cases.find((c) => c.name === n);

test('the published vectors are well formed and self-describing', () => {
  assert.equal(vectors.format, 'morphtile-conformance'); assert.ok(vectors.cases.length >= 7);
  for (const c of vectors.cases) { assert.ok(c.name && c.note && c.world && c.expect, c.name); assert.deepEqual(MT.validateWorld(c.world).errors, [], c.name + ' must be a valid world'); }
});
test('vector: seed-world', () => {
  const c = find('seed-world'), w = MT.clone(c.world);
  assert.equal(MT.structHash(w), c.expect.struct_hash); assert.equal(MT.countTiles(w), c.expect.tiles);
  assert.deepEqual(MT.rootsOf(w), c.expect.roots);
  for (const row of c.expect.content) assert.equal(MT.contentHash(MT.resolveTile(w, row.id)), row.sha256, row.id);
});
test('vector: signals-and-state', () => {
  const c = find('signals-and-state'), ws = MT.createWorkspace(MT.clone(c.world));
  for (const ev of c.events) MT.act(ws, ev.type === 'tick' ? { do: 'tick', to: ev.t } : { do: 'signal', tile: ev.tile, name: ev.name });
  assert.deepEqual(ws.live.vars, c.expect.vars); assert.equal(ws.live.time, c.expect.time); assert.equal(MT.hashOf(ws.live), c.expect.world_hash);
  assert.equal(MT.readVars(ws.live, 'mt_core', ws.live.time).stored, c.expect.read['mt_core.stored']);
  assert.equal(MT.readVars(ws.live, 'mt_wheel_rr', ws.live.time).turns, c.expect.read['mt_wheel_rr.turns']);
  assert.equal(MT.act(ws, { do: 'reconstruct', fromGenesis: true }).simulation_steps, c.expect.simulation_steps);
});
test('vector: depth-collapse', () => {
  const c = find('depth-collapse'), ws = MT.createWorkspace(MT.clone(c.world));
  const doIt = (op) => { const id = MT.cloneBody(ws); const r = MT.editCandidate(ws, id, op); assert.ok(r.ok, r.error); assert.ok(MT.commitPlan(ws, MT.planMerge(ws, [id]).id).ok); };
  for (const op of c.ops) doIt(op);
  assert.equal(MT.structHash(ws.live), c.expect.after_collapse.struct_hash); assert.equal(MT.countTiles(ws.live), c.expect.after_collapse.tiles);
  assert.equal(MT.readVars(ws.live, c.expect.after_collapse.beacon_at, ws.live.time).beacon, c.expect.after_collapse.beacon);
  doIt({ op: 'tile.expand', id: 'mt_asm' });
  assert.equal(MT.structHash(ws.live), c.expect.after_expand.struct_hash, 'expanding must restore the exact structure');
  assert.deepEqual(ws.live.vars, c.expect.after_expand.vars, 'and the exact state');
});
test('vector: recipe-shapes and composed-and-painted', () => {
  for (const name of ['recipe-shapes', 'composed-and-painted']) {
    const c = find(name), w = MT.clone(c.world);
    for (const row of c.expect.geometry) {
      const m = MT.compileMesh(MT.resolveTile(w, row.id), w);
      assert.equal(m.recipe_parts || null, row.parts, name + '/' + row.id + ' part count');
      assert.equal(geomHash(m), row.sha256, name + '/' + row.id + ' geometry');
    }
  }
});
test('vector: sleeping-capability', () => {
  const c = find('sleeping-capability'), w = MT.clone(c.world);
  assert.equal(MT.countTiles(w), c.expect.asleep.tiles); assert.equal(MT.hashOf({ tiles: w.tiles, edges: w.edges }), c.expect.asleep.matter_hash);
  const ws = MT.createWorkspace(w); for (const ev of c.events) MT.act(ws, { do: 'signal', tile: ev.tile, name: ev.name });
  assert.equal(MT.countTiles(ws.live), c.expect.awake.tiles);
  assert.equal(MT.hashOf({ tiles: ws.live.tiles, edges: ws.live.edges }), c.expect.awake.matter_hash, 'waking must not rewrite matter');
  assert.deepEqual(ws.live.awake, c.expect.awake.awake_state);
});
test('vector: text-round-trip', () => {
  const c = find('text-round-trip'), w = MT.clone(c.world);
  assert.equal(MT.toText(w), c.text, 'the text a world writes out is part of the contract');
  assert.deepEqual(MT.fromText(w, c.text).ops.length, c.expect.ops_on_read_back);
  assert.equal(MT.structHash(w), c.expect.struct_hash);
});
