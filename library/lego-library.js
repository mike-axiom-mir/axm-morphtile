(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../core/morphtile.js"));
  else root.MorphTileLegoLibrary = factory(root.MorphTile);
})(typeof self !== "undefined" ? self : this, function (MT) {
"use strict";
const ID = /^[A-Za-z0-9_.-]+$/;
const clone = MT.clone;

function createLegoLibrary() {
  return { kind: "morphtile-lego-library", version: "0.1", objects: {}, items: {} };
}

function objectRef(kind, data) {
  return "sha256:" + MT.hashOf({ kind, data });
}

function needTile(world, path) {
  const tile = MT.resolveTile(world, path);
  if (!tile) throw new Error("no tile " + path);
  return tile;
}

function capture(world, spec) {
  spec = spec || {};
  let kind = spec.kind, data, name = spec.name || null;
  if (kind === "world") {
    data = MT.exportWorld(world, spec.name);
    name = name || world.name;
  } else if (kind === "kit") {
    data = MT.exportKit(world, spec.path, { name: spec.name });
    if (!data) throw new Error("no tile " + spec.path);
    name = name || data.name;
  } else if (kind === "tile") {
    const tile = needTile(world, spec.path); data = clone(tile); name = name || tile.name;
  } else if (kind === "body") {
    const tile = needTile(world, spec.path); data = MT.bodyOf(tile); name = name || tile.name + " body";
  } else if (kind === "facet") {
    if (!MT.FACETS.includes(spec.facet)) throw new Error("unknown facet " + spec.facet);
    const tile = needTile(world, spec.path); data = clone(tile.facets[spec.facet]); kind = "facet." + spec.facet; name = name || tile.name + " " + spec.facet;
  } else if (kind === "capability") {
    const tile = needTile(world, spec.path), cap = (tile.capabilities || []).find((x) => x.id === spec.capability);
    if (!cap) throw new Error("no capability " + spec.capability + " on " + spec.path);
    data = clone(cap); name = name || cap.id;
  } else if (kind === "view") {
    const tile = needTile(world, spec.path); if (tile.view === undefined) throw new Error("tile has no view: " + spec.path); data = clone(tile.view); name = name || tile.name + " view";
  } else if (kind === "presentation") {
    const tile = needTile(world, spec.path); if (tile.presentation === undefined) throw new Error("tile has no presentation: " + spec.path); data = clone(tile.presentation); name = name || tile.name + " presentation";
  } else if (kind === "parameter") {
    const tile = needTile(world, spec.path), p = (tile.params || []).find((x) => x.id === spec.parameter);
    if (!p) throw new Error("no parameter " + spec.parameter + " on " + spec.path);
    data = clone(p); name = name || p.label || p.id;
  } else if (kind === "form_hints") {
    const tile = needTile(world, spec.path); data = clone(tile.form_hints); name = name || tile.name + " forms";
  } else if (kind === "definition") {
    const d = (world.defs || {})[spec.id]; if (!d) throw new Error("no definition " + spec.id); data = clone(d); name = name || d.name || d.id;
  } else if (kind === "word") {
    const w = (world.words || {})[spec.name || spec.id]; if (!w) throw new Error("no word " + (spec.name || spec.id)); data = clone(w); name = name || w.name;
  } else {
    throw new Error("unsupported Lego kind: " + kind);
  }
  return { kind, data, name: name || kind };
}

function entryId(spec, index) {
  const id = spec.entry_id || spec.id || "item_" + (index + 1);
  if (!ID.test(id)) throw new Error("item id must be [A-Za-z0-9_.-]+");
  return id;
}

function exportLegoPack(world, selections, opts) {
  opts = opts || {};
  const objects = {}, entries = [], seenIds = {};
  for (let i = 0; i < (selections || []).length; i++) {
    const spec = selections[i], id = entryId(spec, i);
    if (seenIds[id]) throw new Error("duplicate item id " + id); seenIds[id] = true;
    const captured = capture(world, spec), ref = objectRef(captured.kind, captured.data);
    objects[ref] = { kind: captured.kind, data: clone(captured.data) };
    entries.push({
      id, kind: captured.kind, name: captured.name, object_ref: ref,
      provenance: clone(spec.provenance || opts.provenance || {})
    });
  }
  const pack = { format: "morphtile-lego-pack", version: "0.1", name: opts.name || "MorphTile Lego Pack", entries, objects };
  pack.expect = { sha256: MT.hashOf({ entries, objects }), entries: entries.length, unique_objects: Object.keys(objects).length };
  return pack;
}

function verifyLegoPack(pack) {
  if (!pack || pack.format !== "morphtile-lego-pack" || pack.version !== "0.1" || !Array.isArray(pack.entries) || !pack.objects)
    return { ok: false, status: "HOLD_NOT_A_LEGO_PACK" };
  const observed = MT.hashOf({ entries: pack.entries, objects: pack.objects });
  if (pack.expect && pack.expect.sha256 && pack.expect.sha256 !== observed)
    return { ok: false, status: "HOLD_HASH_MISMATCH", claimed: pack.expect.sha256, observed };
  for (const ref of Object.keys(pack.objects)) {
    const object = pack.objects[ref], expected = objectRef(object.kind, object.data);
    if (ref !== expected) return { ok: false, status: "HOLD_OBJECT_HASH_MISMATCH", object_ref: ref, observed: expected };
  }
  for (const entry of pack.entries) {
    if (!entry || !ID.test(entry.id || "")) return { ok: false, status: "HOLD_INVALID_ITEM_ID" };
    const object = pack.objects[entry.object_ref];
    if (!object) return { ok: false, status: "HOLD_MISSING_OBJECT", item: entry.id };
    if (object.kind !== entry.kind) return { ok: false, status: "HOLD_KIND_MISMATCH", item: entry.id };
  }
  return { ok: true, status: pack.expect && pack.expect.sha256 ? "VERIFIED" : "READ_UNVERIFIED", observed };
}

function importLegoPack(library, pack, opts) {
  opts = opts || {};
  const verified = verifyLegoPack(pack); if (!verified.ok) return verified;
  const next = clone(library), conflicts = [], already = [], added = [], objectAdded = new Set(), objectReused = new Set();
  for (const entry of pack.entries) {
    let id = entry.id;
    if (next.items[id]) {
      if (next.items[id].object_ref === entry.object_ref) { already.push(id); objectReused.add(entry.object_ref); continue; }
      if (!opts.rename) { conflicts.push({ id, why: "item id already points at different Lego" }); continue; }
      let n = 2; while (next.items[id + "_" + n]) n++; id = id + "_" + n;
    }
    if (next.objects[entry.object_ref]) objectReused.add(entry.object_ref);
    else { next.objects[entry.object_ref] = clone(pack.objects[entry.object_ref]); objectAdded.add(entry.object_ref); }
    next.items[id] = Object.assign({}, clone(entry), { id, imported_from: verified.observed });
    added.push(id);
  }
  if (conflicts.length && !opts.partial) return { ok: true, status: "HELD_INCOMPLETE", conflicts, already, added: [], objects_added: 0, objects_reused: objectReused.size };
  library.objects = next.objects; library.items = next.items;
  return { ok: true, status: conflicts.length ? "PARTIAL_HELD" : "IMPORTED", conflicts, already, added, objects_added: objectAdded.size, objects_reused: objectReused.size };
}

function getItem(library, id) {
  const item = library && library.items && library.items[id]; if (!item) return null;
  const object = library.objects[item.object_ref]; if (!object) return null;
  return { item: clone(item), object: clone(object) };
}

function exportLibraryPack(library, itemIds, opts) {
  opts = opts || {};
  const entries = [], objects = {};
  for (const id of (itemIds || Object.keys(library.items)).slice().sort()) {
    const found = getItem(library, id); if (!found) throw new Error("no library item " + id);
    entries.push(found.item); objects[found.item.object_ref] = found.object;
  }
  const pack = { format: "morphtile-lego-pack", version: "0.1", name: opts.name || "MorphTile Lego Pack", entries, objects };
  pack.expect = { sha256: MT.hashOf({ entries, objects }), entries: entries.length, unique_objects: Object.keys(objects).length };
  return pack;
}

function safeItemId(value) {
  const id = String(value || "lego").replace(/[^A-Za-z0-9_.-]+/g, ".").replace(/^\.+|\.+$/g, "") || "lego";
  return id;
}

function discoverWorldLego(library, world, opts) {
  opts = opts || {};
  const provenance = clone(opts.provenance || { source: "self-created" }), candidates = [], used = {};
  const add = (baseId, spec) => {
    const captured = capture(world, spec), ref = objectRef(captured.kind, captured.data);
    let id = safeItemId(baseId), n = 2;
    while (used[id]) id = safeItemId(baseId) + "." + n++;
    used[id] = true;
    const needs = ["world", "kit", "definition", "word"].includes(captured.kind) ? { defs: {}, words: {} } : MT.needsOf(world, captured.data);
    candidates.push({
      id, kind: captured.kind, name: captured.name, object_ref: ref,
      already_vaulted: !!(library && library.objects && library.objects[ref]),
      dependencies: {
        defs: Object.keys(needs.defs || {}).filter((k) => !!needs.defs[k]).sort(),
        words: Object.keys(needs.words || {}).filter((k) => !!needs.words[k]).sort()
      },
      spec: Object.assign({}, clone(spec), { entry_id: id, provenance }),
      provenance: clone(provenance)
    });
  };

  add("world." + safeItemId(world.name), { kind: "world", name: world.name });
  for (const entry of MT.leaves(world)) {
    const p = "tile." + safeItemId(entry.path), tile = entry.tile;
    add(p + ".kit", { kind: "kit", path: entry.path });
    add(p + ".body", { kind: "body", path: entry.path });
    for (const facet of MT.FACETS) add(p + ".facet." + facet, { kind: "facet", facet, path: entry.path });
    for (const cap of tile.capabilities || []) add(p + ".capability." + safeItemId(cap.id), { kind: "capability", path: entry.path, capability: cap.id });
    for (const param of tile.params || []) add(p + ".parameter." + safeItemId(param.id), { kind: "parameter", path: entry.path, parameter: param.id });
    if (tile.view !== undefined) add(p + ".view", { kind: "view", path: entry.path });
    if (tile.presentation !== undefined) add(p + ".presentation", { kind: "presentation", path: entry.path });
    add(p + ".forms", { kind: "form_hints", path: entry.path });
  }
  for (const id of Object.keys(world.defs || {}).sort()) add("definition." + safeItemId(id), { kind: "definition", id, entry_id: "definition." + safeItemId(id) });
  for (const name of Object.keys(world.words || {}).sort()) add("word." + safeItemId(name), { kind: "word", id: name, entry_id: "word." + safeItemId(name) });
  return {
    ok: true, status: "READY", source: clone(provenance),
    candidates, new_candidates: candidates.filter((x) => !x.already_vaulted).map((x) => x.id),
    already_vaulted: candidates.filter((x) => x.already_vaulted).map((x) => x.id)
  };
}

function pullWorldLego(library, world, candidateIds, opts) {
  opts = opts || {};
  const discovery = discoverWorldLego(library, world, opts), byId = {};
  for (const row of discovery.candidates) byId[row.id] = row;
  const wanted = Array.from(new Set(candidateIds || []));
  if (!wanted.length) return { ok: false, status: "HOLD_NOTHING_SELECTED" };

  const selections = [], dependencyKeys = {}, selected = [];
  for (const id of wanted) {
    const row = byId[id];
    if (!row) return { ok: false, status: "HOLD_DISCOVERY_ITEM_MISSING", item: id };
    selections.push(clone(row.spec)); selected.push(id);
    for (const def of row.dependencies.defs) dependencyKeys["def:" + def] = def;
    for (const word of row.dependencies.words) dependencyKeys["word:" + word] = word;
  }
  for (const key of Object.keys(dependencyKeys).sort()) {
    if (key.startsWith("def:")) {
      const id = dependencyKeys[key];
      selections.push({ kind: "definition", id, entry_id: "dependency.definition." + safeItemId(id), provenance: clone(opts.provenance || { source: "self-created" }) });
    } else {
      const name = dependencyKeys[key];
      selections.push({ kind: "word", id: name, entry_id: "dependency.word." + safeItemId(name), provenance: clone(opts.provenance || { source: "self-created" }) });
    }
  }

  const pack = exportLegoPack(world, selections, { name: opts.name || "Pulled from " + world.name, provenance: opts.provenance });
  const imported = importLegoPack(library, pack, { rename: !!opts.rename, partial: !!opts.partial });
  return Object.assign({}, imported, {
    selected, dependency_items: pack.entries.filter((x) => x.id.startsWith("dependency.")).map((x) => x.id),
    auto_vaulted: false, source_world_can_be_deleted_after_pull: imported.ok && imported.status !== "HELD_INCOMPLETE"
  });
}

function proposeLibraryUse(world, library, itemId, opts) {
  opts = opts || {};
  const found = getItem(library, itemId); if (!found) return { ok: false, status: "HOLD_LIBRARY_ITEM_MISSING" };
  const kind = found.object.kind, data = found.object.data;
  if (kind === "world") {
    const read = MT.importWorld(data); return read.ok ? { ok: true, status: "READY_AS_WORLD", world: read.world, evidence: read.evidence } : read;
  }
  if (kind === "kit") return MT.importKit(world, data, opts);
  if (kind === "tile") return { ok: true, status: "READY", ops: [{ op: "tile.add", in: opts.in || "", tile: clone(data), rename: opts.rename !== false }], evidence: "verified_library_object" };
  if (kind === "definition") return { ok: true, status: "READY", ops: [{ op: "def.put", id: data.id, name: data.name, body: data.body, by: data.created_by }], evidence: "verified_library_object" };
  if (kind === "word") return { ok: true, status: "READY", ops: [{ op: "word.define", name: data.name, args: data.args, body: data.body, note: data.note }], evidence: "verified_library_object" };
  return { ok: true, status: "READY_FOR_REMIX", item: found.item, object: found.object };
}

return { createLegoLibrary, objectRef, capture, exportLegoPack, verifyLegoPack, importLegoPack, getItem, exportLibraryPack, safeItemId, discoverWorldLego, pullWorldLego, proposeLibraryUse };
});
