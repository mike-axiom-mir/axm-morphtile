const test = require('node:test');
const assert = require('node:assert/strict');
const MT = require('../core/morphtile.js');

const allFinite = (values) => values.every((value) => typeof value === 'number' && Number.isFinite(value));

function directBox(pos, size) {
  return MT.createTile({
    id: 'mt_mesh_finite_probe',
    name: 'Mesh finite probe',
    facets: {
      mesh: { type: 'primitive', source: null, data: { shape: 'box', size, pos } }
    }
  });
}

test('direct primitive compilation fails closed when finite authored values overflow geometry', () => {
  const tile = directBox([Number.MAX_VALUE, 0, 0], [Number.MAX_VALUE, 1, 1]);
  assert.equal(MT.validateTile(tile).ok, true, 'the authored inputs themselves are finite');

  const mesh = MT.compileMesh(tile);
  assert.equal(mesh.hold, 'HOLD_MESH_NONFINITE_VALUE');
  assert.deepEqual(mesh.P, []);
  assert.deepEqual(mesh.T, []);
  assert.deepEqual(mesh.K, []);
});

test('primitive part collections fail closed without leaking an earlier finite partial mesh', () => {
  const tile = MT.createTile({
    id: 'mt_mesh_parts_finite_probe',
    name: 'Mesh parts finite probe',
    facets: {
      mesh: {
        type: 'primitive',
        source: null,
        data: {
          parts: [
            { shape: 'plane', size: [1, 1, 1], pos: [0, 0, 0] },
            { shape: 'box', size: [Number.MAX_VALUE, 1, 1], pos: [Number.MAX_VALUE, 0, 0] }
          ]
        }
      }
    }
  });
  assert.equal(MT.validateTile(tile).ok, true, 'all authored part values are finite');

  const mesh = MT.compileMesh(tile);
  assert.equal(mesh.hold, 'HOLD_MESH_NONFINITE_VALUE');
  assert.deepEqual(mesh.P, []);
  assert.deepEqual(mesh.T, []);
  assert.deepEqual(mesh.K, []);
});

test('large finite direct primitive geometry remains accepted', () => {
  const tile = directBox([1e150, -1e150, 1e150], [1e150, 2e150, 3e150]);
  assert.equal(MT.validateTile(tile).ok, true);

  const mesh = MT.compileMesh(tile);
  assert.equal(mesh.hold, null);
  assert.ok(mesh.P.length > 0);
  assert.equal(allFinite(mesh.P), true);
});
