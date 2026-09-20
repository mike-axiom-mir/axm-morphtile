const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const MT = require('../core/morphtile.js'), Cold = require('../experimental/cold-matter.js'), Flow = require('../experimental/flowing-runtime.js');

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'morphtile-flow-'));
const cleanup = (d) => fs.rmSync(d, { recursive: true, force: true });

function world() {
  const w = MT.createWorld('Flowing world');
  for (let r = 0; r < 3; r++) {
    const root = MT.createTile({ id: 'region_' + r, name: 'Region ' + r });
    root.facets.mesh = { type: 'interior', source: null, data: {} };
    root.interior = { tiles: {}, edges: {}, ports: [] };
    for (let i = 0; i < 3; i++) root.interior.tiles['part_' + i] = MT.createTile({ id: 'part_' + i, name: 'Part ' + i });
    root.provenance.sha256 = MT.contentHash(root);
    w.tiles[root.id] = root;
  }
  w.vars['region_1/part_2'] = { damage: 7 };
  return w;
}

function specs() {
  return [
    { id: 'cold:region_0', depends_on: ['morphtile:tile/region_0/**'], allowed_routes: ['cold-region-rewrite'] },
    { id: 'cold:region_1', depends_on: ['morphtile:tile/region_1/**'], allowed_routes: ['cold-region-rewrite'] },
    { id: 'cold:region_2', depends_on: ['morphtile:tile/region_2/**'], allowed_routes: ['cold-region-rewrite'] },
    { id: 'world:live', depends_on: ['morphtile:tile/**'], allowed_routes: ['world-live-hash'] },
  ];
}

function setup() {
  const d = temp(), w = world(), frozen = Cold.freezeWorld(w, d), artifacts = {};
  for (const e of frozen.manifest.entries) artifacts['cold:' + e.root] = { artifact_sha256: e.sha256, representation: 'cold-region' };
  artifacts['world:live'] = { artifact_sha256: MT.hashOf(w), representation: 'world-live-hash' };
  const runtime = Flow.createRuntime({ label: 'MorphTile cold-world test', contracts: specs(), artifacts });
  return { d, w, frozen, runtime };
}

test('flow runtime routes one tile mutation only to its dependent contracts and commits atomically', () => {
  const x = setup();
  try {
    const g0 = Flow.currentHead(x.runtime);
    const plan = Flow.planMutation(x.runtime, { selectors: ['morphtile:tile/region_1/part_2'], reason: 'damage changed' });
    assert.equal(plan.status, 'PLANNED');
    assert.equal(plan.contracts['cold:region_1'].action, 'UPDATE_REQUIRED');
    assert.equal(plan.contracts['world:live'].action, 'UPDATE_REQUIRED');
    assert.equal(plan.contracts['cold:region_0'].action, 'REUSE_EXACT');
    assert.equal(plan.contracts['cold:region_2'].action, 'REUSE_EXACT');

    let h = Cold.openColdWorld(x.d);
    assert.equal(Cold.wakeRegion(h, 'region_1').status, 'AWAKE_VERIFIED');
    h.world.vars['region_1/part_2'].damage = 99;
    assert.equal(Cold.sleepRegion(h, 'region_1').status, 'COLD_STORED');

    const manifest = JSON.parse(fs.readFileSync(path.join(x.d, 'cold-manifest.json'), 'utf8'));
    const r1 = manifest.entries.find((e) => e.root === 'region_1');
    const expected = MT.clone(x.w); expected.vars['region_1/part_2'].damage = 99;
    const staged = Flow.stageGeneration(x.runtime, plan, {
      'cold:region_1': { artifact_sha256: r1.sha256, representation: 'cold-region', route: 'cold-region-rewrite' },
      'world:live': { artifact_sha256: MT.hashOf(expected), representation: 'world-live-hash', route: 'world-live-hash' },
    });
    assert.equal(staged.status, 'STAGED');
    assert.equal(Flow.currentHead(x.runtime).generation_sha256, g0.generation_sha256, 'staging is not authority');

    const committed = Flow.commitGeneration(x.runtime, staged, 'test');
    assert.equal(committed.status, 'COMMITTED');
    const g1 = Flow.currentHead(x.runtime);
    assert.notEqual(g1.generation_sha256, g0.generation_sha256);
    assert.equal(g1.contracts['cold:region_0'].artifact_sha256, g0.contracts['cold:region_0'].artifact_sha256);
    assert.equal(g1.contracts['cold:region_2'].artifact_sha256, g0.contracts['cold:region_2'].artifact_sha256);
    assert.equal(g1.contracts['cold:region_1'].artifact_sha256, r1.sha256);
    assert.equal(g1.contracts['cold:region_1'].decision, 'UPDATED');
    assert.equal(g1.contracts['cold:region_0'].decision, 'REUSED_EXACT');
  } finally { cleanup(x.d); }
});

