const fs = require('fs');
const path = 'core/morphtile.js';
let source = fs.readFileSync(path, 'utf8');
function replaceOnce(from, to) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`expected one exact match, got ${count}: ${from}`);
  source = source.replace(from, to);
}
replaceOnce(
  "    const vars = Object.assign({}, data.vars || {}), budget = Math.min(data.budget || RECIPE_BUDGET, RECIPE_BUDGET);",
  "    const vars = Object.assign(Object.create(null), data.vars || {}), budget = Math.min(data.budget || RECIPE_BUDGET, RECIPE_BUDGET);"
);
replaceOnce(
  "      const x = evalExpr(v, { t: 0, words: wordsOf(world), get: (n) => (n in scope ? scope[n] : vars[n]) });",
  "      const x = evalExpr(v, { t: 0, words: wordsOf(world), get: (n) => (Object.prototype.hasOwnProperty.call(scope, n) ? scope[n] : vars[n]) });"
);
replaceOnce(
  "          for (let i = 0; i < count; i++) { const inner = Object.assign({}, scope); inner[n.as || 'i'] = i; inner[(n.as || 'i') + '_of'] = count; inner[(n.as || 'i') + '_at'] = count > 1 ? i / (count - 1) : 0; walk(n.body, inner, depth + 1); if (stopped) return; }",
  "          for (let i = 0; i < count; i++) { const inner = Object.assign(Object.create(null), scope); inner[n.as || 'i'] = i; inner[(n.as || 'i') + '_of'] = count; inner[(n.as || 'i') + '_at'] = count > 1 ? i / (count - 1) : 0; walk(n.body, inner, depth + 1); if (stopped) return; }"
);
replaceOnce(
  "        if (n.when !== undefined && !evalExpr(n.when, { t: 0, words: wordsOf(world), get: (k) => (k in scope ? scope[k] : vars[k]) })) continue;",
  "        if (n.when !== undefined && !evalExpr(n.when, { t: 0, words: wordsOf(world), get: (k) => (Object.prototype.hasOwnProperty.call(scope, k) ? scope[k] : vars[k]) })) continue;"
);
replaceOnce(
  "            const over = {}; for (const k in n.with) over[k] = num(n.with[k], scope, undefined);",
  "            const over = Object.create(null); for (const k of Object.keys(n.with)) over[k] = num(n.with[k], scope, undefined);"
);
replaceOnce(
  "            if (subMesh.type === 'generated' && subMesh.data && subMesh.data.generator === 'recipe') subMesh = { type: 'generated', source: null, data: Object.assign({}, subMesh.data, { vars: Object.assign({}, subMesh.data.vars, over) }) };",
  "            if (subMesh.type === 'generated' && subMesh.data && subMesh.data.generator === 'recipe') subMesh = { type: 'generated', source: null, data: Object.assign({}, subMesh.data, { vars: Object.assign(Object.create(null), subMesh.data.vars || {}, over) }) };"
);
replaceOnce(
  "    try { walk(data.parts, {}, 0); } catch (err) { if (err !== NONFINITE_RECIPE_VALUE) throw err; }",
  "    try { walk(data.parts, Object.create(null), 0); } catch (err) { if (err !== NONFINITE_RECIPE_VALUE) throw err; }"
);
fs.writeFileSync(path, source);
