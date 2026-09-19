// "Capabilities can sleep in nodes till needed." A node may carry any amount of capability at no cost until something calls for it.
const test = require('node:test'), assert = require('node:assert');
const MT = require('../core/morphtile.js');
const fresh = () => MT.createWorkspace(MT.seedWorld());
const commit = (ws, ops, by) => { const c = MT.cloneBody(ws, 'c', by); for (const op of ops) { const r = MT.editCandidate(ws, c, op); assert.ok(r.ok, op.op + ': ' + r.error); } const res = MT.commitPlan(ws, MT.planMerge(ws, [c]).id, by); assert.ok(res.ok, JSON.stringify(res)); return res.receipt; };
const shot = (w) => MT.renderReceipt(MT.renderAsset(w, { width: 120, height: 100 }));
// A capability that, when needed, turns this tile into a whole workshop of its own.
const FACTORY = { id: 'factory', name: 'Assembly bay', wake: { on: 'signal', name: 'open' }, grants: {
  form_hints: ['tool'], sockets: [{ id: 'open', kind: 'signal', dir: 'in', signal: 'open', label: 'Open the bay' }],
  params: [{ id: 'yield', label: 'Yield', type: 'number', min: 1, max: 9, step: 1, binds: [{ tile: 'mt_arm', facet: 'mesh', at: 'data.size.1' }] }],
  interior: { ports: [], edges: { a_arm: { id: 'a_arm', kind: 'attach', from: { tile: 'mt_bench', socket: 'top' }, to: { tile: 'mt_arm', socket: 'foot' } } }, tiles: {
    mt_bench: MT.createTile({ id: 'mt_bench', name: 'Bench', form_hints: ['game_asset', 'ui_panel'], facets: { mesh: { type: 'primitive', source: null, data: { shape: 'box', size: [2, 0.3, 1.2] } }, connect: { sockets: [{ id: 'top', kind: 'attach', pos: [0, 0.15, 0] }], bridges: [] } } }),
    mt_arm: MT.createTile({ id: 'mt_arm', name: 'Arm', form_hints: ['game_asset', 'ui_panel'], facets: { mesh: { type: 'primitive', source: null, data: { shape: 'cylinder', size: [0.3, 1.4, 0.3] } }, behavior: { type: 'scripted', data: { ops: [{ op: 'spin', axis: 'y', rate: 1.2 }] } },
      logic: { type: 'rule', data: { vars: { made: 0 }, rules: [{ on: 'make', do: [{ set: ['made', ['+', ['var', 'made'], 1]] }] }] } }, connect: { sockets: [{ id: 'foot', kind: 'attach', pos: [0, -0.7, 0] }, { id: 'make', kind: 'signal', dir: 'in', signal: 'make' }], bridges: [] } } }) } } } };

