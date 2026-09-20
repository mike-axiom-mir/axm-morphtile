'use strict';

// Experimental Flowing Compute runtime for MorphTile.
// It owns generation routing and exact artifact references, not artifact storage or contract-local policy.
// Durable artifact bytes may live in cold matter, a future library, files, or another host.
// Session-hot values are explicitly non-canonical and are never exported.
const MT = require('../core/morphtile.js');

const FORMAT = 'morphtile-flow-runtime';
const VERSION = '0.1';
const SHA = /^[0-9a-f]{64}$/;

const clone = (v) => MT.clone(v);
const hash = (v) => MT.hashOf(v);
const fail = (status, detail) => Object.assign({ status }, detail || {});

function sealed(body, field) {
  const out = clone(body);
  out[field] = hash(body);
  return out;
}

function verifySeal(value, field) {
  if (!value || typeof value !== 'object') return false;
  const claimed = value[field], body = clone(value);
  delete body[field];
  return typeof claimed === 'string' && claimed === hash(body);
}

function selectorMatches(pattern, selector) {
  pattern = String(pattern || '');
  selector = String(selector || '');
  if (pattern === '**' || pattern === selector) return true;
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    return selector === prefix || selector.startsWith(prefix + '/');
  }
  if (pattern.endsWith('**')) return selector.startsWith(pattern.slice(0, -2));
  if (pattern.endsWith('*')) return selector.startsWith(pattern.slice(0, -1));
  return false;
}

function normalizeContract(spec) {
  if (!spec || typeof spec.id !== 'string' || !spec.id) throw new Error('contract id required');
  const depends = [...new Set((spec.depends_on || []).map(String).filter(Boolean))].sort();
  if (!depends.length) throw new Error('contract ' + spec.id + ' needs depends_on selectors');
  return {
    id: spec.id,
    kind: spec.kind || 'derived-state',
    depends_on: depends,
    policy_kind: spec.policy_kind || 'contract-local',
    allowed_routes: [...new Set((spec.allowed_routes || []).map(String).filter(Boolean))].sort(),
    note: spec.note || null,
  };
}

function normalizeArtifact(ref) {
  if (!ref || !SHA.test(String(ref.artifact_sha256 || ''))) throw new Error('artifact_sha256 must be sha256');
  const hashKind = ref.hash_kind || 'canonical-json';
  if (!['canonical-json', 'bytes'].includes(hashKind)) throw new Error('unsupported artifact hash_kind ' + hashKind);
  if (ref.source_sha256 != null && !SHA.test(String(ref.source_sha256))) throw new Error('source_sha256 must be sha256');
  if (ref.proof_sha256 != null && !SHA.test(String(ref.proof_sha256))) throw new Error('proof_sha256 must be sha256');
  return {
    artifact_sha256: String(ref.artifact_sha256),
    hash_kind: hashKind,
    source_sha256: ref.source_sha256 == null ? null : String(ref.source_sha256),
    proof_sha256: ref.proof_sha256 == null ? null : String(ref.proof_sha256),
    representation: ref.representation || 'opaque',
    meta: ref.meta == null ? null : clone(ref.meta),
  };
}

function artifactHash(value, hashKind) {
  if (hashKind === 'bytes') {
    if (!(value instanceof Uint8Array)) throw new Error('bytes artifact must be Uint8Array');
    return MT.sha256(value);
  }
  return hash(value);
}

function artifactRef(value, opts) {
  opts = opts || {};
  const hashKind = opts.hash_kind || (value instanceof Uint8Array ? 'bytes' : 'canonical-json');
  return normalizeArtifact({
    artifact_sha256: artifactHash(value, hashKind),
    hash_kind: hashKind,
    source_sha256: opts.source_sha256 || null,
    proof_sha256: opts.proof_sha256 || null,
    representation: opts.representation || (hashKind === 'bytes' ? 'bytes' : 'canonical-json'),
    meta: opts.meta || null,
  });
}

function generationBody(sequence, parent, planSha, selectors, contracts) {
  return {
    sequence,
    parent_generation_sha256: parent,
    plan_sha256: planSha,
    mutation_selectors: clone(selectors || []),
    contracts: clone(contracts),
  };
}

