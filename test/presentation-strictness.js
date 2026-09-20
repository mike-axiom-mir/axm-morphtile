const test = require('node:test'), assert = require('node:assert');
const MT = require('../core/morphtile.js');

const UNKNOWN_FIELD = 'canonical_state';

function descriptorWithUnknownField() {
  return {
    mode: 'docked',
    dock: 'right',
    preferred_size: [360, 480],
    user_adjustable: true,
    [UNKNOWN_FIELD]: { count: 42 }
  };
}

test('tile validation rejects presentation fields outside the public descriptor contract', () => {
  const tile = MT.createTile({
    id: 'mt_strict_presentation',
    presentation: descriptorWithUnknownField()
  });
  const validity = MT.validateTile(tile);
  assert.equal(validity.ok, false, 'unknown presentation fields must not validate as canonical matter');
  assert.match(validity.errors.join('\n'), /presentation.*(unknown|unsupported).*canonical_state/i);
});

test('presentation.set rejects unknown fields before they enter a candidate merge', () => {
  const ws = MT.createWorkspace(MT.seedWorld());
  const candidate = MT.cloneBody(ws, 'ai', 'ai:strict-presentation-regression');
  const edited = MT.editCandidate(ws, candidate, {
    op: 'presentation.set',
    id: 'mt_tower',
    presentation: descriptorWithUnknownField()
  });

  assert.equal(edited.ok, false, 'presentation.set must fail closed on unknown descriptor fields');
  assert.match(String(edited.error || ''), /(unknown|unsupported).*canonical_state/i);
  assert.equal(ws.candidates[candidate].world.tiles.mt_tower.presentation, undefined, 'rejected presentation data must not enter candidate matter');
});
