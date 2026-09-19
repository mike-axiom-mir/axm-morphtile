// Builds the single-file workshop: core + real bridge fixtures inlined, nothing fetched at runtime.
const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fixtures = {}; for (const f of ['valid-offer.json', 'hash-mismatch-offer.json', 'missing-bytes-offer.json']) fixtures[f] = JSON.parse(read('bridges/fixtures/' + f));
let html = read('workshop/template.html');
html = html.replace('/*__CORE__*/', () => read('core/morphtile.js')).replace('/*__FIXTURES__*/null', () => JSON.stringify(fixtures)).replace('/*__SOURCE__*/null', () => read('bridges/fixtures/SOURCE.json').trim());
fs.mkdirSync(path.join(root, 'dist'), { recursive: true }); fs.writeFileSync(path.join(root, 'dist/axiomatter-workshop.html'), html);
console.log('dist/axiomatter-workshop.html', (html.length / 1024).toFixed(1) + ' kB');
