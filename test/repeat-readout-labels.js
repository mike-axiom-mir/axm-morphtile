// Regression: every expression-backed view label should see the same nearest repeat lexical scope.
// This intentionally proves the currently missing readout-label branch; it must stay red until core supports it.
const test = require('node:test'), assert = require('node:assert');
const MT = require('../core/morphtile.js');

const fresh = () => MT.createWorkspace(MT.seedWorld());
const commit = (ws, ops, by) => {
  const c = MT.cloneBody(ws, 'repeat-readout-label-regression', by || 'interface-core-regression');
  for (const op of ops) {
    const r = MT.editCandidate(ws, c, op);
    assert.ok(r.ok, op.op + ': ' + r.error);
  }
  const plan = MT.planMerge(ws, [c]);
  assert.equal(plan.status, 'READY');
  const res = MT.commitPlan(ws, plan.id, by || 'interface-core-regression');
  assert.ok(res.ok, JSON.stringify(res));
  return res.receipt;
};
const html = (ws) => MT.vnodeToHTML(MT.compilePanel(ws.live).root);

test('repeat lexical scope reaches readout labels without changing readout authority', () => {
  const ws = fresh();
  const before = MT.structHash(ws.live);
  const rc = commit(ws, [{
    op: 'view.set',
    id: 'mt_tower',
    view: {
      title: 'Scoped readout labels',
      body: [{
        repeat: 2,
        as: 'i',
        body: [
          { value: 'beacon', label: ['+', 'readout ', ['var', 'i']] },
          { value: 'beacon', label: ['+', 'count ', ['var', 'i_of']] }
        ]
      }]
    }
  }]);

  const committed = MT.structHash(ws.live);
  const page = html(ws);
  assert.match(page, /readout 0/);
  assert.match(page, /readout 1/);
  assert.equal((page.match(/count 2/g) || []).length, 2, 'repeat count should resolve from the same nearest lexical scope');
  assert.equal((page.match(/data-bind="mt_tower\|beacon"/g) || []).length, 4, 'lexical labels must remain four views over one canonical readout binding');
  assert.equal(MT.structHash(ws.live), committed, 'rendering lexical readout labels must remain read-only');

  const rollback = MT.rollback(ws, rc.rollback_token);
  assert.ok(rollback.ok && rollback.exact);
  assert.equal(MT.structHash(ws.live), before);
});
