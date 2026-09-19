'use strict';

const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), child = require('node:child_process'), { performance } = require('node:perf_hooks');
const MT = require('../core/morphtile.js'), Cold = require('../experimental/cold-matter.js');
const ROOT = path.resolve(__dirname, '..'), evidence = path.join(ROOT, 'evidence', 'cold-matter-measurement.json');
const measure = () => { if (global.gc) global.gc(); const m = process.memoryUsage(); return { rss_bytes: m.rss, heap_used_bytes: m.heapUsed, heap_total_bytes: m.heapTotal, external_bytes: m.external }; };
const duration = (start) => Math.round((performance.now() - start) * 1000) / 1000;

function makeWorld(regions, parts) {
  const w = MT.createWorld('Cold matter measurement world');
  for (let r = 0; r < regions; r++) {
    const root = MT.createTile({ id: 'region_' + r, name: 'Region ' + r, facets: { connect: { sockets: [], bridges: [], place: [(r % 12) * 3, 0, Math.floor(r / 12) * 3] } } });
    root.facets.mesh = { type: 'interior', source: null, data: {} }; root.interior = { tiles: {}, edges: {}, ports: [] };
    for (let i = 0; i < parts; i++) root.interior.tiles['part_' + i] = MT.createTile({ id: 'part_' + i, name: 'Part ' + i,
      facets: { connect: { sockets: [], bridges: [], place: [(i % 6) * 0.28, Math.floor(i / 6) * 0.28, 0] }, mesh: { type: 'primitive', source: null, data: { shape: 'box', size: [0.2, 0.2, 0.2] } } } });
    root.provenance.sha256 = MT.contentHash(root); w.tiles[root.id] = root;
  }
  const selected = Math.min(42, regions - 1); w.vars['region_' + selected + '/part_3'] = { damage: 1, note: 'must survive cold storage' };
  return { world: w, selected };
}

