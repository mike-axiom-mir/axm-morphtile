'use strict';

// Node-side experimental storage layer. MorphTile core stays host-neutral; this module exchanges
// resident canonical structures for hash-verified local payloads and reconstructs them on demand.
const fs = require('node:fs'), path = require('node:path');
const MT = require('../core/morphtile.js');

const MANIFEST = 'cold-manifest.json';
const stableWrite = (file, value) => {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, file);
};
const stateFor = (table, ids) => Object.fromEntries(Object.keys(table || {}).filter((k) => ids.some((id) => k === id || k.startsWith(id + '/'))).sort().map((k) => [k, MT.clone(table[k])]));

function collectRegionIds(world, root) {
  if (!world.tiles[root]) throw new Error('no top-level region ' + root);
  const found = [], seen = new Set(), walk = (id) => { if (seen.has(id)) return; seen.add(id); found.push(id); for (const child of MT.childrenOf(world, id)) walk(child); };
  walk(root); return found.sort();
}

function regionPayload(world, root) {
  const ids = collectRegionIds(world, root), set = new Set(ids), tiles = {}, edges = {}, defs = {}, words = {};
  for (const id of ids) {
    tiles[id] = MT.clone(world.tiles[id]);
    const need = MT.needsOf(world, world.tiles[id]);
    for (const k of Object.keys(need.defs)) if (need.defs[k]) defs[k] = MT.clone(need.defs[k]);
    for (const k of Object.keys(need.words)) if (need.words[k]) words[k] = MT.clone(need.words[k]);
  }
  for (const k of Object.keys(world.edges).sort()) { const e = world.edges[k]; if (set.has(e.from.tile) && set.has(e.to.tile)) edges[k] = MT.clone(e); }
  return { format: 'morphtile-cold-region', version: '0.1', root, ids, tiles, edges, defs, words,
    vars: stateFor(world.vars, ids), awake: stateFor(world.awake, ids), time: world.time, tile_count: ids.reduce((n, id) => n + MT.countTiles({ tiles: { [id]: world.tiles[id] }, edges: {} }), 0) };
}

function manifestBody(world, entries) {
  return { format: 'morphtile-cold-world', version: '0.1', world: { kind: world.kind, version: world.version, name: world.name, spatial_root: MT.clone(world.spatial_root), time: world.time },
    entries, edges: MT.clone(world.edges), expect: { struct_hash: MT.structHash(world), live_hash: MT.hashOf(world), tiles: MT.countTiles(world) } };
}

function writeManifest(directory, body) {
  const out = MT.clone(body); out.expect.manifest_sha256 = MT.hashOf(body); stableWrite(path.join(directory, MANIFEST), out); return out;
}

function freezeWorld(world, directory) {
  if (!world || !MT.validateWorld(world).ok) throw new Error('freeze requires a valid MorphTile world');
  fs.mkdirSync(directory, { recursive: true });
  const occupied = fs.readdirSync(directory).filter((x) => x !== '.gitkeep');
  if (occupied.length) throw new Error('cold directory must be empty');
  const entries = [];
  for (const root of MT.rootsOf(world)) {
    const payload = regionPayload(world, root), file = 'region-' + root + '.json', sha256 = MT.hashOf(payload);
    stableWrite(path.join(directory, file), payload);
    entries.push({ root, file, sha256, tile_count: payload.tile_count, state_keys: Object.keys(payload.vars).length, awake_keys: Object.keys(payload.awake).length });
  }
  const manifest = writeManifest(directory, manifestBody(world, entries));
  return { status: 'COLD_STORED', directory, manifest, index: entries.map((e) => ({ root: e.root, sha256: e.sha256, tile_count: e.tile_count })) };
}

function openColdWorld(directory) {
  const file = path.join(directory, MANIFEST);
  if (!fs.existsSync(file)) return { status: 'HOLD_MISSING_MANIFEST', directory };
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { status: 'HOLD_INVALID_MANIFEST', directory, detail: e.message }; }
  const claimed = manifest.expect && manifest.expect.manifest_sha256, body = MT.clone(manifest); if (body.expect) delete body.expect.manifest_sha256;
  if (!claimed || claimed !== MT.hashOf(body)) return { status: 'HOLD_MANIFEST_HASH_MISMATCH', directory, claimed, observed: MT.hashOf(body) };
  const world = MT.createWorld(manifest.world.name); world.version = manifest.world.version; world.spatial_root = MT.clone(manifest.world.spatial_root); world.time = manifest.world.time;
  return { status: 'COLD_READY', directory, manifest, world, loaded: new Map() };
}

