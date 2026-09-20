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
const EXPECTED_HOLD = 'HOLD_RECIPE_NONFINITE_VALUE';

test('non-finite recipe position expression holds instead of silently becoming zero', () => {
  const mesh = MT.compileMesh(tileFor([{ shape: 'plane', pos: [overflow, 0, 0] }]));
  assert.equal(mesh.hold, EXPECTED_HOLD);
});

test('non-finite recipe size expression holds instead of silently becoming one', () => {
  const mesh = MT.compileMesh(tileFor([{ shape: 'plane', size: [overflow, 1, 1] }]));
  assert.equal(mesh.hold, EXPECTED_HOLD);
});

test('non-finite recipe repeat expression holds instead of silently becoming zero', () => {
  const mesh = MT.compileMesh(tileFor([{ repeat: overflow, as: 'i', body: [{ shape: 'plane' }] }]));
  assert.equal(mesh.hold, EXPECTED_HOLD);
});

test('non-finite definition setting expression holds instead of silently falling back', () => {
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
  assert.equal(mesh.hold, EXPECTED_HOLD);
});

test('large finite recipe values remain ordinary candidate geometry', () => {
  const mesh = MT.compileMesh(tileFor([{ shape: 'plane', pos: [Number.MAX_VALUE / 4, 0, 0], size: [2, 1, 2] }]));
  assert.equal(mesh.hold, null);
  assert.ok(mesh.P.every(Number.isFinite), 'finite control stays finite through compilation');
});
