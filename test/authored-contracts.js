const test = require('node:test'), assert = require('node:assert/strict');
const MT = require('../core/morphtile.js');

const cap = (wake) => ({ id: 'counter', wake, grants: { facets: { logic: {
  type: 'rule', data: { vars: { count: 0 }, rules: [{ on: 'increment', do: [{ set: ['count', ['+', ['var', 'count'], 1]] }] }] },
} } } });

test('malformed wake fields and numeric lookalikes never enter tile or candidate matter', () => {
  const malformed = [
    null, false, [], {}, { on: ['manual'] }, { on: 'constructor' },
    { on: 'manual', name: 'ignored' }, { on: 'signal', name: '' }, { on: 'signal', name: 1 },
    { on: 'signal', name: 'increment', within: 4 },
    ...[0, -1, null, false, '4', Infinity, NaN].map((within) => ({ on: 'near', within })),
    ...[0.5, null, false, '1.25', Infinity].map((hysteresis) => ({ on: 'near', hysteresis })),
    { on: 'near', sleeps: 'false' }, { on: 'value', var: 'count' },
    { on: 'value', var: 'count', over: 1, under: 2 }, { on: 'value', var: '', over: 1 },
    ...[null, false, '1', Infinity].map((over) => ({ on: 'value', var: 'count', over })),
    ...['../other', '/mt_other', 'mt_a//mt_b', null, []].map((tile) => ({ on: 'value', tile, var: 'count', under: 1 })),
    ...[undefined, null, false, '0', -1, Infinity].map((after) => ({ on: 'time', after })),
  ];
  const ws = MT.createWorkspace(MT.seedWorld()), c = MT.cloneBody(ws);
  const before = MT.hashOf({ candidate: ws.candidates[c], live: ws.live });
  for (const wake of malformed) {
    const authored = cap(wake);
    // Direct validation does not rely on JSON cloning to turn NaN/Infinity into null.
    const tile = MT.createTile({ id: 'mt_authored' }); tile.capabilities = [authored];
    assert.equal(MT.validateTile(tile).ok, false, JSON.stringify(wake));
    assert.equal(MT.editCandidate(ws, c, { op: 'cap.add', id: 'mt_tower', capability: authored }).ok, false, JSON.stringify(wake));
    assert.equal(MT.hashOf({ candidate: ws.candidates[c], live: ws.live }), before, 'a rejected edit is atomic');
  }
});

test('invalid capability containers and duplicate identities return validation errors', () => {
  for (const capabilities of [null, false, {}, [null], [false], [[]], [{ id: 1 }], [cap({ on: 'manual' }), cap({ on: 'time', after: 0 })]]) {
    const tile = MT.createTile({ id: 'mt_invalid', capabilities });
    assert.equal(MT.validateTile(tile).ok, false, JSON.stringify(capabilities));
  }
});

test('omitted manual and near defaults, zero thresholds and native sleeps flag preserve authored bytes', () => {
  const valid = [undefined, { on: 'manual' }, { on: 'near' }, { on: 'near', within: 4, hysteresis: 1, sleeps: false },
    { on: 'value', tile: '', var: 'count', over: 0, sleeps: true },
    { on: 'value', tile: 'mt_inner/mt_leaf', var: 'count', under: -1 }, { on: 'time', after: 0, sleeps: false }];
  for (const wake of valid) {
    const ws = MT.createWorkspace(MT.seedWorld()), c = MT.cloneBody(ws), authored = cap(wake);
    assert.equal(MT.editCandidate(ws, c, { op: 'cap.add', id: 'mt_tower', capability: authored }).ok, true);
    assert.deepEqual(ws.candidates[c].world.tiles.mt_tower.capabilities[0], MT.clone(authored));
  }
});

test('malformed descriptors cannot bypass the contract through tile replacement, text or world import', () => {
  const ws = MT.createWorkspace(MT.seedWorld()), c = MT.cloneBody(ws), before = MT.hashOf(ws.live);
  const malformed = MT.clone(ws.live.tiles.mt_tower); malformed.capabilities = [cap({ on: 'signal' })];
  assert.equal(MT.editCandidate(ws, c, { op: 'tile.replace', id: 'mt_tower', tile: malformed }).ok, false);
  const matter = MT.clone(ws.live); matter.tiles.mt_tower = malformed;
  const parsed = MT.fromText(ws.live, MT.toText(matter));
  assert.ok(parsed.ops.length > 0);
  for (const op of parsed.ops) assert.equal(MT.editCandidate(ws, c, op).ok, false);
  assert.equal(MT.hashOf(ws.live), before);
  const file = MT.exportWorld(matter);
  assert.equal(MT.importWorld(file).status, 'HOLD_INVALID_WORLD');
});

test('only the named signal wakes a capability, then behavior and replay agree', () => {
  const w = MT.createWorld('Named signal');
  w.tiles.mt_counter = MT.createTile({ id: 'mt_counter', capabilities: [cap({ on: 'signal', name: 'increment' })] });
  const ws = MT.createWorkspace(w), matter = MT.structHash(ws.live);
  MT.act(ws, { do: 'signal', tile: 'mt_counter', name: 'other' });
  assert.equal(MT.isAwake(ws.live, 'mt_counter', 'counter'), false);
  MT.act(ws, { do: 'signal', tile: 'mt_counter', name: 'increment' });
  assert.equal(MT.isAwake(ws.live, 'mt_counter', 'counter'), true);
  assert.equal(MT.readVars(ws.live, 'mt_counter', ws.live.time).count, 1);
  assert.equal(MT.structHash(ws.live), matter);
  assert.equal(MT.act(ws, { do: 'reconstruct', fromGenesis: true }).matches_live, true);
});

test('unvalidated legacy signal descriptors no longer act as a wildcard', () => {
  const w = MT.createWorld('Legacy invalid data');
  w.tiles.mt_counter = MT.createTile({ id: 'mt_counter', capabilities: [cap({ on: 'signal' })] });
  assert.throws(() => MT.createWorkspace(w), /signal wake needs a non-empty name/);
  MT.applyEvent(w, { type: 'signal', tile: 'mt_counter', name: 'increment' });
  assert.equal(MT.isAwake(w, 'mt_counter', 'counter'), false);
});

test('all declared presentation modes remain valid and falsey descriptors are rejected', () => {
  for (const mode of ['screen', 'docked', 'floating', 'fullscreen', 'embedded', 'world', 'tile']) {
    assert.equal(MT.validateTile(MT.createTile({ presentation: { mode } })).ok, true, mode);
  }
  for (const presentation of [false, null, 0, '', []]) {
    assert.equal(MT.validateTile(MT.createTile({ presentation })).ok, false);
  }
});