function readRegion(handle, root) {
  const entry = (handle.manifest.entries || []).find((e) => e.root === root);
  if (!entry) return { status: 'HOLD_UNKNOWN_REGION', root };
  const file = path.join(handle.directory, entry.file);
  if (!fs.existsSync(file)) return { status: 'HOLD_MISSING_REGION', root, file: entry.file };
  let payload;
  try { payload = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return { status: 'HOLD_INVALID_REGION', root, detail: e.message }; }
  const observed = MT.hashOf(payload);
  if (observed !== entry.sha256) return { status: 'HOLD_REGION_HASH_MISMATCH', root, claimed: entry.sha256, observed };
  return { status: 'VERIFIED_REGION', entry, payload };
}

function addDependencies(world, payload) {
  if (Object.keys(payload.words || {}).length) world.words = world.words || {};
  world.defs = world.defs || {};
  for (const k of Object.keys(payload.words || {}).sort()) {
    if (world.words[k] && MT.canonical(world.words[k]) !== MT.canonical(payload.words[k])) throw new Error('word conflict ' + k);
    world.words[k] = MT.clone(payload.words[k]);
  }
  for (const k of Object.keys(payload.defs || {}).sort()) {
    if (world.defs[k] && MT.canonical(world.defs[k]) !== MT.canonical(payload.defs[k])) throw new Error('definition conflict ' + k);
    world.defs[k] = MT.clone(payload.defs[k]);
  }
}

function connectLoaded(handle) {
  for (const k of Object.keys(handle.manifest.edges || {}).sort()) {
    const e = handle.manifest.edges[k];
    if (!handle.world.edges[k] && handle.world.tiles[e.from.tile] && handle.world.tiles[e.to.tile]) MT.applyStructOp(handle.world, { op: 'edge.add', edge: e });
  }
}

function wakeRegion(handle, root) {
  if (!handle || handle.status !== 'COLD_READY') return { status: 'HOLD_NOT_OPEN' };
  if (handle.loaded.has(root)) return handle.loaded.get(root).mode === 'full' ? { status: 'ALREADY_AWAKE', root, tile_count: MT.countTiles(handle.world) } : { status: 'HOLD_PARTIAL_REGION_AWAKE', root, path: handle.loaded.get(root).path };
  const read = readRegion(handle, root); if (read.status !== 'VERIFIED_REGION') return read;
  const before = MT.clone(handle.world);
  try {
    addDependencies(handle.world, read.payload);
    for (const id of read.payload.ids) {
      if (handle.world.tiles[id]) throw new Error('tile conflict ' + id);
      MT.applyStructOp(handle.world, { op: 'tile.add', tile: read.payload.tiles[id] });
    }
    for (const k of Object.keys(read.payload.edges || {}).sort()) MT.applyStructOp(handle.world, { op: 'edge.add', edge: read.payload.edges[k] });
    Object.assign(handle.world.vars, MT.clone(read.payload.vars || {}));
    if (Object.keys(read.payload.awake || {}).length) Object.assign((handle.world.awake = handle.world.awake || {}), MT.clone(read.payload.awake));
    connectLoaded(handle);
    const valid = MT.validateWorld(handle.world); if (!valid.ok) throw new Error(valid.errors.join('; '));
  } catch (e) { handle.world = before; return { status: 'HOLD_WAKE_FAILED', root, detail: e.message }; }
  handle.loaded.set(root, { mode: 'full', path: root });
  return { status: 'AWAKE_VERIFIED', root, region_sha256: read.entry.sha256, tile_count: read.payload.tile_count, resident_tiles: MT.countTiles(handle.world) };
}

function pruneDependencies(world) {
  const defs = {}, words = {};
  for (const id of Object.keys(world.tiles)) { const n = MT.needsOf(world, world.tiles[id]); for (const k of Object.keys(n.defs)) if (n.defs[k]) defs[k] = n.defs[k]; for (const k of Object.keys(n.words)) if (n.words[k]) words[k] = n.words[k]; }
  world.defs = MT.clone(defs); if (Object.keys(words).length) world.words = MT.clone(words); else delete world.words;
}

