const test = require("node:test");
const assert = require("node:assert/strict");
const MT = require("../core/morphtile.js");
const P = require("../profiles/profile-store.js");

test("profiles keep categories and can share one world reference without copying world memory", () => {
  const store = P.createProfileStore();
  P.addProfile(store, { id: "mike", label: "Mike" });
  P.addProfile(store, { id: "walmi", label: "Walmi" });
  P.addCategory(store, "mike", { id: "games", label: "Games" });
  P.addCategory(store, "walmi", { id: "training", label: "Training worlds" });
  P.attachWorld(store, "mike", { slot: "wreckline", label: "Wreckline", category: "games", world_ref: "local:worlds/wreckline" });
  P.linkWorld(store, "walmi", { source_profile: "mike", source_slot: "wreckline", slot: "wreckline_shared", category: "training" });
  assert.equal(store.profiles.mike.worlds.wreckline.world_ref, store.profiles.walmi.worlds.wreckline_shared.world_ref);
  assert.ok(!("world" in store.profiles.walmi.worlds.wreckline_shared));
  assert.deepEqual(store.profiles.walmi.worlds.wreckline_shared.linked_from, { profile_id: "mike", world_slot: "wreckline" });
});

test("one profile can connect local or platform AI instances without storing credentials in worlds", () => {
  const store = P.createProfileStore();
  P.addProfile(store, { id: "walmi", label: "Walmi" });
  P.connectAI(store, "walmi", { id: "walmi_local", kind: "local", ref: "lmstudio:walmi" });
  P.connectAI(store, "walmi", { id: "walmi_platform", kind: "platform", ref: "platform:model-session" });
  const view = P.snapshotProfile(store, "walmi");
  assert.equal(view.ai_instances.walmi_local.kind, "local");
  assert.equal(view.ai_instances.walmi_platform.kind, "platform");
  assert.ok(!JSON.stringify(view).includes("token"));
  assert.ok(!JSON.stringify(view).includes("password"));
});

test("a save is opaque profile data and an AI bridge points to it instead of copying it into the world", () => {
  const world = MT.createWorld("RPG", { save_policy: { mode: "profile", ai_bridge: true } }), before = MT.hashOf(world);
  const store = P.createProfileStore();
  P.addProfile(store, { id: "walmi", label: "Walmi" });
  P.addCategory(store, "walmi", { id: "games" });
  P.attachWorld(store, "walmi", { slot: "rpg", category: "games", world_ref: "local:worlds/rpg" });
  P.connectAI(store, "walmi", { id: "walmi_local", kind: "local", ref: "lmstudio:walmi" });

  const checkpoint = { checkpoint: 7, room: "tower", position: [4, 1, 9] };
  const progression = { level: 12, xp: 8840, faction: { archivists: 3 }, inventory: ["key", "map"] };
  assert.ok(P.writeSave(store, world, "walmi", "rpg", "checkpoint", checkpoint).ok);
  assert.ok(P.writeSave(store, world, "walmi", "rpg", "progression", progression).ok);
  assert.deepEqual(P.readSave(store, "walmi", "rpg", "checkpoint").save.payload, checkpoint);
  assert.deepEqual(P.readSave(store, "walmi", "rpg", "progression").save.payload, progression);

  const savesBeforeBridge = Object.keys(store.saves).length;
  const bridged = P.bridgeSaveToAI(store, world, "walmi", "rpg", "checkpoint", "walmi_local", "read_write");
  assert.ok(bridged.ok);
  assert.equal(Object.keys(store.saves).length, savesBeforeBridge);
  assert.equal(P.resolveAIBridge(store, bridged.bridge_ref).bridge.save_ref, bridged.save_ref);
  assert.equal(MT.hashOf(world), before);
  assert.ok(!world.saves && !world.profiles && !world.ai_instances);
});

test("world creator save policy can disable saves or AI bridging", () => {
  const store = P.createProfileStore(); P.addProfile(store, { id: "mike" }); P.attachWorld(store, "mike", { slot: "game", world_ref: "local:game" });
  const undeclared = MT.createWorld("Old");
  const disabled = MT.createWorld("No saves", { save_policy: { mode: "none" } });
  const privateProfile = MT.createWorld("Private", { save_policy: { mode: "profile", ai_bridge: false } });
  assert.equal(P.writeSave(store, undeclared, "mike", "game", "a", {}).status, "HOLD_SAVE_POLICY_UNDECLARED");
  assert.equal(P.writeSave(store, disabled, "mike", "game", "a", {}).status, "HOLD_WORLD_SAVES_DISABLED");
  P.connectAI(store, "mike", { id: "helper", kind: "local", ref: "local:helper" });
  assert.ok(P.writeSave(store, privateProfile, "mike", "game", "a", { ok: 1 }).ok);
  assert.equal(P.bridgeSaveToAI(store, privateProfile, "mike", "game", "a", "helper").status, "HOLD_AI_SAVE_BRIDGE_DISABLED");
});
