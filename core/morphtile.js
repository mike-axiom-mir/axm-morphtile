/*!
 * MorphTile / AxioMatter core  v0.4
 * One file, zero dependencies. Runs in Node (require) and in a browser (global `MorphTile`).
 *
 * License: PolyForm Noncommercial License 1.0.0 plus the MorphTile Creator
 * Output Permission. Commercial Creator Output is allowed; commercial
 * exploitation of the MorphTile engine requires separate written permission.
 * See LICENSE and CREATOR_OUTPUT_PERMISSION.md in the source repository.
 *
 * Sections
 *   1 util ........ canonical JSON, sha256, deterministic RNG
 *   2 tile ........ schema, create, validate, content hash (a tile may hold a whole graph in `interior`)
 *   3 logic ....... expression language, vars (sparse + closed-form accrual), signals
 *   4 world ....... graph validation, structural ops, events
 *   5 ledger ...... genesis + ordered events + checkpoints -> reconstruct (axm-global-state pattern)
 *   6 safety ...... clone -> plan -> commit -> receipt -> rollback (axm-parallel-capability pattern)
 *   7 bridges ..... evidence classes (axm-monolith), material offers (axm-material-surface-fabric), registry
 *   8 mesh ........ primitives + generators -> triangles
 *   9 forms ....... game_asset (rasterizer), ui_panel (vnodes), text (read + write), website (static HTML)
 *  10 seed ........ demo world + presets
 *  11 door ........ act(): one caller-neutral JSON contract for human UI, AI agents and scripts
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MorphTile = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ───────────────────────────── 1 util
  const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  const hasOwn = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  function putOwn(o, k, v) { Object.defineProperty(o, k, { value: v, enumerable: true, configurable: true, writable: true }); return v; }
  function canonical(v) {
    if (v === null || v === undefined || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    const ks = Object.keys(v).filter((k) => v[k] !== undefined).sort();
    return '{' + ks.map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  const K256 = [], H256 = [];
  (function () {
    const frac = (x) => ((x - Math.floor(x)) * 4294967296) | 0;
    let n = 2, c = 0;
    while (c < 64) {
      let p = true;
      for (let i = 2; i * i <= n; i++) if (n % i === 0) { p = false; break; }
      if (p) { if (c < 8) H256.push(frac(Math.sqrt(n))); K256.push(frac(Math.cbrt(n))); c++; }
      n++;
    }
  })();
  const utf8 = (s) => new TextEncoder().encode(s);
  function sha256(input) {
    const m = typeof input === 'string' ? utf8(input) : input;
    const l = m.length, N = ((l + 8) >> 6) + 1, b = new Uint8Array(N * 64);
    b.set(m); b[l] = 0x80;
    const dv = new DataView(b.buffer);
    dv.setUint32(N * 64 - 8, Math.floor(l / 536870912)); dv.setUint32(N * 64 - 4, (l << 3) >>> 0);
    const h = H256.slice(), w = new Int32Array(64);
    for (let o = 0; o < b.length; o += 64) {
      for (let t = 0; t < 16; t++) w[t] = dv.getInt32(o + t * 4);
      for (let t = 16; t < 64; t++) {
        const x = w[t - 15], y = w[t - 2];
        const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      let a = h[0], bb = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (let t = 0; t < 64; t++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K256[t] + w[t]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const t2 = (S0 + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + bb) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    return h.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  const hashOf = (v) => sha256(canonical(v));
  function ihash(x, y, s) { // integer lattice hash -> [0,1). No trig: identical on every engine.
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // ───────────────────────────── 2 tile
  const FACETS = ['mesh', 'material', 'behavior', 'logic', 'connect'];
  const FACET_TYPES = {
    mesh: ['primitive', 'reference', 'generated', 'interior'], material: ['primitive', 'reference', 'generated'],
    behavior: ['none', 'scripted', 'reference'], logic: ['none', 'rule', 'reference'],
  };
  const KNOWN_FORMS = ['game_asset', 'ui_panel', 'website', 'vehicle', 'character', 'world', 'tool'];
  const SPATIAL_FORMS = ['game_asset', 'vehicle', 'character', 'world'];
  const PRESENTATION_MODES = ['screen', 'docked', 'floating', 'fullscreen', 'embedded', 'world', 'tile'];
  const SAVE_POLICY_MODES = ['none', 'profile'];
  function savePolicyError(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return 'save_policy must be an object';
    if (!SAVE_POLICY_MODES.includes(p.mode)) return 'save_policy.mode must be none|profile';
    if (p.ai_bridge != null && typeof p.ai_bridge !== 'boolean') return 'save_policy.ai_bridge must be boolean';
    if (p.mode === 'none' && p.ai_bridge === true) return 'save_policy.ai_bridge cannot be true when saves are disabled';
    return null;
  }
  function normalizeSavePolicy(p) { return { mode: p.mode, ai_bridge: p.mode === 'profile' ? !!p.ai_bridge : false }; }
  function childWorldError(id, spec) {
    if (!id || !/^[A-Za-z0-9_.-]+$/.test(id)) return 'child world id must be [A-Za-z0-9_.-]+';
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return 'child world must be an object';
    if (typeof spec.world_ref !== 'string' || !spec.world_ref) return 'child world needs an opaque world_ref';
    if (spec.activation != null && spec.activation !== 'lazy') return 'child world activation must be lazy';
    if (spec.label != null && typeof spec.label !== 'string') return 'child world label must be a string';
    if (spec.via != null) {
      if (typeof spec.via !== 'object' || Array.isArray(spec.via)) return 'child world via must be an object';
      if (typeof spec.via.tile !== 'string' || !spec.via.tile) return 'child world via.tile must be a tile path';
      if (spec.via.action != null && (typeof spec.via.action !== 'string' || !spec.via.action)) return 'child world via.action must be a non-empty string';
    }
    for (const forbidden of ['world', 'profile', 'profiles', 'save', 'saves', 'payload']) if (spec[forbidden] !== undefined) return 'child world descriptors carry references only, not ' + forbidden;
    return null;
  }
  function normalizeChildWorld(id, spec) {
    const out = { id, world_ref: spec.world_ref, activation: 'lazy' };
    if (spec.label != null) out.label = spec.label;
    if (spec.via != null) { out.via = { tile: spec.via.tile }; if (spec.via.action != null) out.via.action = spec.via.action; }
    return out;
  }
  const savePolicyOf = (world) => world && world.save_policy ? clone(world.save_policy) : null;
  const childWorldOf = (world, id) => clone(((world && world.child_worlds) || {})[id] || null);
  const IDENTITY_SPATIAL_ROOT = { origin: [0, 0, 0], rotation: [0, 0, 0] };
  const vec = (v, n) => Array.isArray(v) && v.length === n && v.every((x) => typeof x === 'number' && isFinite(x));
  function spatialRootOf(world) {
    const r = world && world.spatial_root;
    return r ? { origin: clone(r.origin), rotation: clone(r.rotation || [0, 0, 0]), explicit: true } : { origin: [0, 0, 0], rotation: [0, 0, 0], explicit: false };
  }
  function presentationError(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return 'presentation must be an object';
    const unknown = Object.keys(p).filter((k) => !['mode', 'dock', 'preferred_size', 'preferred_position', 'user_adjustable', 'anchor'].includes(k)).sort();
    if (unknown.length) return 'presentation unknown fields: ' + unknown.join(', ');
    if (!PRESENTATION_MODES.includes(p.mode)) return 'presentation.mode must be ' + PRESENTATION_MODES.join('|');
    if (p.dock != null && !['left', 'right', 'top', 'bottom'].includes(p.dock)) return 'presentation.dock must be left|right|top|bottom';
    if (p.preferred_size != null && (!vec(p.preferred_size, 2) || p.preferred_size.some((x) => x <= 0))) return 'presentation.preferred_size must be two positive numbers';
    if (p.preferred_position != null && !(vec(p.preferred_position, 2) || vec(p.preferred_position, 3))) return 'presentation.preferred_position must be two or three numbers';
    if (p.user_adjustable != null && typeof p.user_adjustable !== 'boolean') return 'presentation.user_adjustable must be boolean';
    if (p.anchor != null && typeof p.anchor !== 'string') return 'presentation.anchor must be a tile path string';
    return null;
  }
  // Public authored wake contract. Validation never resolves grants or wakes a node.
  function capabilityError(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return 'capability must be an object';
    if (typeof c.id !== 'string' || !c.id) return 'a capability needs a non-empty string id';
    if (c.wake === undefined) return null; // Omitted wake is the existing manual default.
    const w = c.wake, finite = (x) => typeof x === 'number' && Number.isFinite(x);
    if (!w || typeof w !== 'object' || Array.isArray(w)) return 'capability wake must be an object';
    const fields = {
      manual: ['on'], signal: ['on', 'name'], near: ['on', 'within', 'hysteresis', 'sleeps'],
      value: ['on', 'tile', 'var', 'over', 'under', 'sleeps'], time: ['on', 'after', 'sleeps'],
    };
    if (typeof w.on !== 'string' || !Object.prototype.hasOwnProperty.call(fields, w.on)) return 'capability wake.on must be manual|signal|near|value|time';
    const unknown = Object.keys(w).filter((k) => !fields[w.on].includes(k)).sort();
    if (unknown.length) return 'capability wake unknown fields: ' + unknown.join(', ');
    if (w.sleeps !== undefined && typeof w.sleeps !== 'boolean') return 'capability wake.sleeps must be boolean';
    if (w.on === 'signal' && (typeof w.name !== 'string' || !w.name)) return 'signal wake needs a non-empty name';
    if (w.on === 'near') {
      if (w.within !== undefined && (!finite(w.within) || w.within <= 0)) return 'near wake.within must be a positive finite number';
      if (w.hysteresis !== undefined && (!finite(w.hysteresis) || w.hysteresis < 1)) return 'near wake.hysteresis must be a finite number >= 1';
    }
    if (w.on === 'value') {
      if (typeof w.var !== 'string' || !w.var) return 'value wake needs a non-empty var name';
      if (w.tile !== undefined && (typeof w.tile !== 'string' || (w.tile !== '' && !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(w.tile)))) return 'value wake.tile must be a descendant tile path or empty for this tile';
      if ((w.over !== undefined) === (w.under !== undefined)) return 'value wake needs exactly one of over or under';
      if (!finite(w.over !== undefined ? w.over : w.under)) return 'value wake threshold must be a finite number';
    }
    if (w.on === 'time' && (!finite(w.after) || w.after < 0)) return 'time wake.after must be a non-negative finite number';
    return null;
  }
  function defaultFacets() {
    return {
      mesh: { type: 'primitive', source: null, data: { shape: 'box', size: [1, 1, 1] } },
      material: { type: 'primitive', source: null, data: { color: [0.55, 0.62, 0.9] } },
      behavior: { type: 'none', data: {} },
      logic: { type: 'none', data: {} },
      connect: { sockets: [], bridges: [], place: [0, 0, 0] },
    };
  }
  function contentHash(tile) {
    return hashOf({ id: tile.id, kind: tile.kind, version: tile.version, name: tile.name, facets: tile.facets, form_hints: tile.form_hints, interior: tile.interior, params: tile.params, capabilities: tile.capabilities, view: tile.view, presentation: tile.presentation });
  }
  function createTile(spec) {
    spec = spec || {};
    const facets = Object.assign(defaultFacets(), clone(spec.facets || {}));
    const name = spec.name || 'Untitled tile';
    const id = spec.id || 'mt_' + hashOf({ name, facets, salt: spec.salt || 0 }).slice(0, 6);
    const tile = {
      id, kind: 'morphtile', version: '0.1', name, facets,
      form_hints: clone(spec.form_hints || ['game_asset', 'ui_panel']),
      provenance: { created_by: spec.created_by || 'human', bridges: clone(spec.bridges || []), sha256: null },
      state: { version: 1, mutable: true, last_transform: null },
    };
    if (spec.params) tile.params = clone(spec.params);
    if (spec.capabilities !== undefined) tile.capabilities = clone(spec.capabilities);
    if (spec.view) tile.view = clone(spec.view);
    if (spec.presentation !== undefined) tile.presentation = clone(spec.presentation);
    tile.provenance.sha256 = contentHash(tile);
    return tile;
  }
  function validateTile(tile) {
    const e = [];
    if (!tile || typeof tile !== 'object') return { ok: false, errors: ['tile is not an object'] };
    if (typeof tile.id !== 'string' || !/^[A-Za-z0-9_\-]+$/.test(tile.id)) e.push('id must be [A-Za-z0-9_-]+');
    if (tile.kind !== 'morphtile') e.push('kind must be "morphtile"');
    if (!tile.facets) e.push('facets missing');
    else {
      for (const f of FACETS) if (!tile.facets[f]) e.push('facet missing: ' + f);
      for (const f in FACET_TYPES) if (tile.facets[f] && !FACET_TYPES[f].includes(tile.facets[f].type)) e.push(f + '.type invalid: ' + tile.facets[f].type);
      const cn = tile.facets.connect || {};
      if (cn.place != null && !vec(cn.place, 3)) e.push('connect.place must be three finite numbers');
      if (cn.rotation != null && !vec(cn.rotation, 3)) e.push('connect.rotation must be three finite numbers');
      const so = (tile.facets.connect && tile.facets.connect.sockets) || [], seen = {};
      for (const s of so) {
        if (!s.id) e.push('socket without id'); else if (seen[s.id]) e.push('duplicate socket ' + s.id); seen[s.id] = 1;
        if (s.kind !== 'attach' && s.kind !== 'signal') e.push('socket ' + s.id + ' kind must be attach|signal');
        if (s.kind === 'signal' && s.dir !== 'in' && s.dir !== 'out') e.push('signal socket ' + s.id + ' needs dir in|out');
      }
    }
    if (!Array.isArray(tile.form_hints)) e.push('form_hints must be an array');
    if (tile.presentation !== undefined) { const bad = presentationError(tile.presentation); if (bad) e.push(bad); }
    if (tile.capabilities !== undefined) {
      if (!Array.isArray(tile.capabilities)) e.push('capabilities must be an array');
      else {
        const seen = new Set();
        for (const c of tile.capabilities) {
          const bad = capabilityError(c);
          if (bad) e.push(bad);
          if (c && typeof c.id === 'string') { if (seen.has(c.id)) e.push('duplicate capability ' + c.id); seen.add(c.id); }
        }
      }
    }
    return { ok: e.length === 0, errors: e };
  }
  const findSocket = (tile, id) => ((tile.facets.connect.sockets || []).find((s) => s.id === id) || null);

  // ───────────────────────────── 3 logic
  function evalExpr(x, ctx) {
    if (!Array.isArray(x)) return x;
    const op = x[0], v = (i) => evalExpr(x[i + 1], ctx);
    switch (op) {
      case 'var': return ctx.get(x[1]);
      case 't': return ctx.t;
      case '+': return v(0) + v(1); case '-': return v(0) - v(1); case '*': return v(0) * v(1);
      case '/': { const d = v(1); return d === 0 ? 0 : v(0) / d; }
      case '%': { const d = v(1); return d === 0 ? 0 : v(0) % d; }
      case 'min': return Math.min(v(0), v(1)); case 'max': return Math.max(v(0), v(1));
      case 'floor': return Math.floor(v(0));
      case 'abs': return Math.abs(v(0));
      case 'sqrt': { const a = v(0); return a < 0 ? 0 : Math.sqrt(a); }
      case 'pow': return Math.pow(v(0), v(1));
      case 'sin': return Math.sin(v(0)); case 'cos': return Math.cos(v(0));
      case 'wrap': { const a = v(0), b = v(1); return b === 0 ? 0 : a - b * Math.floor(a / b); }
      case '==': return v(0) === v(1); case '!=': return v(0) !== v(1);
      case '<': return v(0) < v(1); case '>': return v(0) > v(1); case '<=': return v(0) <= v(1); case '>=': return v(0) >= v(1);
      case 'and': return !!(v(0) && v(1)); case 'or': return !!(v(0) || v(1)); case 'not': return !v(0);
      case 'if': return v(0) ? v(1) : v(2);
      default: { // a word the world itself defined: the vocabulary is not the engine's to own
        const w = ctx.words && ctx.words[op];
        if (!w) return null; // still unknown: inert, never executes anything
        const depth = (ctx.depth || 0) + 1;
        if (depth > 12) return null; // a word that leans on itself forever simply stops being readable
        const args = (w.args || []).map((_, i) => evalExpr(x[i + 1], ctx)), scope = {};
        (w.args || []).forEach((n, i) => (scope[n] = args[i]));
        return evalExpr(w.body, { t: ctx.t, depth, words: ctx.words, get: (n) => (n in scope ? scope[n] : ctx.get ? ctx.get(n) : undefined) });
      }
    }
  }
  const BUILTIN_WORDS = ['var', 't', '+', '-', '*', '/', '%', 'min', 'max', 'floor', 'abs', 'sqrt', 'pow', 'sin', 'cos', 'wrap', '==', '!=', '<', '>', '<=', '>=', 'and', 'or', 'not', 'if'];
  const wordsOf = (world) => (world && world.words) || null;
  // Paths. "mt_a/mt_b/mt_c" addresses a tile at any depth: a tile may hold a whole graph in `interior`
  // ({tiles, edges, ports}). The root world and every interior are the same kind of container.
  const splitPath = (p) => { const i = p.lastIndexOf('/'); return i < 0 ? ['', p] : [p.slice(0, i), p.slice(i + 1)]; };
  const join = (c, id) => (c ? c + '/' + id : id);
  function resolveTile(world, path) {
    let c = world, t = null, walked = '';
    for (const seg of String(path).split('/')) {
      t = c && c.tiles[seg];
      if (!t) return null;
      walked = walked ? walked + '/' + seg : seg;
      c = (typeof activeTile === 'function' ? activeTile(world, walked, t) : t).interior;
    }
    return t;
  }
  // The tile as addressed, with whatever is awake in it — the form every reader wants.
  const liveTile = (world, path) => { const t = resolveTile(world, path); return t ? activeTile(world, path, t) : null; };
  function containerAt(world, cpath, raw) { if (!cpath) return world; const t = resolveTile(world, cpath); if (!t) return null; return ((raw ? t : activeTile(world, cpath, t)).interior) || null; }
  function countTiles(c, world, prefix) {
    world = world || c;
    return Object.keys(c.tiles).reduce((n, k) => { const path = prefix ? prefix + '/' + k : k, t = (world.tiles ? activeTile(world, path, c.tiles[k]) : c.tiles[k]); return n + 1 + (t.interior ? countTiles(t.interior, world, path) : 0); }, 0);
  }
  const depthOf = (tile) => (tile.interior ? 1 + Math.max(0, ...Object.keys(tile.interior.tiles).map((k) => depthOf(tile.interior.tiles[k]))) : 0);

  // Sleeping capabilities. A tile may carry capabilities that are inert data until something needs them: no geometry,
  // no rules, no state, no cost. Waking is runtime state (sparse, in world.awake, keyed by path), never a rewrite of the
  // matter — so the same sleeping node is cheap in a thousand places and wakes independently in each.
  const capCache = new Map();
  function grantOnto(t, g) {
    if (!g) return t;
    if (g.facets) for (const f in g.facets) t.facets[f] = clone(g.facets[f]);
    if (g.sockets) t.facets.connect.sockets = (t.facets.connect.sockets || []).concat(clone(g.sockets));
    if (g.params) t.params = (t.params || []).concat(clone(g.params));
    if (g.interior) { t.interior = clone(g.interior); if (!g.facets || !g.facets.mesh) t.facets.mesh = { type: 'interior', source: null, data: {} }; }
    if (g.form_hints) t.form_hints = t.form_hints.concat(g.form_hints.filter((h) => !t.form_hints.includes(h)));
    if (g.name) t.name = g.name;
    return t;
  }
  // The tile as it currently behaves: its matter, plus whatever capabilities are awake here. Nothing is stored.
  // A capability may carry its matter inline, or name a shared definition it brings. The reference is resolved only at
  // the moment of waking — so a node can carry a city it does not hold, and a missing definition is a visible HOLD, never
  // a silently empty room.
  function grantsOf(world, cap) {
    if (!cap.grants_ref) return { grants: cap.grants || {}, status: 'INLINE' };
    const def = (world.defs || {})[cap.grants_ref.def];
    if (!def) return { grants: null, status: 'HOLD_DEFINITION_NOT_HERE', evidence: 'declared_contract_match_not_tested' };
    const g = Object.assign({}, cap.grants || {});
    for (const k of ['facets', 'form_hints', 'params', 'interior', 'capabilities']) if (def.body[k] !== undefined && g[k] === undefined) g[k] = def.body[k];
    return { grants: g, status: 'RESOLVED', evidence: 'verified_payload_sha256', from: def.id };
  }
  function capStatus(world, path, cap) {
    const r = grantsOf(world, cap);
    return { id: cap.id, awake: isAwake(world, path, cap.id), status: r.status, from: r.from || null, wake: cap.wake || { on: 'manual' } };
  }
  function activeTile(world, path, tile) {
    tile = tile || resolveTile(world, path);
    if (!tile || !tile.capabilities || !tile.capabilities.length) return tile;
    const awake = (world.awake || {})[path];
    if (!awake) return tile;
    const on = tile.capabilities.filter((c) => awake[c.id]);
    if (!on.length) return tile;
    const key = tile.provenance.sha256 + '|' + on.map((c) => c.id).join(',') + '|' + on.map((c) => (c.grants_ref ? hashOf((world.defs || {})[c.grants_ref.def] || null) : '')).join(',');
    if (capCache.has(key)) return capCache.get(key);
    let out = clone(tile), held = null;
    for (const c of on) { const r = grantsOf(world, c); if (r.grants) grantOnto(out, r.grants); else held = (held || []).concat({ capability: c.id, status: r.status }); }
    if (held) { out.facets.material = Object.assign({}, out.facets.material, { data: Object.assign({}, out.facets.material.data, { hold: held[0].status }) }); out.provenance = Object.assign({}, out.provenance, { held }); }
    out.provenance = Object.assign({}, out.provenance, { awake: on.map((c) => c.id) });
    if (capCache.size > 300) capCache.clear();
    capCache.set(key, out);
    return out;
  }
  const capOf = (tile, id) => ((tile.capabilities || []).find((c) => c.id === id) || null);
  const isAwake = (world, path, id) => !!((world.awake || {})[path] || {})[id];
  function setAwake(world, path, id, on) {
    const bag = (world.awake = world.awake || {}), here = bag[path] || (bag[path] = {});
    if (on) here[id] = true; else delete here[id];
    if (!Object.keys(here).length) delete bag[path];
  }
  // What the world would wake or put to sleep right now, given where the viewer is and what time it is.
  // This is a pure question: it reads, and returns events for the caller to record. Nothing here writes.
  function pendingWakes(world, ctx) {
    ctx = ctx || {};
    const at = ctx.t == null ? world.time : ctx.t, out = [], here = (p) => { const m = tileMatrix(world, p, at, ctx.memo || {}); return m && m.t; };
    for (const e of leaves(world, { active: true })) {
      for (const c of e.tile.capabilities || []) {
        const w = c.wake || { on: 'manual' }, awake = isAwake(world, e.path, c.id);
        let want = null;
        if (w.on === 'near' && ctx.from) { const p = here(e.path); if (p) { const d = Math.hypot(p[0] - ctx.from[0], p[1] - ctx.from[1], p[2] - ctx.from[2]); want = d <= (w.within || 8) ? true : d > (w.within || 8) * (w.hysteresis || 1.25) ? false : null; } }
        else if (w.on === 'value') { const v = getVar(world, w.tile ? join(e.path, w.tile) : e.path, w.var, at); if (v !== undefined) want = w.over !== undefined ? v > w.over : w.under !== undefined ? v < w.under : null; }
        else if (w.on === 'time') want = at >= (w.after || 0);
        if (want === true && !awake) out.push({ type: 'wake', tile: e.path, capability: c.id, why: w.on });
        else if (want === false && awake && w.sleeps !== false) out.push({ type: 'sleep', tile: e.path, capability: c.id, why: w.on });
      }
    }
    return out;
  }
  function sleepingReport(world) { // what this world is carrying but not spending anything on
    let asleep = 0, awake = 0, carriers = 0;
    for (const e of leaves(world, { active: true })) { const caps = e.tile.capabilities || []; if (!caps.length) continue; carriers++; for (const c of caps) (isAwake(world, e.path, c.id) ? awake++ : asleep++); }
    return { carriers, awake, asleep };
  }
  const isAccrual = (def) => !!(def && typeof def === 'object' && def.accrue);
  function varDefs(tile) { return (tile.facets.logic.type === 'rule' && tile.facets.logic.data.vars) || {}; }
  function getVar(world, path, name, t, depth, tile) {
    tile = tile || activeTile(world, path);
    if (!tile) return undefined;
    const def = varDefs(tile)[name], muts = world.vars[path], mut = muts ? muts[name] : undefined;
    if (isAccrual(def)) {
      // closed form: value = base + rate * (t - t0). Nothing is simulated while time passes.
      const base = mut ? mut.base : def.base || 0, t0 = mut ? mut.t0 : 0;
      const ctx = { t, words: wordsOf(world), get: (n) => ((depth || 0) > 8 ? 0 : getVar(world, path, n, t, (depth || 0) + 1, tile)) };
      const rate = Number(evalExpr(def.accrue.rate, ctx)) || 0;
      const val = base + rate * Math.max(0, t - t0);
      return def.accrue.cap != null ? Math.min(def.accrue.cap, val) : val;
    }
    return mut !== undefined ? mut : def;
  }
  function setVar(world, path, tile, name, value, t) {
    const def = varDefs(tile)[name];
    const bag = world.vars[path] || (world.vars[path] = {});
    if (isAccrual(def)) bag[name] = { base: Number(value) || 0, t0: t };
    else if (canonical(value) === canonical(def)) delete bag[name]; // persist mutations, not untouched possibility
    else bag[name] = value;
    if (Object.keys(bag).length === 0) delete world.vars[path];
  }
  function readVars(world, path, t) { const tile = activeTile(world, path), o = {}; if (tile) for (const n of Object.keys(varDefs(tile))) o[n] = getVar(world, path, n, t, 0, tile); return o; }
  const tileCtx = (world, path, t, tile) => ({ t, words: wordsOf(world), get: (n) => getVar(world, path, n, t, 0, tile) });
  function rekeyVars(vars, rekeys) { // state follows a tile when it moves deeper or shallower; values are never touched
    for (const [from, to] of rekeys || []) for (const k of Object.keys(vars)) if (k === from || k.startsWith(from + '/')) { vars[to + k.slice(from.length)] = vars[k]; delete vars[k]; }
    return vars;
  }
  const sortedEdges = (c) => Object.keys(c.edges).sort().map((k) => c.edges[k]);
  function deliver(world, path, name, t, depth, trace) {
    let tile = resolveTile(world, path);
    if (!tile) return;
    for (const c of tile.capabilities || []) if (!isAwake(world, path, c.id) && c.wake && c.wake.on === 'signal' && typeof c.wake.name === 'string' && c.wake.name.length && c.wake.name === name) { setAwake(world, path, c.id, true); trace.push({ tile: path, woke: c.id }); } // only the explicitly named signal wakes it
    tile = activeTile(world, path, tile);
    if (depth > 48) { trace.push({ halt: 'signal depth limit', tile: path }); return; }
    trace.push({ tile: path, signal: name });
    const lg = tile.facets.logic;
    if (lg.type === 'rule') for (const r of lg.data.rules || []) {
      if (r.on !== name) continue;
      const ctx = tileCtx(world, path, t, tile);
      if (r.if !== undefined && !evalExpr(r.if, ctx)) continue;
      for (const act of r.do || []) {
        if (act.wake) setAwake(world, path, act.wake, true);
        else if (act.sleep) setAwake(world, path, act.sleep, false);
        else if (act.set) setVar(world, path, tile, act.set[0], evalExpr(act.set[1], ctx), t);
        else if (act.emit) emitFromSockets(world, path, outSocketsOf(tile, act.emit), t, depth + 1, trace);
      }
    }
    if (tile.interior) for (const p of tile.interior.ports || []) { // a port passes the signal inward, unchanged
      const s = findSocket(tile, p.id);
      if (!s || s.kind !== 'signal' || s.dir !== 'in' || (s.signal || s.id) !== name) continue;
      const inner = tile.interior.tiles[p.tile], is = inner && findSocket(inner, p.socket);
      if (is) deliver(world, join(path, p.tile), is.signal || is.id, t, depth + 1, trace);
    }
  }
  const outSocketsOf = (tile, outName) => (tile.facets.connect.sockets || []).filter((s) => s.kind === 'signal' && s.dir === 'out' && (s.signal || s.id) === outName).map((s) => s.id);
  function emitFromSockets(world, path, socketIds, t, depth, trace) {
    if (!socketIds.length || depth > 48) return;
    const [cpath, id] = splitPath(path), c = containerAt(world, cpath);
    if (!c) return;
    for (const e of sortedEdges(c)) {
      if (e.kind !== 'signal' || e.from.tile !== id || !socketIds.includes(e.from.socket)) continue;
      const tt = c.tiles[e.to.tile], ts = tt && findSocket(tt, e.to.socket);
      if (ts) deliver(world, join(cpath, e.to.tile), ts.signal || ts.id, t, depth, trace);
    }
    if (cpath) emitFromSockets(world, cpath, (c.ports || []).filter((p) => p.tile === id && socketIds.includes(p.socket)).map((p) => p.id), t, depth + 1, trace); // and outward through the shell
  }

  // ───────────────────────────── 4 world
  function createWorld(name, opts) {
    opts = opts || {};
    const world = { kind: 'morphtile-world', version: '0.1', name: name || 'Untitled world', spatial_root: clone(IDENTITY_SPATIAL_ROOT), tiles: {}, edges: {}, vars: {}, defs: {}, time: 0 };
    if (opts.save_policy !== undefined) { const bad = savePolicyError(opts.save_policy); if (bad) throw new Error(bad); world.save_policy = normalizeSavePolicy(opts.save_policy); }
    return world;
  }
  // Definitions: one shared body that many tiles ARE. The body lives once in world.defs; each instance is a real tile
  // with its own id, name, place, wires and state. Syncing a definition rewrites every instance's body through ordinary
  // merge units — so instancing gains nothing that is hidden from planning, receipts or rollback.
  const BODY = ['facets', 'form_hints', 'params', 'interior', 'capabilities', 'view', 'presentation'];
  // A body is what the instances share. It deliberately excludes everything that is each instance's own:
  // its place, and — at every depth inside it — each tile's state and provenance. Those are history, not shape.
  const stripHistory = (c) => { for (const k in c.tiles) { const t = c.tiles[k]; delete t.state; delete t.provenance; if (t.interior) stripHistory(t.interior); } return c; };
  function bodyOf(tile) { const b = {}; for (const k of BODY) if (tile[k] !== undefined) b[k] = clone(tile[k]); if (b.facets) { b.facets.connect = clone(b.facets.connect); delete b.facets.connect.place; delete b.facets.connect.rotation; } if (b.interior) stripHistory(b.interior); return b; }
  const bodyHash = (body) => hashOf(body);
  function restoreHistory(c, had, by) { // each instance keeps its own history for the tiles it already had; new ones start fresh
    for (const k in c.tiles) {
      const t = c.tiles[k], old = had && had.tiles[k];
      t.state = old ? clone(old.state) : { version: 1, mutable: true, last_transform: null };
      t.provenance = old ? clone(old.provenance) : { created_by: by || 'human', bridges: [], sha256: null };
      if (t.interior) restoreHistory(t.interior, old && old.interior, by);
      t.provenance.sha256 = contentHash(t);
    }
    return c;
  }
  function applyBody(tile, body) {
    const place = tile.facets.connect.place, rotation = tile.facets.connect.rotation, had = tile.interior;
    for (const k of BODY) { if (body[k] === undefined) delete tile[k]; else tile[k] = clone(body[k]); }
    if (place !== undefined) tile.facets.connect.place = clone(place);
    if (rotation !== undefined) tile.facets.connect.rotation = clone(rotation); else delete tile.facets.connect.rotation;
    if (tile.interior) restoreHistory(tile.interior, had, tile.provenance && tile.provenance.created_by);
    tile.provenance.sha256 = contentHash(tile); return tile;
  }
  function instancesOf(world, defId) { const out = []; for (const e of leaves(world)) if (e.tile.provenance && e.tile.provenance.instance_of === defId) out.push(e); return out; }
  function defDrift(world, defId) { const def = (world.defs || {})[defId]; if (!def) return null; const h = bodyHash(def.body); return instancesOf(world, defId).filter((e) => bodyHash(bodyOf(e.tile)) !== h).map((e) => e.path); }
  const structHash = (world) => {
    const matter = { tiles: world.tiles, edges: world.edges, defs: world.defs || {}, words: world.words || {}, spatial_root: world.spatial_root };
    if (world.save_policy !== undefined) matter.save_policy = world.save_policy;
    if (world.child_worlds !== undefined) matter.child_worlds = world.child_worlds;
    return hashOf(matter);
  };
  const parentEdgeOf = (c, tileId) => sortedEdges(c).find((e) => e.kind === 'attach' && e.to.tile === tileId) || null;
  const childrenOf = (c, tileId) => sortedEdges(c).filter((e) => e.kind === 'attach' && e.from.tile === tileId).map((e) => e.to.tile);
  const rootsOf = (c) => Object.keys(c.tiles).sort().filter((id) => !parentEdgeOf(c, id));
  function validateContainer(c, prefix, e) {
    const at = (id) => join(prefix, id);
    for (const id in c.tiles) {
      const t = c.tiles[id], r = validateTile(t);
      if (!r.ok) e.push(...r.errors.map((m) => at(id) + ': ' + m));
      if (t.id !== id) e.push(at(id) + ': key does not match tile.id');
      for (const p of t.params || []) { const bad = checkParam(t, p); if (bad) e.push(at(id) + ': ' + bad); }
      if (t.interior) {
        for (const p of t.interior.ports || []) {
          const inner = t.interior.tiles[p.tile], is = inner && findSocket(inner, p.socket), os = findSocket(t, p.id);
          if (!is) e.push(at(id) + ': port ' + p.id + ' points at a missing inner socket');
          else if (!os || !os.port || os.kind !== is.kind || os.dir !== is.dir) e.push(at(id) + ': port ' + p.id + ' does not match its inner socket');
        }
        validateContainer(t.interior, at(id), e);
      }
    }
    const parents = {};
    for (const id in c.edges) {
      const ed = c.edges[id], a = c.tiles[ed.from.tile], b = c.tiles[ed.to.tile], nm = 'edge ' + at(id);
      if (!a || !b) { e.push(nm + ': missing tile'); continue; }
      if (a === b) { e.push(nm + ': a tile cannot connect to itself'); continue; }
      const sa = findSocket(a, ed.from.socket), sb = findSocket(b, ed.to.socket);
      if (!sa || !sb) { e.push(nm + ': missing socket'); continue; }
      if (sa.kind !== ed.kind || sb.kind !== ed.kind) { e.push(nm + ': socket kind mismatch (' + ed.kind + ')'); continue; }
      if (ed.kind === 'signal' && (sa.dir !== 'out' || sb.dir !== 'in')) e.push(nm + ': signal edges run out -> in');
      if (ed.kind === 'attach') { if (parents[ed.to.tile]) e.push(nm + ': ' + ed.to.tile + ' already has a parent'); parents[ed.to.tile] = ed.from.tile; }
    }
    for (const id in parents) { let cur = id, n = 0; while (parents[cur] && n++ < 1000) { cur = parents[cur]; if (cur === id) { e.push('attach cycle through ' + at(id)); break; } } }
  }
  function validateWorld(world) {
    const e = [], root = spatialRootOf(world);
    if (!vec(root.origin, 3) || !vec(root.rotation, 3)) e.push('spatial_root needs three-number origin and rotation arrays');
    else if (canonical(root.origin) !== canonical([0, 0, 0]) || canonical(root.rotation) !== canonical([0, 0, 0])) e.push('spatial_root is the canonical identity frame; place content through tile-local frames instead');
    if (world.save_policy !== undefined) { const bad = savePolicyError(world.save_policy); if (bad) e.push(bad); }
    if (world.child_worlds !== undefined) {
      if (!world.child_worlds || typeof world.child_worlds !== 'object' || Array.isArray(world.child_worlds)) e.push('child_worlds must be an object');
      else for (const id of Object.keys(world.child_worlds)) {
        const child = world.child_worlds[id], bad = childWorldError(id, child);
        if (bad) e.push('child world ' + id + ': ' + bad);
        else if (child.id !== id) e.push('child world ' + id + ': key does not match child.id');
      }
    }
    validateContainer(world, '', e);
    for (const entry of leaves(world)) { const d = entry.tile.provenance && entry.tile.provenance.instance_of; if (d && !(world.defs || {})[d]) e.push(entry.path + ': points at a definition that is not here: ' + d); }
    return { ok: e.length === 0, errors: e };
  }
  function nextEdgeId(c, edge) {
    let base = (edge.kind === 'signal' ? 's_' : 'a_') + hashOf([edge.from, edge.to, edge.kind]).slice(0, 5), id = base, n = 1;
    while (c.edges[id]) id = base + '_' + n++;
    return id;
  }
  // Parameters: a simple control on a tile that WRITES INTO real facet data, its own or any tile inside it at any depth.
  // A parameter stores no value of its own; its value is read back from the first place it is bound to. It is a surface, never a copy.
  const getAt = (obj, at) => { if (!at) return obj; let o = obj; for (const k of at.split('.')) { if (o == null || typeof o !== 'object' || !(k in o)) return undefined; o = o[k]; } return o; };
  function setAt(obj, at, value) { const ks = at.split('.'); let o = obj; for (let i = 0; i < ks.length - 1; i++) { o = o[ks[i]]; if (o == null || typeof o !== 'object') throw new Error('no such place: ' + at); } if (!(ks[ks.length - 1] in o)) throw new Error('no such place: ' + at); o[ks[ks.length - 1]] = value; }
  const relTile = (tile, rel) => { let t = tile; if (rel) for (const seg of rel.split('/')) { t = t && t.interior && t.interior.tiles[seg]; if (!t) return null; } return t; };
  function paramValue(tile, param) { const b = param.binds[0], target = relTile(tile, b.tile || ''); return target ? getAt(target.facets[b.facet], b.at) : undefined; }
  function checkParam(tile, p, strict) { // strict when a parameter is created; afterwards a missing place only makes the control dormant (the matter may be reshaped freely)
    if (!p || !p.id || !Array.isArray(p.binds) || !p.binds.length) return 'a parameter needs an id and at least one binding';
    if (p.binds[0].expr !== undefined) return 'the first binding is where the value is read from, so it cannot have an expression';
    if (p.type === 'choice' && !(p.options || []).length) return 'a choice parameter needs options';
    for (const b of p.binds) { const target = relTile(tile, b.tile || ''); if (!target) return 'parameter ' + p.id + ' points at a missing tile: ' + b.tile; if (!FACETS.includes(b.facet)) return 'unknown facet ' + b.facet; if (strict && getAt(target.facets[b.facet], b.at) === undefined) return 'parameter ' + p.id + ' points at a missing place: ' + b.facet + '.' + b.at; }
    return null;
  }
  function addPort(shell, innerTile, socketId) { // expose one inner socket on the shell; returns the shell-side socket id
    const it = shell.interior, have = it.ports.find((p) => p.tile === innerTile.id && p.socket === socketId);
    if (have) return have.id;
    const s = findSocket(innerTile, socketId), socks = shell.facets.connect.sockets;
    if (!s) throw new Error('no socket ' + socketId + ' on ' + innerTile.id);
    let pid = socketId, n = 1;
    if (socks.some((x) => x.id === pid)) pid = innerTile.id + '.' + socketId;
    while (socks.some((x) => x.id === pid)) pid = innerTile.id + '.' + socketId + '_' + n++;
    const o = { id: pid, kind: s.kind, port: true, label: s.label || innerTile.name + ' · ' + socketId };
    if (s.kind === 'signal') { o.dir = s.dir; o.signal = s.signal || s.id; } else o.pos = [0, 0, 0];
    socks.push(o); it.ports.push({ id: pid, tile: innerTile.id, socket: socketId });
    return pid;
  }
  // Structural ops mutate the world they are given. They are only ever given disposable clones (section 6).
  // `id` is always a path; `in` names the container (path of a collapsed tile, or '' for the root).
  function applyStructOp(world, op) {
    const need = (path) => { const t = resolveTile(world, path); if (!t) throw new Error('no tile ' + path); return t; };
    const box = (cpath) => { const c = containerAt(world, cpath || ''); if (!c) throw new Error('no container ' + cpath); return c; };
    let rekeys = [];
    switch (op.op) {
      case 'world.save-policy.set': {
        if (op.save_policy === null || op.save_policy === undefined) delete world.save_policy;
        else { const bad = savePolicyError(op.save_policy); if (bad) throw new Error(bad); world.save_policy = normalizeSavePolicy(op.save_policy); }
        break;
      }
      case 'child-world.put': {
        const id = op.id || (op.child && op.child.id), spec = Object.assign({}, op.child || {}, op.world_ref != null ? { world_ref: op.world_ref } : {});
        const bad = childWorldError(id, spec); if (bad) throw new Error(bad);
        world.child_worlds = world.child_worlds || {}; world.child_worlds[id] = normalizeChildWorld(id, spec); break;
      }
      case 'child-world.remove': {
        if (!(world.child_worlds || {})[op.id]) throw new Error('no child world ' + op.id);
        delete world.child_worlds[op.id]; if (!Object.keys(world.child_worlds).length) delete world.child_worlds; break;
      }
      case 'tile.add': { const c = box(op.in), t = clone(op.tile); if (c.tiles[t.id] && op.rename) { const b0 = t.id; let n = 2; while (c.tiles[b0 + '_' + n]) n++; t.id = b0 + '_' + n; } if (c.tiles[t.id]) throw new Error('tile exists: ' + t.id); if (t.provenance) t.provenance.sha256 = contentHash(t); c.tiles[t.id] = t; break; }
      case 'tile.replace': { const [cpath, id] = splitPath(op.id), c = box(cpath); need(op.id); if (!op.tile || op.tile.id !== id) throw new Error('the replacement must keep the id ' + id); c.tiles[id] = clone(op.tile); break; }
      case 'word.define': { // teach this world a word; every expression anywhere in it can use it at once
        const name = op.name;
        if (!name || !/^[a-z][a-z0-9_]*$/i.test(name)) throw new Error('a word needs a plain name');
        if (BUILTIN_WORDS.indexOf(name) >= 0) throw new Error('"' + name + '" is one of the words the engine already knows');
        if (op.body === undefined) throw new Error('a word needs a body');
        world.words = world.words || {};
        putOwn(world.words, name, { name, args: clone(op.args || []), body: clone(op.body), note: op.note || null });
        break;
      }
      case 'def.put': { world.defs = world.defs || {}; if (!op.id) throw new Error('a definition needs an id'); putOwn(world.defs, op.id, { id: op.id, name: op.name || op.id, body: clone(op.body), created_by: op.by || 'human' }); break; }
      case 'word.remove': { if (!hasOwn(world.words || {}, op.name)) throw new Error('no word ' + op.name); delete world.words[op.name]; if (!Object.keys(world.words).length) delete world.words; break; }
      case 'view.set': { const t = need(op.id); if (op.view === null || op.view === undefined) delete t.view; else t.view = clone(op.view); break; }
      case 'presentation.set': { const t = need(op.id); if (op.presentation === null || op.presentation === undefined) delete t.presentation; else { const bad = presentationError(op.presentation); if (bad) throw new Error(bad); t.presentation = clone(op.presentation); } break; }
      case 'frame.set': {
        const t = need(op.id), cn = t.facets.connect;
        if (op.place != null) { if (!vec(op.place, 3)) throw new Error('frame place must be three finite numbers'); cn.place = clone(op.place); }
        if (op.rotation != null) { if (!vec(op.rotation, 3)) throw new Error('frame rotation must be three finite numbers'); cn.rotation = clone(op.rotation); }
        break;
      }
      case 'cap.add': { const t = need(op.id), bad = capabilityError(op.capability); if (bad) throw new Error(bad); const c = clone(op.capability); if (capOf(t, c.id)) throw new Error('capability exists: ' + c.id); (t.capabilities = t.capabilities || []).push(c); break; }
      case 'cap.remove': { const t = need(op.id); if (!capOf(t, op.capability)) throw new Error('no capability ' + op.capability); t.capabilities = t.capabilities.filter((c) => c.id !== op.capability); if (!t.capabilities.length) delete t.capabilities; break; }
      case 'def.create': { // this tile becomes the first instance of a shared definition
        const t = need(op.id), defId = op.as || 'def_' + hashOf({ b: bodyOf(t), n: op.name || t.name }).slice(0, 6);
        world.defs = world.defs || {};
        if (hasOwn(world.defs, defId)) throw new Error('a definition called ' + defId + ' already exists');
        putOwn(world.defs, defId, { id: defId, name: op.name || t.name, body: bodyOf(t), created_by: op.by || 'human' });
        t.provenance.instance_of = defId; t.provenance.sha256 = contentHash(t); break;
      }
      case 'def.instance': { // another tile that IS the same thing
        const def = (world.defs || {})[op.def];
        if (!def) throw new Error('no definition ' + op.def);
        const c = box(op.in), base = op.as || def.id.replace(/^def_/, 'mt_'); let id = base, n = 1;
        while (c.tiles[id]) id = base + '_' + ++n;
        const t = createTile({ id, name: op.name || def.name + ' ' + (instancesOf(world, def.id).length + 1), created_by: op.by || 'human' });
        t.provenance.instance_of = def.id; applyBody(t, def.body); t.facets.connect.place = clone(op.place || [0, 0, 0]);
        if (op.rotation) t.facets.connect.rotation = clone(op.rotation);
        t.provenance.sha256 = contentHash(t); c.tiles[id] = t; break;
      }
      case 'def.update': { // take one instance's current body as the definition's new truth
        const t = need(op.id), defId = op.def || (t.provenance && t.provenance.instance_of);
        if (!defId || !hasOwn(world.defs || {}, defId)) throw new Error(op.id + ' is not an instance of a definition');
        putOwn(world.defs, defId, Object.assign({}, world.defs[defId], { body: bodyOf(t) })); break;
      }
      case 'def.sync': { // every instance becomes the definition again; each keeps its id, name, place, wires and state
        const def = (world.defs || {})[op.def];
        if (!def) throw new Error('no definition ' + op.def);
        for (const e of instancesOf(world, op.def)) if (!op.only || op.only.includes(e.path)) applyBody(e.tile, def.body);
        break;
      }
      case 'def.detach': { const t = need(op.id); if (!t.provenance.instance_of) throw new Error(op.id + ' is not an instance'); t.provenance.was_instance_of = t.provenance.instance_of; delete t.provenance.instance_of; t.provenance.sha256 = contentHash(t); break; }
      case 'tile.stamp': { // a full-depth copy that becomes its own thing: same matter inside, fresh state, recorded origin
        const src = need(op.id), c = box(op.in != null ? op.in : splitPath(op.id)[0]), t = clone(src); let id = op.as, n = 1;
        if (id && c.tiles[id]) throw new Error('tile exists: ' + id);
        if (!id) do { id = src.id + '_' + ++n; } while (c.tiles[id]);
        const pl = src.facets.connect.place || [0, 0, 0], off = op.offset || [0, 0, 0];
        t.id = id; t.name = op.name || src.name + (n > 1 ? ' ' + n : ' copy'); t.facets.connect.place = [pl[0] + off[0], pl[1] + off[1], pl[2] + off[2]];
        if (op.rotation) t.facets.connect.rotation = clone(op.rotation);
        t.state = { version: 1, mutable: true, last_transform: null };
        t.provenance = { created_by: op.by || 'human', bridges: clone(src.provenance.bridges), stamped_from: { path: op.id, sha256: src.provenance.sha256 }, sha256: null };
        t.provenance.sha256 = contentHash(t); c.tiles[id] = t; break;
      }
      case 'param.add': { const x = need(op.id), p = clone(op.param); if ((x.params || []).some((q) => q.id === p.id)) throw new Error('parameter exists: ' + p.id); const bad = checkParam(x, p, true); if (bad) throw new Error(bad); (x.params = x.params || []).push(p); break; }
      case 'param.remove': { const x = need(op.id); if (!(x.params || []).some((q) => q.id === op.param)) throw new Error('no parameter ' + op.param); x.params = x.params.filter((q) => q.id !== op.param); if (!x.params.length) delete x.params; break; }
      case 'param.set': {
        const x = need(op.id), p = (x.params || []).find((q) => q.id === op.param); let v = op.value;
        if (!p) throw new Error('no parameter ' + op.param + ' on ' + op.id);
        if (paramValue(x, p) === undefined) throw new Error('this control is dormant: the place it acts on does not exist in the current matter');
        if (p.type === 'choice') { const o = p.options.find((q) => q.label === v); if (!o) throw new Error('no such option: ' + v); v = o.value; }
        else { v = Number(v); if (!isFinite(v)) throw new Error('not a number'); if (p.min != null) v = Math.max(p.min, v); if (p.max != null) v = Math.min(p.max, v); }
        for (const b of p.binds) {
          const target = relTile(x, b.tile || '');
          if (!target) throw new Error('parameter points at a missing tile: ' + b.tile);
          if (target.state && target.state.mutable === false) throw new Error('tile is not mutable: ' + b.tile);
          const val = b.expr !== undefined ? evalExpr(b.expr, { t: 0, words: wordsOf(world), get: (nm) => (nm === 'value' ? v : undefined) }) : clone(v);
          if (!b.at) target.facets[b.facet] = val; else if (getAt(target.facets[b.facet], b.at) !== undefined) setAt(target.facets[b.facet], b.at, val); // a secondary place that no longer exists is skipped
        }
        break;
      }
      case 'tile.remove': {
        need(op.id); const [cpath, id] = splitPath(op.id), c = box(cpath);
        if ((c.ports || []).some((p) => p.tile === id)) throw new Error(id + ' is exposed through a port of its shell; expand the shell or keep the tile');
        delete c.tiles[id];
        for (const k of Object.keys(world.vars)) if (k === op.id || k.startsWith(op.id + '/')) delete world.vars[k];
        for (const k of Object.keys(c.edges)) if (c.edges[k].from.tile === id || c.edges[k].to.tile === id) delete c.edges[k];
        break;
      }
      case 'facet.swap': {
        const t = need(op.id);
        if (!FACETS.includes(op.facet)) throw new Error('unknown facet ' + op.facet);
        if (t.state && t.state.mutable === false) throw new Error('tile is not mutable: ' + op.id);
        t.facets[op.facet] = clone(op.value); break;
      }
      case 'tile.meta': { const t = need(op.id); if (op.name != null) t.name = String(op.name); if (op.form_hints) t.form_hints = clone(op.form_hints); break; }
      case 'bridge.attach': need(op.id).provenance.bridges.push(clone(op.bridge)); break;
      case 'edge.add': { const c = box(op.in), ed = clone(op.edge); ed.id = ed.id || nextEdgeId(c, ed); if (c.edges[ed.id]) throw new Error('edge exists: ' + ed.id); c.edges[ed.id] = ed; break; }
      case 'edge.remove': { const c = box(op.in); if (!c.edges[op.id]) throw new Error('no edge ' + op.id); delete c.edges[op.id]; break; }
      case 'edge.rewire': { const ed = box(op.in).edges[op.id]; if (!ed) throw new Error('no edge ' + op.id); if (op.from) ed.from = clone(op.from); if (op.to) ed.to = clone(op.to); break; }
      case 'port.add': { const x = need(op.id); if (!x.interior) throw new Error(op.id + ' has no interior'); const inner = x.interior.tiles[op.tile]; if (!inner) throw new Error('no inner tile ' + op.tile); if (x.interior.ports.some((p) => p.tile === op.tile && p.socket === op.socket)) throw new Error('already exposed'); addPort(x, inner, op.socket); break; }
      case 'tile.collapse': { // many tiles -> one tile that still IS those tiles. Nothing inside is rewritten.
        const cpath = op.in || '', c = box(cpath), ids = Array.from(new Set(op.ids || [])).sort(), inside = new Set(ids);
        if (!ids.length) throw new Error('nothing selected to collapse');
        for (const id of ids) if (!c.tiles[id]) throw new Error('no tile ' + id + ' here');
        const newId = op.id || 'mt_' + hashOf({ collapse: ids, name: op.name || '', n: Object.keys(c.tiles).length }).slice(0, 6);
        if (c.tiles[newId]) throw new Error('tile exists: ' + newId);
        const hints = []; ids.forEach((id) => c.tiles[id].form_hints.forEach((h) => hints.includes(h) || hints.push(h)));
        const shell = createTile({ id: newId, name: op.name || 'Collapsed ' + ids.length + ' tiles', created_by: op.by || 'human', form_hints: KNOWN_FORMS.filter((h) => hints.includes(h)).concat(hints.filter((h) => !KNOWN_FORMS.includes(h))),
          facets: { mesh: { type: 'interior', source: null, data: {} }, material: { type: 'primitive', source: null, data: { color: [0.6, 0.5, 1] } }, connect: { sockets: [], bridges: [], place: [0, 0, 0] } } });
        shell.interior = { tiles: {}, edges: {}, ports: [] };
        let anchors = 0;
        for (const e of sortedEdges(c)) {
          const a = inside.has(e.from.tile), b = inside.has(e.to.tile);
          if (a && b) { shell.interior.edges[e.id] = e; delete c.edges[e.id]; }
          else if (a) e.from = { tile: newId, socket: addPort(shell, c.tiles[e.from.tile], e.from.socket) };
          else if (b) { if (e.kind === 'attach' && ++anchors > 1) throw new Error('these tiles hang from more than one outside parent; collapse them together with that parent, or separately'); e.to = { tile: newId, socket: addPort(shell, c.tiles[e.to.tile], e.to.socket) }; }
        }
        for (const p of c.ports || []) if (inside.has(p.tile)) { p.socket = addPort(shell, c.tiles[p.tile], p.socket); p.tile = newId; }
        if (op.expose !== 'crossing') for (const id of ids) for (const s of c.tiles[id].facets.connect.sockets || []) // free inputs stay reachable from outside
          if (s.kind === 'signal' && s.dir === 'in' && !Object.keys(shell.interior.edges).some((k) => shell.interior.edges[k].to.tile === id && shell.interior.edges[k].to.socket === s.id)) addPort(shell, c.tiles[id], s.id);
        for (const id of ids) { shell.interior.tiles[id] = c.tiles[id]; delete c.tiles[id]; }
        shell.provenance.collapsed_from = ids; shell.provenance.sha256 = contentHash(shell); c.tiles[newId] = shell;
        rekeys = ids.map((id) => [join(cpath, id), join(cpath, newId + '/' + id)]);
        break;
      }
      case 'tile.expand': { // the exact inverse of collapse
        const x = need(op.id), [cpath, id] = splitPath(op.id), c = box(cpath);
        if (!x.interior) throw new Error(op.id + ' has nothing inside to expand');
        if ((x.params || []).length && !op.drop_params) throw new Error('this tile has parameters that would be lost by expanding it; remove them first');
        const it = x.interior, pmap = {}; it.ports.forEach((p) => (pmap[p.id] = p));
        for (const k in it.tiles) if (c.tiles[k]) throw new Error('cannot expand: a tile with id ' + k + ' already exists here');
        for (const k in it.edges) if (c.edges[k]) throw new Error('cannot expand: a wire with id ' + k + ' already exists here');
        const pe = parentEdgeOf(c, id), anchored = pe && pmap[pe.to.socket] ? pmap[pe.to.socket].tile : null, shellFrame = placementOf(x);
        for (const e of sortedEdges(c)) for (const end of ['from', 'to']) if (e[end].tile === id) { const p = pmap[e[end].socket]; if (!p) throw new Error('cannot expand: wire ' + e.id + ' uses a socket that belongs to the shell itself'); e[end] = { tile: p.tile, socket: p.socket }; }
        for (const p of c.ports || []) if (p.tile === id) { const q = pmap[p.socket]; if (!q) throw new Error('cannot expand: an outer port uses the shell itself'); p.tile = q.tile; p.socket = q.socket; }
        for (const k of rootsOf(it)) {
          const child = it.tiles[k], hadRotation = child.facets.connect.rotation !== undefined, shellRotated = canonical(shellFrame.rotation) !== canonical([0, 0, 0]), merged = composePlacement(shellFrame, placementOf(child));
          if (k !== anchored) child.facets.connect.place = merged.place;
          if (hadRotation || shellRotated) child.facets.connect.rotation = merged.rotation; else delete child.facets.connect.rotation;
        }
        Object.assign(c.tiles, it.tiles); Object.assign(c.edges, it.edges); delete c.tiles[id];
        rekeys = Object.keys(it.tiles).sort().map((k) => [join(op.id, k), join(cpath, k)]);
        break;
      }
      default: throw new Error('unknown structural op: ' + op.op);
    }
    rekeyVars(world.vars, rekeys); rekeyVars(world.awake || {}, rekeys);
    return { rekeys };
  }
  // Units: the granularity at which edits are compared, merged, held and rolled back. Keys carry full paths,
  // so an edit five levels deep is its own unit and does not collide with an edit to a sibling.
  const metaOf = (t) => ({ name: t.name, form_hints: t.form_hints, bridges: t.provenance.bridges, created_by: t.provenance.created_by, instance_of: t.provenance.instance_of, was_instance_of: t.provenance.was_instance_of });
  function parseKey(key) { const rest = key.slice(5), h = rest.indexOf('#'); return { isEdge: key.startsWith('edge:'), path: h < 0 ? rest : rest.slice(0, h), part: h < 0 ? null : rest.slice(h + 1) }; }
  function unitValue(world, key) {
    if (key === 'world:save_policy') return world.save_policy || null;
    if (key.startsWith('childworld:')) return (world.child_worlds || {})[key.slice('childworld:'.length)] || null;
    if (key.startsWith('word:')) { const src = world.words || {}, id = key.slice(5); return hasOwn(src, id) ? src[id] : null; }
    if (key.startsWith('def:')) { const src = world.defs || {}, id = key.slice(4); return hasOwn(src, id) ? src[id] : null; }
    const k = parseKey(key), [cp, id] = splitPath(k.path), c = containerAt(world, cp);
    if (!c) return null;
    if (k.isEdge) return c.edges[id] || null;
    const t = c.tiles[id];
    if (!k.part) return t || null;
    if (!t) return null;
    return k.part === 'meta' ? metaOf(t) : k.part === 'view' ? t.view || null : k.part === 'presentation' ? t.presentation || null : k.part === 'capabilities' ? t.capabilities || null : k.part === 'params' ? t.params || null : k.part === 'ports' ? (t.interior ? t.interior.ports : null) : k.part === 'interior' ? t.interior || null : t.facets[k.part.slice(6)] || null;
  }
  function setUnit(world, key, value) {
    if (key === 'world:save_policy') { if (value === null) delete world.save_policy; else world.save_policy = clone(value); return; }
    if (key.startsWith('childworld:')) { const id = key.slice('childworld:'.length); if (value === null) { if (world.child_worlds) { delete world.child_worlds[id]; if (!Object.keys(world.child_worlds).length) delete world.child_worlds; } } else { world.child_worlds = world.child_worlds || {}; world.child_worlds[id] = clone(value); } return; }
    if (key.startsWith('word:')) { world.words = world.words || {}; const id = key.slice(5); if (value === null) delete world.words[id]; else putOwn(world.words, id, clone(value)); return; }
    if (key.startsWith('def:')) { world.defs = world.defs || {}; const id = key.slice(4); if (value === null) delete world.defs[id]; else putOwn(world.defs, id, clone(value)); return; }
    const k = parseKey(key), [cp, id] = splitPath(k.path), c = containerAt(world, cp);
    if (!c) throw new Error('unit targets a missing container: ' + key);
    if (k.isEdge) { if (value === null) delete c.edges[id]; else c.edges[id] = clone(value); return; }
    if (!k.part) { if (value === null) { delete c.tiles[id]; for (const v of Object.keys(world.vars)) if (v === k.path || v.startsWith(k.path + '/')) delete world.vars[v]; } else c.tiles[id] = clone(value); return; }
    const t = c.tiles[id];
    if (!t) throw new Error('unit targets a missing tile: ' + key);
    if (k.part === 'meta') { t.name = value.name; t.form_hints = clone(value.form_hints); t.provenance.bridges = clone(value.bridges); t.provenance.created_by = value.created_by;
      for (const f of ['instance_of', 'was_instance_of']) { if (value[f] === undefined) delete t.provenance[f]; else t.provenance[f] = value[f]; } }
    else if (k.part === 'params') { if (value === null) delete t.params; else t.params = clone(value); }
    else if (k.part === 'capabilities') { if (value === null) delete t.capabilities; else t.capabilities = clone(value); }
    else if (k.part === 'view') { if (value === null) delete t.view; else t.view = clone(value); }
    else if (k.part === 'presentation') { if (value === null) delete t.presentation; else t.presentation = clone(value); }
    else if (k.part === 'ports') t.interior.ports = clone(value);
    else if (k.part === 'interior') { if (value === null) delete t.interior; else t.interior = clone(value); }
    else t.facets[k.part.slice(6)] = clone(value);
  }
  function diffContainer(a, b, prefix, out) {
    const same = (x, y) => canonical(x) === canonical(y);
    for (const id of Array.from(new Set([...Object.keys(a.tiles), ...Object.keys(b.tiles)])).sort()) {
      const x = a.tiles[id], y = b.tiles[id], p = join(prefix, id);
      if (!x || !y) { out.push({ key: 'tile:' + p, value: y ? clone(y) : null }); continue; }
      for (const f of FACETS) if (!same(x.facets[f], y.facets[f])) out.push({ key: 'tile:' + p + '#facet.' + f, value: clone(y.facets[f]) });
      if (!same(metaOf(x), metaOf(y))) out.push({ key: 'tile:' + p + '#meta', value: clone(metaOf(y)) });
      if (!same(x.params, y.params)) out.push({ key: 'tile:' + p + '#params', value: y.params ? clone(y.params) : null });
      if (!same(x.capabilities, y.capabilities)) out.push({ key: 'tile:' + p + '#capabilities', value: y.capabilities ? clone(y.capabilities) : null });
      if (!same(x.view, y.view)) out.push({ key: 'tile:' + p + '#view', value: y.view ? clone(y.view) : null });
      if (!same(x.presentation, y.presentation)) out.push({ key: 'tile:' + p + '#presentation', value: y.presentation ? clone(y.presentation) : null });
      if (!x.interior !== !y.interior) out.push({ key: 'tile:' + p + '#interior', value: y.interior ? clone(y.interior) : null });
      else if (x.interior) { if (!same(x.interior.ports, y.interior.ports)) out.push({ key: 'tile:' + p + '#ports', value: clone(y.interior.ports) }); diffContainer(x.interior, y.interior, p, out); }
    }
    for (const id of Array.from(new Set([...Object.keys(a.edges), ...Object.keys(b.edges)])).sort())
      if (!same(a.edges[id], b.edges[id])) out.push({ key: 'edge:' + join(prefix, id), value: b.edges[id] ? clone(b.edges[id]) : null });
    return out;
  }
  function diffUnits(base, cand) {
    const out = diffContainer(base, cand, '', []), a = base.defs || {}, b = cand.defs || {}, wa = base.words || {}, wb = cand.words || {}, ca = base.child_worlds || {}, cb = cand.child_worlds || {};
    if (canonical(base.save_policy) !== canonical(cand.save_policy)) out.push({ key: 'world:save_policy', value: cand.save_policy === undefined ? null : clone(cand.save_policy) });
    for (const id of Array.from(new Set([...Object.keys(ca), ...Object.keys(cb)])).sort()) if (canonical(ca[id]) !== canonical(cb[id])) out.push({ key: 'childworld:' + id, value: cb[id] ? clone(cb[id]) : null });
    for (const id of Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort()) { const av = hasOwn(a, id) ? a[id] : undefined, bv = hasOwn(b, id) ? b[id] : undefined; if (canonical(av) !== canonical(bv)) out.push({ key: 'def:' + id, value: bv === undefined ? null : clone(bv) }); }
    for (const id of Array.from(new Set([...Object.keys(wa), ...Object.keys(wb)])).sort()) { const av = hasOwn(wa, id) ? wa[id] : undefined, bv = hasOwn(wb, id) ? wb[id] : undefined; if (canonical(av) !== canonical(bv)) out.push({ key: 'word:' + id, value: bv === undefined ? null : clone(bv) }); }
    return out;
  }
  const isWorldUnit = (key) => key === 'world:save_policy' || key.startsWith('childworld:');
  const isWhole = (key) => !isWorldUnit(key) && !key.startsWith('edge:') && !key.startsWith('def:') && !key.startsWith('word:') && (key.indexOf('#') < 0 || key.endsWith('#interior'));
  const touchedPath = (key) => { if (isWorldUnit(key) || key.startsWith('def:') || key.startsWith('word:')) return null; const k = parseKey(key); return k.isEdge ? splitPath(k.path)[0] || null : k.path; };
  const ancestors = (path) => { const out = []; let p = path; while (p.indexOf('/') >= 0) { p = splitPath(p)[0]; out.push(p); } return out; };
  const unitOrder = (key) => (key === 'world:save_policy' ? -4 : key.startsWith('childworld:') ? -3 : key.startsWith('word:') ? -2 : key.startsWith('def:') ? -1 : key.startsWith('edge:') ? 2 : key.indexOf('#') < 0 ? 0 : key.endsWith('#interior') ? 1 : 3);
  // Events: the only way a live world changes. Deterministic: same world + same event -> same world.
  function applyEvent(world, ev) {
    const trace = [];
    if (ev.t != null && ev.t > world.time) world.time = ev.t;
    if (ev.type === 'signal') deliver(world, ev.tile, ev.name, world.time, 0, trace);
    else if (ev.type === 'wake' || ev.type === 'sleep') {
      const t = resolveTile(world, ev.tile);
      if (!t || !capOf(t, ev.capability)) throw new Error('no capability ' + ev.capability + ' on ' + ev.tile);
      setAwake(world, ev.tile, ev.capability, ev.type === 'wake');
      if (ev.type === 'sleep' && ev.forget) for (const k of Object.keys(world.vars)) if (k === ev.tile || k.startsWith(ev.tile + '/')) delete world.vars[k];
    }
    else if (ev.type === 'commit') {
      rekeyVars(world.vars, ev.rekeys); rekeyVars(world.awake || {}, ev.rekeys); // state moves first, so nothing is lost when its old address disappears
      const bump = {}, rehash = {};
      for (const u of ev.units) {
        setUnit(world, u.key, u.value);
        const p = touchedPath(u.key);
        if (!p) continue;
        if (u.key.startsWith('edge:') || u.key.indexOf('#') >= 0) bump[p] = 1; // a tile that merely moved keeps its version
        rehash[p] = 1; ancestors(p).forEach((a) => (rehash[a] = 1));
      }
      for (const p of Object.keys(bump).sort()) { const t = resolveTile(world, p); if (t) { t.state.version = (t.state.version || 0) + 1; t.state.last_transform = ev.plan_id; } }
      for (const p of Object.keys(rehash).sort((a, b) => b.split('/').length - a.split('/').length || (a < b ? -1 : 1))) { const t = resolveTile(world, p); if (t) t.provenance.sha256 = contentHash(t); }
    } else if (ev.type === 'rollback') {
      rekeyVars(world.vars, ev.rekeys); rekeyVars(world.awake || {}, ev.rekeys);
      for (const u of ev.units) setUnit(world, u.key, u.value);
      for (const p in ev.tile_states || {}) { const t = resolveTile(world, p); if (t) { t.state = clone(ev.tile_states[p].state); t.provenance.sha256 = ev.tile_states[p].sha256; } }
      for (const k in ev.vars || {}) world.vars[k] = clone(ev.vars[k]);
      // Empty registries and absent registries have the same structural meaning,
      // but different full-world hashes. Preserve the original authored shape.
      for (const key of ['words', 'defs', 'child_worlds']) if (ev.registry_presence && typeof ev.registry_presence[key] === 'boolean') {
        if (ev.registry_presence[key] && world[key] === undefined) world[key] = {};
        else if (!ev.registry_presence[key] && world[key] && !Object.keys(world[key]).length) delete world[key];
      }
    } else if (ev.type !== 'tick') throw new Error('unknown event type: ' + ev.type);
    return trace;
  }

  // ───────────────────────────── 5 ledger
  // genesis + logical time + deterministic rules + ordered events + sparse mutations = current state
  function reconstruct(ledger, opts) {
    opts = opts || {};
    const upto = opts.seq == null ? ledger.events.length : opts.seq;
    let world = null, from = 0;
    if (!opts.fromGenesis) for (const cp of ledger.checkpoints) if (cp.seq <= upto && cp.seq >= from) { from = cp.seq; world = cp.world; }
    world = clone(world || ledger.genesis);
    for (let i = from; i < upto; i++) applyEvent(world, ledger.events[i]);
    return { world, replayed: upto - from, from_seq: from, upto_seq: upto, hash: hashOf(world), simulation_steps: 0 };
  }

  // ───────────────────────────── 6 safety
  function createWorkspace(genesis, opts) {
    const v = validateWorld(genesis);
    if (!v.ok) throw new Error('genesis world invalid: ' + v.errors.join('; '));
    return {
      ledger: { genesis: clone(genesis), genesis_hash: hashOf(genesis), events: [], checkpoints: [] },
      live: clone(genesis), candidates: {}, receipts: [], plans: {}, counter: 0,
      checkpointEvery: (opts && opts.checkpointEvery) || 20,
    };
  }
  function record(ws, ev) {
    ev.seq = ws.ledger.events.length + 1;
    if (ev.t == null) ev.t = ws.live.time;
    const trace = applyEvent(ws.live, ev);
    ws.ledger.events.push(clone(ev));
    if (ev.seq % ws.checkpointEvery === 0) ws.ledger.checkpoints.push({ seq: ev.seq, hash: hashOf(ws.live), world: clone(ws.live) });
    return trace;
  }
  function cloneBody(ws, label, by) {
    const id = 'cand_' + ++ws.counter;
    ws.candidates[id] = { id, label: label || id, by: by || 'human', base: clone(ws.live), base_struct_hash: structHash(ws.live), world: clone(ws.live), ops: [], rekeys: [] };
    return id;
  }
  function editCandidate(ws, candId, op) {
    const c = ws.candidates[candId];
    if (!c) return { ok: false, error: 'no candidate ' + candId };
    const trial = clone(c.world); let res;
    try { res = applyStructOp(trial, op); } catch (err) { return { ok: false, error: err.message }; }
    const v = validateWorld(trial);
    if (!v.ok) return { ok: false, error: 'edit would leave the clone invalid', errors: v.errors };
    c.world = trial; c.ops.push(clone(op)); c.rekeys = (c.rekeys || []).concat(res.rekeys);
    return { ok: true, changed: diffUnits(c.base, c.world).map((u) => u.key) };
  }
  function planMerge(ws, candIds) {
    const live = ws.live, same = (a, b) => canonical(a) === canonical(b), entries = [];
    for (const cid of candIds) {
      const c = ws.candidates[cid];
      if (!c) continue;
      for (const u of diffUnits(c.base, c.world)) {
        const liveVal = unitValue(live, u.key), baseVal = unitValue(c.base, u.key);
        const drifted = !same(baseVal, liveVal) && !same(liveVal, u.value);
        entries.push({ key: u.key, candidate: cid, by: c.by, value: u.value, prior: clone(liveVal), status: drifted ? 'HELD_BASE_DRIFTED' : 'READY' });
      }
    }
    const covers = (a, b) => { if (!isWhole(a.key) || a.key === b.key) return false; const pa = parseKey(a.key).path, pb = parseKey(b.key).path; return pb === pa || pb.startsWith(pa + '/'); };
    for (const a of entries) for (const b of entries) {
      if (a === b || a.candidate === b.candidate) continue;
      if ((a.key === b.key && !same(a.value, b.value)) || covers(a, b) || covers(b, a)) { a.status = 'HELD_CONFLICT'; b.status = 'HELD_CONFLICT'; }
    }
    for (const cid of candIds) { // a collapse or expand moves state with it, so it merges whole or not at all
      const c = ws.candidates[cid], mine = entries.filter((e) => e.candidate === cid);
      if (c && (c.rekeys || []).length && mine.some((e) => e.status !== 'READY')) mine.forEach((e) => { if (e.status === 'READY') e.status = 'HELD_ATOMIC'; });
    }
    const ready = [], seen = {};
    for (const en of entries) if (en.status === 'READY' && !seen[en.key]) { seen[en.key] = 1; ready.push(en); }
    ready.sort((a, b) => unitOrder(a.key) - unitOrder(b.key));
    let status = ready.length ? (entries.some((x) => x.status !== 'READY') ? 'PARTIAL_HELD' : 'READY') : 'NOTHING_TO_COMMIT', errors = [];
    if (ready.length) {
      const trial = clone(live);
      try { for (const en of ready) setUnit(trial, en.key, en.value); } catch (err) { errors.push(err.message); }
      const v = validateWorld(trial);
      if (!v.ok) errors.push(...v.errors);
      if (errors.length) status = 'HOLD_INVALID_RESULT';
    }
    const readyCands = new Set(ready.map((e) => e.candidate)), rekeys = [];
    for (const cid of candIds) if (readyCands.has(cid)) rekeys.push(...(ws.candidates[cid].rekeys || []));
    const plan = { id: 'plan_' + ++ws.counter, candidates: candIds.slice(), base_struct_hash: structHash(live), entries, rekeys, status, errors };
    plan.plan_hash = hashOf({ c: plan.candidates, b: plan.base_struct_hash, e: entries, r: rekeys });
    ws.plans[plan.id] = plan;
    return plan;
  }
  function commitPlan(ws, planId, by) {
    const plan = ws.plans[planId];
    if (!plan) return { ok: false, status: 'REFUSED_NO_PLAN' };
    if (plan.status === 'HOLD_INVALID_RESULT' || plan.status === 'NOTHING_TO_COMMIT') return { ok: false, status: 'REFUSED_' + plan.status, errors: plan.errors };
    const before = structHash(ws.live);
    if (before !== plan.base_struct_hash) return { ok: false, status: 'REFUSED_PLAN_STALE' };
    const seen = {}, ready = plan.entries.filter((e) => e.status === 'READY' && !seen[e.key] && (seen[e.key] = 1)).sort((a, b) => unitOrder(a.key) - unitOrder(b.key));
    const tile_states = {}, var_restore = {}, moved = rekeyVars(clone(ws.live.vars), plan.rekeys), registry_presence = {};
    for (const key of ['words', 'defs', 'child_worlds']) registry_presence[key] = Object.prototype.hasOwnProperty.call(ws.live, key);
    for (const en of ready) {
      const p = touchedPath(en.key);
      if (p) for (const q of [p].concat(ancestors(p))) { const t = resolveTile(ws.live, q); if (t) tile_states[q] = { state: clone(t.state), sha256: t.provenance.sha256 }; }
      if (en.value === null && !en.key.startsWith('edge:') && en.key.indexOf('#') < 0) for (const k in moved) if (k === p || k.startsWith(p + '/')) var_restore[k] = moved[k];
    }
    record(ws, { type: 'commit', plan_id: plan.id, plan_hash: plan.plan_hash, by: by || 'human', rekeys: plan.rekeys, units: ready.map((e) => ({ key: e.key, value: e.value })) });
    const receipt = {
      id: 'rcpt_' + ++ws.counter, plan_id: plan.id, plan_hash: plan.plan_hash, seq: ws.ledger.events.length, by: by || 'human',
      before_struct_hash: before, after_struct_hash: structHash(ws.live),
      units: ready.map((e) => ({ key: e.key, prior: e.prior })), tile_states, var_restore, registry_presence, rekeys_back: plan.rekeys.map((r) => [r[1], r[0]]).reverse(),
      held: plan.entries.filter((e) => e.status !== 'READY').map((e) => ({ key: e.key, candidate: e.candidate, status: e.status })),
      rolled_back: false,
    };
    receipt.rollback_token = hashOf([receipt.id, receipt.plan_hash, receipt.before_struct_hash, receipt.after_struct_hash]).slice(0, 24);
    ws.receipts.push(receipt);
    const stillHeld = new Set(receipt.held.map((h) => h.candidate));
    for (const cid of plan.candidates) if (!stillHeld.has(cid)) delete ws.candidates[cid];
    delete ws.plans[planId];
    return { ok: true, status: 'COMMITTED', receipt };
  }
  function rollback(ws, token) {
    const r = ws.receipts.find((x) => x.rollback_token === token);
    if (!r) return { ok: false, status: 'REFUSED_UNKNOWN_TOKEN' };
    if (r.rolled_back) return { ok: false, status: 'REFUSED_ALREADY_ROLLED_BACK' };
    if (structHash(ws.live) !== r.after_struct_hash) return { ok: false, status: 'REFUSED_STATE_DRIFTED', detail: 'The world changed after this commit, so an exact restore is no longer possible.' };
    const units = r.units.map((u) => ({ key: u.key, value: u.prior })).sort((a, b) => unitOrder(a.key) - unitOrder(b.key));
    const event = { type: 'rollback', receipt_id: r.id, rekeys: r.rekeys_back || [], units, tile_states: r.tile_states, vars: r.var_restore || {} };
    if (r.registry_presence) event.registry_presence = clone(r.registry_presence);
    record(ws, event);
    r.rolled_back = true;
    return { ok: true, status: 'ROLLED_BACK', exact: structHash(ws.live) === r.before_struct_hash };
  }
  function exportWorkspace(ws) {
    const out = { format: 'morphtile-workspace', version: '0.4', exported_at_time: ws.live.time, ledger: { genesis: ws.ledger.genesis, events: ws.ledger.events }, candidates: ws.candidates, receipts: ws.receipts, counter: ws.counter };
    out.expect = { live_hash: hashOf(ws.live), struct_hash: structHash(ws.live), events: ws.ledger.events.length, tiles: countTiles(ws.live) }; // what a correct replay of this file must produce
    return out;
  }
  // A world on its own, with no history: for handing one world to another system, or starting fresh from where you are.
  // Words can leave a world and join another: the same evidence discipline as every other thing that arrives from outside.
  function exportWords(world, names) {
    const src = world.words || {}, pick = {};
    for (const k of (names && names.length ? names : Object.keys(src)).sort()) if (hasOwn(src, k)) putOwn(pick, k, clone(src[k]));
    return { format: 'morphtile-words', version: '0.4', words: pick, expect: { sha256: hashOf(pick), count: Object.keys(pick).length } };
  }
  function importWords(world, pack, opts) {
    opts = opts || {};
    if (!pack || pack.format !== 'morphtile-words' || !pack.words) return { ok: false, status: 'HOLD_NOT_A_WORD_PACK', ops: [], conflicts: [] };
    const claimed = pack.expect && pack.expect.sha256, observed = hashOf(pack.words);
    if (claimed && claimed !== observed) return { ok: false, status: 'HOLD_HASH_MISMATCH', claimed, observed, ops: [], conflicts: [] };
    const mine = world.words || {}, ops = [], conflicts = [], already = [];
    for (const k of Object.keys(pack.words).sort()) {
      const w = pack.words[k];
      if (BUILTIN_WORDS.indexOf(k) >= 0) { conflicts.push({ name: k, why: 'the engine already knows this word' }); continue; }
      if (hasOwn(mine, k)) { if (canonical(mine[k]) === canonical(w)) { already.push(k); continue; } if (!opts.overwrite) { conflicts.push({ name: k, why: 'this world has a different word by that name', mine: mine[k], theirs: w }); continue; } }
      ops.push({ op: 'word.define', name: k, args: w.args, body: w.body, note: w.note });
    }
    return { ok: true, status: conflicts.length ? 'PARTIAL_HELD' : 'READY', evidence: claimed ? 'verified_payload_sha256' : 'structurally_possible_not_tested', ops, conflicts, already };
  }
  // What a tile needs in order to be itself somewhere else: the definitions it names, at any depth, and the words its
  // expressions are written in. Gathered by reading the matter, so nothing is assumed and nothing is forgotten.
  function needsOf(world, value, found) {
    found = found || { defs: {}, words: {} };
    const walk = (v) => {
      if (Array.isArray(v)) { const head = v[0];
        if (typeof head === 'string' && (world.words || {})[head]) { if (!found.words[head]) { found.words[head] = clone(world.words[head]); walk(world.words[head].body); } }
        for (const x of v) walk(x); return;
      }
      if (!v || typeof v !== 'object') return;
      for (const k of Object.keys(v)) {
        const x = v[k];
        const named = (k === 'use' && typeof x === 'string') ? x : (k === 'grants_ref' && x && x.def) ? x.def : (k === 'instance_of' && typeof x === 'string') ? x : null;
        if (named && !found.defs[named]) { const d = (world.defs || {})[named]; if (d) { found.defs[named] = clone(d); walk(d.body); } else found.defs[named] = null; }
        walk(x);
      }
    };
    walk(value);
    return found;
  }
  function exportKit(world, path, opts) {
    const tile = resolveTile(world, path);
    if (!tile) return null;
    const need = needsOf(world, tile), missing = Object.keys(need.defs).filter((k) => !need.defs[k]);
    for (const k of missing) delete need.defs[k];
    const kit = { format: 'morphtile-kit', version: '0.4', name: (opts && opts.name) || tile.name, tile: clone(tile), defs: need.defs, words: need.words };
    kit.expect = { sha256: hashOf({ tile: kit.tile, defs: kit.defs, words: kit.words }), defs: Object.keys(kit.defs).length, words: Object.keys(kit.words).length, missing };
    return kit;
  }
  function importKit(world, kit, opts) {
    opts = opts || {};
    if (!kit || kit.format !== 'morphtile-kit' || !kit.tile) return { ok: false, status: 'HOLD_NOT_A_KIT', ops: [], conflicts: [] };
    const claimed = kit.expect && kit.expect.sha256, observed = hashOf({ tile: kit.tile, defs: kit.defs || {}, words: kit.words || {} });
    if (claimed && claimed !== observed) return { ok: false, status: 'HOLD_HASH_MISMATCH', claimed, observed, ops: [], conflicts: [] };
    const ops = [], conflicts = [], already = [];
    const wordPack = importWords(world, { format: 'morphtile-words', version: '0.4', words: kit.words || {} }, opts);
    ops.push(...wordPack.ops); conflicts.push(...wordPack.conflicts); already.push(...(wordPack.already || []));
    for (const id of Object.keys(kit.defs || {}).sort()) {
      const mine = (world.defs || {})[id], theirs = kit.defs[id];
      if (hasOwn(world.defs || {}, id)) { if (canonical(mine.body) === canonical(theirs.body)) { already.push(id); continue; } if (!opts.overwrite) { conflicts.push({ name: id, why: 'this world has a different definition by that name' }); continue; } }
      ops.push({ op: 'def.put', id, name: theirs.name, body: theirs.body, by: theirs.created_by });
    }
    if (conflicts.length && !opts.partial) return { ok: true, status: 'HELD_INCOMPLETE', evidence: claimed ? 'verified_payload_sha256' : 'structurally_possible_not_tested', ops: [], conflicts, already, detail: 'the tile would arrive without something it needs, so nothing is applied' };
    const incoming = clone(kit.tile), source = placementOf(incoming), requested = opts.anchor || {};
    const place = opts.place || requested.place || requested.position, rotation = opts.rotation || requested.rotation;
    if (place != null) { if (!vec(place, 3)) return { ok: false, status: 'HOLD_INVALID_DESTINATION_ANCHOR', detail: 'place must be three finite numbers', ops: [], conflicts, already }; incoming.facets.connect.place = clone(place); }
    if (rotation != null) { if (!vec(rotation, 3)) return { ok: false, status: 'HOLD_INVALID_DESTINATION_ANCHOR', detail: 'rotation must be three finite numbers', ops: [], conflicts, already }; incoming.facets.connect.rotation = clone(rotation); }
    if (incoming.provenance) incoming.provenance.sha256 = contentHash(incoming);
    ops.push({ op: 'tile.add', in: opts.in || '', tile: incoming, rename: true });
    return { ok: true, status: conflicts.length ? 'PARTIAL_HELD' : 'READY', evidence: claimed ? 'verified_payload_sha256' : 'structurally_possible_not_tested', ops, conflicts, already,
      placement: { source, destination: placementOf(incoming), descendants_rewritten: false } };
  }
  function exportWorld(world, name) { const w = clone(world); if (name) w.name = name; return { format: 'morphtile-world', version: '0.4', world: w, expect: { struct_hash: structHash(w), tiles: countTiles(w) } }; }
  function importWorld(data) {
    const w = data && data.format === 'morphtile-world' ? data.world : data && data.kind === 'morphtile-world' ? data : null;
    if (!w) return { ok: false, status: 'HOLD_NOT_A_WORLD' };
    const v = validateWorld(w);
    if (!v.ok) return { ok: false, status: 'HOLD_INVALID_WORLD', errors: v.errors };
    const claimed = data.expect && data.expect.struct_hash, observed = structHash(w);
    if (claimed && claimed !== observed) return { ok: false, status: 'HOLD_HASH_MISMATCH', claimed, observed };
    return { ok: true, status: claimed ? 'VERIFIED' : 'READ_UNVERIFIED', world: w, evidence: claimed ? 'verified_payload_sha256' : 'structurally_possible_not_tested' };
  }
  function importWorkspace(data) {
    const ws = createWorkspace(data.ledger.genesis);
    for (const ev of data.ledger.events) { const e = clone(ev); delete e.seq; record(ws, e); } // live state is rebuilt from evidence, never trusted from the file
    ws.candidates = clone(data.candidates || {}); ws.receipts = clone(data.receipts || []); ws.counter = data.counter || ws.counter;
    // The file may claim what its replay should produce. Checking is how a claim becomes evidence.
    ws.import_check = data.expect ? (hashOf(ws.live) === data.expect.live_hash ? { status: 'VERIFIED', evidence: 'verified_payload_sha256' } : { status: 'HOLD_REPLAY_MISMATCH', evidence: 'declared_contract_match_not_tested', claimed: data.expect.live_hash, observed: hashOf(ws.live) }) : { status: 'READ_UNVERIFIED', evidence: 'structurally_possible_not_tested' };
    return ws;
  }

  // ───────────────────────────── 7 bridges
  const EVIDENCE = ['inferred_candidate_not_tested', 'structurally_possible_not_tested', 'declared_contract_match_not_tested', 'verified_payload_sha256'];
  function weakestEvidence(list) { // a pipeline inherits the weakest evidence class of any edge in it
    if (!list.length) return null;
    return list.reduce((w, x) => ((EVIDENCE.indexOf(x) < 0 ? -1 : EVIDENCE.indexOf(x)) < EVIDENCE.indexOf(w) ? (EVIDENCE.indexOf(x) < 0 ? EVIDENCE[0] : x) : w), EVIDENCE[EVIDENCE.length - 1]);
  }
  function dataUrlBytes(url) {
    const m = /^data:([^;,]*)(;base64)?,(.*)$/.exec(url || '');
    if (!m) return null;
    if (!m[2]) return utf8(decodeURIComponent(m[3]));
    const bin = atob(m[3]), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Reads an `axm-material-offer` packet (axm-material-surface-fabric v0.9/v0.10) and re-checks every payload byte-for-byte.
  function ingestMaterialOffer(offer) {
    if (!offer || offer.format !== 'axm-material-offer' || !Array.isArray(offer.entries))
      return { ok: false, status: 'HOLD_SOURCE_INCOMPLETE', reason: 'not an axm-material-offer packet', entries: [] };
    const entries = offer.entries.map((en) => {
      const declared = en.sha256 || null, bytes = en.dataUrl ? dataUrlBytes(en.dataUrl) : null;
      if (!bytes) return { entryId: en.id, state: 'hold', reason: 'no-portable-payload', evidence: 'declared_contract_match_not_tested', declared, observed: null };
      const observed = 'sha256:' + sha256(bytes);
      if (!declared) return { entryId: en.id, state: 'portable-unverified', reason: 'sha256-not-declared', evidence: 'structurally_possible_not_tested', declared, observed };
      if (declared.toLowerCase() !== observed) return { entryId: en.id, state: 'hold', reason: 'sha256-mismatch', evidence: 'declared_contract_match_not_tested', declared, observed };
      return { entryId: en.id, state: 'portable-verified', reason: null, evidence: 'verified_payload_sha256', declared, observed };
    });
    return { ok: true, status: 'READ', offerId: offer.id, producer: offer.producer || null, entries, pipeline_evidence: weakestEvidence(entries.map((e) => e.evidence)) };
  }
  // Turns one offer entry into a material facet + bridge record. Anything unverified stays a visible HOLD.
  function materialFromOffer(offer, report, entryId, ref, color) {
    const row = (report.entries || []).find((e) => e.entryId === entryId), en = (offer.entries || []).find((e) => e.id === entryId);
    const bridge = { system: 'external:axm-material-surface-fabric', ref: ref + '#' + entryId, evidence: row ? row.evidence : EVIDENCE[0], sha256: row ? row.observed : null, status: 'HOLD_SOURCE_INCOMPLETE' };
    if (!row || !en || row.state !== 'portable-verified') {
      bridge.status = row && row.reason === 'sha256-mismatch' ? 'HOLD_HASH_MISMATCH' : 'HOLD_SOURCE_INCOMPLETE';
      return { bridge, facet: { type: 'reference', source: bridge.ref, data: { hold: bridge.status, color: [1, 0.7, 0.3], pattern: 'stripes', scale: 0.35 } } };
    }
    bridge.status = 'BOUND';
    return { bridge, facet: { type: 'reference', source: bridge.ref, data: { color: color || [0.8, 0.8, 0.8], channel: en.channel, payload_sha256: row.observed, payload: en.dataUrl } } };
  }
  // Capability registry (parallel-capability v0.6 shape): a manifest is inert data until bound to a local executor.
  function createRegistry() {
    const man = {}, exe = {};
    return {
      advertise(m) { man[m.id] = clone(m); return m.id; },
      bind(id, fn) { if (!man[id]) throw new Error('cannot bind an unadvertised capability: ' + id); exe[id] = fn; },
      status: (id) => (man[id] ? (exe[id] ? 'BOUND' : 'HOLD_NOT_BOUND') : 'UNKNOWN'),
      list: () => Object.keys(man).sort().map((id) => Object.assign({}, man[id], { status: exe[id] ? 'BOUND' : 'HOLD_NOT_BOUND' })),
      whoCanProduce: (form) => Object.keys(man).sort().filter((id) => man[id].produces === form).map((id) => ({ id, status: exe[id] ? 'BOUND' : 'HOLD_NOT_BOUND' })),
      invoke(id) { if (!exe[id]) return { ok: false, status: man[id] ? 'HOLD_NOT_BOUND' : 'UNKNOWN' }; return { ok: true, result: exe[id].apply(null, Array.prototype.slice.call(arguments, 1)) }; },
    };
  }

  // ───────────────────────────── 8 mesh
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const ID3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const mul3 = (a, b) => { const o = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]; return o; };
  const mv3 = (m, p) => [m[0] * p[0] + m[1] * p[1] + m[2] * p[2], m[3] * p[0] + m[4] * p[1] + m[5] * p[2], m[6] * p[0] + m[7] * p[1] + m[8] * p[2]];
  const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
  const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
  const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
  const affine = (m, t) => ({ m: m || ID3, t: t || [0, 0, 0] });
  const compose = (A, B) => { const p = mv3(A.m, B.t); return { m: mul3(A.m, B.m), t: [p[0] + A.t[0], p[1] + A.t[1], p[2] + A.t[2]] }; };
  const xform = (A, p) => { const q = mv3(A.m, p); return [q[0] + A.t[0], q[1] + A.t[1], q[2] + A.t[2]]; };
  const rotXYZ = (r) => mul3(rotY(r[1] || 0), mul3(rotX(r[0] || 0), rotZ(r[2] || 0)));
  const cleanNumber = (n) => Math.abs(n) < 1e-12 ? 0 : Math.round(n * 1e12) / 1e12;
  function rotationOf(m) { // inverse of rotXYZ: Ry * Rx * Rz
    const x = Math.asin(Math.max(-1, Math.min(1, -m[5]))), cx = Math.cos(x);
    let y, z;
    if (Math.abs(cx) > 1e-9) { y = Math.atan2(m[2], m[8]); z = Math.atan2(m[3], m[4]); }
    else { y = Math.atan2(-m[6], m[0]); z = 0; }
    return [cleanNumber(x), cleanNumber(y), cleanNumber(z)];
  }
  function placementOf(tile) {
    const c = (tile && tile.facets && tile.facets.connect) || {};
    return { place: clone(c.place || [0, 0, 0]), rotation: clone(c.rotation || [0, 0, 0]) };
  }
  function composePlacement(parent, child) {
    const A = affine(rotXYZ(parent.rotation || [0, 0, 0]), parent.place || [0, 0, 0]);
    const B = affine(rotXYZ(child.rotation || [0, 0, 0]), child.place || [0, 0, 0]);
    const C = compose(A, B);
    return { place: C.t.map(cleanNumber), rotation: rotationOf(C.m) };
  }

  function pushTri(out, A, a, b, c, dir, tint, K) { // orient so the normal points along `dir`, then place with affine A
    if (dot(cross(sub3(b, a), sub3(c, a)), dir) < 0) { const x = b; b = c; c = x; }
    const pa = xform(A, a), pb = xform(A, b), pc = xform(A, c);
    out.P.push(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2], pc[0], pc[1], pc[2]); out.T.push(tint == null ? 1 : tint); out.K.push(K || null);
  }
  const outward = (a, b, c, ctr) => [(a[0] + b[0] + c[0]) / 3 - ctr[0], (a[1] + b[1] + c[1]) / 3 - ctr[1], (a[2] + b[2] + c[2]) / 3 - ctr[2]];
  const convexTri = (out, A, a, b, c, K, ctr) => pushTri(out, A, a, b, c, outward(a, b, c, ctr || [0, 0, 0]), 1, K);
  function addPart(out, part) {
    const s = part.size || [1, 1, 1], K = part.color || null, A = affine(rotXYZ(part.rot || [0, 0, 0]), part.pos || [0, 0, 0]);
    const hx = s[0] / 2, hy = s[1] / 2, hz = s[2] / 2, seg = part.segments || 14;
    const ring = (y, r) => { const p = []; for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; p.push([Math.cos(a) * r * hx, y, Math.sin(a) * r * hz]); } return p; };
    switch (part.shape) {
      case 'sphere': {
        const la = 9;
        for (let i = 0; i < la; i++) for (let j = 0; j < seg; j++) {
          const p = (u, v) => { const th = (u / la) * Math.PI, ph = (v / seg) * Math.PI * 2; return [Math.sin(th) * Math.cos(ph) * hx, Math.cos(th) * hy, Math.sin(th) * Math.sin(ph) * hz]; };
          const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1);
          if (i > 0) convexTri(out, A, a, b, d, K);
          if (i < la - 1) convexTri(out, A, b, c, d, K);
        }
        break;
      }
      case 'cylinder': case 'cone': {
        const top = ring(hy, part.shape === 'cone' ? 0.001 : part.taper == null ? 1 : part.taper), bot = ring(-hy, 1);
        for (let i = 0; i < seg; i++) {
          const j = (i + 1) % seg;
          convexTri(out, A, bot[i], bot[j], top[j], K); convexTri(out, A, bot[i], top[j], top[i], K);
          convexTri(out, A, [0, -hy, 0], bot[i], bot[j], K);
          if (part.shape !== 'cone') convexTri(out, A, [0, hy, 0], top[i], top[j], K);
        }
        break;
      }
      case 'wedge': {
        const a = [-hx, -hy, -hz], b = [hx, -hy, -hz], c = [hx, -hy, hz], d = [-hx, -hy, hz], e = [-hx, hy, -hz], f = [hx, hy, -hz], ctr = [0, -hy / 3, -hz / 3];
        for (const t of [[a, b, c], [a, c, d], [a, b, f], [a, f, e], [e, f, c], [e, c, d], [a, d, e], [b, c, f]]) convexTri(out, A, t[0], t[1], t[2], K, ctr);
        break;
      }
      case 'plane': { const a = [-hx, 0, -hz], b = [hx, 0, -hz], c = [hx, 0, hz], d = [-hx, 0, hz]; pushTri(out, A, a, b, c, [0, 1, 0], 1, K); pushTri(out, A, a, c, d, [0, 1, 0], 1, K); break; }
      default: { // box, faces subdivided so patterns have something to show on
        const n = part.sub || 3;
        const faces = [[[-hx, -hy, hz], [s[0], 0, 0], [0, s[1], 0]], [[hx, -hy, -hz], [-s[0], 0, 0], [0, s[1], 0]], [[hx, -hy, hz], [0, 0, -s[2]], [0, s[1], 0]],
          [[-hx, -hy, -hz], [0, 0, s[2]], [0, s[1], 0]], [[-hx, hy, hz], [s[0], 0, 0], [0, 0, -s[2]]], [[-hx, -hy, -hz], [s[0], 0, 0], [0, 0, s[2]]]];
        for (const [o, u, v] of faces) {
          const nrm = cross(u, v), pt = (i, j) => [o[0] + (u[0] * i + v[0] * j) / n, o[1] + (u[1] * i + v[1] * j) / n, o[2] + (u[2] * i + v[2] * j) / n];
          for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { pushTri(out, A, pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), nrm, 1, K); pushTri(out, A, pt(i, j), pt(i + 1, j + 1), pt(i, j + 1), nrm, 1, K); }
        }
      }
    }
  }
  function vnoise(x, z, seed) {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
    const a = ihash(ix, iz, seed), b = ihash(ix + 1, iz, seed), c = ihash(ix, iz + 1, seed), d = ihash(ix + 1, iz + 1, seed);
    return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
  }
  const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  // A recipe is a shape described as matter: loops, expressions and parts, evaluated by the same little expression
  // language the rest of the world uses. New forms can be invented inside a world without any engine code, and the
  // only limit is a stated budget — exceeded, it says so in amber rather than running away.
  const RECIPE_BUDGET = 4000;
  function runRecipe(out, data, ctx) {
    ctx = ctx || {};
    const vars = Object.assign(Object.create(null), data.vars || {}), budget = Math.min(data.budget || RECIPE_BUDGET, RECIPE_BUDGET);
    const world = ctx.world || null, seen = ctx.seen || [], depth0 = ctx.depth || 0, spent = ctx.made || 0; // what the rest of the chain has already used
    let made = 0, stopped = null;
    const NONFINITE_RECIPE_VALUE = {};
    const num = (v, scope, d) => {
      if (v === undefined) return d;
      const x = evalExpr(v, { t: 0, words: wordsOf(world), get: (n) => (Object.prototype.hasOwnProperty.call(scope, n) ? scope[n] : vars[n]) });
      if (typeof x === 'number' && !Number.isFinite(x)) { stopped = stopped || 'HOLD_RECIPE_NONFINITE_VALUE'; throw NONFINITE_RECIPE_VALUE; }
      return typeof x === 'number' ? x : d;
    };
    const vec = (v, scope, d) => (Array.isArray(v) ? [num(v[0], scope, d[0]), num(v[1], scope, d[1]), num(v[2], scope, d[2])] : d);
    const walk = (nodes, scope, depth) => {
      if (stopped || depth > 8) { if (depth > 8) stopped = stopped || 'HOLD_RECIPE_TOO_DEEP'; return; }
      for (const n of nodes || []) {
        if (stopped) return;
        if (n.repeat !== undefined) {
          const count = Math.max(0, Math.floor(num(n.repeat, scope, 0)));
          if (count + spent > budget) { stopped = 'HOLD_RECIPE_OVER_BUDGET'; return; }
          for (let i = 0; i < count; i++) { const inner = Object.assign(Object.create(null), scope); inner[n.as || 'i'] = i; inner[(n.as || 'i') + '_of'] = count; inner[(n.as || 'i') + '_at'] = count > 1 ? i / (count - 1) : 0; walk(n.body, inner, depth + 1); if (stopped) return; }
          continue;
        }
        if (n.when !== undefined && !evalExpr(n.when, { t: 0, words: wordsOf(world), get: (k) => (Object.prototype.hasOwnProperty.call(scope, k) ? scope[k] : vars[k]) })) continue;
        if (n.body) { walk(n.body, scope, depth + 1); continue; }
        if (n.use !== undefined) { // a part that is another invented shape: composition, not a special case
          if (!world) { stopped = 'HOLD_NO_WORLD_TO_LOOK_IN'; return; }
          const def = (world.defs || {})[n.use];
          if (!def || !def.body || !def.body.facets) { stopped = 'HOLD_DEFINITION_NOT_HERE'; return; }
          if (seen.indexOf(n.use) >= 0) { stopped = 'HOLD_RECIPE_USES_ITSELF'; return; }
          if (depth0 >= 4) { stopped = 'HOLD_RECIPE_TOO_DEEP'; return; }
          const sub = { P: [], T: [], K: [], hold: null };
          let subMesh = def.body.facets.mesh;
          if (n.with) { // the same shape, asked for at different settings: the definition itself is untouched
            const over = Object.create(null); for (const k of Object.keys(n.with)) over[k] = num(n.with[k], scope, undefined);
            if (subMesh.type === 'generated' && subMesh.data && subMesh.data.generator === 'recipe') subMesh = { type: 'generated', source: null, data: Object.assign({}, subMesh.data, { vars: Object.assign(Object.create(null), subMesh.data.vars || {}, over) }) };
            else stopped = 'HOLD_SETTINGS_NOT_ACCEPTED';
            if (stopped) return;
          }
          const inner = compileMeshData(subMesh, def.body.facets.material && def.body.facets.material.data, { world, seen: seen.concat(n.use), depth: depth0 + 1, made: spent + made, budget });
          sub.P = inner.P; sub.T = inner.T; sub.K = inner.K;
          made += inner.recipe_parts || 1;
          if (inner.hold) { stopped = inner.hold; return; }
          if (made + spent > budget) { stopped = 'HOLD_RECIPE_OVER_BUDGET'; return; }
          const sc = n.scale === undefined ? [1, 1, 1] : (Array.isArray(n.scale) ? vec(n.scale, scope, [1, 1, 1]) : (function (k) { return [k, k, k]; })(num(n.scale, scope, 1)));
          const R = rotXYZ(vec(n.rot, scope, [0, 0, 0])), P = vec(n.pos, scope, [0, 0, 0]), K = n.color ? vec(n.color, scope, [0.6, 0.6, 0.7]) : null;
          for (let i = 0; i < sub.T.length; i++) {
            const o = i * 9;
            for (let v = 0; v < 3; v++) { const q = mv3(R, [sub.P[o + v * 3] * sc[0], sub.P[o + v * 3 + 1] * sc[1], sub.P[o + v * 3 + 2] * sc[2]]); out.P.push(q[0] + P[0], q[1] + P[1], q[2] + P[2]); }
            out.T.push(sub.T[i]); out.K.push(K || sub.K[i]);
          }
          continue;
        }
        if (++made + spent > budget) { stopped = 'HOLD_RECIPE_OVER_BUDGET'; return; }
        addPart(out, { shape: n.shape || 'box', size: vec(n.size, scope, [1, 1, 1]), pos: vec(n.pos, scope, [0, 0, 0]), rot: vec(n.rot, scope, [0, 0, 0]),
          color: n.color ? vec(n.color, scope, [0.6, 0.6, 0.7]) : null, segments: n.segments, taper: n.taper === undefined ? undefined : num(n.taper, scope, 1), sub: n.sub });
      }
    };
    try { walk(data.parts, Object.create(null), 0); } catch (err) { if (err !== NONFINITE_RECIPE_VALUE) throw err; }
    if (stopped) { out.hold = stopped; if (!ctx.depth) addPart(out, { shape: 'box', size: [1, 1, 1], color: [1, 0.7, 0.3] }); }
    out.recipe_parts = made;
  }
  const GENERATORS = {
    recipe(out, d, ctx) { runRecipe(out, d, ctx); },
    terrain(out, d) { // floating island: heightfield top, rocky underside, flat plateau in the middle for things to stand on
      const R = d.radius || 5.5, n = d.resolution || 22, H = d.height || 1.6, plateau = d.plateau == null ? 1 : d.plateau, depth = d.depth || 4, seed = d.seed || 1, A = affine();
      const at = (i, j) => {
        const x = -R + (2 * R * i) / n, z = -R + (2 * R * j) / n, r = Math.hypot(x, z) / R, m = Math.max(0, 1 - r * r);
        const nz = 0.6 * vnoise(x * 0.55, z * 0.55, seed) + 0.4 * vnoise(x * 1.3, z * 1.3, seed + 7);
        let top = (0.3 + nz) * H * Math.sqrt(m); const w = 1 - smooth(0.3, 0.55, r); top = top + (plateau - top) * w;
        return { x, z, m, top: m > 0 ? top : 0, bot: -depth * Math.pow(m, 0.8) * (0.65 + 0.7 * vnoise(x * 0.8, z * 0.8, seed + 3)) };
      };
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const q = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
        if (q.every((c) => c.m <= 0)) continue;
        const T = q.map((c) => [c.x, c.top, c.z]), B = q.map((c) => [c.x, c.bot, c.z]), avg = (q[0].top + q[1].top + q[2].top + q[3].top) / 4;
        const K = avg > H * 0.95 + 0.25 ? [0.9, 0.94, 1] : null, tint = 0.72 + 0.28 * ihash(i, j, seed + 11);
        pushTri(out, A, T[0], T[1], T[2], [0, 1, 0], tint, K); pushTri(out, A, T[0], T[2], T[3], [0, 1, 0], tint, K);
        const rk = [0.3, 0.27, 0.4];
        pushTri(out, A, B[0], B[1], B[2], [0, -1, 0], tint, rk); pushTri(out, A, B[0], B[2], B[3], [0, -1, 0], tint, rk);
      }
    },
    tower(out, d) {
      const levels = d.levels || 3, r0 = d.radius || 0.6, lh = d.level_height || 1.1, seed = d.seed || 1; let y = 0;
      for (let i = 0; i < levels; i++) {
        const r = r0 * (1 - 0.12 * i) * (0.95 + 0.1 * ihash(i, 0, seed));
        addPart(out, { shape: 'cylinder', size: [r * 2, lh, r * 2], pos: [0, y + lh / 2, 0], taper: 0.9 });
        addPart(out, { shape: 'cylinder', size: [r * 2.25, 0.12, r * 2.25], pos: [0, y + lh, 0], color: [0.45, 0.5, 0.7] });
        y += lh;
      }
      addPart(out, { shape: 'cone', size: [r0 * 2.3, d.roof_height || 0.9, r0 * 2.3], pos: [0, y + (d.roof_height || 0.9) / 2, 0], color: d.roof_color || [0.45, 0.35, 0.85] });
    },
  };
  const meshCache = new Map();
  function clearRuntimeCaches() { const cleared = meshCache.size; meshCache.clear(); return { cleared }; }
  const compileMesh = (tile, world) => compileMeshData(tile.facets.mesh, tile.facets.material.data, world ? { world } : null);
  function compileMeshData(mf, material, ctx) {
    const md = material || {}, world = ctx && ctx.world;
    const key = canonical([mf, md.pattern, md.scale, md.paint, (ctx && ctx.seen) || null, world && mf.type === 'generated' && mf.data && mf.data.generator === 'recipe' ? hashOf(world.defs || {}) : null]);
    if (meshCache.has(key)) return meshCache.get(key);
    const out = { P: [], T: [], K: [], hold: null };
    if (mf.type === 'interior') { /* this tile's geometry is its contents */ }
    else if (mf.type === 'reference') { out.hold = 'HOLD_SOURCE_INCOMPLETE'; addPart(out, { shape: 'box', size: [1, 1, 1], color: [1, 0.7, 0.3] }); }
    else if (mf.type === 'generated') {
      const g = GENERATORS[(mf.data || {}).generator];
      if (g) g(out, mf.data, ctx); else { out.hold = 'HOLD_UNKNOWN_GENERATOR'; addPart(out, { shape: 'box', size: [1, 1, 1], color: [1, 0.7, 0.3] }); }
    } else for (const part of (mf.data && mf.data.parts) || [mf.data || {}]) addPart(out, part);
    if (out.P.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      out.P = []; out.T = []; out.K = [];
      if (!out.hold) out.hold = 'HOLD_MESH_NONFINITE_VALUE';
    }
    const paint = md.paint; // {vars, color: [expr, expr, expr] over x, y, z, and the tile's own numbers}
    if (paint && Array.isArray(paint.color)) {
      const pv = paint.vars || {};
      for (let i = 0; i < out.T.length; i++) {
        const o = i * 9, px = (out.P[o] + out.P[o + 3] + out.P[o + 6]) / 3, py = (out.P[o + 1] + out.P[o + 4] + out.P[o + 7]) / 3, pz = (out.P[o + 2] + out.P[o + 5] + out.P[o + 8]) / 3;
        const nrm = norm(cross([out.P[o + 3] - out.P[o], out.P[o + 4] - out.P[o + 1], out.P[o + 5] - out.P[o + 2]], [out.P[o + 6] - out.P[o], out.P[o + 7] - out.P[o + 1], out.P[o + 8] - out.P[o + 2]]));
        const ctx2 = { t: 0, words: wordsOf(world), get: (k) => (k === 'x' ? px : k === 'y' ? py : k === 'z' ? pz : k === 'nx' ? nrm[0] : k === 'ny' ? nrm[1] : k === 'nz' ? nrm[2] : k === 'up' ? Math.max(0, nrm[1]) : pv[k]) };
        const ch = paint.color.map((e) => { const v = evalExpr(e, ctx2); return typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : null; });
        if (ch.every((v) => v !== null)) out.K[i] = ch;
      }
    }
    const pat = md.pattern, sc = md.scale || 0.5;
    if (pat && pat !== 'none') for (let i = 0; i < out.T.length; i++) {
      const o = i * 9, cx = (out.P[o] + out.P[o + 3] + out.P[o + 6]) / 3, cy = (out.P[o + 1] + out.P[o + 4] + out.P[o + 7]) / 3, cz = (out.P[o + 2] + out.P[o + 5] + out.P[o + 8]) / 3;
      const e = 1e-4, fx = Math.floor(cx / sc + e), fy = Math.floor(cy / sc + e), fz = Math.floor(cz / sc + e);
      out.T[i] *= pat === 'checker' ? ((fx + fy + fz) & 1 ? 0.62 : 1) : pat === 'stripes' ? ((fy + fz) & 1 ? 0.55 : 1) : 0.7 + 0.3 * ihash(fx, fz, fy);
    }
    if (meshCache.size > 200) meshCache.clear();
    meshCache.set(key, out);
    return out;
  }
  function behaviorPose(world, path, tile, t) {
    tile = activeTile(world, path, tile);
    const pose = { pos: [0, 0, 0], r: [0, 0, 0], glow: 0 }, bh = tile.facets.behavior;
    if (bh.type !== 'scripted') return pose;
    const ctx = tileCtx(world, path, t, tile);
    const mo = bh.data.motion; // {vars, pos: [expr,expr,expr], rot: [...], glow: expr} — motion written, not chosen
    if (mo) {
      const mv = mo.vars || {}, mctx = { t, words: wordsOf(world), get: (n) => (n in mv ? mv[n] : ctx.get(n)) };
      const one = (e, d) => { if (e === undefined) return d; const v = evalExpr(e, mctx); return typeof v === 'number' && isFinite(v) ? v : d; };
      const three = (a, into) => { if (!Array.isArray(a)) return; for (let i = 0; i < 3; i++) into[i] += one(a[i], 0); };
      three(mo.pos, pose.pos); three(mo.rot, pose.r); pose.glow += one(mo.glow, 0);
    }
    for (const op of bh.data.ops || []) {
      if (op.when !== undefined && !evalExpr(op.when, ctx)) continue;
      const by = op.by !== undefined ? Number(evalExpr(op.by, ctx)) || 0 : t, rate = op.rate == null ? 1 : op.rate;
      if (op.op === 'spin') pose.r[op.axis === 'x' ? 0 : op.axis === 'z' ? 2 : 1] += rate * by;
      else if (op.op === 'bob') pose.pos[1] += (op.amp || 0.2) * Math.sin(rate * by);
      else if (op.op === 'orbit') { const a = rate * by, r = op.radius || 5; pose.pos[0] += r * Math.cos(a); pose.pos[2] += r * Math.sin(a); pose.r[1] -= a; }
      else if (op.op === 'pulse') pose.glow += (op.amp || 0.4) * (0.5 + 0.5 * Math.sin(rate * by));
    }
    return pose;
  }
  const negSocket = (s) => { const p = (s && s.pos) || [0, 0, 0]; return affine(ID3, [-p[0], -p[1], -p[2]]); };
  function attachFrame(world, path, socketId, t, memo, depth) { // where a socket is in space; a port resolves down to the real inner socket
    const tile = activeTile(world, path), s = tile && findSocket(tile, socketId);
    if (tile && tile.interior && s && s.port && (depth || 0) < 64) { const p = tile.interior.ports.find((x) => x.id === socketId); if (p) return attachFrame(world, join(path, p.tile), p.socket, t, memo, (depth || 0) + 1); }
    return compose(tileMatrix(world, path, t, memo), affine(ID3, (s && s.pos) || [0, 0, 0]));
  }
  function tileMatrix(world, path, t, memo, depth) {
    if (memo[path]) return memo[path];
    const [cpath, id] = splitPath(path), c = containerAt(world, cpath), tile = activeTile(world, path, c.tiles[id]), pose = behaviorPose(world, path, tile, t), B = affine(rotXYZ(pose.r), pose.pos), local = placementOf(tile), P = affine(rotXYZ(local.rotation), local.place);
    const pe = (depth || 0) < 64 ? parentEdgeOf(c, id) : null;
    let M;
    if (pe) M = compose(compose(compose(attachFrame(world, join(cpath, pe.from.tile), pe.from.socket, t, memo), affine(rotXYZ(local.rotation), [0, 0, 0])), B), negSocket(findSocket(tile, pe.to.socket)));
    else if (cpath) { // a root of an interior: it lives in its shell's frame; if the shell hangs from outside through this tile's port, it hangs the same way it did before collapsing
      const shell = activeTile(world, cpath), sp = splitPath(cpath), spe = parentEdgeOf(containerAt(world, sp[0]), sp[1]);
      const anchor = spe && ((shell.interior && shell.interior.ports) || []).find((p) => p.id === spe.to.socket && p.tile === id), S = tileMatrix(world, cpath, t, memo, (depth || 0) + 1);
      M = anchor ? compose(compose(compose(S, affine(rotXYZ(local.rotation), [0, 0, 0])), B), negSocket(findSocket(tile, anchor.socket))) : compose(compose(S, P), B);
    } else M = compose(P, B);
    M.glow = pose.glow; memo[path] = M;
    return M;
  }

  // ───────────────────────────── 9 forms
  // Every form below is a VIEW: it reads canonical matter and returns a picture of it. None of them stores anything,
  // none of them owns a simplified copy, and every control they expose is a signal or op addressed to the real tile path.
  const declares = (tile, forms) => tile.form_hints.some((h) => forms.includes(h));
  function leaves(world, opts) { // every tile at every depth, in a stable order that does not depend on how deeply things are collapsed
    const act = !(opts && opts.active === false);
    const out = [], walk = (c, prefix) => { for (const id of Object.keys(c.tiles)) { const path = join(prefix, id), tile = act ? activeTile(world, path, c.tiles[id]) : c.tiles[id]; out.push({ path, id, tile }); if (tile.interior && tile.facets.mesh.type === 'interior') walk(tile.interior, path); } };
    walk(world, '');
    return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.path < b.path ? -1 : 1));
  }
  // FORM game_asset — a dependency-free software rasterizer. Same world + same time + same camera -> same pixels.
  function renderAsset(world, opts) {
    opts = opts || {};
    const W = opts.width || 360, Hh = opts.height || 300, t = opts.t == null ? world.time : opts.t, cam = Object.assign({ yaw: 0.6, pitch: 0.32, dist: 19, target: [0, 1.4, 0] }, opts.camera || {});
    const tg = opts.target && opts.target.width === W && opts.target.height === Hh ? opts.target : { width: W, height: Hh, pixels: new Uint8ClampedArray(W * Hh * 4), z: new Float32Array(W * Hh), ids: new Int16Array(W * Hh) };
    const px = tg.pixels, zb = tg.z, ib = tg.ids;
    zb.fill(0); ib.fill(-1);
    for (let y = 0; y < Hh; y++) { const k = y / Hh, r = 5 + 9 * k, g = 8 + 16 * k, b = 22 + 38 * k; for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255; } }
    for (let i = 0; i < 70; i++) { const x = (ihash(i, 1, 5) * W) | 0, y = (ihash(i, 2, 5) * Hh * 0.8) | 0, o = (y * W + x) * 4, v = 90 + ihash(i, 3, 5) * 150; px[o] = v; px[o + 1] = v; px[o + 2] = Math.min(255, v + 40); }
    const cp = Math.cos(cam.pitch), eye = [cam.target[0] + cam.dist * cp * Math.sin(cam.yaw), cam.target[1] + cam.dist * Math.sin(cam.pitch), cam.target[2] + cam.dist * cp * Math.cos(cam.yaw)];
    const f = norm(sub3(cam.target, eye)), rt = norm(cross(f, [0, 1, 0])), up = cross(rt, f), focal = Hh * 1.25, L = norm([0.45, 0.8, 0.35]);
    let list = leaves(world).filter((e) => e.tile.facets.mesh.type !== 'interior'); const memo = {}, stats = { tris: 0, tiles: 0, skipped: [], holds: [], sleeping: sleepingReport(world).asleep };
    const sel = opts.highlight || null;
    if (opts.within) { // hold far more than you draw: anything past this distance is not drawn at all
      const kept = [];
      for (const e of list) { const m = tileMatrix(world, e.path, t, memo); const d = Math.hypot(m.t[0] - cam.target[0], m.t[1] - cam.target[1], m.t[2] - cam.target[2]); if (d <= opts.within) kept.push(e); }
      stats.out_of_range = list.length - kept.length; list = kept;
    }
    list.forEach((entry, index) => {
      const tile = entry.tile, path = entry.path;
      if (!declares(tile, SPATIAL_FORMS)) { stats.skipped.push(path); return; }
      const mesh = compileMesh(tile, world), M = tileMatrix(world, path, t, memo), md = tile.facets.material.data || {}, ctx = tileCtx(world, path, t, tile);
      if (mesh.hold) stats.holds.push({ tile: path, facet: 'mesh', status: mesh.hold });
      if (md.hold) stats.holds.push({ tile: path, facet: 'material', status: md.hold });
      const lit = sel && (path === sel || path.startsWith(sel + '/'));
      const base = md.color || [0.6, 0.6, 0.7], glowC = md.glow || base, em = Math.max(0, (Number(evalExpr(md.emissive, ctx)) || 0) + (M.glow || 0)) + (lit ? 0.35 : 0);
      stats.tiles++;
      const P = mesh.P, n = mesh.T.length;
      for (let i = 0; i < n; i++) {
        const o = i * 9, a = xform(M, [P[o], P[o + 1], P[o + 2]]), b = xform(M, [P[o + 3], P[o + 4], P[o + 5]]), c = xform(M, [P[o + 6], P[o + 7], P[o + 8]]);
        const nr = cross(sub3(b, a), sub3(c, a));
        if (dot(nr, sub3(a, eye)) >= 0) continue; // back face
        const va = sub3(a, eye), vb = sub3(b, eye), vc = sub3(c, eye), az = dot(va, f), bz = dot(vb, f), cz = dot(vc, f);
        if (az < 0.2 || bz < 0.2 || cz < 0.2) continue;
        const ax = W / 2 + (dot(va, rt) / az) * focal, ay = Hh / 2 - (dot(va, up) / az) * focal, bx = W / 2 + (dot(vb, rt) / bz) * focal, by = Hh / 2 - (dot(vb, up) / bz) * focal, cx = W / 2 + (dot(vc, rt) / cz) * focal, cy = Hh / 2 - (dot(vc, up) / cz) * focal;
        const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        if (Math.abs(area) < 1e-6) continue;
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx))), y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(Hh - 1, Math.ceil(Math.max(ay, by, cy)));
        if (x0 > x1 || y0 > y1) continue;
        const nn = norm(nr), lam = Math.max(0, dot(nn, L)), sky = 0.5 + 0.5 * nn[1], col = mesh.K[i] || base, tint = mesh.T[i], shade = 0.22 + 0.78 * lam;
        const fog = Math.max(0, Math.min(0.55, ((az + bz + cz) / 3 - cam.dist) * 0.03));
        let r = col[0] * tint * shade + 0.05 * sky + glowC[0] * em, g = col[1] * tint * shade + 0.08 * sky + glowC[1] * em, bl = col[2] * tint * shade + 0.14 * sky + glowC[2] * em;
        r = (r * (1 - fog) + 0.04 * fog) * 255; g = (g * (1 - fog) + 0.07 * fog) * 255; bl = (bl * (1 - fog) + 0.16 * fog) * 255;
        const inv = 1 / area, iza = 1 / az, izb = 1 / bz, izc = 1 / cz;
        stats.tris++;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const qx = x + 0.5, qy = y + 0.5, w0 = ((bx - qx) * (cy - qy) - (by - qy) * (cx - qx)) * inv, w1 = ((cx - qx) * (ay - qy) - (cy - qy) * (ax - qx)) * inv, w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const iz = w0 * iza + w1 * izb + w2 * izc, k = y * W + x;
          if (iz <= zb[k]) continue;
          zb[k] = iz; ib[k] = index; const q = k * 4; px[q] = r; px[q + 1] = g; px[q + 2] = bl;
        }
      }
    });
    return { width: W, height: Hh, pixels: px, target: tg, order: list.map((e) => e.path), stats, pick: (x, y) => { const i = ib[(y | 0) * W + (x | 0)]; return i >= 0 ? list[i].path : null; } };
  }
  const renderReceipt = (frame) => ({ form: 'game_asset', width: frame.width, height: frame.height, sha256: sha256(new Uint8Array(frame.pixels.buffer, frame.pixels.byteOffset, frame.pixels.length)), tris: frame.stats.tris });

  // FORM ui_panel — the same graph read as an interface. Output is a plain vnode tree; any host can mount it.
  // `opts.open` (true, or {path: true}) is view state owned by the host: which shells are shown opened. It is never written into matter.
  const css = (c, k) => 'rgb(' + c.map((v) => Math.round(Math.max(0, Math.min(1, v * (k || 1))) * 255)).join(',') + ')';
  const h = (tag, props, children) => Object.assign({ tag, children: children || [] }, props || {});
  const fmt = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : String(v));
  function meshSummary(tile) { const m = tile.facets.mesh; return m.type === 'interior' ? 'holds ' + countTiles(tile.interior || { tiles: {} }) + ' tiles, ' + depthOf(tile) + ' deep' : m.type === 'generated' ? 'generated ' + m.data.generator : m.type === 'reference' ? 'referenced' : m.data.parts ? m.data.parts.length + ' parts' : m.data.shape || 'box'; }
  function resolvePresentation(world, path, opts) {
    opts = opts || {};
    const tile = activeTile(world, path), canonicalPresentation = clone((tile && tile.presentation) || { mode: 'screen', user_adjustable: false });
    const session = (opts.session_presentations || {})[path];
    const resolved = canonicalPresentation.user_adjustable && session ? Object.assign({}, canonicalPresentation, clone(session)) : canonicalPresentation;
    const bad = presentationError(resolved);
    if (bad) return { status: 'HOLD_INVALID_PRESENTATION', detail: bad, canonical: canonicalPresentation, resolved };
    const supported = opts.presentation_modes || PRESENTATION_MODES;
    if (!supported.includes(resolved.mode)) return { status: 'HOLD_UNSUPPORTED_PRESENTATION', detail: 'host does not support ' + resolved.mode, canonical: canonicalPresentation, resolved };
    let anchor_frame = null;
    if (resolved.mode === 'world') anchor_frame = { place: [0, 0, 0], rotation: [0, 0, 0], anchor: 'world-root' };
    if (resolved.mode === 'tile') {
      const anchor = resolved.anchor || path;
      if (!resolveTile(world, anchor)) return { status: 'HOLD_MISSING_PRESENTATION_ANCHOR', detail: 'no tile ' + anchor, canonical: canonicalPresentation, resolved };
      const m = tileMatrix(world, anchor, opts.t == null ? world.time : opts.t, {});
      anchor_frame = { place: m.t.map(cleanNumber), rotation: rotationOf(m.m), anchor };
    }
    return { status: 'READY', canonical: canonicalPresentation, resolved, anchor_frame, session_applied: !!(canonicalPresentation.user_adjustable && session) };
  }
  function presentNode(node, world, path, opts) {
    const p = resolvePresentation(world, path, opts), d = p.resolved || { mode: 'screen' }, mode = PRESENTATION_MODES.includes(d.mode) ? d.mode : 'screen';
    node.cls = (node.cls || '') + ' mt-p-' + mode + (d.dock ? ' mt-dock-' + d.dock : '') + (p.status !== 'READY' ? ' is-presentation-held' : '');
    node.attrs = Object.assign({}, node.attrs, { 'data-presentation-mode': mode, 'data-presentation-status': p.status });
    node.style = Object.assign({}, node.style);
    if (d.preferred_size) { node.style['--p-width'] = d.preferred_size[0] + 'px'; node.style['--p-height'] = d.preferred_size[1] + 'px'; }
    if (d.preferred_position) { node.style['--p-x'] = d.preferred_position[0] + 'px'; node.style['--p-y'] = d.preferred_position[1] + 'px'; }
    const where = mode === 'docked' ? 'docked ' + (d.dock || 'right') : mode === 'tile' ? 'tile anchor ' + ((p.anchor_frame && p.anchor_frame.anchor) || d.anchor || path) : mode === 'world' ? 'world anchor' : mode;
    node.children.unshift(h('p', { cls: 'mt-presentation-tag' + (p.status === 'READY' ? '' : ' is-hold'), text: p.status === 'READY' ? where + (p.session_applied ? ' · session adjusted' : '') : p.status + ' · ' + p.detail }));
    return node;
  }
  // A tile may carry its own interface in `view`: the same little language, deciding what is shown and how.
  // The engine's card is only the default for a tile that has not said otherwise — presentation stops being
  // the engine's to decide. Views read; they never write, and every control they place addresses a real path.
  function compileView(world, path, tile, t, ctxExtra, depth, seen) {
    depth = depth || 0; seen = seen || [];
    const vctx = { t, words: wordsOf(world), get: (n) => { if (ctxExtra && n in ctxExtra) return ctxExtra[n]; const v = getVar(world, path, n, t, 0, tile); return v === undefined ? undefined : v; } };
    const ev = (e, d) => { if (e === undefined) return d; if (typeof e === 'string' || typeof e === 'number' || typeof e === 'boolean') return e; const v = evalExpr(e, vctx); return v === null || v === undefined ? d : v; };
    const label = (e, d) => { const v = ev(e, d); return v === undefined || v === null ? d : (typeof v === 'number' ? fmt(v) : String(v)); };
    const one = (n, scope) => {
      if (n === null || n === undefined) return null;
      if (typeof n === 'string') return h('p', { cls: 'v-text', text: n });
      const sctx = scope ? Object.assign({}, ctxExtra, scope) : ctxExtra;
      const evs = (e, d) => { if (e === undefined) return d; const v = evalExpr(e, { t, words: wordsOf(world), get: (k) => (sctx && k in sctx ? sctx[k] : getVar(world, path, k, t, 0, tile)) }); return v === null || v === undefined ? d : v; };
      if (n.when !== undefined && !evs(n.when, false)) return null;
      if (n.repeat !== undefined) { const count = Math.max(0, Math.min(200, Math.floor(Number(evs(n.repeat, 0)) || 0))), out = [];
        for (let i = 0; i < count; i++) { const inner = Object.assign({}, sctx); inner[n.as || 'i'] = i; inner[(n.as || 'i') + '_of'] = count; out.push(h('div', { cls: 'v-item' }, (n.body || []).map((x) => one(x, inner)).filter(Boolean))); }
        return h('div', { cls: 'v-repeat' }, out); }
      if (n.text !== undefined) return h('p', { cls: 'v-text' + (n.strong ? ' is-strong' : ''), text: label(n.text, '') });
      if (n.value !== undefined) { const v = getVar(world, path, n.value, t, 0, tile);
        return h('div', { cls: 'v-value' }, [h('span', { cls: 'v-label', text: n.label || n.value }), h('b', { text: fmt(v === undefined ? 0 : v), bind: { tile: path, name: n.value } })]); }
      if (n.meter !== undefined) { const v = Number(evs(n.meter, 0)) || 0, lo = Number(evs(n.min, 0)) || 0, hi = Number(evs(n.max, 1)) || 1, k = hi === lo ? 0 : Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
        return h('div', { cls: 'v-meter' }, [h('span', { cls: 'v-label', text: label(n.label, '') }), h('div', { cls: 'v-bar' }, [h('i', { style: { width: (k * 100).toFixed(1) + '%' } })])]); }
      if (n.button !== undefined) { const sock = findSocket(tile, n.button);
        if (!sock || sock.kind !== 'signal' || sock.dir !== 'in') return h('p', { cls: 'v-missing', text: 'no exposed action called ' + n.button });
        return h('button', { cls: 'v-button', text: label(n.label, sock.label || n.button), on: { type: 'signal', tile: path, name: sock.signal || sock.id } }); }
      if (n.control !== undefined) { const p2 = (tile.params || []).find((q) => q.id === n.control);
        if (!p2) return h('p', { cls: 'v-missing', text: 'no control called ' + n.control });
        const v = paramValue(tile, p2), ctl = { tile: path, id: p2.id };
        if (v === undefined) return h('p', { cls: 'v-missing', text: (p2.label || p2.id) + ' is dormant' });
        return h('label', { cls: 'v-control' }, [h('span', { cls: 'v-label', text: label(n.label, p2.label || p2.id) }), p2.type === 'choice'
          ? h('select', { param: ctl }, p2.options.map((o) => h('option', { text: o.label, attrs: Object.assign({ value: o.label }, canonical(o.value) === canonical(v) ? { selected: 'selected' } : {}) })))
          : h('input', { param: ctl, attrs: { type: 'range', min: p2.min, max: p2.max, step: p2.step || 1, value: v } }), h('output', { text: fmt(v) })]); }
      if (n.tile !== undefined) { // show another tile here: interfaces compose the way shapes do
        const sub = n.tile.indexOf('/') === 0 ? n.tile.slice(1) : join(splitPath(path)[0], n.tile), st = resolveTile(world, sub) || resolveTile(world, n.tile);
        const spath = resolveTile(world, sub) ? sub : n.tile;
        if (!st) return h('p', { cls: 'v-missing', text: 'no tile called ' + n.tile });
        if (depth > 6 || seen.indexOf(spath) >= 0) return h('p', { cls: 'v-missing', text: 'this view leans on itself' });
        const at = activeTile(world, spath, st);
        return h('div', { cls: 'v-embed', tile: spath }, [at.view ? compileView(world, spath, at, t, null, depth + 1, seen.concat(path)) : h('p', { cls: 'v-text', text: at.name })]); }
      if (n.row || n.group) return h('div', { cls: n.row ? 'v-row' : 'v-group' }, (n.row || n.group).map((x) => one(x, sctx)).filter(Boolean));
      return null;
    };
    const v = tile.view, md = tile.facets.material.data || {}, col = md.color || [0.5, 0.55, 0.8];
    return h('section', { cls: 'mt-panel is-view' + (md.hold ? ' is-hold' : ''), tile: path,
      style: { '--tile': Array.isArray(v.accent) ? css(v.accent) : typeof v.accent === 'string' ? v.accent : css(col), 'flex-grow': String(Math.max(1, Number(ev(v.width, 1)) || 1)) } },
      [v.title === undefined ? null : h('header', {}, [h('h3', { text: label(v.title, tile.name) })])].concat((v.body || []).map((x) => one(x, null))).filter(Boolean));
  }
  function compilePanel(world, opts) {
    opts = opts || {};
    const t = opts.t == null ? world.time : opts.t, skipped = [], isOpen = (p) => opts.open === true || !!(opts.open && opts.open[p]);
    const node = (c, cpath, id) => {
      const path = join(cpath, id), tile = activeTile(world, path, c.tiles[id]), kids = childrenOf(c, id).map((k) => node(c, cpath, k));
      const inside = tile.interior && isOpen(path) ? h('div', { cls: 'mt-interior' }, rootsOf(tile.interior).map((k) => node(tile.interior, path, k))) : null;
      if (tile.view && declares(tile, ['ui_panel'])) { const own = presentNode(compileView(world, path, tile, t, null, 0, []), world, path, Object.assign({}, opts, { t }));
        return kids.length || inside ? h('div', { cls: 'v-holder' }, [own].concat(inside ? [inside] : [], kids.length ? [h('div', { cls: 'mt-children' }, kids)] : [])) : own; }
      if (!declares(tile, ['ui_panel'])) { skipped.push(path); return h('div', { cls: 'mt-foreign', tile: path }, [h('span', { text: tile.name + ' is not declared for this form' })].concat(kids, inside ? [inside] : [])); }
      const md = tile.facets.material.data || {}, col = md.color || [0.5, 0.55, 0.8], shape = tile.facets.mesh.data && tile.facets.mesh.data.shape, size = (tile.facets.mesh.data && tile.facets.mesh.data.size) || [1, 1, 1];
      const em = Math.max(0, Number(evalExpr(md.emissive, tileCtx(world, path, t, tile))) || 0), vars = readVars(world, path, t), socks = tile.facets.connect.sockets || [];
      const wires = sortedEdges(c).filter((e) => e.kind === 'signal' && e.from.tile === id).map((e) => h('li', { text: e.from.socket + ' → ' + (c.tiles[e.to.tile] || {}).name + ' · ' + e.to.socket }));
      const ops = tile.facets.behavior.type === 'scripted' ? tile.facets.behavior.data.ops || [] : [];
      return presentNode(h('section', {
        cls: 'mt-panel' + (tile.interior ? ' mt-shell' : '') + (em > 0.05 ? ' is-lit' : '') + (ops.some((o) => o.op === 'pulse') ? ' is-pulsing' : '') + (md.hold ? ' is-hold' : ''), tile: path,
        style: { '--tile': css(col), '--tile-dim': css(col, 0.35), '--glow': css(md.glow || col), 'border-radius': shape === 'sphere' ? '28px' : shape === 'cylinder' || shape === 'cone' ? '18px' : '6px', 'flex-grow': String(Math.max(1, Math.round(size[0] * size[2]))) },
      }, [
        h('header', {}, [h('h3', { text: tile.name }), h('span', { cls: 'mt-kind', text: meshSummary(tile) }), tile.interior ? h('button', { cls: 'mt-open', text: isOpen(path) ? 'Close' : 'Open', toggle: path }) : null].filter(Boolean)),
        Object.keys(vars).length ? h('dl', {}, Object.keys(vars).map((n) => h('div', {}, [h('dt', { text: n }), h('dd', { text: fmt(vars[n]), bind: { tile: path, name: n } })]))) : null,
        (tile.params || []).length ? h('div', { cls: 'mt-params' }, tile.params.map((p) => { const v = paramValue(tile, p), ctl = { tile: path, id: p.id };
          if (v === undefined) return h('label', { cls: 'is-dormant' }, [h('span', { text: (p.label || p.id) + ' — dormant, nothing to act on in the current matter' })]);
          return h('label', {}, [h('span', { text: p.label || p.id }), p.type === 'choice'
            ? h('select', { param: ctl }, p.options.map((o) => h('option', { text: o.label, attrs: Object.assign({ value: o.label }, canonical(o.value) === canonical(v) ? { selected: 'selected' } : {}) })))
            : h('input', { param: ctl, attrs: { type: 'range', min: p.min, max: p.max, step: p.step || 1, value: v } }), p.type === 'choice' ? null : h('output', { text: fmt(v) })].filter(Boolean)); })) : null,
        socks.some((s) => s.kind === 'signal' && s.dir === 'in') ? h('div', { cls: 'mt-inputs' }, socks.filter((s) => s.kind === 'signal' && s.dir === 'in').map((s) => h('button', { text: s.label || s.signal || s.id, on: { type: 'signal', tile: path, name: s.signal || s.id } }))) : null,
        ops.length ? h('p', { cls: 'mt-behavior', text: ops.map((o) => o.op).join(' + ') }) : null,
        md.hold ? h('p', { cls: 'mt-holdnote', text: 'Material on hold: ' + md.hold }) : null,
        wires.length ? h('ul', { cls: 'mt-wires' }, wires) : null,
        inside,
        kids.length ? h('div', { cls: 'mt-children' }, kids) : null,
      ].filter(Boolean)), world, path, Object.assign({}, opts, { t }));
    };
    const root = h('div', { cls: 'mt-panels' }, rootsOf(world).map((id) => node(world, '', id)));
    return { form: 'ui_panel', root, skipped, presentations: leaves(world).filter((e) => declares(e.tile, ['ui_panel'])).map((e) => Object.assign({ path: e.path }, resolvePresentation(world, e.path, Object.assign({}, opts, { t })))) };
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function vnodeToHTML(v) {
    const style = v.style ? ' style="' + esc(Object.keys(v.style).map((k) => k + ':' + v.style[k]).join(';')) + '"' : '';
    const attrs = (v.cls ? ' class="' + esc(v.cls) + '"' : '') + style + (v.tile ? ' data-tile="' + esc(v.tile) + '"' : '') + (v.on ? ' data-signal="' + esc(v.on.tile + ':' + v.on.name) + '"' : '') + (v.toggle ? ' data-toggle="' + esc(v.toggle) + '"' : '') + (v.param ? ' data-param="' + esc(v.param.tile + ':' + v.param.id) + '"' : '') + (v.bind ? ' data-bind="' + esc(v.bind.tile + '|' + v.bind.name) + '"' : '') + Object.keys(v.attrs || {}).map((k) => ' ' + k + '="' + esc(v.attrs[k]) + '"').join('');
    return '<' + v.tag + attrs + '>' + (v.text != null ? esc(v.text) : '') + v.children.map(vnodeToHTML).join('') + '</' + v.tag + '>';
  }
  // FORM website — static export of the same graph, always opened to full depth. No runtime in the page: it is a compiled delivery.
  // FORM text — the matter written out as readable lines, and read back as ops.
  // It is a surface like the others: `toText` only reads, `fromText` only produces ops that go through
  // the same clone -> plan -> commit path. Anything the notation cannot say is carried as inline JSON,
  // so a round trip never silently drops what it did not understand.
  const IND = '  ';
  function jsonish(v) { return canonical(v).replace(/","/g, '", "').replace(/":/g, '": ').replace(/,"/g, ', "'); }
  function toText(world, opts) {
    const only = (opts && opts.path) || '', lines = [];
    const facetLine = (t, name, pad) => {
      const f = t.facets[name];
      if (name === 'connect') return;
      if (canonical(f) === canonical(defaultFacets()[name])) return;
      lines.push(pad + name + ' ' + f.type + (f.data && Object.keys(f.data).length ? ' ' + jsonish(f.data) : '') + (f.source ? ' from ' + JSON.stringify(f.source) : ''));
    };
    const tile = (c, id, depth) => {
      const t = c.tiles[id], pad = IND.repeat(depth), place = t.facets.connect.place, rotation = t.facets.connect.rotation;
      lines.push(pad + 'tile ' + id + ' ' + JSON.stringify(t.name) + (t.form_hints.length ? ' as ' + t.form_hints.join(' ') : ''));
      if (place && canonical(place) !== canonical([0, 0, 0])) lines.push(pad + IND + 'at ' + place.join(' '));
      if (rotation && canonical(rotation) !== canonical([0, 0, 0])) lines.push(pad + IND + 'rotate ' + rotation.join(' '));
      for (const f of FACETS) facetLine(t, f, pad + IND);
      for (const s of t.facets.connect.sockets || []) if (!s.port) lines.push(pad + IND + 'socket ' + s.id + ' ' + s.kind + (s.kind === 'signal' ? ' ' + s.dir + (s.signal && s.signal !== s.id ? ' ' + s.signal : '') : ' at ' + (s.pos || [0, 0, 0]).join(' ')) + (s.label ? ' ' + JSON.stringify(s.label) : ''));
      for (const p of t.params || []) lines.push(pad + IND + 'control ' + p.id + ' ' + jsonish(p));
      for (const cp of t.capabilities || []) lines.push(pad + IND + 'capability ' + cp.id + ' ' + jsonish(cp));
      if (t.view) lines.push(pad + IND + 'view ' + jsonish(t.view));
      if (t.presentation) lines.push(pad + IND + 'presentation ' + jsonish(t.presentation));
      for (const b of t.provenance.bridges || []) lines.push(pad + IND + 'bridge ' + jsonish(b));
      if (t.interior) {
        lines.push(pad + IND + 'inside');
        for (const k of Object.keys(t.interior.tiles).sort()) tile(t.interior, k, depth + 2);
        for (const k of Object.keys(t.interior.edges).sort()) { const e = t.interior.edges[k]; lines.push(pad + IND + IND + 'wire ' + k + ' ' + e.kind + ' ' + e.from.tile + '.' + e.from.socket + ' -> ' + e.to.tile + '.' + e.to.socket); }
        for (const p of t.interior.ports) lines.push(pad + IND + IND + 'port ' + p.id + ' = ' + p.tile + '.' + p.socket);
        lines.push(pad + IND + 'end');
      }
    };
    const c = only ? (resolveTile(world, only) || {}).interior || { tiles: {}, edges: {} } : world;
    if (!only) { lines.push('world ' + JSON.stringify(world.name)); for (const k of Object.keys(world.words || {}).sort()) lines.push('word ' + k + ' ' + jsonish(world.words[k])); }
    for (const id of Object.keys(c.tiles).sort()) tile(c, id, 0);
    for (const id of Object.keys(c.edges).sort()) { const e = c.edges[id]; lines.push('wire ' + id + ' ' + e.kind + ' ' + e.from.tile + '.' + e.from.socket + ' -> ' + e.to.tile + '.' + e.to.socket); }
    return lines.join('\n') + '\n';
  }
  function parseText(text) { // -> {tiles, edges, world} in the same shape the world uses, or throws with the line number
    const out = { tiles: {}, edges: {}, name: null }, stack = [{ c: out, indent: -1 }];
    const lines = String(text).split('\n');
    let cur = null, curIndent = 0;
    const fail = (i, msg) => { throw new Error('line ' + (i + 1) + ': ' + msg); };
    const readJSON = (rest, i) => { try { return JSON.parse(rest); } catch (e) { fail(i, 'expected JSON here — ' + e.message); } };
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (!raw.trim() || /^\s*#/.test(raw)) continue;
      const indent = raw.match(/^\s*/)[0].length, line = raw.trim(), sp = line.indexOf(' '), word = sp < 0 ? line : line.slice(0, sp), rest = sp < 0 ? '' : line.slice(sp + 1).trim();
      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
      const c = stack[stack.length - 1].c;
      if (word === 'world') { out.name = readJSON(rest, i); continue; }
      if (word === 'word') { const m = /^([A-Za-z][A-Za-z0-9_]*)\s+(\{.*\})$/.exec(rest) || fail(i, 'expected: word <name> {json}'); const wd = readJSON(m[2], i); wd.name = m[1]; (out.words = out.words || {})[m[1]] = wd; continue; }
      if (word === 'end') { if (stack.length > 1) stack.pop(); cur = null; continue; }
      if (word === 'tile') {
        const m = /^([A-Za-z0-9_\-]+)\s+("(?:[^"\\]|\\.)*")(?:\s+as\s+(.*))?$/.exec(rest) || fail(i, 'expected: tile <id> "<name>" [as <forms>]');
        const t = createTile({ id: m[1], name: JSON.parse(m[2]), form_hints: m[3] ? m[3].trim().split(/\s+/) : [] });
        if (c.tiles[m[1]]) fail(i, 'a tile with id ' + m[1] + ' is already here');
        c.tiles[m[1]] = t; cur = t; curIndent = indent; continue;
      }
      if (word === 'wire') {
        const m = /^([A-Za-z0-9_\-]+)\s+(attach|signal)\s+([A-Za-z0-9_\-]+)\.([A-Za-z0-9_.\-]+)\s*->\s*([A-Za-z0-9_\-]+)\.([A-Za-z0-9_.\-]+)$/.exec(rest) || fail(i, 'expected: wire <id> attach|signal <tile>.<socket> -> <tile>.<socket>');
        c.edges[m[1]] = { id: m[1], kind: m[2], from: { tile: m[3], socket: m[4] }, to: { tile: m[5], socket: m[6] } }; continue;
      }
      if (word === 'port') {
        const m = /^([A-Za-z0-9_.\-]+)\s*=\s*([A-Za-z0-9_\-]+)\.([A-Za-z0-9_.\-]+)$/.exec(rest) || fail(i, 'expected: port <id> = <tile>.<socket>');
        const shell = stack[stack.length - 1].shell || fail(i, 'a port only makes sense inside an "inside" block');
        const inner = c.tiles[m[2]] || fail(i, 'no tile ' + m[2] + ' inside this one');
        try { addPort(shell, inner, m[3]); } catch (e) { fail(i, e.message); }
        continue;
      }
      if (!cur) fail(i, '"' + word + '" has to belong to a tile');
      if (indent <= curIndent) fail(i, 'indent this under its tile');
      if (word === 'inside') { cur.interior = cur.interior || { tiles: {}, edges: {}, ports: [] }; cur.facets.mesh = { type: 'interior', source: null, data: {} }; stack.push({ c: cur.interior, indent, shell: cur }); continue; }
      if (word === 'at') { cur.facets.connect.place = rest.split(/\s+/).map(Number); continue; }
      if (word === 'rotate') { cur.facets.connect.rotation = rest.split(/\s+/).map(Number); continue; }
      if (FACETS.includes(word)) {
        const m = /^(\S+)(?:\s+(\{.*?\}))?(?:\s+from\s+("(?:[^"\\]|\\.)*"))?$/.exec(rest) || fail(i, 'expected: ' + word + ' <type> [{json}] [from "<source>"]');
        cur.facets[word] = { type: m[1], source: m[3] ? JSON.parse(m[3]) : null, data: m[2] ? readJSON(m[2], i) : {} };
        if (word === 'connect') { cur.facets[word].sockets = cur.facets[word].sockets || []; cur.facets[word].bridges = cur.facets[word].bridges || []; }
        continue;
      }
      if (word === 'socket') {
        const m = /^([A-Za-z0-9_.\-]+)\s+(attach|signal)\s+(.*)$/.exec(rest) || fail(i, 'expected: socket <id> attach at x y z | socket <id> signal in|out [name]');
        const s = { id: m[1], kind: m[2] }, tail = m[3].trim();
        if (m[2] === 'attach') { const a = /^at\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+(".*"))?$/.exec(tail) || fail(i, 'expected: socket <id> attach at x y z'); s.pos = [+a[1], +a[2], +a[3]]; if (a[4]) s.label = JSON.parse(a[4]); }
        else { const a = /^(in|out)(?:\s+([A-Za-z0-9_\-]+))?(?:\s+(".*"))?$/.exec(tail) || fail(i, 'expected: socket <id> signal in|out [name] ["label"]'); s.dir = a[1]; s.signal = a[2] || m[1]; if (a[3]) s.label = JSON.parse(a[3]); }
        cur.facets.connect.sockets.push(s); continue;
      }
      if (word === 'view') { cur.view = readJSON(rest, i); continue; }
      if (word === 'presentation') { cur.presentation = readJSON(rest, i); continue; }
      if (word === 'capability') { const m = /^([A-Za-z0-9_\-]+)\s+(\{.*\})$/.exec(rest) || fail(i, 'expected: capability <id> {json}'); const cp = readJSON(m[2], i); cp.id = m[1]; (cur.capabilities = cur.capabilities || []).push(cp); continue; }
      if (word === 'control') { const m = /^([A-Za-z0-9_\-]+)\s+(\{.*\})$/.exec(rest) || fail(i, 'expected: control <id> {json}'); const p = readJSON(m[2], i); p.id = m[1]; (cur.params = cur.params || []).push(p); continue; }
      if (word === 'bridge') { (cur.provenance.bridges = cur.provenance.bridges || []).push(readJSON(rest, i)); continue; }
      fail(i, 'I do not know the word "' + word + '"');
    }
    for (const id in out.tiles) { const t = out.tiles[id]; t.provenance.sha256 = contentHash(t); }
    return out;
  }
  // Text in -> the ops that would make the live world match it. Nothing is applied here; the caller still
  // goes through clone -> plan -> commit, so the text surface has no privileges the others do not have.
  function fromText(world, text, opts) {
    opts = opts || {};
    const into = opts.path || '', target = containerAt(world, into);
    if (!target) return { ok: false, error: 'no container ' + into };
    let parsed;
    try { parsed = parseText(text); } catch (e) { return { ok: false, error: e.message }; }
    const ops = [], same = (a, b) => canonical(a) === canonical(b);
    // Compare in a normal form, at every depth, so notation shorthands (an omitted zero place, an implied null source)
    // never read as a change — and so text is never able to quietly rewrite what it cannot express.
    const norm = (t) => { const x = clone(t); delete x.state; delete x.provenance; for (const f of FACETS) if (f !== 'connect' && x.facets[f].source === undefined) x.facets[f].source = null;
      const c = x.facets.connect; c.place = c.place || [0, 0, 0]; c.rotation = c.rotation || [0, 0, 0]; c.sockets = (c.sockets || []).slice().sort((a, b) => (a.id < b.id ? -1 : 1)); c.bridges = c.bridges || [];
      if (x.interior) { x.interior.ports = (x.interior.ports || []).slice().sort((a, b) => (a.id < b.id ? -1 : 1)); for (const k in x.interior.tiles) x.interior.tiles[k] = norm(x.interior.tiles[k]); }
      return x; };
    // Text cannot say what a tile's history is, so it never overwrites one. A replacement starts from the tile that is
    // already there and takes only the parts the text actually changed — at every depth. State, provenance and anything
    // the notation does not express stay exactly as they were.
    const normFacet = (f, name) => { const x = clone(f); if (name !== 'connect') { if (x.source === undefined) x.source = null; return x; } x.place = x.place || [0, 0, 0]; x.rotation = x.rotation || [0, 0, 0]; x.sockets = (x.sockets || []).slice().sort((a, b) => (a.id < b.id ? -1 : 1)); x.bridges = x.bridges || []; return x; };
    const reconcile = (want, have) => {
      if (!have) return want;
      const out = clone(have);
      for (const f of FACETS) if (!same(normFacet(want.facets[f], f), normFacet(have.facets[f], f))) out.facets[f] = clone(want.facets[f]);
      if (want.capabilities) out.capabilities = clone(want.capabilities); else delete out.capabilities;
      if (want.view) out.view = clone(want.view); else delete out.view;
      if (want.presentation) out.presentation = clone(want.presentation); else delete out.presentation;
      out.name = want.name; out.form_hints = clone(want.form_hints); out.provenance.bridges = clone(want.provenance.bridges);
      if (want.params) out.params = clone(want.params); else delete out.params;
      if (!want.interior) delete out.interior;
      else {
        out.interior = out.interior || { tiles: {}, edges: {}, ports: [] };
        const tiles = {};
        for (const k in want.interior.tiles) tiles[k] = reconcile(want.interior.tiles[k], out.interior.tiles[k]);
        out.interior = { tiles, edges: clone(want.interior.edges), ports: clone(want.interior.ports || []) };
        for (const k in tiles) tiles[k].provenance.sha256 = contentHash(tiles[k]);
      }
      out.provenance.sha256 = contentHash(out); return out;
    };
    if (!into) { const pw = parsed.words || {}, hw = world.words || {};
      for (const k of Object.keys(pw).sort()) if (!same(pw[k], hw[k])) ops.push({ op: 'word.define', name: k, args: pw[k].args, body: pw[k].body, note: pw[k].note });
      for (const k of Object.keys(hw).sort()) if (!pw[k] && !opts.additive) ops.push({ op: 'word.remove', name: k });
    }
    for (const id of Object.keys(parsed.tiles).sort()) {
      const want = parsed.tiles[id], have = target.tiles[id];
      if (!have) ops.push({ op: 'tile.add', in: into, tile: want });
      else if (!same(norm(want), norm(have))) ops.push({ op: 'tile.replace', id: join(into, id), tile: reconcile(want, have) });
    }
    for (const id of Object.keys(target.tiles).sort()) if (!parsed.tiles[id] && !opts.additive) ops.push({ op: 'tile.remove', id: join(into, id) });
    for (const id of Object.keys(parsed.edges).sort()) { const want = parsed.edges[id], have = target.edges[id];
      if (!have) ops.push({ op: 'edge.add', in: into, edge: want });
      else if (!same(want, have)) { ops.push({ op: 'edge.remove', in: into, id }); ops.push({ op: 'edge.add', in: into, edge: want }); } }
    for (const id of Object.keys(target.edges).sort()) if (!parsed.edges[id] && !opts.additive) ops.push({ op: 'edge.remove', in: into, id });
    const trial = clone(world);
    for (const op of ops) { try { applyStructOp(trial, op); } catch (e) { return { ok: false, error: e.message, ops }; } }
    const v = validateWorld(trial);
    if (!v.ok) return { ok: false, error: 'that text would leave the world invalid', errors: v.errors, ops };
    return { ok: true, ops, name: parsed.name, changed: ops.length };
  }

  function compileWebsite(world, opts) {
    const t = (opts && opts.t) == null ? world.time : opts.t;
    const sect = (c, cpath, id, depth) => {
      const path = join(cpath, id), tile = activeTile(world, path, c.tiles[id]), md = tile.facets.material.data || {}, vars = readVars(world, path, t);
      const kids = childrenOf(c, id).map((k) => sect(c, cpath, k, depth + 1)).join('') + (tile.interior ? rootsOf(tile.interior).map((k) => sect(tile.interior, path, k, depth + 1)).join('') : '');
      if (!declares(tile, ['website', 'ui_panel'])) return kids;
      const tag = depth === 0 ? 'section' : 'article', hd = depth === 0 ? 'h2' : 'h3';
      return '<' + tag + ' style="--tile:' + css(md.color || [0.5, 0.55, 0.8]) + '"><' + hd + '>' + esc(tile.name) + '</' + hd + '><p class="k">' + esc(meshSummary(tile)) + ' · ' + esc(tile.form_hints.join(', ')) + '</p>' +
        (Object.keys(vars).length ? '<ul>' + Object.keys(vars).map((n) => '<li><b>' + esc(fmt(vars[n])) + '</b> ' + esc(n) + '</li>').join('') + '</ul>' : '') +
        (kids ? '<div class="kids">' + kids + '</div>' : '') + '</' + tag + '>';
    };
    const body = rootsOf(world).map((id) => sect(world, '', id, 0)).join('\n');
    const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(world.name) + '</title><style>' +
      'body{margin:0;font:16px/1.55 system-ui,sans-serif;background:#070b1a;color:#e6efff}main{max-width:60rem;margin:auto;padding:2rem 1.2rem}h1{font-size:2.2rem;letter-spacing:.04em}' +
      'section,article{border-left:3px solid var(--tile);padding:.2rem 0 .2rem 1rem;margin:1.6rem 0}article{margin:1rem 0}.k{opacity:.65;margin:.1rem 0}ul{list-style:none;padding:0;display:flex;gap:1.4rem;flex-wrap:wrap}li b{font-size:1.4rem;color:var(--tile)}.kids{margin-left:.4rem}' +
      '</style></head><body><main><h1>' + esc(world.name) + '</h1>\n' + body + '\n<footer><p class="k">Compiled from MorphTile matter at logical time ' + esc(fmt(t)) + '. Structure hash ' + structHash(world).slice(0, 12) + '.</p></footer></main></body></html>';
    return { form: 'website', html, sha256: sha256(html) };
  }

  // ───────────────────────────── 10 seed + presets
  const PRESETS = {
    mesh: {
      box: { type: 'primitive', source: null, data: { shape: 'box', size: [1.2, 1.2, 1.2] } },
      sphere: { type: 'primitive', source: null, data: { shape: 'sphere', size: [1.5, 1.5, 1.5] } },
      cylinder: { type: 'primitive', source: null, data: { shape: 'cylinder', size: [1.2, 1.6, 1.2] } },
      cone: { type: 'primitive', source: null, data: { shape: 'cone', size: [1.4, 1.8, 1.4] } },
      wedge: { type: 'primitive', source: null, data: { shape: 'wedge', size: [1.4, 1, 2] } },
      tower: { type: 'generated', source: null, data: { generator: 'tower', levels: 3, radius: 0.6, seed: 4 } },
      'tall tower': { type: 'generated', source: null, data: { generator: 'tower', levels: 5, radius: 0.5, seed: 9 } },
      island: { type: 'generated', source: null, data: { generator: 'terrain', radius: 5.5, height: 1.6, plateau: 1, depth: 4, seed: 3 } },
      spiral: { type: 'generated', source: null, data: { generator: 'recipe', vars: { rungs: 14, turn: 0.55, lift: 0.26, reach: 1.1 }, parts: [
        { repeat: ['var', 'rungs'], as: 'i', body: [
          { shape: 'box', size: [0.55, 0.12, 0.22], pos: [['*', ['var', 'reach'], ['+', 1, ['*', 0.02, ['var', 'i']]]], ['*', ['var', 'lift'], ['var', 'i']], 0], rot: [0, ['*', ['var', 'turn'], ['var', 'i']], 0] },
          { shape: 'cylinder', size: [0.16, ['var', 'lift'], 0.16], pos: [0, ['*', ['var', 'lift'], ['var', 'i']], 0], color: [0.55, 0.6, 0.85] }] }] } },
      lattice: { type: 'generated', source: null, data: { generator: 'recipe', vars: { n: 4, gap: 0.55 }, parts: [
        { repeat: ['var', 'n'], as: 'x', body: [{ repeat: ['var', 'n'], as: 'y', body: [{ repeat: ['var', 'n'], as: 'z', body: [
          { when: ['or', ['or', ['==', ['var', 'x'], 0], ['==', ['var', 'y'], 0]], ['==', ['var', 'z'], 0]],
            shape: 'box', size: [0.2, 0.2, 0.2], pos: [['*', ['var', 'gap'], ['var', 'x']], ['*', ['var', 'gap'], ['var', 'y']], ['*', ['var', 'gap'], ['var', 'z']]] }] }] }] }] } },
      'unresolved reference': { type: 'reference', source: 'uc://asset-packages/axm.example.modular-tank@1.0.0', data: {} },
    },
    material: {
      moss: { type: 'primitive', source: null, data: { color: [0.25, 0.58, 0.36] } },
      stone: { type: 'primitive', source: null, data: { color: [0.62, 0.66, 0.78] } },
      'violet glass': { type: 'primitive', source: null, data: { color: [0.55, 0.4, 1], emissive: 0.3 } },
      'ion blue': { type: 'primitive', source: null, data: { color: [0.3, 0.6, 1], emissive: 0.15 } },
      ember: { type: 'primitive', source: null, data: { color: [0.95, 0.45, 0.25], emissive: 0.2 } },
      'checker hull': { type: 'primitive', source: null, data: { color: [0.78, 0.82, 0.92], pattern: 'checker', scale: 0.4 } },
      'painted: height gradient': { type: 'generated', source: null, data: { color: [0.6, 0.6, 0.7], paint: { vars: { low: 0.15, span: 4 }, color: [['+', 0.2, ['/', ['var', 'y'], ['var', 'span']]], ['+', ['var', 'low'], ['/', ['var', 'y'], ['*', 2, ['var', 'span']]]], ['-', 0.95, ['/', ['var', 'y'], ['var', 'span']]]] } } },
      'painted: ground': { type: 'generated', source: null, data: { color: [0.5, 0.5, 0.55], paint: { vars: { grass: 0.62 }, color: [
        ['if', ['>', ['var', 'up'], ['var', 'grass']], 0.24, 0.42], ['if', ['>', ['var', 'up'], ['var', 'grass']], 0.6, 0.38], ['if', ['>', ['var', 'up'], ['var', 'grass']], 0.3, 0.46]] } } },
      'painted: rings': { type: 'generated', source: null, data: { color: [0.7, 0.7, 0.8], paint: { vars: { ring: 0.45 }, color: [['if', ['<', ['%', ['+', ['*', ['var', 'y'], 1], 100], ['var', 'ring']], ['*', 0.5, ['var', 'ring']]], 0.95, 0.35], 0.55, ['if', ['<', ['%', ['+', ['*', ['var', 'y'], 1], 100], ['var', 'ring']], ['*', 0.5, ['var', 'ring']]], 0.4, 0.9]] } } },
    },
    behavior: {
      still: { type: 'none', data: {} },
      spin: { type: 'scripted', data: { ops: [{ op: 'spin', axis: 'y', rate: 0.6 }] } },
      hover: { type: 'scripted', data: { ops: [{ op: 'bob', amp: 0.18, rate: 1.4 }, { op: 'spin', axis: 'y', rate: 0.5 }, { op: 'pulse', amp: 0.35, rate: 2 }] } },
      'written: figure eight': { type: 'scripted', data: { motion: { vars: { reach: 2.2, rise: 0.5, rate: 0.7 },
        pos: [['*', ['var', 'reach'], ['sin', ['*', ['var', 'rate'], ['t']]]], ['*', ['var', 'rise'], ['sin', ['*', ['*', 2, ['var', 'rate']], ['t']]]], ['*', ['var', 'reach'], ['sin', ['*', ['*', 2, ['var', 'rate']], ['t']]]]],
        rot: [0, ['*', ['var', 'rate'], ['t']], 0] } } },
      'written: breathe': { type: 'scripted', data: { motion: { vars: { depth: 0.35, rate: 1.1 },
        pos: [0, ['*', ['var', 'depth'], ['sin', ['*', ['var', 'rate'], ['t']]]], 0], glow: ['*', 0.5, ['+', 0.5, ['*', 0.5, ['sin', ['*', ['var', 'rate'], ['t']]]]]] } } },
      pulse: { type: 'scripted', data: { ops: [{ op: 'pulse', amp: 0.5, rate: 3 }] } },
    },
  };
  function seedWorld() {
    const w = createWorld('Skyhold'), sig = (id, dir, signal, label) => ({ id, kind: 'signal', dir, signal, label }), att = (id, pos) => ({ id, kind: 'attach', pos });
    const add = (spec) => { const t = createTile(Object.assign({ created_by: 'ai:fable' }, spec)); w.tiles[t.id] = t; };
    add({ id: 'mt_island', params: [{ id: 'seed', label: 'Terrain seed', type: 'number', min: 1, max: 60, step: 1, binds: [{ tile: '', facet: 'mesh', at: 'data.seed' }] }, { id: 'height', label: 'Hill height', type: 'number', min: 0.4, max: 3, step: 0.1, binds: [{ tile: '', facet: 'mesh', at: 'data.height' }] }], name: 'Floating island', form_hints: ['world', 'game_asset', 'ui_panel', 'website'], facets: { mesh: PRESETS.mesh.island, material: PRESETS.material.moss, connect: { sockets: [att('top', [0, 1, 0]), att('dock', [1.25, 1, 0.75])], bridges: [], place: [0, 0, 0] } } });
    add({ id: 'mt_tower', params: [{ id: 'levels', label: 'Levels', type: 'number', min: 1, max: 7, step: 1, binds: [{ tile: '', facet: 'mesh', at: 'data.levels' }, { tile: '', facet: 'connect', at: 'sockets.1.pos.1', expr: ['+', ['*', ['var', 'value'], 1.1], 1.6] }] }], name: 'Beacon tower', form_hints: ['game_asset', 'ui_panel', 'website'], facets: {
      mesh: PRESETS.mesh.tower, material: { type: 'primitive', source: null, data: { color: [0.62, 0.66, 0.78], glow: [0.35, 0.65, 1], emissive: ['*', ['var', 'beacon'], 0.45] } },
      logic: { type: 'rule', data: { vars: { beacon: 0 }, rules: [{ on: 'toggle', do: [{ set: ['beacon', ['-', 1, ['var', 'beacon']]] }, { emit: 'lit' }] }] } },
      connect: { sockets: [att('base', [0, 0, 0]), att('roof', [0, 4.9, 0]), sig('toggle', 'in', 'toggle', 'Toggle beacon'), sig('lit', 'out', 'lit')], bridges: [] } } });
    add({ id: 'mt_core', name: 'Matter core', form_hints: ['game_asset', 'ui_panel', 'website'], facets: {
      mesh: { type: 'primitive', source: null, data: { shape: 'box', size: [0.9, 0.9, 0.9], rot: [0.6, 0, 0.6] } }, material: { type: 'primitive', source: null, data: { color: [0.5, 0.36, 1], emissive: 0.25, pattern: 'checker', scale: 0.3 } }, behavior: PRESETS.behavior.hover,
      logic: { type: 'rule', data: { vars: { energy: { accrue: { rate: 1, cap: 21600 }, base: 0 }, stored: 0 }, rules: [{ on: 'surge', do: [{ set: ['stored', ['+', ['var', 'stored'], ['floor', ['var', 'energy']]]] }, { set: ['energy', 0] }] }] } },
      connect: { sockets: [att('mount', [0, 0, 0]), sig('surge', 'in', 'surge', 'Harvest energy')], bridges: [] } } });
    add({ id: 'mt_switch', name: 'Dock switch', form_hints: ['game_asset', 'ui_panel'], facets: {
      mesh: { type: 'primitive', source: null, data: { parts: [{ shape: 'cylinder', size: [0.5, 0.5, 0.5], pos: [0, 0.25, 0] }, { shape: 'sphere', size: [0.34, 0.34, 0.34], pos: [0, 0.6, 0], color: [1, 0.55, 0.3] }] } }, material: PRESETS.material['ion blue'],
      logic: { type: 'rule', data: { vars: { presses: 0 }, rules: [{ on: 'press', do: [{ set: ['presses', ['+', ['var', 'presses'], 1]] }, { emit: 'pressed' }] }] } },
      connect: { sockets: [att('foot', [0, 0, 0]), sig('press', 'in', 'press', 'Press'), sig('pressed', 'out', 'pressed')], bridges: [] } } });
    const wheelAt = { fl: [-0.95, 0.05, 0.85], fr: [0.95, 0.05, 0.85], rl: [-0.95, 0.05, -0.85], rr: [0.95, 0.05, -0.85] };
    add({ id: 'mt_rover', params: [{ id: 'orbit', label: 'Orbit radius', type: 'number', min: 6, max: 14, step: 0.2, binds: [{ tile: '', facet: 'behavior', at: 'data.ops.0.radius' }] }], name: 'Sky rover', form_hints: ['vehicle', 'game_asset', 'ui_panel', 'website'], facets: {
      mesh: { type: 'primitive', source: null, data: { parts: [{ shape: 'box', size: [1.5, 0.4, 2.6], pos: [0, 0.35, 0] }, { shape: 'wedge', size: [1.5, 0.35, 0.9], pos: [0, 0.72, 0.75] }, { shape: 'box', size: [1.2, 0.4, 1.1], pos: [0, 0.75, -0.25], color: [0.2, 0.5, 1] }] } },
      material: { type: 'primitive', source: null, data: { color: [0.78, 0.82, 0.92], glow: [0.3, 0.6, 1], emissive: ['*', ['var', 'moving'], 0.25] } },
      behavior: { type: 'scripted', data: { ops: [{ op: 'orbit', radius: 7.6, rate: 0.22, by: ['var', 'odometer'] }, { op: 'bob', amp: 0.07, rate: 2 }] } },
      logic: { type: 'rule', data: { vars: { moving: 0, odometer: { accrue: { rate: ['var', 'moving'] }, base: 0 } }, rules: [{ on: 'drive', do: [{ set: ['odometer', ['var', 'odometer']] }, { set: ['moving', ['-', 1, ['var', 'moving']]] }, { emit: 'rolling' }] }] } },
      connect: { sockets: Object.keys(wheelAt).map((k) => att('w_' + k, wheelAt[k])).concat([sig('drive', 'in', 'drive', 'Drive / stop'), sig('rolling', 'out', 'rolling')]), bridges: [], place: [0, 0.4, 0] } } });
    for (const k of Object.keys(wheelAt)) add({ id: 'mt_wheel_' + k, name: 'Wheel ' + k.toUpperCase(), form_hints: ['game_asset'], facets: {
      mesh: { type: 'primitive', source: null, data: { shape: 'cylinder', size: [0.7, 0.3, 0.7], rot: [0, 0, Math.PI / 2], segments: 12 } }, material: { type: 'primitive', source: null, data: { color: [0.16, 0.18, 0.3], pattern: 'stripes', scale: 0.17 } },
      behavior: { type: 'scripted', data: { ops: [{ op: 'spin', axis: 'x', rate: 3, by: ['var', 'turns'] }] } },
      logic: { type: 'rule', data: { vars: { rolling: 0, turns: { accrue: { rate: ['var', 'rolling'] }, base: 0 } }, rules: [{ on: 'roll', do: [{ set: ['turns', ['var', 'turns']] }, { set: ['rolling', ['-', 1, ['var', 'rolling']]] }] }] } },
      connect: { sockets: [att('hub', [0, 0, 0]), sig('roll', 'in', 'roll')], bridges: [] } } });
    const edge = (id, kind, a, as, b, bs) => { w.edges[id] = { id, kind, from: { tile: a, socket: as }, to: { tile: b, socket: bs } }; };
    edge('a_tower', 'attach', 'mt_island', 'top', 'mt_tower', 'base'); edge('a_core', 'attach', 'mt_tower', 'roof', 'mt_core', 'mount'); edge('a_switch', 'attach', 'mt_island', 'dock', 'mt_switch', 'foot');
    edge('s_switch', 'signal', 'mt_switch', 'pressed', 'mt_tower', 'toggle'); edge('s_lit', 'signal', 'mt_tower', 'lit', 'mt_core', 'surge');
    for (const k of Object.keys(wheelAt)) { edge('a_wheel_' + k, 'attach', 'mt_rover', 'w_' + k, 'mt_wheel_' + k, 'hub'); edge('s_wheel_' + k, 'signal', 'mt_rover', 'rolling', 'mt_wheel_' + k, 'roll'); }
    return w;
  }

  // ───────────────────────────── 11 door
  // One JSON contract for every caller. A human tapping the workshop and an AI sending ops go through this same function.
  function act(ws, op, by) {
    try {
      switch (op.do) {
        case 'signal': if (!resolveTile(ws.live, op.tile)) return { ok: false, error: 'no tile ' + op.tile }; return { ok: true, trace: record(ws, { type: 'signal', tile: op.tile, name: op.name, by: by || 'human' }) };
        case 'wake': case 'sleep': { const t = resolveTile(ws.live, op.tile); if (!t || !capOf(t, op.capability)) return { ok: false, error: 'no capability ' + op.capability + ' on ' + op.tile }; record(ws, { type: op.do, tile: op.tile, capability: op.capability, forget: op.forget, by: by || 'human' }); return { ok: true, awake: isAwake(ws.live, op.tile, op.capability) }; }
        case 'tick': { const to = op.to != null ? op.to : ws.live.time + (op.dt || 0); record(ws, { type: 'tick', t: to, by: by || 'human' }); return { ok: true, time: ws.live.time }; }
        case 'clone': return { ok: true, candidate: cloneBody(ws, op.label, by) };
        case 'edit': return editCandidate(ws, op.candidate, op.op);
        case 'discard': delete ws.candidates[op.candidate]; return { ok: true };
        case 'plan': return { ok: true, plan: planMerge(ws, op.candidates || Object.keys(ws.candidates)) };
        case 'commit': return commitPlan(ws, op.plan, by);
        case 'rollback': return rollback(ws, op.token);
        case 'settle': { const evs = pendingWakes(ws.live, op); for (const ev of evs) record(ws, Object.assign({ by: by || 'human' }, ev)); return { ok: true, changes: evs }; }
        case 'reconstruct': { const r = reconstruct(ws.ledger, op); return { ok: true, replayed: r.replayed, from_seq: r.from_seq, hash: r.hash, matches_live: r.hash === hashOf(ws.live), simulation_steps: 0 }; }
        default: return { ok: false, error: 'unknown action: ' + op.do };
      }
    } catch (err) { return { ok: false, error: err.message }; }
  }

  return {
    VERSION: '0.4', FACETS, KNOWN_FORMS, SPATIAL_FORMS, PRESENTATION_MODES, SAVE_POLICY_MODES, IDENTITY_SPATIAL_ROOT, EVIDENCE, PRESETS,
    clone, canonical, sha256, hashOf, ihash,
    createTile, validateTile, contentHash, findSocket,
    evalExpr, getVar, readVars, rekeyVars, paramValue, relTile, getAt, activeTile, isAwake, capOf, capStatus, grantsOf, sleepingReport, pendingWakes, splitPath, resolveTile, containerAt, countTiles, depthOf, leaves,
    createWorld, validateWorld, structHash, spatialRootOf, placementOf, composePlacement, tileMatrix, savePolicyOf, savePolicyError, childWorldOf, childWorldError, BUILTIN_WORDS, bodyOf, bodyHash, instancesOf, defDrift, applyStructOp, applyEvent, diffUnits, unitValue, rootsOf, childrenOf, parentEdgeOf,
    reconstruct, exportWorld, importWorld, exportWords, importWords, exportKit, importKit, needsOf, createWorkspace, record, cloneBody, editCandidate, planMerge, commitPlan, rollback, exportWorkspace, importWorkspace,
    weakestEvidence, ingestMaterialOffer, materialFromOffer, createRegistry, dataUrlBytes,
    compileMesh, compileMeshData, clearRuntimeCaches, renderAsset, renderReceipt, compilePanel, compileView, resolvePresentation, presentationError, vnodeToHTML, compileWebsite, toText, parseText, fromText,
    seedWorld, act,
  };
});
