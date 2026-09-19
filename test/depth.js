// Proves the two founding principles (docs/PRINCIPLES.md). Each test name is the claim.
const test = require('node:test'), assert = require('node:assert');
const MT = require('../core/morphtile.js');
const fresh = () => MT.createWorkspace(MT.seedWorld(), { checkpointEvery: 5 });
const commit = (ws, ops, by) => { const c = MT.cloneBody(ws, 'c', by); for (const op of ops) { const r = MT.editCandidate(ws, c, op); assert.ok(r.ok, JSON.stringify(r)); } const res = MT.commitPlan(ws, MT.planMerge(ws, [c]).id, by); assert.ok(res.ok, JSON.stringify(res)); return res.receipt; };
const leafVars = (w) => { const o = {}; for (const e of MT.leaves(w)) o[e.id] = MT.readVars(w, e.path, w.time); return o; };
const play = (ws, press, drive) => { MT.act(ws, { do: 'tick', dt: 50 }); MT.act(ws, { do: 'signal', tile: press, name: 'press' }); MT.act(ws, { do: 'signal', tile: drive, name: 'drive' }); MT.act(ws, { do: 'tick', dt: 12.5 }); };
const ASM = { op: 'tile.collapse', ids: ['mt_tower', 'mt_core'], name: 'Beacon assembly', id: 'mt_asm' };
const RIG = { op: 'tile.collapse', ids: ['mt_rover', 'mt_wheel_fl', 'mt_wheel_fr', 'mt_wheel_rl', 'mt_wheel_rr'], name: 'Rover rig', id: 'mt_rig' };

