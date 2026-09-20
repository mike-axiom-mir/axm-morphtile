const test = require('node:test');
const assert = require('node:assert/strict');
const MT = require('../core/morphtile.js');

function ownData(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true
  });
  return target;
}

function recipe(vars, parts) {
  return { type: 'generated', source: null, data: { generator: 'recipe', vars, parts } };
}

function tile(mesh, id = 'mt_key') {
  return MT.createTile({ id, name: 'Own-key recipe proof', form_hints: ['game_asset'], facets: { mesh } });
}

function axisExtent(mesh, axis) {
  const values = [];
  for (let i = axis; i < mesh.P.length; i += 3) values.push(mesh.P[i]);
  return Math.max(...values) - Math.min(...values);
}

test('recipe vars preserve an authored own __proto__ data key', () => {
  const vars = ownData({}, '__proto__', 2);
  const compiled = MT.compileMesh(tile(recipe(vars, [
    { shape: 'box', size: [['var', '__proto__'], 1, 1] }
  ])));

  assert.equal(compiled.hold, null);
  assert.equal(axisExtent(compiled, 0), 2, 'authored __proto__ variable must remain numeric recipe meaning');
});

test('repeat scope preserves an authored __proto__ loop alias', () => {
  const compiled = MT.compileMesh(tile(recipe({}, [
    {
      repeat: 2,
      as: '__proto__',
      body: [{ shape: 'box', size: [1, 1, 1], pos: [['var', '__proto__'], 0, 0] }]
    }
  ]), 'mt_loop_key'));

  assert.equal(compiled.hold, null);
  assert.equal(compiled.recipe_parts, 2);
  assert.equal(axisExtent(compiled, 0), 2, 'loop alias must produce distinct x positions 0 and 1');
});

test('definition settings preserve an authored own __proto__ override key', () => {
  const vars = ownData({}, '__proto__', 1);
  const withSettings = ownData({}, '__proto__', 3);
  const w = MT.createWorld('Own-key definition proof');
  w.defs = {
    def_part: {
      id: 'def_part',
      name: 'Own-key part',
      body: {
        facets: {
          mesh: recipe(vars, [{ shape: 'box', size: [['var', '__proto__'], 1, 1] }]),
          material: { type: 'primitive', source: null, data: { color: [0.7, 0.7, 0.9] } }
        }
      }
    }
  };
  w.tiles.mt_key = tile(recipe({}, [{ use: 'def_part', with: withSettings }]), 'mt_key');

  const compiled = MT.compileMesh(w.tiles.mt_key, w);
  assert.equal(compiled.hold, null);
  assert.equal(axisExtent(compiled, 0), 3, 'definition override must reach the nested recipe under its exact own key');
  assert.equal(Object.prototype.hasOwnProperty.call(w.defs.def_part.body.facets.mesh.data.vars, '__proto__'), true);
  assert.equal(w.defs.def_part.body.facets.mesh.data.vars.__proto__, 1, 'definition source must remain unchanged');
});
