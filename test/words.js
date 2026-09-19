// The vocabulary is not the engine's to own: a world can teach itself new words.
const test = require('node:test'), assert = require('node:assert');
const MT = require('../core/morphtile.js');
const base = () => { const ws = MT.createWorkspace(MT.seedWorld()); return ws; };
const commit = (ws, ops, by) => { const c = MT.cloneBody(ws, 'c', by); for (const op of ops) { const r = MT.editCandidate(ws, c, op); assert.ok(r.ok, op.op + ': ' + r.error); } const res = MT.commitPlan(ws, MT.planMerge(ws, [c]).id, by); assert.ok(res.ok, JSON.stringify(res)); return res.receipt; };
const EASE = { op: 'word.define', name: 'ease', args: ['x'], body: ['*', ['var', 'x'], ['*', ['var', 'x'], ['-', 3, ['*', 2, ['var', 'x']]]]], note: 'smooth 0..1' };
const WOBBLE = { op: 'word.define', name: 'wobble', args: ['a', 'r'], body: ['*', ['var', 'a'], ['sin', ['*', ['var', 'r'], ['t']]]] };
const shot = (w, t) => MT.renderReceipt(MT.renderAsset(w, { width: 80, height: 64, t })).sha256;

test('a word the world taught itself is usable everywhere an expression is', () => {
  const ws = base(); const rc = commit(ws, [EASE, WOBBLE,
    { op: 'facet.swap', id: 'mt_core', facet: 'mesh', value: { type: 'generated', source: null, data: { generator: 'recipe', vars: { n: 6 }, parts: [{ repeat: ['var', 'n'], as: 'i', body: [{ shape: 'box', size: [0.4, 0.4, 0.4], pos: [0, ['*', 3, ['ease', ['var', 'i_at']]], 0] }] }] } } },
    { op: 'facet.swap', id: 'mt_core', facet: 'behavior', value: { type: 'scripted', data: { motion: { vars: { amp: 1.4 }, pos: [['wobble', ['var', 'amp'], 1.2], 0, 0] } } } },
    { op: 'facet.swap', id: 'mt_core', facet: 'material', value: { type: 'generated', source: null, data: { color: [0.6, 0.6, 0.8], paint: { vars: { span: 3 }, color: [['ease', ['/', ['var', 'y'], ['var', 'span']]], 0.4, 0.8] } } } }]);
  assert.equal(MT.compileMesh(ws.live.tiles.mt_core, ws.live).recipe_parts, 6, 'shape used it');
  assert.ok(MT.compileMesh(ws.live.tiles.mt_core, ws.live).K.some(Boolean), 'painting used it');
  assert.notEqual(shot(ws.live, 0), shot(ws.live, 1.3), 'motion used it');
  assert.ok(rc.units.some((u) => u.key === 'word:ease'), 'and a word is an ordinary merge unit');
  const c = MT.cloneBody(ws); assert.ok(MT.editCandidate(ws, c, { op: 'facet.swap', id: 'mt_switch', facet: 'logic', value: { type: 'rule', data: { vars: { n: 0, eased: 0 }, rules: [{ on: 'press', do: [{ set: ['n', ['+', ['var', 'n'], 0.25]] }, { set: ['eased', ['ease', ['var', 'n']]] }] }] } } }).ok);
  assert.ok(MT.commitPlan(ws, MT.planMerge(ws, [c]).id).ok);
  MT.act(ws, { do: 'signal', tile: 'mt_switch', name: 'press' });
  assert.ok(Math.abs(MT.readVars(ws.live, 'mt_switch', 0).eased - 0.15625) < 1e-9, 'and logic used it too');
});
test('words can lean on words, and a word that leans on itself forever simply stops being readable', () => {
  const ws = base();
  commit(ws, [EASE, { op: 'word.define', name: 'arch', args: ['x'], body: ['*', 4, ['*', ['ease', ['var', 'x']], ['-', 1, ['var', 'x']]]] }]);
  const t = MT.createTile({ id: 'mt_t', name: 'T', form_hints: ['game_asset'], facets: { behavior: { type: 'scripted', data: { motion: { pos: [0, ['arch', 0.5], 0] } } } } });
  const c = MT.cloneBody(ws); assert.ok(MT.editCandidate(ws, c, { op: 'tile.add', tile: t }).ok);
  assert.ok(MT.commitPlan(ws, MT.planMerge(ws, [c]).id).ok);
  assert.ok(Math.abs(MT.evalExpr(['arch', 0.5], { t: 0, words: ws.live.words, get: () => undefined }) - 1) < 1e-9);
  commit(ws, [{ op: 'word.define', name: 'forever', args: ['x'], body: ['forever', ['var', 'x']] }]);
  const t0 = Date.now(); const v = MT.evalExpr(['forever', 1], { t: 0, words: ws.live.words, get: () => undefined });
  assert.equal(v, null); assert.ok(Date.now() - t0 < 500, 'it stopped rather than spun');
  assert.deepEqual(MT.validateWorld(ws.live).errors, []);
});
test('a world cannot redefine the words the engine already knows, and an unknown word stays inert', () => {
  const ws = base(), c = MT.cloneBody(ws);
  for (const bad of ['sin', 'if', 'var', '+']) assert.ok(!MT.editCandidate(ws, c, { op: 'word.define', name: bad, args: ['x'], body: 1 }).ok, bad + ' should be refused');
  assert.ok(!MT.editCandidate(ws, c, { op: 'word.define', name: '2legs', body: 1 }).ok);
  assert.equal(MT.evalExpr(['nosuchword', 1], { t: 0, get: () => undefined }), null, 'an unknown word is inert, as it always was');
  assert.equal(MT.BUILTIN_WORDS.length, 26);
});
test('words travel as matter, and taking one away is a visible change', () => {
  const ws = base(); commit(ws, [EASE]);
  assert.ok(/^word ease /m.test(MT.toText(ws.live)), 'the text surface writes it out');
  assert.deepEqual(MT.fromText(ws.live, MT.toText(ws.live)).ops, [], 'and reads it back with nothing to do');
  const back = MT.importWorkspace(JSON.parse(JSON.stringify(MT.exportWorkspace(ws))));
  assert.equal(back.import_check.status, 'VERIFIED'); assert.deepEqual(Object.keys(back.live.words), ['ease']);
  const dropped = MT.fromText(ws.live, MT.toText(ws.live).replace(/^word ease .*$/m, ''));
  assert.deepEqual(dropped.ops, [{ op: 'word.remove', name: 'ease' }], 'removing the line removes the word');
  const rc = commit(ws, [{ op: 'word.remove', name: 'ease' }]);
  assert.deepEqual(rc.units.map((u) => u.key), ['word:ease']); assert.ok(MT.rollback(ws, rc.rollback_token).exact);
  assert.ok(ws.live.words.ease, 'and it comes back exactly');
});

