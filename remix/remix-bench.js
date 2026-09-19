"use strict";

const MT = require("../core/morphtile.js");
const Lib = require("../library/lego-library.js");
const clone = MT.clone;
const BODY_KEYS = ["facets", "form_hints", "params", "interior", "capabilities", "view", "presentation"];

function autoSlot(kind) {
  if (kind.startsWith("facet.")) return kind;
  if (["capability", "view", "presentation", "parameter", "form_hints", "body"].includes(kind)) return kind;
  return null;
}

function applyBody(draft, body) {
  const place = clone(draft.facets.connect.place), rotation = clone(draft.facets.connect.rotation);
  for (const key of BODY_KEYS) {
    if (body[key] === undefined) delete draft[key]; else draft[key] = clone(body[key]);
  }
  draft.facets = draft.facets || {};
  draft.facets.connect = draft.facets.connect || { sockets: [], bridges: [] };
  if (place !== undefined) draft.facets.connect.place = place;
  if (rotation !== undefined) draft.facets.connect.rotation = rotation; else delete draft.facets.connect.rotation;
}

function replaceById(list, incoming, replaceId, label) {
  list = clone(list || []);
  const oldId = replaceId || incoming.id, oldIndex = list.findIndex((x) => x.id === oldId);
  if (replaceId && oldIndex < 0) throw new Error("no " + label + " " + replaceId + " to replace");
  if (oldIndex >= 0) list.splice(oldIndex, 1);
  const conflict = list.findIndex((x) => x.id === incoming.id);
  if (conflict >= 0) list.splice(conflict, 1);
  list.push(clone(incoming));
  return list;
}

function proposeRemix(world, library, targetPath, choices, opts) {
  opts = opts || {};
  const target = MT.resolveTile(world, targetPath);
  if (!target) return { ok: false, status: "HOLD_TARGET_MISSING" };
  const draft = clone(target), sources = [], warnings = [];
  try {
    for (const raw of choices || []) {
      const choice = typeof raw === "string" ? { item_id: raw } : raw;
      const found = Lib.getItem(library, choice.item_id);
      if (!found) throw new Error("no library item " + choice.item_id);
      const kind = found.object.kind, data = found.object.data, slot = choice.slot || autoSlot(kind);
      if (!slot) throw new Error("choose a target slot for " + kind);

      if (slot.startsWith("facet.")) {
        const facet = slot.slice("facet.".length);
        if (!MT.FACETS.includes(facet)) throw new Error("unknown facet slot " + facet);
        if (kind !== slot) throw new Error(kind + " cannot fill " + slot);
        draft.facets[facet] = clone(data);
      } else if (slot === "capability") {
        if (kind !== "capability") throw new Error(kind + " cannot fill capability");
        draft.capabilities = replaceById(draft.capabilities, data, choice.replace, "capability");
      } else if (slot === "parameter") {
        if (kind !== "parameter") throw new Error(kind + " cannot fill parameter");
        draft.params = replaceById(draft.params, data, choice.replace, "parameter");
      } else if (slot === "view") {
        if (kind !== "view") throw new Error(kind + " cannot fill view"); draft.view = clone(data);
      } else if (slot === "presentation") {
        if (kind !== "presentation") throw new Error(kind + " cannot fill presentation"); draft.presentation = clone(data);
      } else if (slot === "form_hints") {
        if (kind !== "form_hints") throw new Error(kind + " cannot fill form_hints"); draft.form_hints = clone(data);
      } else if (slot === "body") {
        if (kind === "body") applyBody(draft, data);
        else if (kind === "tile") applyBody(draft, MT.bodyOf(data));
        else throw new Error(kind + " cannot fill body");
      } else {
        throw new Error("unsupported remix slot " + slot);
      }
      sources.push({ item_id: choice.item_id, object_ref: found.item.object_ref, kind, slot, replace: choice.replace || null });
    }
  } catch (err) {
    return { ok: false, status: "HOLD_INVALID_REMIX", detail: err.message, target: targetPath, sources };
  }

  const changed = MT.canonical(MT.bodyOf(target)) !== MT.canonical(MT.bodyOf(draft)) || target.name !== draft.name;
  if (!changed) return { ok: true, status: "NOTHING_TO_CHANGE", target: targetPath, sources, created_new_atoms: 0, reused_atoms: new Set(sources.map((x) => x.object_ref)).size };
  if (sources.some((x) => x.kind === "facet.connect")) warnings.push({ code: "CONNECT_REMIX_REQUIRES_GRAPH_VALIDATION" });
  return {
    ok: true, status: "CANDIDATE", mode: "remix", target: targetPath,
    ops: [{ op: "tile.replace", id: targetPath, tile: draft }],
    sources, warnings, created_new_atoms: 0,
    reused_atoms: new Set(sources.map((x) => x.object_ref)).size,
    recipe_hash: MT.hashOf({ target: targetPath, base: MT.contentHash(target), sources })
  };
}

function stageRemix(ws, proposal, by) {
  if (!proposal || !proposal.ok || proposal.status !== "CANDIDATE") return { ok: false, status: "HOLD_NO_REMIX_CANDIDATE" };
  const candidate = MT.cloneBody(ws, "remix:" + proposal.recipe_hash.slice(0, 10), by || "human");
  for (const op of proposal.ops) {
    const edited = MT.editCandidate(ws, candidate, op);
    if (!edited.ok) return { ok: false, status: "HOLD_INVALID_COMBINATION", candidate, detail: edited.error, errors: edited.errors || [] };
  }
  const plan = MT.planMerge(ws, [candidate]);
  return { ok: true, status: plan.status, candidate, plan, created_new_atoms: 0, reused_atoms: proposal.reused_atoms, recipe_hash: proposal.recipe_hash };
}

module.exports = { autoSlot, proposeRemix, stageRemix };
