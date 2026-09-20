const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const MT = require('../core/morphtile.js');
const Flow = require('../experimental/flowing-runtime.js');

const vectors = JSON.parse(fs.readFileSync(path.join(__dirname, '../conformance/neutral-compute-v0.1.json'), 'utf8'));
const clone = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));

function decode(body) {
  if (body.kind === 'json') return clone(body.value);
  if (body.kind === 'bytes-base64') return Buffer.from(body.value, 'base64');
  throw new Error('unknown body kind ' + body.kind);
}

function ref(body) {
  const value = decode(body);
  if (body.kind === 'bytes-base64') {
    return { artifact_sha256: MT.sha256(value), hash_kind: 'bytes', representation: 'bytes' };
  }
  return Flow.artifactRef(value, { hash_kind: 'canonical-json', representation: 'canonical-json' });
}

function partial(actual, expected, at = '$') {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return { ok: false, at, expected, actual };
    for (let i = 0; i < expected.length; i++) { const r = partial(actual[i], expected[i], at + '[' + i + ']'); if (!r.ok) return r; }
    return { ok: true };
  }
  if (expected && typeof expected === 'object') {
    if (!actual || typeof actual !== 'object') return { ok: false, at, expected, actual };
    for (const k of Object.keys(expected)) {
      if (!Object.prototype.hasOwnProperty.call(actual, k)) return { ok: false, at: at + '.' + k, expected: expected[k], actual: undefined };
      const r = partial(actual[k], expected[k], at + '.' + k); if (!r.ok) return r;
    }
    return { ok: true };
  }
  return Object.is(actual, expected) ? { ok: true } : { ok: false, at, expected, actual };
}

function decisions(headLike) {
  const c = headLike && headLike.contracts || {};
  return Object.fromEntries(Object.keys(c).sort().map((id) => [id, c[id].decision]));
}
function actions(plan) {
  const c = plan && plan.contracts || {};
  return Object.fromEntries(Object.keys(c).sort().map((id) => [id, c[id].action]));
}
function sequence(ctx) { return Flow.currentHead(ctx.runtime).sequence; }
function hot(ctx) { return Object.keys(ctx.runtime.hot || {}).sort(); }

function setup(spec) {
  const artifacts = {};
  for (const [id, body] of Object.entries(spec.artifacts || {})) artifacts[id] = ref(body);
  return { runtime: Flow.createRuntime({ label: 'neutral-conformance', contracts: spec.contracts || [], artifacts }), vars: {} };
}