function createRuntime(opts) {
  opts = opts || {};
  const specs = (opts.contracts || []).map(normalizeContract);
  if (!specs.length) throw new Error('at least one contract required');
  const registry = {};
  for (const spec of specs) {
    if (registry[spec.id]) throw new Error('duplicate contract ' + spec.id);
    registry[spec.id] = spec;
  }

  const baseContracts = {};
  for (const id of Object.keys(registry).sort()) {
    const initial = opts.artifacts && opts.artifacts[id];
    if (!initial) throw new Error('missing initial artifact for ' + id);
    baseContracts[id] = Object.assign({ decision: 'BASE', route: null, previous_artifact_sha256: null }, normalizeArtifact(initial));
  }

  const baseBody = generationBody(0, null, null, [], baseContracts);
  const base = sealed(baseBody, 'generation_sha256');
  return {
    format: FORMAT,
    version: VERSION,
    label: opts.label || null,
    registry,
    generations: { [base.generation_sha256]: base },
    current_generation_sha256: base.generation_sha256,
    receipts: [],
    hot: {},
  };
}

function currentGeneration(runtime) {
  return runtime && runtime.generations && runtime.generations[runtime.current_generation_sha256] || null;
}

function currentHead(runtime) {
  const g = currentGeneration(runtime);
  if (!g) return null;
  return {
    sequence: g.sequence,
    generation_sha256: g.generation_sha256,
    parent_generation_sha256: g.parent_generation_sha256,
    contracts: clone(g.contracts),
  };
}

function planMutation(runtime, request) {
  request = request || {};
  const base = currentGeneration(runtime);
  if (!base) return fail('HOLD_NO_CURRENT_GENERATION');
  const selectors = [...new Set((request.selectors || []).map(String).filter(Boolean))].sort();
  if (!selectors.length) return fail('HOLD_MUTATION_SELECTORS_REQUIRED');

  const rows = {}, claimed = new Set();
  for (const id of Object.keys(runtime.registry).sort()) {
    const spec = runtime.registry[id], matched = [];
    for (const selector of selectors) {
      if (spec.depends_on.some((p) => selectorMatches(p, selector))) {
        matched.push(selector);
        claimed.add(selector);
      }
    }
    rows[id] = {
      action: matched.length ? 'UPDATE_REQUIRED' : 'REUSE_EXACT',
      matched_selectors: matched,
      policy_kind: spec.policy_kind,
      allowed_routes: clone(spec.allowed_routes),
    };
  }

  const unknown = selectors.filter((s) => !claimed.has(s));
  if (unknown.length) return fail('HOLD_UNKNOWN_SELECTOR', { selectors, unknown_selectors: unknown });

  const body = {
    base_generation_sha256: base.generation_sha256,
    base_sequence: base.sequence,
    selectors,
    reason: request.reason || null,
    contracts: rows,
  };
  return Object.assign({ status: 'PLANNED' }, sealed(body, 'plan_sha256'));
}

function validatePlan(plan) {
  if (!plan || plan.status !== 'PLANNED') return false;
  const body = clone(plan);
  delete body.status;
  return verifySeal(body, 'plan_sha256');
}

function stageGeneration(runtime, plan, updates) {
  updates = updates || {};
  if (!validatePlan(plan)) return fail('HOLD_INVALID_PLAN');
  if (plan.base_generation_sha256 !== runtime.current_generation_sha256) {
    return fail('HOLD_STALE_BASE', { planned_base: plan.base_generation_sha256, current: runtime.current_generation_sha256 });
  }

  const prior = currentGeneration(runtime), contracts = {}, updated = [], reused = [];
  for (const id of Object.keys(runtime.registry).sort()) {
    const decision = plan.contracts[id];
    if (!decision) return fail('HOLD_PLAN_CONTRACT_MISSING', { contract: id });

    if (decision.action === 'REUSE_EXACT') {
      if (Object.prototype.hasOwnProperty.call(updates, id)) return fail('HOLD_REUSE_OVERRIDE', { contract: id });
      contracts[id] = Object.assign({}, clone(prior.contracts[id]), {
        decision: 'REUSED_EXACT',
        route: null,
        previous_artifact_sha256: prior.contracts[id].artifact_sha256,
      });
      reused.push(id);
      continue;
    }

    if (decision.action !== 'UPDATE_REQUIRED') return fail('HOLD_UNKNOWN_PLAN_ACTION', { contract: id, action: decision.action });
    const update = updates[id];
    if (!update) return fail('HOLD_UPDATE_MISSING', { contract: id });
    if (typeof update.route !== 'string' || !update.route) return fail('HOLD_ROUTE_REQUIRED', { contract: id });
    if (decision.allowed_routes.length && !decision.allowed_routes.includes(update.route)) {
      return fail('HOLD_ROUTE_NOT_ALLOWED', { contract: id, route: update.route, allowed_routes: decision.allowed_routes });
    }
    let ref;
    try { ref = normalizeArtifact(update); } catch (e) { return fail('HOLD_INVALID_ARTIFACT_REF', { contract: id, detail: e.message }); }
    contracts[id] = Object.assign({}, ref, {
      decision: 'UPDATED',
      route: update.route,
      previous_artifact_sha256: prior.contracts[id].artifact_sha256,
    });
    updated.push(id);
  }

  const gbody = generationBody(prior.sequence + 1, prior.generation_sha256, plan.plan_sha256, plan.selectors, contracts);
  const generation = sealed(gbody, 'generation_sha256');
  const sbody = {
    base_generation_sha256: prior.generation_sha256,
    plan_sha256: plan.plan_sha256,
    generation,
    updated,
    reused,
  };
  return Object.assign({ status: 'STAGED' }, sealed(sbody, 'stage_sha256'));
}

