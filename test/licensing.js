const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('repository carries the engine licence and creator-output permission', () => {
  assert.match(read('LICENSE'), /PolyForm Noncommercial License 1\.0\.0/);
  const permission = read('CREATOR_OUTPUT_PERMISSION.md');
  assert.match(permission, /use MorphTile for commercial purposes solely to create/);
  assert.match(permission, /commercial exploitation of\s+MorphTile itself/);
  assert.equal(JSON.parse(read('package.json')).license, 'SEE LICENSE IN LICENSE');
});

test('the licence boundary travels in both core and standalone workshop', () => {
  for (const file of ['core/morphtile.js', 'dist/axiomatter-workshop.html']) {
    const text = read(file);
    assert.match(text, /PolyForm Noncommercial License 1\.0\.0/, file);
    assert.match(text, /MorphTile Creator/, file);
    assert.match(text, /Output Permission/, file);
  }
});
