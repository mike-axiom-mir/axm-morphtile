const test = require('node:test');
const assert = require('node:assert/strict');
const MT = require('../core/morphtile.js');

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const put = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: true, configurable: true, writable: true });

function ownMap(entries) {
  const out = {};
  for (const [key, value] of entries) put(out, key, value);
  return out;
}

function apply(ws, ops) {
  const c = MT.cloneBody(ws, 'own-key-kit', 'test');
  for (const op of ops) {
    const edited = MT.editCandidate(ws, c, op);
    assert.equal(edited.ok, true, `${op.op}: ${edited.error || ''}`);
  }
  const merged = MT.commitPlan(ws, MT.planMerge(ws, [c]).id, 'test');
  assert.equal(merged.ok, true, JSON.stringify(merged));
}

function portableKit() {
  const defs = ownMap([
    ['__proto__', { id: '__proto__', name: 'Proto definition', body: { facets: { mesh: { type: 'primitive', source: null, data: { shape: 'box', size: [1, 1, 1] } } } }, created_by: 'test' }],
    ['constructor', { id: 'constructor', name: 'Constructor definition', body: { facets: { mesh: { type: 'primitive', source: null, data: { shape: 'box', size: [2, 1, 1] } } } }, created_by: 'test' }],
    ['toString', { id: 'toString', name: 'toString definition', body: { facets: { mesh: { type: 'primitive', source: null, data: { shape: 'box', size: [3, 1, 1] } } } }, created_by: 'test' }]
  ]);
  const words = ownMap([
    ['constructor', { name: 'constructor', args: [], body: 22, note: null }],
    ['toString', { name: 'toString', args: [], body: 33, note: null }]
  ]);
  const tile = MT.createTile({
    id: 'mt_own_key_kit',
    name: 'Own-key portable kit',
    form_hints: ['game_asset'],
    facets: {
      mesh: { type: 'generated', source: null, data: { generator: 'recipe', vars: {}, parts: [{ use: '__proto__' }] } },
      connect: { sockets: [], bridges: [], place: [0, 0, 0] }
    }
  });
  return JSON.parse(JSON.stringify({ format: 'morphtile-kit', version: '0.4', name: 'Own-key kit', tile, defs, words }));
}

test('kit import treats authored own registry names as data, not Object.prototype conflicts', () => {
  const ws = MT.createWorkspace(MT.createWorld('Own-key receiver'));
  const kit = portableKit();
  for (const key of ['__proto__', 'constructor', 'toString']) assert.equal(hasOwn(kit.defs, key), true);
  for (const key of ['constructor', 'toString']) assert.equal(hasOwn(kit.words, key), true);

  const incoming = MT.importKit(ws.live, kit);
  assert.equal(incoming.status, 'READY', JSON.stringify(incoming));
  assert.deepEqual(incoming.conflicts, []);
  assert.deepEqual(incoming.ops.map((op) => op.op), [
    'word.define', 'word.define',
    'def.put', 'def.put', 'def.put',
    'tile.add'
  ]);

  apply(ws, incoming.ops);
  for (const key of ['__proto__', 'constructor', 'toString']) {
    assert.equal(hasOwn(ws.live.defs, key), true, `${key} definition must be own world data`);
    assert.equal(ws.live.defs[key].id, key);
  }
  for (const key of ['constructor', 'toString']) {
    assert.equal(hasOwn(ws.live.words, key), true, `${key} word must be own world data`);
    assert.equal(ws.live.words[key].name, key);
  }

  const mesh = MT.compileMesh(ws.live.tiles.mt_own_key_kit, ws.live);
  assert.equal(mesh.hold, null, JSON.stringify(mesh));
  assert.ok(mesh.P.length > 0);
  assert.ok(mesh.P.every(Number.isFinite));

  const again = MT.importKit(ws.live, kit);
  assert.equal(again.status, 'READY', JSON.stringify(again));
  assert.deepEqual(again.conflicts, []);
  assert.deepEqual(again.already.sort(), ['__proto__', 'constructor', 'toString', 'constructor', 'toString'].sort());
  assert.deepEqual(again.ops.map((op) => op.op), ['tile.add']);
});

test('word export preserves exact own-key names and never exports inherited names as authored words', () => {
  const ws = MT.createWorkspace(MT.createWorld('Word export receiver'));
  apply(ws, [
    { op: 'word.define', name: 'constructor', args: [], body: 22 },
    { op: 'word.define', name: 'toString', args: [], body: 33 }
  ]);
  const pack = MT.exportWords(ws.live, ['constructor', 'toString', 'valueOf']);
  assert.deepEqual(Object.keys(pack.words).sort(), ['constructor', 'toString'].sort());
  for (const key of ['constructor', 'toString']) assert.equal(hasOwn(pack.words, key), true);
  assert.equal(hasOwn(pack.words, 'valueOf'), false, 'inherited Object.prototype names are not authored world words');
});