function validateStage(stage) {
  if (!stage || stage.status !== 'STAGED') return false;
  const body = clone(stage);
  delete body.status;
  if (!verifySeal(body, 'stage_sha256')) return false;
  return verifySeal(stage.generation, 'generation_sha256');
}

function invalidateHot(runtime) {
  const current = currentGeneration(runtime);
  for (const id of Object.keys(runtime.hot || {})) {
    if (!current.contracts[id] || current.contracts[id].artifact_sha256 !== runtime.hot[id].artifact_sha256) delete runtime.hot[id];
  }
}

function commitGeneration(runtime, stage, by) {
  if (!validateStage(stage)) return fail('HOLD_INVALID_STAGE');
  if (stage.base_generation_sha256 !== runtime.current_generation_sha256) {
    return fail('HOLD_STALE_STAGE', { staged_base: stage.base_generation_sha256, current: runtime.current_generation_sha256 });
  }
  const g = clone(stage.generation);
  runtime.generations[g.generation_sha256] = g;
  runtime.current_generation_sha256 = g.generation_sha256;
  invalidateHot(runtime);

  const receipt = sealed({
    type: 'generation.commit',
    sequence: g.sequence,
    generation_sha256: g.generation_sha256,
    parent_generation_sha256: g.parent_generation_sha256,
    plan_sha256: g.plan_sha256,
    updated: clone(stage.updated),
    reused: clone(stage.reused),
    by: by || null,
  }, 'receipt_sha256');
  runtime.receipts.push(receipt);
  return { status: 'COMMITTED', receipt: clone(receipt), head: currentHead(runtime) };
}

function isAncestor(runtime, target, from) {
  let sha = from;
  while (sha) {
    if (sha === target) return true;
    const g = runtime.generations[sha];
    if (!g) return false;
    sha = g.parent_generation_sha256;
  }
  return false;
}

function rollback(runtime, targetGenerationSha, by) {
  if (!runtime.generations[targetGenerationSha]) return fail('HOLD_UNKNOWN_GENERATION', { target_generation_sha256: targetGenerationSha });
  const from = runtime.current_generation_sha256;
  if (from === targetGenerationSha) return { status: 'ALREADY_CURRENT', head: currentHead(runtime) };
  if (!isAncestor(runtime, targetGenerationSha, from)) {
    return fail('HOLD_TARGET_NOT_ANCESTOR', { current_generation_sha256: from, target_generation_sha256: targetGenerationSha });
  }
  runtime.current_generation_sha256 = targetGenerationSha;
  invalidateHot(runtime);
  const g = currentGeneration(runtime);
  const receipt = sealed({
    type: 'generation.rollback',
    from_generation_sha256: from,
    to_generation_sha256: targetGenerationSha,
    to_sequence: g.sequence,
    by: by || null,
  }, 'receipt_sha256');
  runtime.receipts.push(receipt);
  return { status: 'ROLLED_BACK', receipt: clone(receipt), head: currentHead(runtime) };
}

