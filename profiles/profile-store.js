"use strict";

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const ID = /^[A-Za-z0-9_.-]+$/;

function needId(value, label) {
  if (typeof value !== "string" || !ID.test(value)) throw new Error((label || "id") + " must be [A-Za-z0-9_.-]+");
  return value;
}
function createProfileStore() {
  return { kind: "morphtile-profile-store", version: "0.1", profiles: {}, saves: {}, ai_instances: {}, bridges: {} };
}
function needProfile(store, id) {
  const p = store && store.profiles && store.profiles[id];
  if (!p) throw new Error("no profile " + id);
  return p;
}
function addProfile(store, spec) {
  spec = spec || {};
  const id = needId(spec.id, "profile id");
  if (store.profiles[id]) throw new Error("profile exists: " + id);
  store.profiles[id] = { id, label: spec.label || id, categories: {}, worlds: {}, ai_instances: {} };
  return store.profiles[id];
}
function addCategory(store, profileId, spec) {
  const p = needProfile(store, profileId), id = needId(spec && spec.id, "category id");
  if (p.categories[id]) throw new Error("category exists: " + id);
  p.categories[id] = { id, label: spec.label || id };
  return p.categories[id];
}
function attachWorld(store, profileId, spec) {
  const p = needProfile(store, profileId), slot = needId(spec && spec.slot, "world slot");
  if (p.worlds[slot]) throw new Error("world slot exists: " + slot);
  if (typeof spec.world_ref !== "string" || !spec.world_ref) throw new Error("world_ref is required");
  if (spec.category != null && !p.categories[spec.category]) throw new Error("no category " + spec.category);
  p.worlds[slot] = { slot, label: spec.label || slot, category: spec.category || null, world_ref: spec.world_ref, saves: {} };
  if (spec.linked_from) p.worlds[slot].linked_from = clone(spec.linked_from);
  return p.worlds[slot];
}
function linkWorld(store, targetProfileId, spec) {
  const source = needProfile(store, spec.source_profile), sourceWorld = source.worlds[spec.source_slot];
  if (!sourceWorld) throw new Error("no source world slot " + spec.source_slot);
  return attachWorld(store, targetProfileId, {
    slot: spec.slot,
    label: spec.label || sourceWorld.label,
    category: spec.category || null,
    world_ref: sourceWorld.world_ref,
    linked_from: { profile_id: spec.source_profile, world_slot: spec.source_slot }
  });
}
function connectAI(store, profileId, spec) {
  const p = needProfile(store, profileId), id = needId(spec && spec.id, "AI id");
  if (!["local", "platform"].includes(spec.kind)) throw new Error("AI kind must be local|platform");
  if (typeof spec.ref !== "string" || !spec.ref) throw new Error("AI ref is required");
  const normalized = { id, label: spec.label || id, kind: spec.kind, ref: spec.ref };
  const existing = store.ai_instances[id];
  if (existing && JSON.stringify(existing) !== JSON.stringify(normalized)) throw new Error("AI id already describes a different instance: " + id);
  store.ai_instances[id] = existing || normalized;
  p.ai_instances[id] = true;
  return clone(store.ai_instances[id]);
}
function worldPolicy(world) {
  return world && world.save_policy ? world.save_policy : null;
}
function saveHold(world, forBridge) {
  const policy = worldPolicy(world);
  if (!policy) return { ok: false, status: "HOLD_SAVE_POLICY_UNDECLARED" };
  if (policy.mode === "none") return { ok: false, status: "HOLD_WORLD_SAVES_DISABLED" };
  if (policy.mode !== "profile") return { ok: false, status: "HOLD_UNSUPPORTED_SAVE_POLICY" };
  if (forBridge && !policy.ai_bridge) return { ok: false, status: "HOLD_AI_SAVE_BRIDGE_DISABLED" };
  return null;
}
function writeSave(store, world, profileId, worldSlot, saveSlot, payload, meta) {
  const held = saveHold(world, false); if (held) return held;
  const p = needProfile(store, profileId), link = p.worlds[worldSlot], slot = needId(saveSlot, "save slot");
  if (!link) return { ok: false, status: "HOLD_WORLD_SLOT_MISSING" };
  const ref = "save:" + profileId + ":" + worldSlot + ":" + slot, old = store.saves[ref];
  store.saves[ref] = {
    id: ref, profile_id: profileId, world_ref: link.world_ref, world_slot: worldSlot, slot,
    revision: old ? old.revision + 1 : 1, payload: clone(payload), meta: clone(meta || {})
  };
  link.saves[slot] = ref;
  return { ok: true, status: "SAVED", save_ref: ref, revision: store.saves[ref].revision };
}
function readSave(store, profileId, worldSlot, saveSlot) {
  const p = needProfile(store, profileId), link = p.worlds[worldSlot];
  if (!link) return { ok: false, status: "HOLD_WORLD_SLOT_MISSING" };
  const ref = link.saves[saveSlot];
  if (!ref || !store.saves[ref]) return { ok: false, status: "HOLD_SAVE_SLOT_EMPTY" };
  return { ok: true, status: "READY", save_ref: ref, save: clone(store.saves[ref]) };
}
function bridgeSaveToAI(store, world, profileId, worldSlot, saveSlot, aiId, access) {
  const held = saveHold(world, true); if (held) return held;
  const p = needProfile(store, profileId);
  if (!p.ai_instances[aiId] || !store.ai_instances[aiId]) return { ok: false, status: "HOLD_AI_NOT_CONNECTED" };
  const saved = readSave(store, profileId, worldSlot, saveSlot);
  if (!saved.ok) return saved;
  access = access || "read_write";
  if (!["read", "read_write"].includes(access)) return { ok: false, status: "HOLD_INVALID_AI_SAVE_ACCESS" };
  const id = "bridge:" + profileId + ":" + worldSlot + ":" + saveSlot + ":" + aiId;
  store.bridges[id] = { id, kind: "ai-save", profile_id: profileId, ai_id: aiId, save_ref: saved.save_ref, access };
  return { ok: true, status: "BRIDGED", bridge_ref: id, save_ref: saved.save_ref };
}
function resolveAIBridge(store, bridgeRef) {
  const bridge = store.bridges[bridgeRef];
  if (!bridge) return { ok: false, status: "HOLD_AI_SAVE_BRIDGE_MISSING" };
  const save = store.saves[bridge.save_ref];
  if (!save) return { ok: false, status: "HOLD_SAVE_SLOT_EMPTY" };
  return { ok: true, status: "READY", bridge: clone(bridge), save: clone(save) };
}
function snapshotProfile(store, profileId) {
  const p = clone(needProfile(store, profileId));
  const ai_instances = {};
  for (const id of Object.keys(p.ai_instances).sort()) ai_instances[id] = clone(store.ai_instances[id]);
  return { profile: p, ai_instances };
}

module.exports = { createProfileStore, addProfile, addCategory, attachWorld, linkWorld, connectAI, writeSave, readSave, bridgeSaveToAI, resolveAIBridge, snapshotProfile };