test('a sleeping capability costs nothing: same pixels, same tiles, same state as a world without it', () => {
  const plain = fresh(), loaded = fresh();
  commit(loaded, [{ op: 'cap.add', id: 'mt_switch', capability: FACTORY }]);
  assert.equal(MT.countTiles(loaded.live), MT.countTiles(plain.live), 'nothing inside it exists yet');
  assert.equal(shot(loaded.live).tris, shot(plain.live).tris); assert.equal(shot(loaded.live).sha256, shot(plain.live).sha256);
  assert.deepEqual(MT.readVars(loaded.live, 'mt_switch', 0), MT.readVars(plain.live, 'mt_switch', 0));
  assert.deepEqual(loaded.live.awake, undefined, 'sleeping costs no state at all');
  assert.deepEqual(MT.sleepingReport(loaded.live), { carriers: 1, awake: 0, asleep: 1 });
  assert.ok(!MT.findSocket(loaded.live.tiles.mt_switch, 'open'), 'and it grants nothing while asleep');
});
test('it wakes when it is called for, and what it brings is real: tiles, wires, behavior, logic, controls', () => {
  const ws = fresh(); commit(ws, [{ op: 'cap.add', id: 'mt_switch', capability: FACTORY }]);
  const before = shot(ws.live).sha256, matter = MT.hashOf({ t: ws.live.tiles, e: ws.live.edges });
  const r = MT.act(ws, { do: 'signal', tile: 'mt_switch', name: 'open' }, 'human');
  assert.ok(r.trace.some((x) => x.woke === 'factory'), 'the signal itself woke it');
  const live = MT.activeTile(ws.live, 'mt_switch');
  assert.equal(MT.countTiles(ws.live), 11, 'two more tiles are there now');
  assert.ok(live.form_hints.includes('tool') && live.params[0].id === 'yield');
  assert.notEqual(shot(ws.live).sha256, before, 'and it is visible');
  assert.equal(MT.hashOf({ t: ws.live.tiles, e: ws.live.edges }), matter, 'waking changed no matter: it is state, not a rewrite');
  MT.act(ws, { do: 'signal', tile: 'mt_switch/mt_arm', name: 'make' });
  assert.equal(MT.readVars(ws.live, 'mt_switch/mt_arm', 0).made, 1, 'what it brought is ordinary matter with ordinary state');
  assert.ok(MT.act(ws, { do: 'reconstruct', fromGenesis: true }).matches_live, 'and the whole thing replays from the ledger');
});
test('it can go back to sleep; its state waits for it, or can be let go', () => {
  const ws = fresh(); commit(ws, [{ op: 'cap.add', id: 'mt_switch', capability: FACTORY }]);
  MT.act(ws, { do: 'wake', tile: 'mt_switch', capability: 'factory' }); MT.act(ws, { do: 'signal', tile: 'mt_switch/mt_arm', name: 'make' });
  const busy = MT.renderAsset(ws.live, { width: 120, height: 100 });
  assert.ok(busy.order.includes('mt_switch/mt_arm'), 'what it brought is being drawn');
  MT.act(ws, { do: 'sleep', tile: 'mt_switch', capability: 'factory' });
  const quiet = MT.renderAsset(ws.live, { width: 120, height: 100 });
  assert.equal(MT.countTiles(ws.live), 9); assert.ok(!quiet.order.includes('mt_switch/mt_arm'), 'and no longer drawn once it sleeps');
  assert.equal(quiet.stats.tiles, busy.stats.tiles - 1);
  MT.act(ws, { do: 'wake', tile: 'mt_switch', capability: 'factory' });
  assert.equal(MT.readVars(ws.live, 'mt_switch/mt_arm', 0).made, 1, 'its state was waiting for it');
  MT.act(ws, { do: 'sleep', tile: 'mt_switch', capability: 'factory', forget: true }); MT.act(ws, { do: 'wake', tile: 'mt_switch', capability: 'factory' });
  assert.equal(MT.readVars(ws.live, 'mt_switch/mt_arm', 0).made, 0, 'or let go on purpose');
});
test('a node can carry many capabilities, and a thousand sleeping nodes cost nothing', () => {
  const ws = fresh(), many = [];
  for (let i = 0; i < 6; i++) many.push({ op: 'cap.add', id: 'mt_switch', capability: Object.assign({}, FACTORY, { id: 'cap' + i, wake: { on: 'signal', name: 'open' + i } }) });
  commit(ws, many);
  assert.equal(MT.sleepingReport(ws.live).asleep, 6); assert.equal(MT.countTiles(ws.live), 9);
  const world = MT.createWorld('Deep store'), tile = MT.createTile({ id: 'mt_seed', name: 'Seed', form_hints: ['game_asset'], capabilities: [FACTORY] });
  for (let i = 0; i < 1000; i++) { const t = MT.clone(tile); t.id = 'mt_' + i; t.facets.connect.place = [i % 30, 0, Math.floor(i / 30)]; world.tiles[t.id] = t; }
  const t0 = Date.now(), f = MT.renderAsset(world, { width: 120, height: 100 }), ms = Date.now() - t0;
  assert.equal(MT.sleepingReport(world).asleep, 1000); assert.equal(MT.countTiles(world), 1000, '1000 nodes, not 3000');
  assert.ok(ms < 2000, 'drawing 1000 loaded-but-sleeping nodes took ' + ms + 'ms');
  assert.equal(f.stats.sleeping, 1000);
});
test('logic can wake and sleep capabilities, so a world can arm itself without anyone watching', () => {
  const ws = fresh(); commit(ws, [{ op: 'cap.add', id: 'mt_switch', capability: Object.assign({}, FACTORY, { wake: { on: 'manual' } }) },
    { op: 'facet.swap', id: 'mt_switch', facet: 'logic', value: { type: 'rule', data: { vars: { presses: 0 }, rules: [
      { on: 'press', do: [{ set: ['presses', ['+', ['var', 'presses'], 1]] }, { emit: 'pressed' }] },
      { on: 'press', if: ['>=', ['var', 'presses'], 2], do: [{ wake: 'factory' }] }] } } }]);
  MT.act(ws, { do: 'signal', tile: 'mt_switch', name: 'press' });
  assert.ok(!MT.isAwake(ws.live, 'mt_switch', 'factory'), 'not yet');
  MT.act(ws, { do: 'signal', tile: 'mt_switch', name: 'press' });
  assert.ok(MT.isAwake(ws.live, 'mt_switch', 'factory'), 'the world woke its own capability when its own rule said so');
  assert.equal(MT.countTiles(ws.live), 11);
});
test('capabilities are matter: they travel through text, files, definitions and depth', () => {
  const ws = fresh(); commit(ws, [{ op: 'cap.add', id: 'mt_switch', capability: FACTORY }]);
  assert.deepEqual(MT.fromText(ws.live, MT.toText(ws.live)).ops, [], 'text round trips a sleeping capability unchanged');
  assert.ok(/capability factory/.test(MT.toText(ws.live)));
  const back = MT.importWorkspace(JSON.parse(JSON.stringify(MT.exportWorkspace(ws))));
  assert.equal(back.import_check.status, 'VERIFIED'); assert.ok(MT.capOf(back.live.tiles.mt_switch, 'factory'));
  commit(ws, [{ op: 'def.create', id: 'mt_switch', as: 'def_sw', name: 'Switch' }, { op: 'def.instance', def: 'def_sw', as: 'mt_sw2', place: [3, 3, 0] }]);
  assert.ok(MT.capOf(ws.live.tiles.mt_sw2, 'factory'), 'an instance carries the same sleeping capability');
  MT.act(ws, { do: 'wake', tile: 'mt_sw2', capability: 'factory' });
  assert.equal(MT.countTiles(ws.live), 12, 'and wakes on its own: one instance awake, the other still asleep');
  assert.ok(!MT.isAwake(ws.live, 'mt_switch', 'factory'));
  commit(ws, [{ op: 'tile.collapse', ids: ['mt_sw2'], id: 'mt_box', name: 'Box' }]);
  assert.ok(MT.isAwake(ws.live, 'mt_box/mt_sw2', 'factory'), 'waking follows the tile when it moves deeper');
  assert.equal(MT.countTiles(ws.live), 13);
});