function sample(regions, parts) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'morphtile-cold-measure-'));
  try {
    const baseline = measure(), started = performance.now(), made = makeWorld(regions, parts); let world = made.world; const construction_ms = duration(started);
    const expected = { live_hash: MT.hashOf(world), struct_hash: MT.structHash(world), tiles: MT.countTiles(world) };
    const preserved_state_bytes = Buffer.byteLength(MT.canonical({ vars: world.vars, awake: world.awake || {} }));
    const renderStart = performance.now(); let frame = MT.renderAsset(world, { width: 48, height: 48, camera: { yaw: 0.7, pitch: 0.4, dist: 60, target: [16, 1, 13] } });
    const realization_ms = duration(renderStart), realization = { rendered_tiles: frame.stats.tiles, triangles: frame.stats.tris, holds: frame.stats.holds.length }, fully_realized = measure();
    frame = null; const cleared = MT.clearRuntimeCaches(), warm_canonical = measure();
    const freezeStart = performance.now(), frozen = Cold.freezeWorld(world, directory), freeze_ms = duration(freezeStart);
    const files = fs.readdirSync(directory), storage_bytes = files.reduce((n, f) => n + fs.statSync(path.join(directory, f)).size, 0);
    world = null; const handle = Cold.openColdWorld(directory), cold_index_only = measure(), root = 'region_' + made.selected;
    const wakeStart = performance.now(), wake = Cold.wakeRegion(handle, root), wake_region_ms = duration(wakeStart), one_region_awake = measure();
    const mutation_preserved = MT.canonical(handle.world.vars[root + '/part_3']) === MT.canonical({ damage: 1, note: 'must survive cold storage' });
    const unrelated_regions_resident_after_one_wake = Object.keys(handle.world.tiles).filter((k) => k !== root);
    const allStart = performance.now(), all = Cold.wakeAll(handle), wake_all_ms = duration(allStart), restored = { live_hash: MT.hashOf(handle.world), struct_hash: MT.structHash(handle.world), tiles: MT.countTiles(handle.world) }, all_awake = measure();
    return {
      input: { regions, parts_per_region: parts, expected, preserved_state_bytes }, realization,
      timings_ms: { construction: construction_ms, full_realization: realization_ms, freeze: freeze_ms, wake_one_region: wake_region_ms, wake_all: wake_all_ms },
      memory: { baseline, fully_realized, warm_canonical, cold_index_only, one_region_awake, all_awake,
        heap_delta_full_to_warm_bytes: warm_canonical.heap_used_bytes - fully_realized.heap_used_bytes,
        heap_delta_full_to_cold_bytes: cold_index_only.heap_used_bytes - fully_realized.heap_used_bytes,
        rss_delta_full_to_warm_bytes: warm_canonical.rss_bytes - fully_realized.rss_bytes,
        rss_delta_full_to_cold_bytes: cold_index_only.rss_bytes - fully_realized.rss_bytes },
      storage: { bytes: storage_bytes, region_files: frozen.manifest.entries.length }, runtime_products: { mesh_cache_entries_cleared: cleared.cleared },
      verification: { cold_open_status: handle.status, one_region_status: wake.status, unrelated_regions_resident_after_one_wake, mutation_preserved,
        all_status: all.status, restored, exact_live_hash: restored.live_hash === expected.live_hash, exact_struct_hash: restored.struct_hash === expected.struct_hash, exact_tile_count: restored.tiles === expected.tiles }
    };
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

function boundary(samples, field) {
  const first = samples.find((s) => s.memory[field] >= 0);
  return first ? { first_non_beneficial_tested_scale_tiles: first.input.expected.tiles, delta_bytes: first.memory[field] } : { not_observed_through_tested_scale_tiles: samples[samples.length - 1].input.expected.tiles };
}

if (process.argv[2] === '--sample') {
  process.stdout.write(JSON.stringify(sample(Number(process.argv[3]), Number(process.argv[4]))));
} else {
  const scales = [24, 60, 120], parts = 24;
  const samples = scales.map((regions) => JSON.parse(child.execFileSync(process.execPath, ['--expose-gc', __filename, '--sample', String(regions), String(parts)], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })));
  const report = {
    format: 'morphtile-cold-memory-measurement', version: '0.2', measured_at: new Date().toISOString(),
    runtime: { node: process.version, platform: process.platform, arch: process.arch, gc_exposed_in_samples: true, isolated_process_per_scale: true }, samples,
    observed_boundaries: { heap_full_to_cold: boundary(samples, 'heap_delta_full_to_cold_bytes'), rss_full_to_cold: boundary(samples, 'rss_delta_full_to_cold_bytes') },
    truth_boundary: 'Three synthetic deterministic scales, each in a fresh Node process. Heap/RSS include runtime and allocator noise; negative and positive deltas are preserved. This measures local-file eviction, warm cache clearing and selective reconstruction, not universal hardware behavior.'
  };
  fs.writeFileSync(evidence, JSON.stringify(report, null, 2) + '\n');
  const summary = samples.map((s) => ({ tiles: s.input.expected.tiles, triangles: s.realization.triangles, heap_full_to_warm: s.memory.heap_delta_full_to_warm_bytes, heap_full_to_cold: s.memory.heap_delta_full_to_cold_bytes, rss_full_to_cold: s.memory.rss_delta_full_to_cold_bytes, wake_one_ms: s.timings_ms.wake_one_region, exact: s.verification.exact_live_hash && s.verification.exact_struct_hash && s.verification.exact_tile_count, unrelated_resident: s.verification.unrelated_regions_resident_after_one_wake.length }));
  console.log(JSON.stringify({ evidence, samples: summary, observed_boundaries: report.observed_boundaries }, null, 2));
  if (samples.some((s) => !s.verification.mutation_preserved || s.verification.all_status !== 'ALL_AWAKE' || !s.verification.exact_live_hash || !s.verification.exact_struct_hash || !s.verification.exact_tile_count || s.verification.unrelated_regions_resident_after_one_wake.length)) process.exitCode = 1;
}
