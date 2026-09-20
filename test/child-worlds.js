const test = require("node:test");
const assert = require("node:assert/strict");
const MT = require("../core/morphtile.js");
const S = require("../runtime/world-session.js");

test("save policy and child-world references use ordinary candidate receipt and exact rollback", () => {
  const ws = MT.createWorkspace(MT.createWorld("Hub")), before = MT.structHash(ws.live), c = MT.cloneBody(ws);
  assert.ok(MT.editCandidate(ws, c, { op: "world.save-policy.set", save_policy: { mode: "profile", ai_bridge: true } }).ok);
  assert.ok(MT.editCandidate(ws, c, { op: "child-world.put", id: "house", child: { world_ref: "local:worlds/house", label: "House", via: { tile: "front_door", action: "open" } } }).ok);
  const plan = MT.planMerge(ws, [c]); assert.equal(plan.status, "READY");
  const committed = MT.commitPlan(ws, plan.id); assert.ok(committed.ok);
  assert.deepEqual(committed.receipt.units.map((u) => u.key).sort(), ["childworld:house", "world:save_policy"]);
  assert.deepEqual(ws.live.save_policy, { mode: "profile", ai_bridge: true });
  assert.deepEqual(ws.live.child_worlds.house, { id: "house", world_ref: "local:worlds/house", activation: "lazy", label: "House", via: { tile: "front_door", action: "open" } });
  const exported = MT.exportWorld(ws.live), imported = MT.importWorld(exported);
  assert.ok(imported.ok); assert.deepEqual(imported.world.child_worlds, ws.live.child_worlds);
  const rb = MT.rollback(ws, committed.receipt.rollback_token); assert.ok(rb.ok && rb.exact); assert.equal(MT.structHash(ws.live), before);
});

test("child-world descriptors refuse embedded child bytes or profile/save payloads", () => {
  const ws = MT.createWorkspace(MT.createWorld("Hub")), c = MT.cloneBody(ws);
  const r = MT.editCandidate(ws, c, { op: "child-world.put", id: "bad", child: { world_ref: "local:bad", world: { kind: "morphtile-world" } } });
  assert.equal(r.ok, false); assert.match(r.error, /references only/);
});

test("only one world reference is active while navigation may recurse child into child", () => {
  const root = MT.createWorld("Root"), house = MT.createWorld("House");
  MT.applyStructOp(root, { op: "child-world.put", id: "house", child: { world_ref: "local:house", via: { tile: "door", action: "open" } } });
  MT.applyStructOp(house, { op: "child-world.put", id: "dungeon", child: { world_ref: "local:dungeon", via: { tile: "hatch", action: "descend" } } });
  const rootHash = MT.hashOf(root), houseHash = MT.hashOf(house);
  let session = S.createWorldSession("local:root");
  assert.equal(session.active_world_ref, "local:root");
  assert.ok(!("worlds" in session) && !("loaded_worlds" in session));

  let step = S.enterRoute(session, root, { tile: "door", action: "open" });
  assert.ok(step.ok); session = step.session; assert.equal(session.active_world_ref, "local:house"); assert.equal(session.stack.length, 1);
  step = S.enterRoute(session, house, { tile: "hatch", action: "descend" });
  assert.ok(step.ok); session = step.session; assert.equal(session.active_world_ref, "local:dungeon"); assert.equal(session.stack.length, 2);
  step = S.leaveChild(session); assert.ok(step.ok); assert.equal(step.session.active_world_ref, "local:house");
  assert.equal(MT.hashOf(root), rootHash); assert.equal(MT.hashOf(house), houseHash);
});

test("old worlds keep their previous structural hash semantics until the new optional fields are used", () => {
  const old = MT.seedWorld(), manual = MT.hashOf({ tiles: old.tiles, edges: old.edges, defs: old.defs || {}, words: old.words || {}, spatial_root: old.spatial_root });
  assert.equal(MT.structHash(old), manual);
});
