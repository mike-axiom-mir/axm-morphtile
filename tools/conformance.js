// Generates conformance/vectors.json: small worlds plus what any correct implementation must produce for them.
// Numbers are rounded before hashing, and nothing that depends on trig rounding is included, so the vectors
// are checkable across languages and engines rather than only in this one.
const MT = require('../core/morphtile.js'), fs = require('fs'), path = require('path');
const round = (v, p) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);
const geomHash = (m) => MT.hashOf({ parts: m.recipe_parts || null, hold: m.hold || null, tris: m.T.length, points: Array.from(m.P).map((x) => round(x)), tint: Array.from(m.T).map((x) => round(x)), colors: m.K.map((c) => (c ? c.map(round) : null)) });

const cases = [];
function add(name, note, build) { const c = { name, note }; build(c); cases.push(c); }

add('seed-world', 'The world the workshop starts from: structure, validity and every tile\u2019s content hash.', (c) => {
  const w = MT.seedWorld();
  c.world = w;
  c.expect = { valid: true, struct_hash: MT.structHash(w), tiles: MT.countTiles(w), roots: MT.rootsOf(w), content: Object.keys(w.tiles).sort().map((id) => ({ id, sha256: w.tiles[id].provenance.sha256 })) };
});
add('signals-and-state', 'A signal travelling the graph, and closed-form state after six offline hours.', (c) => {
  const ws = MT.createWorkspace(MT.seedWorld());
  c.world = MT.clone(ws.ledger.genesis);
  c.events = [{ type: 'signal', tile: 'mt_switch', name: 'press' }, { type: 'tick', t: 21600 }, { type: 'signal', tile: 'mt_rover', name: 'drive' }, { type: 'tick', t: 21660 }];
  for (const ev of c.events) MT.act(ws, ev.type === 'tick' ? { do: 'tick', to: ev.t } : { do: 'signal', tile: ev.tile, name: ev.name });
  c.expect = { vars: ws.live.vars, time: ws.live.time, world_hash: MT.hashOf(ws.live), simulation_steps: 0,
    read: { 'mt_core.stored': MT.readVars(ws.live, 'mt_core', ws.live.time).stored, 'mt_wheel_rr.turns': MT.readVars(ws.live, 'mt_wheel_rr', ws.live.time).turns } };
});
add('depth-collapse', 'Collapsing tiles into one and expanding again must be exactly reversible, state included.', (c) => {
  const ws = MT.createWorkspace(MT.seedWorld());
  MT.act(ws, { do: 'signal', tile: 'mt_switch', name: 'press' }); MT.act(ws, { do: 'tick', to: 40 });
  c.world = MT.clone(ws.live);
  const before = { struct: MT.structHash(ws.live), vars: MT.canonical(ws.live.vars) };
  const cid = MT.cloneBody(ws); MT.editCandidate(ws, cid, { op: 'tile.collapse', ids: ['mt_tower', 'mt_core'], id: 'mt_asm', name: 'Beacon assembly' });
  MT.commitPlan(ws, MT.planMerge(ws, [cid]).id);
  c.ops = [{ op: 'tile.collapse', ids: ['mt_tower', 'mt_core'], id: 'mt_asm', name: 'Beacon assembly' }];
  c.expect = { after_collapse: { struct_hash: MT.structHash(ws.live), tiles: MT.countTiles(ws.live), beacon_at: 'mt_asm/mt_tower', beacon: MT.readVars(ws.live, 'mt_asm/mt_tower', 40).beacon },
    after_expand: { struct_hash: before.struct, vars: JSON.parse(before.vars) } };
});
add('recipe-shapes', 'Shapes described as matter: the geometry a recipe must produce, point for point.', (c) => {
  const w = MT.createWorld('Recipes');
  for (const k of ['spiral', 'lattice', 'tower', 'island']) w.tiles['mt_' + k.replace(/\W/g, '')] = MT.createTile({ id: 'mt_' + k.replace(/\W/g, ''), name: k, form_hints: ['game_asset'], facets: { mesh: MT.PRESETS.mesh[k] } });
  c.world = w;
  c.expect = { geometry: Object.keys(w.tiles).sort().map((id) => ({ id, parts: MT.compileMesh(w.tiles[id]).recipe_parts || null, sha256: geomHash(MT.compileMesh(w.tiles[id])) })) };
});
add('composed-and-painted', 'A shape made of another shape, at two settings, painted by position and by surface direction.', (c) => {
  const w = MT.createWorld('Composed');
  w.words = { ease: { name: 'ease', args: ['x'], body: ['*', ['var', 'x'], ['var', 'x']] } };
  w.defs = { def_s: { id: 'def_s', name: 'Spiral', body: { facets: { mesh: MT.PRESETS.mesh.spiral, material: { type: 'primitive', source: null, data: { color: [0.7, 0.7, 0.9] } } } } } };
  w.tiles.mt_row = MT.createTile({ id: 'mt_row', name: 'Row', form_hints: ['game_asset'], facets: { mesh: { type: 'generated', source: null, data: { generator: 'recipe', vars: { gap: 3 }, parts: [
    { use: 'def_s', pos: [0, 0, 0], with: { rungs: 6 } }, { use: 'def_s', pos: [['*', 2, ['ease', ['var', 'gap']]], 0, 0], with: { rungs: 9 } }] } } } });
  w.tiles.mt_ground = MT.createTile({ id: 'mt_ground', name: 'Ground', form_hints: ['game_asset'], facets: { mesh: MT.PRESETS.mesh.island, material: MT.PRESETS.material['painted: ground'] } });
  w.tiles.mt_grad = MT.createTile({ id: 'mt_grad', name: 'Gradient', form_hints: ['game_asset'], facets: { mesh: MT.PRESETS.mesh.tower, material: MT.PRESETS.material['painted: height gradient'] } });
  c.world = w;
  c.expect = { geometry: ['mt_grad', 'mt_ground', 'mt_row'].map((id) => ({ id, parts: MT.compileMesh(w.tiles[id], w).recipe_parts || null, sha256: geomHash(MT.compileMesh(w.tiles[id], w)) })) };
});
add('sleeping-capability', 'A capability asleep in a node costs nothing; waking it changes state, never matter.', (c) => {
  const w = MT.seedWorld();
  w.tiles.mt_switch.capabilities = [{ id: 'bay', name: 'Bay', wake: { on: 'signal', name: 'open' }, grants: { sockets: [{ id: 'open', kind: 'signal', dir: 'in', signal: 'open' }],
    interior: { ports: [], edges: {}, tiles: { mt_arm: MT.createTile({ id: 'mt_arm', name: 'Arm', form_hints: ['game_asset'], facets: { mesh: { type: 'primitive', source: null, data: { shape: 'cylinder', size: [0.3, 1.4, 0.3] } } } }) } } } }];
  w.tiles.mt_switch.provenance.sha256 = MT.contentHash(w.tiles.mt_switch);
  c.world = w;
  const matter = MT.hashOf({ tiles: w.tiles, edges: w.edges });
  const ws = MT.createWorkspace(w); MT.act(ws, { do: 'signal', tile: 'mt_switch', name: 'open' });
  c.events = [{ type: 'signal', tile: 'mt_switch', name: 'open' }];
  c.expect = { asleep: { tiles: MT.countTiles(w), matter_hash: matter }, awake: { tiles: MT.countTiles(ws.live), matter_hash: MT.hashOf({ tiles: ws.live.tiles, edges: ws.live.edges }), awake_state: ws.live.awake } };
});
add('text-round-trip', 'Writing a world out as text and reading it back must change nothing.', (c) => {
  const w = MT.seedWorld();
  c.world = w; c.text = MT.toText(w);
  c.expect = { ops_on_read_back: 0, struct_hash: MT.structHash(w) };
});

const out = { format: 'morphtile-conformance', version: '0.4', engine: MT.VERSION, generated: '2026-09-19',
  note: 'Each case gives a world (and events or ops) and what a correct implementation must produce. Geometry hashes are over coordinates rounded to six decimals. Nothing here depends on trigonometry, so results are comparable across languages.', cases };
fs.mkdirSync(path.join(__dirname, '../conformance'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '../conformance/vectors.json'), JSON.stringify(out, null, 1));
console.log('conformance/vectors.json', cases.length, 'cases,', (JSON.stringify(out).length / 1024).toFixed(0) + ' kB');