function sleepRegion(handle, root) {
  if (!handle.loaded.has(root)) return { status: 'ALREADY_COLD', root };
  if (handle.loaded.get(root).mode !== 'full') return { status: 'HOLD_PARTIAL_REGION_AWAKE', root, path: handle.loaded.get(root).path };
  let payload;
  try { payload = regionPayload(handle.world, root); } catch (e) { return { status: 'HOLD_SLEEP_FAILED', root, detail: e.message }; }
  const entry = handle.manifest.entries.find((e) => e.root === root), file = path.join(handle.directory, entry.file);
  entry.sha256 = MT.hashOf(payload); entry.tile_count = payload.tile_count; entry.state_keys = Object.keys(payload.vars).length; entry.awake_keys = Object.keys(payload.awake).length;
  stableWrite(file, payload);
  const ids = new Set(payload.ids);
  for (const k of Object.keys(handle.world.edges)) { const e = handle.world.edges[k]; if (ids.has(e.from.tile) || ids.has(e.to.tile)) delete handle.world.edges[k]; }
  for (const id of payload.ids) delete handle.world.tiles[id];
  for (const table of [handle.world.vars, handle.world.awake || {}]) for (const k of Object.keys(table)) if (payload.ids.some((id) => k === id || k.startsWith(id + '/'))) delete table[k];
  handle.loaded.delete(root); pruneDependencies(handle.world);
  writeManifest(handle.directory, Object.assign({}, handle.manifest, { expect: Object.assign({}, handle.manifest.expect, { manifest_sha256: undefined }) }));
  handle.manifest = JSON.parse(fs.readFileSync(path.join(handle.directory, MANIFEST), 'utf8'));
  return { status: 'COLD_STORED', root, region_sha256: entry.sha256, resident_tiles: MT.countTiles(handle.world) };
}

function wakeAll(handle) { const receipts = []; for (const e of handle.manifest.entries) receipts.push(wakeRegion(handle, e.root)); return { status: receipts.every((r) => r.status === 'AWAKE_VERIFIED' || r.status === 'ALREADY_AWAKE') ? 'ALL_AWAKE' : 'HOLD_PARTIAL_WAKE', receipts }; }

function nestedTile(tile, segments) { let t = tile; for (const seg of segments) { t = t && t.interior && t.interior.tiles[seg]; if (!t) return null; } return t; }
function slicedRoot(tile, segments) {
  const root = MT.clone(tile); let source = tile, target = root;
  for (const seg of segments) {
    const child = source.interior && source.interior.tiles[seg]; if (!child) return null;
    const ports = (source.interior.ports || []).filter((p) => p.tile === seg), portIds = new Set(ports.map((p) => p.id));
    target.interior = { tiles: { [seg]: MT.clone(child) }, edges: {}, ports: MT.clone(ports) };
    for (const k of Object.keys(source.interior.edges || {})) { const e = source.interior.edges[k]; if (e.from.tile === seg && e.to.tile === seg) target.interior.edges[k] = MT.clone(e); }
    target.facets.connect.sockets = (target.facets.connect.sockets || []).filter((s) => !s.port || portIds.has(s.id));
    target.provenance.sha256 = MT.contentHash(target); source = child; target = target.interior.tiles[seg];
  }
  return root;
}
function ancestorPaths(fullPath) { const parts = fullPath.split('/'), out = []; for (let i = 1; i <= parts.length; i++) out.push(parts.slice(0, i).join('/')); return out; }
function stateForSubtree(table, fullPath) {
  const ancestors = new Set(ancestorPaths(fullPath));
  return Object.fromEntries(Object.keys(table || {}).filter((k) => ancestors.has(k) || k.startsWith(fullPath + '/')).sort().map((k) => [k, MT.clone(table[k])]));
}

