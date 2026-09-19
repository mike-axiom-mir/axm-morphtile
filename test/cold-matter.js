const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const MT = require('../core/morphtile.js'), Cold = require('../experimental/cold-matter.js');
const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'morphtile-cold-'));
const cleanup = (d) => fs.rmSync(d, { recursive: true, force: true });
const world = () => {
  const w = MT.createWorld('Cold test');
  for (let r = 0; r < 3; r++) {
    const root = MT.createTile({ id: 'region_' + r, name: 'Region ' + r }); root.facets.mesh = { type: 'interior', source: null, data: {} }; root.interior = { tiles: {}, edges: {}, ports: [] };
    for (let i = 0; i < 4; i++) root.interior.tiles['part_' + i] = MT.createTile({ id: 'part_' + i, name: 'Part ' + i });
    root.provenance.sha256 = MT.contentHash(root); w.tiles[root.id] = root;
  }
  w.vars['region_1/part_2'] = { damage: 7 }; return w;
};

test('cold store wakes one region without realizing unrelated siblings', () => {
  const d = temp(); try {
    const w = world(), frozen = Cold.freezeWorld(w, d), h = Cold.openColdWorld(d);
    assert.equal(frozen.status, 'COLD_STORED'); assert.equal(h.status, 'COLD_READY'); assert.equal(MT.countTiles(h.world), 0);
    const r = Cold.wakeRegion(h, 'region_1'); assert.equal(r.status, 'AWAKE_VERIFIED'); assert.equal(MT.countTiles(h.world), 5);
    assert.deepEqual(h.world.vars['region_1/part_2'], { damage: 7 }); assert.equal(h.world.tiles.region_0, undefined); assert.equal(h.world.tiles.region_2, undefined);
  } finally { cleanup(d); }
});

test('cold instances keep independent state while sharing one definition', () => {
  const d = temp(); try {
    const w = MT.createWorld('Cold instances'); w.tiles.unit = MT.createTile({ id: 'unit', name: 'Unit' });
    MT.applyStructOp(w, { op: 'def.create', id: 'unit', as: 'shared_unit' });
    MT.applyStructOp(w, { op: 'def.instance', def: 'shared_unit', as: 'unit_b', place: [20, 0, 0] });
    w.vars.unit = { charge: 3 }; w.vars.unit_b = { charge: 91 };
    Cold.freezeWorld(w, d); const h = Cold.openColdWorld(d);
    assert.equal(Cold.wakeRegion(h, 'unit').status, 'AWAKE_VERIFIED'); assert.deepEqual(h.world.vars.unit, { charge: 3 }); assert.equal(h.world.vars.unit_b, undefined);
    assert.equal(Cold.wakeRegion(h, 'unit_b').status, 'AWAKE_VERIFIED'); assert.deepEqual(h.world.vars.unit_b, { charge: 91 });
    assert.equal(h.world.tiles.unit.provenance.instance_of, 'shared_unit'); assert.equal(h.world.tiles.unit_b.provenance.instance_of, 'shared_unit');
  } finally { cleanup(d); }
});

test('a nested child wakes without realizing its sibling tiles, then sleeps with its mutation', () => {
  const d = temp(); try {
    Cold.freezeWorld(world(), d); let h = Cold.openColdWorld(d);
    const r = Cold.wakeSubtree(h, 'region_1/part_2'); assert.equal(r.status, 'SUBTREE_AWAKE_VERIFIED'); assert.equal(MT.countTiles(h.world), 2);
    assert.deepEqual(Object.keys(h.world.tiles.region_1.interior.tiles), ['part_2']); assert.equal(h.world.tiles.region_0, undefined);
    h.world.vars['region_1/part_2'].damage = 55; assert.equal(Cold.sleepSubtree(h, 'region_1/part_2').status, 'SUBTREE_COLD_STORED');
    h = Cold.openColdWorld(d); assert.equal(Cold.wakeRegion(h, 'region_1').status, 'AWAKE_VERIFIED'); assert.equal(h.world.vars['region_1/part_2'].damage, 55); assert.equal(MT.countTiles(h.world), 5);
  } finally { cleanup(d); }
});

test('mutate, sleep, reopen after restart and wake preserves meaningful state', () => {
  const d = temp(); try {
    Cold.freezeWorld(world(), d); let h = Cold.openColdWorld(d); Cold.wakeRegion(h, 'region_1');
    h.world.vars['region_1/part_2'].damage = 99; const slept = Cold.sleepRegion(h, 'region_1'); assert.equal(slept.status, 'COLD_STORED');
    h = Cold.openColdWorld(d); const woke = Cold.wakeRegion(h, 'region_1'); assert.equal(woke.status, 'AWAKE_VERIFIED'); assert.equal(h.world.vars['region_1/part_2'].damage, 99);
  } finally { cleanup(d); }
});

test('full reconstruction matches the original world hash and repeated cycles stay stable', () => {
  const d = temp(); try {
    const w = world(), expected = MT.hashOf(w); Cold.freezeWorld(w, d); const h = Cold.openColdWorld(d);
    assert.equal(Cold.wakeAll(h).status, 'ALL_AWAKE'); assert.equal(MT.hashOf(h.world), expected);
    const before = MT.hashOf(h.world); Cold.sleepRegion(h, 'region_0'); Cold.wakeRegion(h, 'region_0'); assert.equal(MT.hashOf(h.world), before);
  } finally { cleanup(d); }
});

test('missing and corrupted region payloads hold visibly', () => {
  const d = temp(); try {
    const frozen = Cold.freezeWorld(world(), d), missing = frozen.manifest.entries[0], corrupt = frozen.manifest.entries[1];
    fs.unlinkSync(path.join(d, missing.file)); let h = Cold.openColdWorld(d); assert.equal(Cold.wakeRegion(h, missing.root).status, 'HOLD_MISSING_REGION');
    const file = path.join(d, corrupt.file), changed = JSON.parse(fs.readFileSync(file, 'utf8')); changed.tiles[corrupt.root].name = 'tampered'; fs.writeFileSync(file, JSON.stringify(changed));
    h = Cold.openColdWorld(d); assert.equal(Cold.wakeRegion(h, corrupt.root).status, 'HOLD_REGION_HASH_MISMATCH');
  } finally { cleanup(d); }
});

test('cold storage refuses to overwrite an occupied evidence directory', () => {
  const d = temp(); try { fs.writeFileSync(path.join(d, 'keep.txt'), 'evidence'); assert.throws(() => Cold.freezeWorld(world(), d), /must be empty/); } finally { cleanup(d); }
});
