const test = require('node:test');
const assert = require('node:assert');
const MT = require('../core/morphtile.js');

function tileFor(parts) {
  return MT.createTile({
    id: 'mt_nonfinite',
    name: 'Non-finite recipe probe',
    facets: {
      mesh: {
        type: 'generated',
        source: null,
        data: { generator: 'recipe', parts }
      }
    }
  });
}

const overflow = ['*', Number.MAX_VALUE, 2];

test('recipe numeric expressions fail closed when evaluation becomes non-finite', () => {
  const position = MT.compileMesh(tileFor([{ shape: 'plane', pos: [overflow, 0, 0] }]));
  assert.equal(position.hold, 'HOLD_RECIPE_NONFINITE_VALUE', 'non-finite position must HOLD instead of silently becoming zero');

  const size = MT.compileMesh(tileFor([{ shape: 'plane', size: [overflow, 1, 1] }]));
  assert.equal(size.hold, 'HOLD_RECIPE_NONFINITE_VALUE', 'non-finite size must HOLD instead of silently becoming one');

  const repeat = MT.compileMesh(tileFor([{ repeat: overflow, as: 'i', body: [{ shape: 'plane' }] }]));
  assert.equal(repeat.hold, 'HOLD_RECIPE_NONFINITE_VALUE', 'non-finite repeat count must HOLD instead of silently becoming zero');
});

test('definition setting expressions fail closed when evaluation becomes non-finite', () => {
  const world = MT.createWorld('Non-finite setting probe');
  world.defs = {
    def_parametric: {
      id: 'def_parametric',
      name: 'Parametric plane',
      body: {
        facets: {
          mesh: {
            type: 'generated',
            source: null,
            data: {
              generator: 'recipe',
              vars: { width: 1 },
              parts: [{ shape: 'plane', size: [['var', 'width'], 1, 1] }]
            }
          },
          material: { type: 'primitive', source: null, data: { color: [0.7, 0.7, 0.9] } }
        }
      }
    }
  };
  const tile = tileFor([{ use: 'def_parametric', with: { width: overflow } }]);
  world.tiles[tile.id] = tile;

  const mesh = MT.compileMesh(tile, world);
  assert.equal(mesh.hold, 'HOLD_RECIPE_NONFINITE_VALUE', 'non-finite setting override must HOLD instead of falling back inside the definition');
});

test('large finite recipe values remain ordinary candidate geometry', () => {
  const mesh = MT.compileMesh(tileFor([{ shape: 'plane', pos: [Number.MAX_VALUE / 4, 0, 0], size: [2, 1, 2] }]));
  assert.equal(mesh.hold, null);
  assert.ok(mesh.P.every(Number.isFinite), 'finite control stays finite through compilation');
});