test('collapse then expand is lossless: structure, state, provenance and ledger all return exactly', () => {
  const ws = fresh(); play(ws, 'mt_switch', 'mt_rover');
  const before = { s: MT.structHash(ws.live), v: MT.canonical(ws.live.vars), sha: ws.live.tiles.mt_tower.provenance.sha256 };
  commit(ws, [ASM, RIG]);
  assert.ok(!ws.live.tiles.mt_tower && ws.live.tiles.mt_asm.interior.tiles.mt_tower, 'the tower now lives inside the shell');
  assert.deepEqual(Object.keys(ws.live.tiles).sort(), ['mt_asm', 'mt_island', 'mt_rig', 'mt_switch'], '9 tiles read as 4');
  assert.equal(MT.readVars(ws.live, 'mt_asm/mt_tower', ws.live.time).beacon, 1, 'state moved with the tile');
  assert.equal(MT.readVars(ws.live, 'mt_asm/mt_core', ws.live.time).stored, 50);
  assert.equal(ws.live.tiles.mt_asm.interior.tiles.mt_tower.provenance.sha256, before.sha, 'inner provenance untouched');
  assert.deepEqual(ws.live.tiles.mt_asm.provenance.collapsed_from, ['mt_core', 'mt_tower']);
  commit(ws, [{ op: 'tile.expand', id: 'mt_asm' }, { op: 'tile.expand', id: 'mt_rig' }]);
  assert.equal(MT.structHash(ws.live), before.s); assert.equal(MT.canonical(ws.live.vars), before.v);
  assert.ok(MT.act(ws, { do: 'reconstruct', fromGenesis: true }).matches_live);
});
test('a collapsed world behaves identically to the flat one: same state per tile, same pixels', () => {
  const flat = fresh(), deep = fresh(); commit(deep, [ASM, RIG]);
  commit(deep, [{ op: 'tile.collapse', ids: ['mt_rig'], name: 'Garage', id: 'mt_garage' }]);
  play(flat, 'mt_switch', 'mt_rover'); play(deep, 'mt_switch', 'mt_garage');
  const a = leafVars(flat.live), b = leafVars(deep.live); for (const id of Object.keys(a)) assert.deepEqual(b[id], a[id], id);
  assert.equal(a.mt_wheel_rr.turns, 12.5);
  const fa = MT.renderAsset(flat.live, { width: 160, height: 130 }), fb = MT.renderAsset(deep.live, { width: 160, height: 130 });
  assert.equal(fb.stats.tris, fa.stats.tris); assert.equal(MT.renderReceipt(fb).sha256, MT.renderReceipt(fa).sha256);
});
test('arbitrary depth: signals pass down and back up through 6 shells; a tile 6 levels deep stays editable, versioned and rollback-exact', () => {
  const ws = fresh(); let cur = 'mt_switch', path = 'mt_switch';
  for (let d = 1; d <= 6; d++) { commit(ws, [{ op: 'tile.collapse', ids: [cur], name: 'Shell ' + d, id: 'mt_d' + d }]); path = 'mt_d' + d + '/' + path; cur = 'mt_d' + d; }
  assert.equal(path.split('/').length, 7); assert.equal(MT.depthOf(ws.live.tiles.mt_d6), 6); assert.deepEqual(MT.validateWorld(ws.live).errors, []);
  const r = MT.act(ws, { do: 'signal', tile: 'mt_d6', name: 'press' });
  assert.equal(MT.readVars(ws.live, path, 0).presses, 1, 'went all the way down'); assert.equal(MT.readVars(ws.live, 'mt_tower', 0).beacon, 1, 'and came all the way back out');
  assert.equal(r.trace[r.trace.length - 1].tile, 'mt_core');
  const before = MT.structHash(ws.live), rc = commit(ws, [{ op: 'facet.swap', id: path, facet: 'material', value: MT.PRESETS.material.ember }], 'ai:codex');
  assert.deepEqual(MT.resolveTile(ws.live, path).facets.material, MT.PRESETS.material.ember); assert.equal(MT.resolveTile(ws.live, path).state.version, 2);
  assert.deepEqual(rc.units.map((u) => u.key), ['tile:' + path + '#facet.material'], 'the merge unit is the deep facet, not the whole shell');
  const rb = MT.rollback(ws, rc.rollback_token); assert.ok(rb.ok && rb.exact); assert.equal(MT.structHash(ws.live), before);
  assert.equal(MT.readVars(ws.live, path, 0).presses, 1, 'rollback kept the state');
  const genesis = MT.structHash(ws.ledger.genesis); for (let d = 6; d >= 1; d--) commit(ws, [{ op: 'tile.expand', id: 'mt_d' + d }]);
  assert.equal(MT.structHash(ws.live), genesis, 'six expands return the genesis structure'); assert.equal(MT.readVars(ws.live, 'mt_switch', 0).presses, 1);
  assert.ok(MT.act(ws, { do: 'reconstruct', fromGenesis: true }).matches_live);
});
test('two callers can edit different tiles inside the same shell without conflict; same tile conflicts and is held', () => {
  const ws = fresh(); commit(ws, [ASM]);
  const h = MT.cloneBody(ws, 'h', 'human'), a = MT.cloneBody(ws, 'a', 'ai:fable'), b = MT.cloneBody(ws, 'b', 'ai:codex');
  MT.editCandidate(ws, h, { op: 'facet.swap', id: 'mt_asm/mt_tower', facet: 'mesh', value: MT.PRESETS.mesh['tall tower'] });
  MT.editCandidate(ws, a, { op: 'facet.swap', id: 'mt_asm/mt_core', facet: 'behavior', value: MT.PRESETS.behavior.spin });
  MT.editCandidate(ws, b, { op: 'facet.swap', id: 'mt_asm/mt_core', facet: 'behavior', value: MT.PRESETS.behavior.pulse });
  const plan = MT.planMerge(ws, [h, a, b]); assert.equal(plan.entries.find((e) => e.candidate === h).status, 'READY'); assert.equal(plan.entries.filter((e) => e.status === 'HELD_CONFLICT').length, 2);
});
test('a collapse merges whole or not at all: if any part conflicts, every part is held', () => {
  const ws = fresh(), h = MT.cloneBody(ws, 'h', 'human'), a = MT.cloneBody(ws, 'a', 'ai:fable');
  MT.editCandidate(ws, h, ASM); MT.editCandidate(ws, a, { op: 'facet.swap', id: 'mt_tower', facet: 'material', value: MT.PRESETS.material.moss });
  const plan = MT.planMerge(ws, [h, a]); assert.equal(plan.status, 'NOTHING_TO_COMMIT'); assert.ok(plan.entries.filter((e) => e.candidate === h).every((e) => /^HELD_/.test(e.status)));
  assert.ok(plan.entries.some((e) => e.status === 'HELD_ATOMIC'));
});
test('rolling back a collapse restores the flat world and its state exactly', () => {
  const ws = fresh(); play(ws, 'mt_switch', 'mt_rover'); const s = MT.structHash(ws.live), v = MT.canonical(ws.live.vars), rc = commit(ws, [RIG]);
  assert.ok(MT.readVars(ws.live, 'mt_rig/mt_rover', ws.live.time).moving === 1);
  assert.ok(MT.rollback(ws, rc.rollback_token).exact); assert.equal(MT.structHash(ws.live), s); assert.equal(MT.canonical(ws.live.vars), v);
});
test('a collapsed tile is one portable JSON object: dropped alone into an empty world it still works', () => {
  const ws = fresh(); commit(ws, [ASM]); const tile = JSON.parse(JSON.stringify(ws.live.tiles.mt_asm));
  const w2 = MT.createWorld('Elsewhere'); MT.applyStructOp(w2, { op: 'tile.add', tile }); assert.deepEqual(MT.validateWorld(w2).errors, []);
  const ws2 = MT.createWorkspace(w2); MT.act(ws2, { do: 'tick', dt: 30 }); MT.act(ws2, { do: 'signal', tile: 'mt_asm', name: 'toggle' });
  assert.equal(MT.readVars(ws2.live, 'mt_asm/mt_tower', 30).beacon, 1); assert.equal(MT.readVars(ws2.live, 'mt_asm/mt_core', 30).stored, 30);
  assert.ok(MT.renderAsset(ws2.live, { width: 80, height: 60 }).stats.tris > 100);
});
test('reopening can ADD capability: expose a new inner socket as a port on a closed shell', () => {
  const ws = fresh(); commit(ws, [ASM]); assert.ok(!MT.findSocket(ws.live.tiles.mt_asm, 'surge'));
  commit(ws, [{ op: 'port.add', id: 'mt_asm', tile: 'mt_core', socket: 'surge' }]); MT.act(ws, { do: 'tick', dt: 9 }); MT.act(ws, { do: 'signal', tile: 'mt_asm', name: 'surge' });
  assert.equal(MT.readVars(ws.live, 'mt_asm/mt_core', 9).stored, 9); assert.equal(MT.readVars(ws.live, 'mt_asm/mt_tower', 9).beacon, 0);
});
test('collapse refuses what it cannot represent honestly (two outside parents) instead of approximating', () => {
  const ws = fresh(), c = MT.cloneBody(ws), r = MT.editCandidate(ws, c, { op: 'tile.collapse', ids: ['mt_tower', 'mt_core', 'mt_switch'] });
  assert.ok(!r.ok && /more than one outside parent/.test(r.error)); assert.equal(MT.diffUnits(ws.candidates[c].base, ws.candidates[c].world).length, 0);
});
test('every form is a view over the same matter: views never write, never fork, and their controls address real tile paths', () => {
  const ws = fresh(); commit(ws, [ASM, RIG]); const w = ws.live, h0 = MT.hashOf(w);
  const closed = MT.vnodeToHTML(MT.compilePanel(w).root), open = MT.vnodeToHTML(MT.compilePanel(w, { open: true }).root), site = MT.compileWebsite(w).html; MT.renderAsset(w, { width: 60, height: 50 });
  assert.equal(MT.hashOf(w), h0, 'reading the world as three forms changed nothing');
  assert.ok(closed.includes('data-signal="mt_asm:toggle"') && !closed.includes('data-tile="mt_asm/mt_tower"'), 'closed shell: simple surface');
  assert.ok(open.includes('data-signal="mt_asm/mt_tower:toggle"') && open.includes('data-signal="mt_asm:toggle"'), 'open shell: full depth, same controls');
  const panelLeaves = MT.leaves(w).filter((e) => e.tile.form_hints.includes('ui_panel')).length, shown = (open.match(/<section /g) || []).length; assert.equal(shown, panelLeaves, 'every ui_panel tile at every depth is reachable in the panel');
  assert.ok(site.includes('Beacon tower') && site.includes('Matter core'), 'website reads to full depth');
  const viaShell = fresh(), viaTile = fresh(); commit(viaShell, [ASM]); commit(viaTile, [ASM]);
  MT.act(viaShell, { do: 'signal', tile: 'mt_asm', name: 'toggle' }); MT.act(viaTile, { do: 'signal', tile: 'mt_asm/mt_tower', name: 'toggle' });
  assert.equal(MT.canonical(viaShell.live.vars), MT.canonical(viaTile.live.vars), 'the simple control and the deep control are the same control');
});
test('a shell may show a stand-in mesh (derived view) without the matter inside changing or becoming unreachable', () => {
  const ws = fresh(); commit(ws, [RIG]); const inner = MT.hashOf(ws.live.tiles.mt_rig.interior), full = MT.renderAsset(ws.live, { width: 80, height: 60 }).stats.tiles;
  commit(ws, [{ op: 'facet.swap', id: 'mt_rig', facet: 'mesh', value: MT.PRESETS.mesh.box }]);
  assert.equal(MT.renderAsset(ws.live, { width: 80, height: 60 }).stats.tiles, full - 4, 'five tiles drawn as one stand-in');
  assert.equal(MT.hashOf(ws.live.tiles.mt_rig.interior), inner); MT.act(ws, { do: 'signal', tile: 'mt_rig', name: 'drive' }); assert.equal(MT.readVars(ws.live, 'mt_rig/mt_rover', 0).moving, 1);
});
