// Presentation as matter: a world can carry its own interface, and the engine's card is only a default.
const test = require('node:test'), assert = require('node:assert');
const MT = require('../core/morphtile.js');
const fresh = () => MT.createWorkspace(MT.seedWorld());
const commit = (ws, ops, by) => { const c = MT.cloneBody(ws, 'c', by); for (const op of ops) { const r = MT.editCandidate(ws, c, op); assert.ok(r.ok, op.op + ': ' + r.error); } const res = MT.commitPlan(ws, MT.planMerge(ws, [c]).id, by); assert.ok(res.ok, JSON.stringify(res)); return res.receipt; };
const html = (ws, opts) => MT.vnodeToHTML(MT.compilePanel(ws.live, opts).root);
const VIEW = { title: 'Beacon', accent: [1, 0.7, 0.25], body: [
  { text: 'The light on the hill', strong: true },
  { value: 'beacon', label: 'Lit' },
  { meter: ['var', 'beacon'], min: 0, max: 1, label: 'Brightness' },
  { row: [{ button: 'toggle', label: 'Switch it' }, { control: 'levels' }] },
  { when: ['==', ['var', 'beacon'], 1], text: 'Ships can see you' }] };

test('a tile can carry its own interface, and it is used instead of the engine\u2019s card', () => {
  const ws = fresh(), before = html(ws);
  assert.ok(/Beacon tower/.test(before) && !/is-view/.test(before), 'the default card first');
  const rc = commit(ws, [{ op: 'view.set', id: 'mt_tower', view: VIEW }]);
  const after = html(ws);
  assert.ok(/is-view/.test(after) && /The light on the hill/.test(after));
  assert.ok(/<h3>Beacon<\/h3>/.test(after), 'its own title, not the tile name');
  assert.ok(/v-meter/.test(after) && /data-bind="mt_tower\|beacon"/.test(after), 'its own readouts');
  assert.deepEqual(rc.units.map((u) => u.key), ['tile:mt_tower#view'], 'and a view is an ordinary merge unit');
  assert.ok(MT.rollback(ws, rc.rollback_token).exact); assert.equal(html(ws), before, 'rolling back restores the default exactly');
});
test('a written interface still addresses the real matter: its controls are the tile\u2019s own', () => {
  const ws = fresh(); commit(ws, [{ op: 'view.set', id: 'mt_tower', view: VIEW }]);
  const page = html(ws);
  assert.ok(/data-signal="mt_tower:toggle"/.test(page), 'the button is the tile\u2019s real signal');
  assert.ok(/data-param="mt_tower:levels"/.test(page), 'the slider is the tile\u2019s real control');
  const h0 = MT.hashOf(ws.live); html(ws); assert.equal(MT.hashOf(ws.live), h0, 'and reading the interface changes nothing');
  MT.act(ws, { do: 'signal', tile: 'mt_tower', name: 'toggle' });
  assert.equal(MT.readVars(ws.live, 'mt_tower', 0).beacon, 1);
  assert.ok(/Ships can see you/.test(html(ws)), 'what it shows follows what is true');
  MT.act(ws, { do: 'signal', tile: 'mt_tower', name: 'toggle' });
  assert.ok(!/Ships can see you/.test(html(ws)));
});
test('interfaces compose: one tile can present others, and a view that leans on itself says so', () => {
  const ws = fresh();
  commit(ws, [{ op: 'view.set', id: 'mt_tower', view: VIEW },
    { op: 'view.set', id: 'mt_switch', view: { title: 'Dock', body: [{ value: 'presses', label: 'Presses' }, { button: 'press' }] } },
    { op: 'tile.add', tile: MT.createTile({ id: 'mt_hud', name: 'Control room', form_hints: ['ui_panel'], view: { title: 'Skyhold', body: [
      { text: 'Everything that matters, in one place' }, { tile: 'mt_tower' }, { tile: 'mt_switch' }, { tile: 'mt_nowhere' }] } }) }]);
  const page = html(ws);
  assert.ok(/Skyhold/.test(page) && /v-embed/.test(page));
  assert.ok(/data-signal="mt_tower:toggle"/.test(page) && /data-signal="mt_switch:press"/.test(page), 'the embedded controls are still the real ones');
  assert.ok(/no tile called mt_nowhere/.test(page), 'and a missing one says so rather than vanishing');
  commit(ws, [{ op: 'view.set', id: 'mt_hud', view: { title: 'Loop', body: [{ tile: 'mt_hud' }] } }]);
  assert.ok(/leans on itself/.test(html(ws)), 'a view that shows itself is stopped, not spun');
});
test('an interface can be written over repeats and expressions, like everything else', () => {
  const ws = fresh();
  commit(ws, [{ op: 'view.set', id: 'mt_core', view: { title: ['if', ['>', ['var', 'stored'], 0], 'Charged core', 'Empty core'], body: [
    { meter: ['var', 'energy'], min: 0, max: 200, label: 'Energy' },
    { repeat: ['min', 5, ['floor', ['/', ['var', 'energy'], 20]]], as: 'i', body: [{ text: ['+', 'cell ', ['var', 'i']] }] },
    { button: 'surge', label: 'Harvest' }] } }]);
  assert.ok(/Empty core/.test(html(ws)));
  MT.act(ws, { do: 'tick', dt: 90 });
  const page = html(ws);
  assert.equal((page.match(/cell /g) || []).length, 4, 'the interface grew with the value');
  MT.act(ws, { do: 'signal', tile: 'mt_core', name: 'surge' });
  assert.ok(/Charged core/.test(html(ws)), 'and its title follows the matter too');
});
test('a view is matter: it travels by text, by file and by kit', () => {
  const ws = fresh(); commit(ws, [{ op: 'view.set', id: 'mt_tower', view: VIEW }]);
  assert.ok(/^\s+view \{/m.test(MT.toText(ws.live)), 'the text surface writes it out');
  assert.deepEqual(MT.fromText(ws.live, MT.toText(ws.live)).ops, [], 'and reads it back with nothing to do');
  const back = MT.importWorkspace(JSON.parse(JSON.stringify(MT.exportWorkspace(ws))));
  assert.equal(back.import_check.status, 'VERIFIED'); assert.deepEqual(back.live.tiles.mt_tower.view, VIEW);
  const kit = JSON.parse(JSON.stringify(MT.exportKit(ws.live, 'mt_tower'))), other = MT.createWorkspace(MT.createWorld('Elsewhere'));
  const r = MT.importKit(other.live, kit); assert.equal(r.status, 'READY');
  commit(other, r.ops);
  assert.ok(/The light on the hill/.test(MT.vnodeToHTML(MT.compilePanel(other.live).root)), 'a tile arrives with its interface intact');
  const dropped = MT.fromText(ws.live, MT.toText(ws.live).replace(/^\s+view \{.*$/m, ''));
  assert.deepEqual(dropped.ops.map((o) => o.op), ['tile.replace'], 'and removing the line removes the interface');
});