test('dormant artifact can wake into a non-canonical hot plane and vanish again without changing generation truth', () => {
  const x = setup();
  try {
    const before = Flow.currentHead(x.runtime);
    const entry = x.frozen.manifest.entries.find((e) => e.root === 'region_1');
    const payload = JSON.parse(fs.readFileSync(path.join(x.d, entry.file), 'utf8'));
    const woke = Flow.wakeContract(x.runtime, 'cold:region_1', payload);
    assert.equal(woke.status, 'AWAKE_VERIFIED');
    assert.equal(Flow.currentHead(x.runtime).generation_sha256, before.generation_sha256);
    assert.equal(Flow.hotArtifact(x.runtime, 'cold:region_1').root, 'region_1');

    const exported = Flow.exportRuntime(x.runtime);
    assert.equal(exported.hot, undefined, 'hot state is never canonical/exported');
    const resumed = Flow.importRuntime(JSON.parse(JSON.stringify(exported)));
    assert.equal(Flow.hotArtifact(resumed, 'cold:region_1'), null, 'process restart begins dormant');
    assert.equal(Flow.currentHead(resumed).generation_sha256, before.generation_sha256);

    const bad = MT.clone(payload); bad.tiles.region_1.name = 'wrong bytes';
    assert.equal(Flow.wakeContract(resumed, 'cold:region_1', bad).status, 'HOLD_ARTIFACT_HASH_MISMATCH');
    assert.equal(Flow.sleepContract(x.runtime, 'cold:region_1').status, 'DORMANT');
  } finally { cleanup(x.d); }
});

test('unknown mutation selectors HOLD instead of assuming a contract is unaffected', () => {
  const x = setup();
  try {
    const plan = Flow.planMutation(x.runtime, { selectors: ['unknown:outside-contract-map'] });
    assert.equal(plan.status, 'HOLD_UNKNOWN_SELECTOR');
    assert.deepEqual(plan.unknown_selectors, ['unknown:outside-contract-map']);
  } finally { cleanup(x.d); }
});

test('affected contracts must name a contract-local route and cannot borrow an unmeasured route', () => {
  const x = setup();
  try {
    const plan = Flow.planMutation(x.runtime, { selectors: ['morphtile:tile/region_0/part_0'] });
    const next = MT.hashOf({ fixture: 'region0-next' });
    const noRoute = Flow.stageGeneration(x.runtime, plan, {
      'cold:region_0': { artifact_sha256: next },
      'world:live': { artifact_sha256: MT.hashOf({ fixture: 'world-next' }), route: 'world-live-hash' },
    });
    assert.equal(noRoute.status, 'HOLD_ROUTE_REQUIRED');

    const wrongRoute = Flow.stageGeneration(x.runtime, plan, {
      'cold:region_0': { artifact_sha256: next, route: 'magic-universal-route' },
      'world:live': { artifact_sha256: MT.hashOf({ fixture: 'world-next' }), route: 'world-live-hash' },
    });
    assert.equal(wrongRoute.status, 'HOLD_ROUTE_NOT_ALLOWED');
  } finally { cleanup(x.d); }
});

test('a plan and stage are bound to the exact current generation', () => {
  const x = setup();
  try {
    const a = Flow.planMutation(x.runtime, { selectors: ['morphtile:tile/region_0/part_0'] });
    const b = Flow.planMutation(x.runtime, { selectors: ['morphtile:tile/region_2/part_0'] });
    const staged = Flow.stageGeneration(x.runtime, a, {
      'cold:region_0': { artifact_sha256: MT.hashOf({ rev: 'a-region' }), route: 'cold-region-rewrite' },
      'world:live': { artifact_sha256: MT.hashOf({ rev: 'a-world' }), route: 'world-live-hash' },
    });
    assert.equal(Flow.commitGeneration(x.runtime, staged).status, 'COMMITTED');
    assert.equal(Flow.stageGeneration(x.runtime, b, {}).status, 'HOLD_STALE_BASE');
  } finally { cleanup(x.d); }
});

test('rollback accepts only real ancestors; preserved sibling generations do not become rollback targets', () => {
  const x = setup();
  try {
    const g0 = Flow.currentHead(x.runtime).generation_sha256;
    const p1 = Flow.planMutation(x.runtime, { selectors: ['morphtile:tile/region_1/part_0'] });
    const s1 = Flow.stageGeneration(x.runtime, p1, {
      'cold:region_1': { artifact_sha256: MT.hashOf({ branch: 'a-region' }), route: 'cold-region-rewrite' },
      'world:live': { artifact_sha256: MT.hashOf({ branch: 'a-world' }), route: 'world-live-hash' },
    });
    Flow.commitGeneration(x.runtime, s1); const branchA = Flow.currentHead(x.runtime).generation_sha256;
    assert.equal(Flow.rollback(x.runtime, g0).status, 'ROLLED_BACK');

    const p2 = Flow.planMutation(x.runtime, { selectors: ['morphtile:tile/region_2/part_0'] });
    const s2 = Flow.stageGeneration(x.runtime, p2, {
      'cold:region_2': { artifact_sha256: MT.hashOf({ branch: 'b-region' }), route: 'cold-region-rewrite' },
      'world:live': { artifact_sha256: MT.hashOf({ branch: 'b-world' }), route: 'world-live-hash' },
    });
    Flow.commitGeneration(x.runtime, s2);
    assert.equal(Flow.rollback(x.runtime, branchA).status, 'HOLD_TARGET_NOT_ANCESTOR');
    assert.equal(Flow.rollback(x.runtime, g0).status, 'ROLLED_BACK');
  } finally { cleanup(x.d); }
});

test('export/import rejects tampered generation evidence and preserves exact receipts', () => {
  const x = setup();
  try {
    const exported = Flow.exportRuntime(x.runtime);
    const resumed = Flow.importRuntime(JSON.parse(JSON.stringify(exported)));
    assert.equal(Flow.currentHead(resumed).generation_sha256, Flow.currentHead(x.runtime).generation_sha256);

    const tampered = JSON.parse(JSON.stringify(exported));
    tampered.generations[tampered.current_generation_sha256].contracts['cold:region_0'].representation = 'invented';
    assert.throws(() => Flow.importRuntime(tampered), /hash mismatch/);
  } finally { cleanup(x.d); }
});