function wakeSubtree(handle, fullPath) {
  const parts = String(fullPath || '').split('/').filter(Boolean), root = parts.shift();
  if (!root || !parts.length) return { status: 'HOLD_SUBTREE_PATH_REQUIRED', path: fullPath };
  if (handle.loaded.has(root)) return { status: 'HOLD_REGION_ALREADY_AWAKE', root, path: handle.loaded.get(root).path };
  const read = readRegion(handle, root); if (read.status !== 'VERIFIED_REGION') return read;
  const source = read.payload.tiles[root], target = nestedTile(source, parts); if (!target) return { status: 'HOLD_UNKNOWN_SUBTREE', path: fullPath };
  const tile = slicedRoot(source, parts), before = MT.clone(handle.world);
  try {
    addDependencies(handle.world, read.payload); MT.applyStructOp(handle.world, { op: 'tile.add', tile });
    Object.assign(handle.world.vars, stateForSubtree(read.payload.vars, fullPath));
    const awake = stateForSubtree(read.payload.awake, fullPath); if (Object.keys(awake).length) Object.assign((handle.world.awake = handle.world.awake || {}), awake);
    const valid = MT.validateWorld(handle.world); if (!valid.ok) throw new Error(valid.errors.join('; '));
  } catch (e) { handle.world = before; return { status: 'HOLD_WAKE_FAILED', path: fullPath, detail: e.message }; }
  handle.loaded.set(root, { mode: 'subtree', path: fullPath });
  return { status: 'SUBTREE_AWAKE_VERIFIED', root, path: fullPath, resident_tiles: MT.countTiles(handle.world), target_tiles: MT.countTiles({ tiles: { [target.id]: target }, edges: {} }) };
}

function replaceNested(rootTile, segments, replacement) {
  let t = rootTile; for (let i = 0; i < segments.length - 1; i++) { t = t.interior && t.interior.tiles[segments[i]]; if (!t) return false; }
  const key = segments[segments.length - 1]; if (!t.interior || !t.interior.tiles[key]) return false; t.interior.tiles[key] = MT.clone(replacement); return true;
}
function sleepSubtree(handle, fullPath) {
  const parts = String(fullPath || '').split('/').filter(Boolean), root = parts.shift(), loaded = handle.loaded.get(root);
  if (!loaded || loaded.mode !== 'subtree' || loaded.path !== fullPath) return { status: 'HOLD_SUBTREE_NOT_AWAKE', path: fullPath };
  const read = readRegion(handle, root); if (read.status !== 'VERIFIED_REGION') return read;
  const resident = nestedTile(handle.world.tiles[root], parts); if (!resident) return { status: 'HOLD_SUBTREE_NOT_RESIDENT', path: fullPath };
  if (!replaceNested(read.payload.tiles[root], parts, resident)) return { status: 'HOLD_UNKNOWN_SUBTREE', path: fullPath };
  for (const k of Object.keys(read.payload.vars || {})) if (k === fullPath || k.startsWith(fullPath + '/')) delete read.payload.vars[k];
  Object.assign(read.payload.vars, stateForSubtree(handle.world.vars, fullPath));
  for (const k of Object.keys(read.payload.awake || {})) if (k === fullPath || k.startsWith(fullPath + '/')) delete read.payload.awake[k];
  Object.assign(read.payload.awake, stateForSubtree(handle.world.awake, fullPath));
  const entry = read.entry; entry.sha256 = MT.hashOf(read.payload); stableWrite(path.join(handle.directory, entry.file), read.payload);
  delete handle.world.tiles[root]; for (const k of Object.keys(handle.world.vars)) if (k === root || k.startsWith(root + '/')) delete handle.world.vars[k];
  for (const k of Object.keys(handle.world.awake || {})) if (k === root || k.startsWith(root + '/')) delete handle.world.awake[k];
  handle.loaded.delete(root); pruneDependencies(handle.world);
  writeManifest(handle.directory, Object.assign({}, handle.manifest, { expect: Object.assign({}, handle.manifest.expect, { manifest_sha256: undefined }) }));
  handle.manifest = JSON.parse(fs.readFileSync(path.join(handle.directory, MANIFEST), 'utf8'));
  return { status: 'SUBTREE_COLD_STORED', path: fullPath, region_sha256: entry.sha256, resident_tiles: MT.countTiles(handle.world) };
}

module.exports = { freezeWorld, openColdWorld, wakeRegion, sleepRegion, wakeSubtree, sleepSubtree, wakeAll, collectRegionIds, regionPayload };
