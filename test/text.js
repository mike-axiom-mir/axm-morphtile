// The text surface: matter written as lines, read back as ops. Proves it is a surface, not a second source of truth.
const test = require('node:test'), assert = require('node:assert');
const MT = require('../core/morphtile.js');
const fresh = () => MT.createWorkspace(MT.seedWorld());
const apply = (ws, text, opts) => { const r = MT.fromText(ws.live, text, opts); assert.ok(r.ok, r.error + (r.errors ? ' ' + r.errors.join('; ') : '')); const c = MT.cloneBody(ws, 'text', 'human'); for (const op of r.ops) { const e = MT.editCandidate(ws, c, op); assert.ok(e.ok, JSON.stringify(e)); } const res = MT.commitPlan(ws, MT.planMerge(ws, [c]).id, 'human'); if (r.ops.length) assert.ok(res.ok, JSON.stringify(res)); return { r, res }; };

test('round trip: the whole world written out and read back produces no change at all', () => {
  const ws = fresh(); MT.act(ws, { do: 'signal', tile: 'mt_switch', name: 'press' }); MT.act(ws, { do: 'tick', dt: 20 });
  const before = MT.structHash(ws.live), text = MT.toText(ws.live);
  const r = MT.fromText(ws.live, text); assert.ok(r.ok); assert.deepEqual(r.ops, [], 'nothing to do: the text already says exactly what the world is');
  assert.equal(MT.structHash(ws.live), before); assert.equal(MT.readVars(ws.live, 'mt_tower', 20).beacon, 1, 'reading the world as text did not touch its state');
});
test('round trip survives depth, controls, ports and bridges', () => {
  const ws = fresh();
  apply(ws, MT.toText(ws.live)); // no-op baseline
  const c = MT.cloneBody(ws); for (const op of [{ op: 'tile.collapse', ids: ['mt_tower', 'mt_core'], id: 'mt_asm', name: 'Beacon' }, { op: 'param.add', id: 'mt_asm', param: { id: 'core', label: 'Core motion', type: 'choice', options: [{ label: 'hover', value: MT.PRESETS.behavior.hover }, { label: 'still', value: MT.PRESETS.behavior.still }], binds: [{ tile: 'mt_core', facet: 'behavior', at: '' }] } }, { op: 'bridge.attach', id: 'mt_asm', bridge: { system: 'external:x', ref: 'y', evidence: 'inferred_candidate_not_tested', status: 'HOLD_SOURCE_INCOMPLETE' } }]) assert.ok(MT.editCandidate(ws, c, op).ok);
  assert.ok(MT.commitPlan(ws, MT.planMerge(ws, [c]).id).ok);
  const text = MT.toText(ws.live);
  assert.ok(/inside/.test(text) && /control core/.test(text) && /port /.test(text) && /bridge /.test(text));
  assert.deepEqual(MT.fromText(ws.live, text).ops, [], 'depth, controls, ports and bridges all survive being written and read');
});
test('writing text is a real edit: it builds tiles, wires and depth, and goes through the same commit path', () => {
  const ws = MT.createWorkspace(MT.createWorld('From text'));
  const { r, res } = apply(ws, `world "From text"
tile mt_base "Base plate" as game_asset ui_panel
  mesh primitive {"shape": "box", "size": [4, 0.4, 4]}
  material primitive {"color": [0.3, 0.35, 0.5]}
  socket top attach at 0 0.2 0
tile mt_lamp "Lamp" as game_asset ui_panel
  mesh primitive {"shape": "sphere", "size": [0.8, 0.8, 0.8]}
  material primitive {"color": [1, 0.8, 0.3], "emissive": ["var", "on"]}
  logic rule {"vars": {"on": 0}, "rules": [{"on": "flick", "do": [{"set": ["on", ["-", 1, ["var", "on"]]]}]}]}
  socket foot attach at 0 -0.4 0
  socket flick signal in
  control glow {"label": "Size", "type": "number", "min": 0.4, "max": 2, "step": 0.1, "binds": [{"facet": "mesh", "at": "data.size.0"}]}
wire a_lamp attach mt_base.top -> mt_lamp.foot
`);
  assert.deepEqual(MT.validateWorld(ws.live).errors, []); assert.equal(res.by, undefined);
  assert.equal(Object.keys(ws.live.tiles).length, 2); assert.ok(r.ops.every((o) => ['tile.add', 'edge.add'].includes(o.op)));
  MT.act(ws, { do: 'signal', tile: 'mt_lamp', name: 'flick' }); assert.equal(MT.readVars(ws.live, 'mt_lamp', 0).on, 1, 'logic written as text actually runs');
  assert.ok(MT.renderAsset(ws.live, { width: 80, height: 60 }).stats.tris > 100, 'and it renders');
  const cc = MT.cloneBody(ws); assert.ok(MT.editCandidate(ws, cc, { op: 'param.set', id: 'mt_lamp', param: 'glow', value: 1.5 }).ok, 'a control written as text works like any other');
  assert.deepEqual(MT.fromText(ws.live, MT.toText(ws.live)).ops, []);
});
test('editing one line changes exactly one thing; nothing else is touched', () => {
  const ws = fresh(); const text = MT.toText(ws.live).replace('"Beacon tower"', '"Lighthouse"');
  const { r, res } = apply(ws, text);
  assert.equal(r.ops.length, 1); assert.deepEqual(res.receipt.units.map((u) => u.key), ['tile:mt_tower#meta']);
  assert.equal(ws.live.tiles.mt_tower.name, 'Lighthouse'); assert.equal(ws.live.tiles.mt_tower.state.version, 2);
  assert.ok(MT.rollback(ws, res.receipt.rollback_token).exact);
});
test('text never has privileges the other surfaces lack: bad text is refused before anything is applied', () => {
  const ws = fresh(), before = MT.structHash(ws.live);
  for (const [bad, why] of [['tile mt_x', 'expected: tile'], ['  mesh primitive', 'belong to a tile'], ['tile mt_x "X"\n  mesh primitive {oops}', 'expected JSON'], ['tile mt_x "X"\n  frobnicate 3', 'do not know the word'],
    [MT.toText(ws.live).replace('wire s_switch signal mt_switch.pressed -> mt_tower.toggle', 'wire s_switch signal mt_switch.pressed -> mt_tower.nope'), 'missing socket'],
    [MT.toText(ws.live) + '\nwire a_extra attach mt_switch.foot -> mt_tower.base\n', 'two parents']]) {
    const r = MT.fromText(ws.live, bad); assert.ok(!r.ok, 'should have refused: ' + why);
    assert.ok((r.error + (r.errors || []).join(' ')).length > 0); assert.equal(MT.structHash(ws.live), before, 'and the world is untouched');
  }
});
test('text can be scoped to one tile\u2019s interior and stay additive', () => {
  const ws = fresh(), c = MT.cloneBody(ws);
  assert.ok(MT.editCandidate(ws, c, { op: 'tile.collapse', ids: ['mt_tower', 'mt_core'], id: 'mt_asm', name: 'Beacon' }).ok);
  assert.ok(MT.commitPlan(ws, MT.planMerge(ws, [c]).id).ok);
  const inner = MT.toText(ws.live, { path: 'mt_asm' });
  assert.ok(/tile mt_tower/.test(inner) && !/tile mt_island/.test(inner), 'scoped to what is inside that tile');
  const r = MT.fromText(ws.live, inner + '\ntile mt_probe "Probe" as game_asset\n  mesh primitive {"shape": "sphere"}\n', { path: 'mt_asm' });
  assert.ok(r.ok); assert.deepEqual(r.ops.map((o) => o.op), ['tile.add']); assert.equal(r.ops[0].in, 'mt_asm');
  const c2 = MT.cloneBody(ws); for (const op of r.ops) assert.ok(MT.editCandidate(ws, c2, op).ok);
  assert.ok(MT.commitPlan(ws, MT.planMerge(ws, [c2]).id).ok); assert.ok(ws.live.tiles.mt_asm.interior.tiles.mt_probe);
  const add = MT.fromText(ws.live, 'tile mt_far "Far" as game_asset\n', { additive: true });
  assert.ok(add.ok && add.ops.every((o) => o.op === 'tile.add'), 'additive text adds without removing what it does not mention');
});
