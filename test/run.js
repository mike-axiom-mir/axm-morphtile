const test = require('node:test'), assert = require('node:assert'), crypto = require('crypto'), fs = require('fs'), path = require('path');
const MT = require('../core/morphtile.js'), png = require('../tools/png.js');
const fx = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, '../bridges/fixtures', n)));
const fresh = () => MT.createWorkspace(MT.seedWorld(), { checkpointEvery: 5 });

test('sha256 matches the platform implementation', () => {
  for (const s of ['', 'abc', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(1000), 'ünï©ode ✓']) assert.equal(MT.sha256(s), crypto.createHash('sha256').update(s).digest('hex'));
});
test('tiles: create, validate, stable content hash, optional bridges', () => {
  const a = MT.createTile({ name: 'Crate' }), b = MT.createTile({ name: 'Crate' });
  assert.ok(MT.validateTile(a).ok); assert.equal(a.id, b.id); assert.equal(a.provenance.sha256, b.provenance.sha256);
  assert.deepEqual(a.provenance.bridges, []); assert.ok(!MT.validateTile({ id: 'x y', kind: 'nope' }).ok);
});
test('seed world is a valid graph', () => { const v = MT.validateWorld(MT.seedWorld()); assert.deepEqual(v.errors, []); });
test('same matter, different worlds: one tile renders as game_asset AND ui_panel AND website', () => {
  const w = MT.seedWorld(), f = MT.renderAsset(w, { width: 200, height: 160 });
  let towerPixels = 0; for (let y = 0; y < 160; y++) for (let x = 0; x < 200; x++) if (f.pick(x, y) === 'mt_tower') towerPixels++;
  assert.ok(towerPixels > 50, 'tower drew ' + towerPixels + ' pixels');
  const html = MT.vnodeToHTML(MT.compilePanel(w).root);
  assert.ok(html.includes('Beacon tower') && html.includes('data-signal="mt_tower:toggle"'));
  assert.ok(MT.compileWebsite(w).html.includes('<h3>Beacon tower</h3>'));
  assert.ok(f.stats.skipped.length === 0 && MT.compilePanel(w).skipped.includes('mt_wheel_fl'), 'form_hints decide who appears where');
});
test('signals travel the graph: switch -> tower -> core', () => {
  const ws = fresh(); MT.act(ws, { do: 'tick', to: 100 });
  const r = MT.act(ws, { do: 'signal', tile: 'mt_switch', name: 'press' });
  assert.deepEqual(r.trace.map((x) => x.tile), ['mt_switch', 'mt_tower', 'mt_core']);
  const v = (id) => MT.readVars(ws.live, id, ws.live.time);
  assert.equal(v('mt_tower').beacon, 1); assert.equal(v('mt_core').stored, 100); assert.equal(v('mt_core').energy, 0);
});
test('global state: six offline hours cost one event and zero simulation steps', () => {
  const ws = fresh(); MT.act(ws, { do: 'tick', dt: 6 * 3600 });
  assert.equal(MT.readVars(ws.live, 'mt_core', ws.live.time).energy, 21600);
  assert.equal(ws.ledger.events.length, 1); assert.deepEqual(ws.live.vars, {}, 'untouched possibility is not persisted');
  const r = MT.act(ws, { do: 'reconstruct' }); assert.ok(r.matches_live); assert.equal(r.simulation_steps, 0);
});
test('replay is evidence: checkpoints shorten replay and still land on the same hash', () => {
  const ws = fresh(); for (let i = 0; i < 13; i++) { MT.act(ws, { do: 'tick', dt: 7 }); MT.act(ws, { do: 'signal', tile: i % 2 ? 'mt_switch' : 'mt_rover', name: i % 2 ? 'press' : 'drive' }); }
  const full = MT.reconstruct(ws.ledger, { fromGenesis: true }), fast = MT.reconstruct(ws.ledger);
  assert.equal(full.hash, MT.hashOf(ws.live)); assert.equal(fast.hash, full.hash); assert.ok(fast.replayed < full.replayed);
});
test('safety: clones never touch live; commit gives a receipt; rollback is exact', () => {
  const ws = fresh(), before = MT.structHash(ws.live), c = MT.act(ws, { do: 'clone', label: 'try sphere' }).candidate;
  assert.ok(MT.act(ws, { do: 'edit', candidate: c, op: { op: 'facet.swap', id: 'mt_tower', facet: 'mesh', value: MT.PRESETS.mesh.sphere } }).ok);
  assert.equal(MT.structHash(ws.live), before);
  const plan = MT.act(ws, { do: 'plan', candidates: [c] }).plan; assert.equal(plan.status, 'READY');
  const res = MT.act(ws, { do: 'commit', plan: plan.id }); assert.ok(res.ok);
  assert.equal(ws.live.tiles.mt_tower.facets.mesh.data.shape, 'sphere'); assert.equal(ws.live.tiles.mt_tower.state.version, 2);
  const rb = MT.act(ws, { do: 'rollback', token: res.receipt.rollback_token }); assert.ok(rb.ok && rb.exact); assert.equal(MT.structHash(ws.live), before);
  assert.ok(MT.act(ws, { do: 'reconstruct', fromGenesis: true }).matches_live, 'commit and rollback are both in the ledger');
});
test('safety: rollback refuses after the state has drifted', () => {
  const ws = fresh(), edit = (val) => { const c = MT.cloneBody(ws); MT.editCandidate(ws, c, { op: 'facet.swap', id: 'mt_core', facet: 'material', value: val }); return MT.commitPlan(ws, MT.planMerge(ws, [c]).id); };
  const first = edit(MT.PRESETS.material.ember); edit(MT.PRESETS.material.moss);
  assert.equal(MT.rollback(ws, first.receipt.rollback_token).status, 'REFUSED_STATE_DRIFTED');
});
test('safety: conflicting candidates are held, not overwritten; independent ones merge', () => {
  const ws = fresh(), h = MT.cloneBody(ws, 'human', 'human'), a = MT.cloneBody(ws, 'ai', 'ai:fable');
  MT.editCandidate(ws, h, { op: 'facet.swap', id: 'mt_tower', facet: 'material', value: MT.PRESETS.material.ember });
  MT.editCandidate(ws, a, { op: 'facet.swap', id: 'mt_tower', facet: 'material', value: MT.PRESETS.material.moss });
  MT.editCandidate(ws, a, { op: 'facet.swap', id: 'mt_core', facet: 'behavior', value: MT.PRESETS.behavior.spin });
  const plan = MT.planMerge(ws, [h, a]); assert.equal(plan.status, 'PARTIAL_HELD');
  assert.equal(plan.entries.filter((e) => e.status === 'HELD_CONFLICT').length, 2);
  const res = MT.commitPlan(ws, plan.id); assert.ok(res.ok);
  assert.deepEqual(ws.live.tiles.mt_tower.facets.material.data.color, [0.62, 0.66, 0.78]); assert.equal(ws.live.tiles.mt_core.facets.behavior.data.ops.length, 1);
  assert.ok(ws.candidates[h] && ws.candidates[a], 'held candidates survive for a human decision');
});
test('safety: an edit that would break the graph is rejected inside the clone', () => {
  const ws = fresh(), c = MT.cloneBody(ws);
  assert.ok(!MT.editCandidate(ws, c, { op: 'edge.add', edge: { kind: 'attach', from: { tile: 'mt_core', socket: 'mount' }, to: { tile: 'mt_island', socket: 'top' } } }).ok, 'attach cycle');
  assert.ok(!MT.editCandidate(ws, c, { op: 'edge.add', edge: { kind: 'signal', from: { tile: 'mt_tower', socket: 'toggle' }, to: { tile: 'mt_core', socket: 'surge' } } }).ok, 'in -> in');
});
test('rearrangeable graph: rewire the switch to the rover and it drives', () => {
  const ws = fresh(), c = MT.cloneBody(ws);
  assert.ok(MT.editCandidate(ws, c, { op: 'edge.rewire', id: 's_switch', to: { tile: 'mt_rover', socket: 'drive' } }).ok);
  assert.ok(MT.commitPlan(ws, MT.planMerge(ws, [c]).id).ok);
  MT.act(ws, { do: 'signal', tile: 'mt_switch', name: 'press' }); MT.act(ws, { do: 'tick', dt: 10 });
  const rv = MT.readVars(ws.live, 'mt_rover', ws.live.time), wh = MT.readVars(ws.live, 'mt_wheel_rr', ws.live.time);
  assert.equal(rv.moving, 1); assert.equal(rv.odometer, 10); assert.equal(wh.turns, 10); assert.equal(MT.readVars(ws.live, 'mt_tower', 0).beacon, 0);
});
test('bridge: real axm-material-offer fixtures from axm-material-surface-fabric are byte-verified or held', () => {
  const ok = MT.ingestMaterialOffer(fx('valid-offer.json')), bad = MT.ingestMaterialOffer(fx('hash-mismatch-offer.json')), none = MT.ingestMaterialOffer(fx('missing-bytes-offer.json'));
  assert.equal(ok.entries[0].state, 'portable-verified'); assert.equal(ok.pipeline_evidence, 'verified_payload_sha256');
  assert.ok(bad.entries.some((e) => e.reason === 'sha256-mismatch')); assert.notEqual(bad.pipeline_evidence, 'verified_payload_sha256');
  assert.ok(none.entries.every((e) => e.state !== 'portable-verified'));
  assert.equal(MT.ingestMaterialOffer({ hello: 1 }).status, 'HOLD_SOURCE_INCOMPLETE');
  const offer = fx('valid-offer.json'), color = png.firstPixel(MT.dataUrlBytes(offer.entries[0].dataUrl));
  const good = MT.materialFromOffer(offer, ok, 'base', 'github:mike-axiom-mir/axm-material-surface-fabric/examples/conformance/valid-offer.json', color);
  assert.equal(good.bridge.status, 'BOUND'); assert.equal(good.facet.data.color.length, 3);
  const held = MT.materialFromOffer(fx('hash-mismatch-offer.json'), bad, bad.entries.find((e) => e.reason === 'sha256-mismatch').entryId, 'x');
  assert.equal(held.bridge.status, 'HOLD_HASH_MISMATCH'); assert.ok(held.facet.data.hold);
  assert.equal(MT.weakestEvidence(['verified_payload_sha256', 'inferred_candidate_not_tested']), 'inferred_candidate_not_tested');
});
test('registry: an advertised capability is inert until bound', () => {
  const r = MT.createRegistry(); r.advertise({ id: 'form:glb_export', produces: 'glb' });
  assert.equal(r.invoke('form:glb_export').status, 'HOLD_NOT_BOUND'); r.bind('form:glb_export', () => 42); assert.equal(r.invoke('form:glb_export').result, 42);
});
test('caller-neutral and deterministic: human and AI runs give identical state and identical pixels', () => {
  const run = (by) => { const ws = fresh(); MT.act(ws, { do: 'tick', dt: 5 }, by); MT.act(ws, { do: 'signal', tile: 'mt_rover', name: 'drive' }, by); MT.act(ws, { do: 'tick', dt: 4 }, by); return { s: MT.hashOf({ t: ws.live.tiles, e: ws.live.edges, v: ws.live.vars, time: ws.live.time }), p: MT.renderReceipt(MT.renderAsset(ws.live, { width: 120, height: 100 })).sha256 }; };
  assert.deepEqual(run('human'), run('ai:codex'));
});
test('workspace survives export -> import by replaying evidence', () => {
  const ws = fresh(); MT.act(ws, { do: 'signal', tile: 'mt_switch', name: 'press' }); const c = MT.cloneBody(ws); MT.editCandidate(ws, c, { op: 'tile.meta', id: 'mt_core', name: 'Heart' }); MT.commitPlan(ws, MT.planMerge(ws, [c]).id);
  const back = MT.importWorkspace(JSON.parse(JSON.stringify(MT.exportWorkspace(ws)))); assert.equal(MT.hashOf(back.live), MT.hashOf(ws.live)); assert.equal(back.live.tiles.mt_core.name, 'Heart');
});