test('a vocabulary can travel: words leave one world and join another, verified, never silently overwriting', () => {
  const a = base(); commit(a, [EASE, WOBBLE]);
  const pack = JSON.parse(JSON.stringify(MT.exportWords(a.live)));
  assert.deepEqual(Object.keys(pack.words), ['ease', 'wobble']); assert.equal(pack.expect.count, 2);
  const b = base(), got = MT.importWords(b.live, pack);
  assert.equal(got.status, 'READY'); assert.equal(got.evidence, 'verified_payload_sha256'); assert.equal(got.ops.length, 2);
  commit(b, got.ops);
  assert.ok(Math.abs(MT.evalExpr(['ease', 0.5], { t: 0, words: b.live.words, get: () => undefined }) - 0.5) < 1e-9, 'and the word works in its new home');
  assert.deepEqual(MT.importWords(b.live, pack).ops, [], 'importing the same words again has nothing to do');
  assert.deepEqual(MT.importWords(b.live, pack).already, ['ease', 'wobble']);
  const clash = JSON.parse(JSON.stringify(pack)); clash.words.ease.body = ['var', 'x']; clash.expect.sha256 = MT.hashOf(clash.words);
  const held = MT.importWords(b.live, clash);
  assert.equal(held.status, 'PARTIAL_HELD'); assert.deepEqual(held.conflicts.map((c) => c.name), ['ease']); assert.deepEqual(held.ops, []);
  assert.deepEqual(MT.importWords(b.live, clash, { overwrite: true }).ops.map((o) => o.name), ['ease'], 'unless you say so plainly');
  const tampered = JSON.parse(JSON.stringify(pack)); tampered.words.wobble.note = 'changed';
  assert.equal(MT.importWords(b.live, tampered).status, 'HOLD_HASH_MISMATCH');
  const engine = { format: 'morphtile-words', version: '0.3', words: { sin: { name: 'sin', args: ['x'], body: 1 } } };
  assert.deepEqual(MT.importWords(b.live, engine).conflicts.map((c) => c.why), ['the engine already knows this word'], 'a pack cannot smuggle in a word the engine owns');
  assert.equal(MT.importWords(b.live, { hello: 1 }).status, 'HOLD_NOT_A_WORD_PACK');
});
test('painting can feel which way a surface faces, not only where it sits', () => {
  const w = MT.createWorld('Ground');
  w.tiles.mt_g = MT.createTile({ id: 'mt_g', name: 'Island', form_hints: ['game_asset'], facets: { mesh: MT.PRESETS.mesh.island, material: MT.PRESETS.material['painted: ground'] } });
  const m = MT.compileMesh(w.tiles.mt_g);
  const green = m.K.filter((c) => c && c[1] > 0.5).length, rock = m.K.filter((c) => c && c[1] <= 0.5).length;
  assert.ok(green > 100 && rock > 100, 'tops are one colour and flanks another: ' + green + ' vs ' + rock);
  const flat = MT.clone(w.tiles.mt_g); flat.facets.material = { type: 'generated', source: null, data: { color: [0.5, 0.5, 0.5], paint: { vars: { grass: 0.62 }, color: [0.3, 0.3, 0.3] } } };
  assert.equal(new Set(MT.compileMesh(flat).K.map(MT.canonical)).size, 1, 'a painting that ignores direction still gives one colour everywhere');
  const steep = MT.clone(w.tiles.mt_g); steep.facets.material = MT.clone(MT.PRESETS.material['painted: ground']); steep.facets.material.data.paint.vars.grass = 0.99;
  assert.ok(MT.compileMesh(steep).K.filter((c) => c && c[1] > 0.5).length < green, 'and one number decides how steep counts as a flank');
});
