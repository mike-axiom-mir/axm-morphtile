const test = require('node:test'), assert = require('node:assert');
const MT = require('../core/morphtile.js');

const commit = (ws, ops) => { const c = MT.cloneBody(ws); for (const op of ops) { const r = MT.editCandidate(ws, c, op); assert.ok(r.ok, r.error); } return MT.commitPlan(ws, MT.planMerge(ws, [c]).id).receipt; };

test('presentation placement is canonical matter and session movement stays outside it', () => {
  const ws = MT.createWorkspace(MT.seedWorld()), descriptor = { mode: 'docked', dock: 'right', preferred_size: [360, 480], preferred_position: [0, 0], user_adjustable: true };
  const rc = commit(ws, [{ op: 'presentation.set', id: 'mt_tower', presentation: descriptor }]);
  assert.deepEqual(rc.units.map((u) => u.key), ['tile:mt_tower#presentation']);
  const before = MT.hashOf(ws.live), p = MT.resolvePresentation(ws.live, 'mt_tower', { session_presentations: { mt_tower: { dock: 'left', preferred_position: [24, 12] } } });
  assert.equal(p.status, 'READY'); assert.equal(p.resolved.dock, 'left'); assert.equal(p.session_applied, true); assert.equal(MT.hashOf(ws.live), before);
  const html = MT.vnodeToHTML(MT.compilePanel(ws.live, { session_presentations: { mt_tower: { dock: 'left' } } }).root);
  assert.match(html, /mt-p-docked mt-dock-left/); assert.match(html, /session adjusted/);
});

test('world and tile anchored presentations resolve against real frames and missing anchors hold visibly', () => {
  const ws = MT.createWorkspace(MT.seedWorld());
  commit(ws, [{ op: 'presentation.set', id: 'mt_tower', presentation: { mode: 'tile', anchor: 'mt_island', preferred_size: [320, 240], user_adjustable: false } }]);
  const p = MT.resolvePresentation(ws.live, 'mt_tower'); assert.equal(p.status, 'READY'); assert.equal(p.anchor_frame.anchor, 'mt_island');
  commit(ws, [{ op: 'presentation.set', id: 'mt_tower', presentation: { mode: 'tile', anchor: 'mt_missing', user_adjustable: false } }]);
  const held = MT.resolvePresentation(ws.live, 'mt_tower'); assert.equal(held.status, 'HOLD_MISSING_PRESENTATION_ANCHOR');
  assert.match(MT.vnodeToHTML(MT.compilePanel(ws.live).root), /HOLD_MISSING_PRESENTATION_ANCHOR/);
});

test('presentation matter survives text, workspace and destination-placed kit transport', () => {
  const ws = MT.createWorkspace(MT.seedWorld()), descriptor = { mode: 'floating', preferred_size: [420, 260], preferred_position: [12, 18], user_adjustable: true };
  commit(ws, [{ op: 'presentation.set', id: 'mt_tower', presentation: descriptor }]);
  const text = MT.toText(ws.live); assert.match(text, /^  presentation \{/m); assert.deepEqual(MT.fromText(ws.live, text).ops, []);
  const back = MT.importWorkspace(JSON.parse(JSON.stringify(MT.exportWorkspace(ws)))); assert.deepEqual(back.live.tiles.mt_tower.presentation, descriptor);
  const other = MT.createWorld('Elsewhere'), r = MT.importKit(other, MT.exportKit(ws.live, 'mt_tower'), { place: [8, 0, 9] });
  for (const op of r.ops) MT.applyStructOp(other, op);
  assert.deepEqual(other.tiles.mt_tower.presentation, descriptor); assert.deepEqual(other.tiles.mt_tower.facets.connect.place, [8, 0, 9]);
});

test('unsupported host presentation modes hold without changing canonical meaning', () => {
  const w = MT.seedWorld(); MT.applyStructOp(w, { op: 'presentation.set', id: 'mt_tower', presentation: { mode: 'world', preferred_position: [1, 2, 3], user_adjustable: false } });
  const h = MT.hashOf(w), p = MT.resolvePresentation(w, 'mt_tower', { presentation_modes: ['screen', 'docked'] });
  assert.equal(p.status, 'HOLD_UNSUPPORTED_PRESENTATION'); assert.equal(MT.hashOf(w), h);
});
