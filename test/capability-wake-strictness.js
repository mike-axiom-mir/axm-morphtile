const test = require('node:test');
const assert = require('node:assert/strict');
const MT = require('../core/morphtile.js');

function carrier(capability) {
  return MT.createTile({
    id: 'mt_cap_carrier',
    name: 'Capability wake strictness fixture',
    capabilities: [capability]
  });
}

function counterGrants() {
  return {
    facets: {
      logic: {
        type: 'rule',
        data: { vars: { count: 0 }, rules: [{ on: 'increment', do: [{ set: ['count', ['+', ['var', 'count'], 1]] }] }] }
      }
    },
    sockets: [{ id: 'increment', kind: 'signal', dir: 'in', signal: 'increment' }]
  };
}

const malformed = [
  {
    label: 'signal wake without a name',
    wake: { on: 'signal' }
  },
  {
    label: 'near wake with a string radius',
    wake: { on: 'near', within: '4', hysteresis: 1.25 }
  },
  {
    label: 'value wake with both thresholds',
    wake: { on: 'value', var: 'heat', over: 5, under: 2 }
  },
  {
    label: 'time wake with a string threshold',
    wake: { on: 'time', after: '5' }
  },
  {
    label: 'unknown wake mode',
    wake: { on: 'telepathy' }
  }
];

test('canonical tile validation fails closed on malformed authored capability wake rules', () => {
  for (const item of malformed) {
    const tile = carrier({ id: 'counter', wake: item.wake, grants: counterGrants() });
    const valid = MT.validateTile(tile);
    assert.equal(valid.ok, false, item.label + ' must not be accepted as canonical MorphTile matter');
  }
});

test('cap.add rejects malformed wake matter before it enters a candidate', () => {
  for (const item of malformed) {
    const world = MT.createWorld('Capability wake strictness');
    world.tiles.mt_cap_carrier = carrier({ id: 'existing', wake: { on: 'manual' }, grants: counterGrants() });
    const ws = MT.createWorkspace(world);
    const candidate = MT.cloneBody(ws, 'strict wake regression', 'capability-machine');
    const edited = MT.editCandidate(ws, candidate, {
      op: 'cap.add',
      id: 'mt_cap_carrier',
      capability: { id: 'bad', wake: item.wake, grants: counterGrants() }
    });
    assert.equal(edited.ok, false, item.label + ' must fail before candidate matter is accepted');
  }
});

test('documented wake shapes remain valid control fixtures', () => {
  const validWakes = [
    { on: 'manual' },
    { on: 'signal', name: 'increment' },
    { on: 'near', within: 4, hysteresis: 1.5 },
    { on: 'value', var: 'heat', over: 5 },
    { on: 'time', after: 5 }
  ];
  for (const wake of validWakes) {
    const tile = carrier({ id: 'counter', wake, grants: counterGrants() });
    assert.equal(MT.validateTile(tile).ok, true, JSON.stringify(wake));
  }
});
