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

test('a tile can carry its own interface, and it is used instead of the engine’s card', () => {
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
test('a written interface still addresses the real matter: its controls are the tile’s own', () => {
  const ws = fresh(); commit(ws, [{ op: 'view.set', id: 'mt_tower', view: VIEW }]);
  const page = html(ws);
  assert.ok(/data-signal="mt_tower:toggle"/.test(page), 'the button is the tile’s real signal');
  assert.ok(/data-param="mt_tower:levels"/.test(page), 'the slider is the tile’s real control');
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
  assert.ok(/cell 0/.test(page) && /cell 1/.test(page) && /cell 2/.test(page) && /cell 3/.test(page), 'expression-backed text sees the repeat lexical index rather than only outer canonical vars');
  MT.act(ws, { do: 'signal', tile: 'mt_core', name: 'surge' });
  assert.ok(/Charged core/.test(html(ws)), 'and its title follows the matter too');
});
test('repeat lexical scope reaches expression-backed node labels without changing action or control authority', () => {
  const ws = fresh();
  commit(ws, [{ op: 'view.set', id: 'mt_tower', view: { title: 'Scoped labels', body: [
    { repeat: 2, as: 'i', body: [
      { meter: ['var', 'beacon'], min: 0, max: 1, label: ['+', 'meter ', ['var', 'i']] },
      { button: 'toggle', label: ['+', 'button ', ['var', 'i']] },
      { control: 'levels', label: ['+', 'control ', ['var', 'i']] }
    ] }
  ] } }]);
  const page = html(ws);
  assert.match(page, /meter 0/); assert.match(page, /meter 1/);
  assert.match(page, /button 0/); assert.match(page, /button 1/);
  assert.match(page, /control 0/); assert.match(page, /control 1/);
  assert.equal((page.match(/data-signal="mt_tower:toggle"/g) || []).length, 2, 'scoped labels do not widen signal authority');
  assert.equal((page.match(/data-param="mt_tower:levels"/g) || []).length, 2, 'scoped labels do not duplicate control state');
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

test('custom view buttons bind only to exposed input signal sockets', () => {
  const ws = fresh();
  const tower = ws.live.tiles.mt_tower;
  tower.facets.logic.data.rules.push({ on: 'hidden-rule', do: [{ set: ['beacon', 1] }] });
  tower.provenance.sha256 = MT.contentHash(tower);

  commit(ws, [{ op: 'view.set', id: 'mt_tower', view: { title: 'Authority boundary', body: [
    { button: 'toggle', label: 'Allowed input' },
    { button: 'hidden-rule', label: 'Rule without socket' },
    { button: 'roof', label: 'Attach socket is not an action' },
    { button: 'lit', label: 'Output signal is not an input action' },
    { button: 'missing-action', label: 'No such socket' }
  ] } }]);

  const page = html(ws);
  assert.match(page, /data-signal="mt_tower:toggle"/, 'declared input signal socket stays actionable');
  assert.doesNotMatch(page, /data-signal="mt_tower:hidden-rule"/, 'internal rules are not promoted to UI authority');
  assert.doesNotMatch(page, /data-signal="mt_tower:roof"/, 'attach sockets are not promoted to actions');
  assert.doesNotMatch(page, /data-signal="mt_tower:lit"/, 'output sockets are not promoted to input actions');
  assert.doesNotMatch(page, /data-signal="mt_tower:missing-action"/, 'missing sockets are not promoted to actions');
  assert.match(page, /no exposed action called hidden-rule/);
  assert.match(page, /no exposed action called roof/);
  assert.match(page, /no exposed action called lit/);
  assert.match(page, /no exposed action called missing-action/);
});