const CITY = { op: 'tile.collapse', ids: ['mt_tower', 'mt_core'], id: 'mt_block', name: 'City block' };
test('a node can carry what it does not hold: the capability names a definition, resolved only when it wakes', () => {
  const ws = fresh(); commit(ws, [CITY, { op: 'def.create', id: 'mt_block', as: 'def_block', name: 'Block' },
    { op: 'cap.add', id: 'mt_switch', capability: { id: 'city', name: 'A whole block', wake: { on: 'manual' }, grants_ref: { def: 'def_block' } } }]);
  assert.deepEqual(MT.capStatus(ws.live, 'mt_switch', MT.capOf(ws.live.tiles.mt_switch, 'city')), { id: 'city', awake: false, status: 'RESOLVED', from: 'def_block', wake: { on: 'manual' } });
  const carrier = MT.canonical(ws.live.tiles.mt_switch).length, copied = MT.canonical(ws.live.defs.def_block.body).length;
  assert.ok(carrier < copied / 2, 'the node carries a name (' + carrier + ' bytes), not a copy (' + copied + ')');
  const asleep = MT.countTiles(ws.live);
  MT.act(ws, { do: 'wake', tile: 'mt_switch', capability: 'city' });
  assert.equal(MT.countTiles(ws.live), asleep + 2, 'waking resolved the definition: the node now IS that block, contents and all');
  assert.equal(MT.readVars(ws.live, 'mt_switch/mt_tower', 0).beacon, 0);
  MT.act(ws, { do: 'signal', tile: 'mt_switch/mt_tower', name: 'toggle' });
  assert.equal(MT.readVars(ws.live, 'mt_switch/mt_tower', 0).beacon, 1, 'and it is ordinary matter once awake');
  assert.ok(MT.act(ws, { do: 'reconstruct', fromGenesis: true }).matches_live);
});
test('a reference that cannot be resolved is a visible hold, never a silently empty room', () => {
  const ws = fresh(); commit(ws, [{ op: 'cap.add', id: 'mt_switch', capability: { id: 'ghost', wake: { on: 'manual' }, grants_ref: { def: 'def_missing' } } }]);
  assert.equal(MT.capStatus(ws.live, 'mt_switch', MT.capOf(ws.live.tiles.mt_switch, 'ghost')).status, 'HOLD_DEFINITION_NOT_HERE');
  MT.act(ws, { do: 'wake', tile: 'mt_switch', capability: 'ghost' });
  const live = MT.activeTile(ws.live, 'mt_switch');
  assert.deepEqual(live.provenance.held, [{ capability: 'ghost', status: 'HOLD_DEFINITION_NOT_HERE' }]);
  assert.equal(live.facets.material.data.hold, 'HOLD_DEFINITION_NOT_HERE', 'and it shows amber in every form');
  assert.ok(MT.renderAsset(ws.live, { width: 60, height: 50 }).stats.holds.some((h) => h.tile === 'mt_switch'));
});
test('the world says what it wants woken; asking is pure, and 500 carriers wake only where you are', () => {
  const ws = fresh(); commit(ws, [CITY, { op: 'def.create', id: 'mt_block', as: 'def_block', name: 'Block' }]);
  const c = MT.cloneBody(ws);
  for (let i = 0; i < 500; i++) MT.editCandidate(ws, c, { op: 'tile.add', tile: MT.createTile({ id: 'mt_lot_' + i, name: 'Lot ' + i, form_hints: ['game_asset'], salt: i,
    capabilities: [{ id: 'block', name: 'Block', wake: { on: 'near', within: 6 }, grants_ref: { def: 'def_block' } }],
    facets: { mesh: { type: 'primitive', source: null, data: { shape: 'box', size: [0.6, 0.2, 0.6] } }, connect: { sockets: [], bridges: [], place: [(i % 25) * 4, 0, Math.floor(i / 25) * 4] } } }) });
  assert.ok(MT.commitPlan(ws, MT.planMerge(ws, [c]).id).ok);
  assert.equal(MT.sleepingReport(ws.live).asleep, 500); assert.equal(MT.countTiles(ws.live), 510, '500 lots carrying a block each, and not one block built');
  const before = MT.hashOf(ws.live), want = MT.pendingWakes(ws.live, { from: [4, 0, 4] });
  assert.equal(MT.hashOf(ws.live), before, 'asking the world what it wants changed nothing');
  assert.deepEqual(want.map((x) => x.tile).sort(), ['mt_lot_0', 'mt_lot_1', 'mt_lot_2', 'mt_lot_25', 'mt_lot_26', 'mt_lot_27', 'mt_lot_50', 'mt_lot_51', 'mt_lot_52'], 'the nine lots within reach, and no others');
  const r = MT.act(ws, { do: 'settle', from: [4, 0, 4] }, 'human');
  assert.equal(r.changes.length, 9); assert.equal(MT.countTiles(ws.live), 510 + 9 * 2, 'only the nine near you were built');
  assert.deepEqual(MT.pendingWakes(ws.live, { from: [4, 0, 4] }), [], 'and it has settled');
  MT.act(ws, { do: 'settle', from: [96, 0, 76] });
  assert.equal(MT.sleepingReport(ws.live).awake, 4, 'walk to the far corner and those nine sleep again, while the four there wake');
  assert.ok(!MT.isAwake(ws.live, 'mt_lot_0', 'block'));
  assert.ok(MT.act(ws, { do: 'reconstruct', fromGenesis: true }).matches_live, 'every waking and sleeping is in the ledger');
});
test('a world can hold far more than it draws', () => {
  const world = MT.createWorld('Sprawl'), tile = MT.createTile({ id: 'mt_x', name: 'Thing', form_hints: ['game_asset'], facets: { mesh: { type: 'primitive', source: null, data: { shape: 'box', size: [1, 1, 1] } } } });
  for (let i = 0; i < 4000; i++) { const t = MT.clone(tile); t.id = 'mt_' + i; t.facets.connect.place = [(i % 64) * 3, 0, Math.floor(i / 64) * 3]; world.tiles[t.id] = t; }
  const t0 = Date.now(), all = MT.renderAsset(world, { width: 100, height: 80 }), full = Date.now() - t0;
  const t1 = Date.now(), near = MT.renderAsset(world, { width: 100, height: 80, within: 14 }), cheap = Date.now() - t1;
  assert.equal(MT.countTiles(world), 4000); assert.ok(near.stats.out_of_range > 3900, 'most of the world is held but not looked at');
  assert.ok(near.stats.tiles < 40 && all.stats.tiles === 4000, 'the renderer considered ' + near.stats.tiles + ' tiles instead of 4000');
  assert.equal(MT.renderReceipt(near).sha256, MT.renderReceipt(all).sha256, 'and the picture is identical: what was skipped was never on screen');
  assert.ok(cheap <= full, 'holding more than you draw costs less, not more (' + cheap + 'ms vs ' + full + 'ms)');
});
test('waking can be decided by a value or a moment, not only by hand', () => {
  const ws = fresh(); commit(ws, [{ op: 'cap.add', id: 'mt_core', capability: { id: 'overflow', name: 'Overflow vent', wake: { on: 'value', var: 'energy', over: 100 }, grants: { form_hints: ['tool'] } } },
    { op: 'cap.add', id: 'mt_switch', capability: { id: 'dawn', name: 'Dawn', wake: { on: 'time', after: 60 }, grants: { form_hints: ['world'] } } }]);
  assert.deepEqual(MT.pendingWakes(ws.live, {}), [], 'nothing yet');
  MT.act(ws, { do: 'tick', dt: 150 });
  const want = MT.pendingWakes(ws.live, {}).map((x) => x.tile + ':' + x.capability + ':' + x.why);
  assert.deepEqual(want.sort(), ['mt_core:overflow:value', 'mt_switch:dawn:time']);
  MT.act(ws, { do: 'settle' });
  assert.ok(MT.activeTile(ws.live, 'mt_core').form_hints.includes('tool'));
  MT.act(ws, { do: 'signal', tile: 'mt_core', name: 'surge' });
  assert.deepEqual(MT.pendingWakes(ws.live, {}).map((x) => x.type), ['sleep'], 'the value dropped, so it offers to sleep again');
});