function step(ctx, s) {
  if (s.op === 'remember_current') {
    const h = Flow.currentHead(ctx.runtime); if (s.save_generation) ctx.vars[s.save_generation] = h.generation_sha256;
    return { status: 'REMEMBERED', current_sequence: h.sequence };
  }
  if (s.op === 'plan') {
    const r = Flow.planMutation(ctx.runtime, { selectors: s.selectors || [], reason: 'neutral-conformance' });
    if (s.save_as && r.status === 'PLANNED') ctx.vars[s.save_as] = r;
    const out = { status: r.status, current_sequence: sequence(ctx) };
    if (r.contracts) out.actions = actions(r);
    if (r.unknown_selectors) out.unknown_selectors = clone(r.unknown_selectors);
    return out;
  }
  if (s.op === 'stage' || s.op === 'stage_from_current') {
    const plan = ctx.vars[s.plan], updates = {};
    if (s.op === 'stage_from_current') {
      const h = Flow.currentHead(ctx.runtime);
      for (const [id, route] of Object.entries(s.routes || {})) updates[id] = Object.assign({}, clone(h.contracts[id]), { route });
    } else {
      for (const [id, u] of Object.entries(s.updates || {})) updates[id] = Object.assign({}, ref(u.body), { route: u.route });
    }
    const r = Flow.stageGeneration(ctx.runtime, plan, updates);
    if (s.save_as && r.status === 'STAGED') ctx.vars[s.save_as] = r;
    const out = { status: r.status, current_sequence: sequence(ctx) };
    if (r.contract) out.contract = r.contract;
    if (r.generation) { out.staged_sequence = r.generation.sequence; out.decisions = decisions(r.generation); }
    return out;
  }
  if (s.op === 'commit') {
    const r = Flow.commitGeneration(ctx.runtime, ctx.vars[s.stage], 'neutral-conformance'), h = Flow.currentHead(ctx.runtime);
    if (s.save_generation && r.status === 'COMMITTED') ctx.vars[s.save_generation] = h.generation_sha256;
    return { status: r.status, current_sequence: h.sequence, decisions: decisions(h) };
  }
  if (s.op === 'rollback') {
    const r = Flow.rollback(ctx.runtime, ctx.vars[s.target] || s.target, 'neutral-conformance');
    return { status: r.status, current_sequence: sequence(ctx) };
  }
  if (s.op === 'reactivate') {
    if (typeof Flow.reactivate !== 'function') return { status: 'HOLD_NOT_IMPLEMENTED', current_sequence: sequence(ctx) };
    const r = Flow.reactivate(ctx.runtime, ctx.vars[s.target] || s.target, 'neutral-conformance');
    return { status: r.status, current_sequence: sequence(ctx) };
  }
  if (s.op === 'wake') {
    const r = Flow.wakeContract(ctx.runtime, s.contract, decode(s.body));
    return { status: r.status, current_sequence: sequence(ctx), hot_contracts: hot(ctx) };
  }
  if (s.op === 'sleep') {
    const r = Flow.sleepContract(ctx.runtime, s.contract);
    return { status: r.status, current_sequence: sequence(ctx), hot_contracts: hot(ctx) };
  }
  if (s.op === 'restart') {
    ctx.runtime = Flow.importRuntime(JSON.parse(JSON.stringify(Flow.exportRuntime(ctx.runtime))));
    return { status: 'RESTARTED', current_sequence: sequence(ctx), hot_contracts: hot(ctx) };
  }
  if (s.op === 'tamper_import') {
    const out = JSON.parse(JSON.stringify(Flow.exportRuntime(ctx.runtime))), g = out.generations[out.current_generation_sha256];
    g.contracts[s.contract][s.field] = clone(s.value);
    let refused = false; try { Flow.importRuntime(out); } catch (_) { refused = true; }
    return { status: refused ? 'REFUSED_TAMPERED_RUNTIME' : 'UNSAFE_ACCEPTED_TAMPERED_RUNTIME', current_sequence: sequence(ctx) };
  }
  throw new Error('unknown neutral conformance op ' + s.op);
}

test('MorphTile native Flow runtime matches neutral hash primitives', () => {
  assert.equal(MT.hashOf(vectors.hash_primitives.canonical_json.value), vectors.hash_primitives.canonical_json.sha256);
  const bytes = Buffer.from(vectors.hash_primitives.bytes_base64.value, 'base64');
  assert.equal(MT.sha256(bytes), vectors.hash_primitives.bytes_base64.sha256);
  const nativeRef = Flow.artifactRef(bytes, { hash_kind: 'bytes', representation: 'bytes' });
  assert.equal(nativeRef.hash_kind, 'bytes');
  assert.equal(nativeRef.artifact_sha256, vectors.hash_primitives.bytes_base64.sha256);
});

test('MorphTile native Flow runtime consumes the pinned neutral conformance vectors', () => {
  const failures = [];
  for (const c of vectors.cases) {
    const ctx = setup(c.setup || vectors.default_setup);
    for (let i = 0; i < c.steps.length; i++) {
      const s = c.steps[i], actual = step(ctx, s), m = partial(actual, s.expect || {});
      if (!m.ok) { failures.push({ case: c.id, step: i, op: s.op, mismatch: m, actual, expected: s.expect }); break; }
    }
  }
  assert.deepEqual(failures, []);
});