function reactivate(runtime, targetGenerationSha, by) {
  if (!runtime.generations[targetGenerationSha]) return fail('HOLD_UNKNOWN_GENERATION', { target_generation_sha256: targetGenerationSha });
  const from = runtime.current_generation_sha256;
  if (from === targetGenerationSha) return { status: 'ALREADY_CURRENT', head: currentHead(runtime) };
  if (!isAncestor(runtime, from, targetGenerationSha)) {
    return fail('HOLD_TARGET_NOT_DESCENDANT', { current_generation_sha256: from, target_generation_sha256: targetGenerationSha });
  }
  runtime.current_generation_sha256 = targetGenerationSha;
  invalidateHot(runtime);
  const g = currentGeneration(runtime);
  const receipt = sealed({
    type: 'generation.reactivate',
    from_generation_sha256: from,
    to_generation_sha256: targetGenerationSha,
    to_sequence: g.sequence,
    by: by || null,
  }, 'receipt_sha256');
  runtime.receipts.push(receipt);
  return { status: 'REACTIVATED', receipt: clone(receipt), head: currentHead(runtime) };
}

function wakeContract(runtime, id, artifact) {
  const g = currentGeneration(runtime);
  if (!g || !g.contracts[id]) return fail('HOLD_UNKNOWN_CONTRACT', { contract: id });
  const hashKind = g.contracts[id].hash_kind || 'canonical-json';
  let observed;
  try { observed = artifactHash(artifact, hashKind); }
  catch (e) { return fail('HOLD_ARTIFACT_TYPE_MISMATCH', { contract: id, detail: e.message }); }
  if (observed !== g.contracts[id].artifact_sha256) {
    return fail('HOLD_ARTIFACT_HASH_MISMATCH', { contract: id, claimed: g.contracts[id].artifact_sha256, observed, hash_kind: hashKind });
  }
  runtime.hot[id] = hashKind === 'bytes'
    ? { artifact_sha256: observed, hash_kind: hashKind, bytes: Array.from(artifact) }
    : { artifact_sha256: observed, hash_kind: hashKind, artifact: clone(artifact) };
  return { status: 'AWAKE_VERIFIED', contract: id, artifact_sha256: observed, generation_sha256: g.generation_sha256 };
}

function sleepContract(runtime, id) {
  if (!runtime.hot[id]) return { status: 'ALREADY_DORMANT', contract: id };
  delete runtime.hot[id];
  return { status: 'DORMANT', contract: id };
}

function hotArtifact(runtime, id) {
  const entry = runtime.hot[id];
  if (!entry) return null;
  return entry.hash_kind === 'bytes' ? Uint8Array.from(entry.bytes || []) : clone(entry.artifact);
}

function persistentBody(runtime) {
  return {
    format: runtime.format,
    version: runtime.version,
    label: runtime.label,
    registry: clone(runtime.registry),
    generations: clone(runtime.generations),
    current_generation_sha256: runtime.current_generation_sha256,
    receipts: clone(runtime.receipts),
  };
}

function exportRuntime(runtime) {
  return sealed(persistentBody(runtime), 'runtime_sha256');
}

function validatePersistent(data) {
  if (!data || data.format !== FORMAT || data.version !== VERSION) throw new Error('unsupported flowing runtime');
  if (!verifySeal(data, 'runtime_sha256')) throw new Error('flow runtime hash mismatch');
  const ids = Object.keys(data.registry || {}).sort();
  if (!ids.length) throw new Error('flow runtime registry empty');
  const gens = data.generations || {};
  if (!gens[data.current_generation_sha256]) throw new Error('flow runtime current generation missing');
  for (const [sha, g] of Object.entries(gens)) {
    if (sha !== g.generation_sha256 || !verifySeal(g, 'generation_sha256')) throw new Error('flow runtime generation hash mismatch ' + sha);
    if (g.parent_generation_sha256 && !gens[g.parent_generation_sha256]) throw new Error('flow runtime missing parent ' + g.parent_generation_sha256);
    for (const id of ids) if (!g.contracts || !g.contracts[id]) throw new Error('flow runtime generation missing contract ' + id);
  }
  for (const r of data.receipts || []) if (!verifySeal(r, 'receipt_sha256')) throw new Error('flow runtime receipt hash mismatch');
  return true;
}

function importRuntime(data) {
  validatePersistent(data);
  const body = clone(data);
  delete body.runtime_sha256;
  return Object.assign(body, { hot: {} });
}

module.exports = {
  FORMAT, VERSION,
  selectorMatches, artifactRef,
  createRuntime, currentGeneration, currentHead,
  planMutation, stageGeneration, commitGeneration, rollback,
  wakeContract, sleepContract, hotArtifact,
  exportRuntime, importRuntime, validatePersistent,
};
