'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const MT = require('../core/morphtile.js');

function commit(ws, ops) {
  const candidate = MT.cloneBody(ws, 'verification', 'verification:view-repeat-text-scope');
  for (const op of ops) {
    const edited = MT.editCandidate(ws, candidate, op);
    assert.equal(edited.ok, true, edited.error || JSON.stringify(edited));
  }
  const plan = MT.planMerge(ws, [candidate]);
  assert.equal(plan.status, 'READY', JSON.stringify(plan));
  const committed = MT.commitPlan(ws, plan.id, 'verification');
  assert.equal(committed.ok, true, JSON.stringify(committed));
  return committed.receipt;
}

test('repeat lexical scope reaches expression-backed view text', () => {
  const ws = MT.createWorkspace(MT.seedWorld());
  const before = MT.structHash(ws.live);
  const receipt = commit(ws, [{
    op: 'view.set',
    id: 'mt_tower',
    view: {
      title: 'Repeat lexical text scope',
      body: [{
        repeat: 3,
        as: 'slot',
        body: [{ text: ['var', 'slot'] }]
      }]
    }
  }]);

  const committedHash = MT.structHash(ws.live);
  const page = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
  assert.match(page, /<p class="v-text">0<\/p>/, 'first repeated text must see lexical slot=0');
  assert.match(page, /<p class="v-text">1<\/p>/, 'second repeated text must see lexical slot=1');
  assert.match(page, /<p class="v-text">2<\/p>/, 'third repeated text must see lexical slot=2');
  assert.equal(MT.structHash(ws.live), committedHash, 'view compilation must remain structurally read-only');

  const rollback = MT.rollback(ws, receipt.rollback_token);
  assert.ok(rollback.ok && rollback.exact, JSON.stringify(rollback));
  assert.equal(MT.structHash(ws.live), before, 'rollback restores exact pre-view structure');
});
