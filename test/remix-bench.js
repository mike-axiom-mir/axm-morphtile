const test = require("node:test");
const assert = require("node:assert/strict");
const MT = require("../core/morphtile.js");
const L = require("../library/lego-library.js");
const R = require("../remix/remix-bench.js");

function lab() {
  const w = MT.createWorld("Remix lab");
  w.tiles.source = MT.createTile({
    id: "source", name: "Donor",
    form_hints: ["game_asset", "ui_panel"],
    facets: {
      material: { type: "primitive", source: null, data: { color: [0.95, 0.35, 0.12], pattern: "stripes", scale: 0.15 } },
      behavior: { type: "scripted", data: { ops: [{ op: "bob", amp: 0.2, rate: 2 }] } }
    },
    capabilities: [{ id: "dash", grants: { vars: { dash: 1 } }, wake: { on: "manual" } }],
    view: { title: "Donor UI", body: [{ text: "mixed in" }] }
  });
  w.tiles.target = MT.createTile({
    id: "target", name: "Receiver",
    facets: { connect: { sockets: [], bridges: [], place: [7, 2, 9], rotation: [0, 0.5, 0] } },
    capabilities: [{ id: "old", grants: { vars: { old: 1 } }, wake: { on: "manual" } }]
  });
  return w;
}

test("remix reuses existing Lego and commits skin, behavior, capability and view with zero new atoms", () => {
  const w = lab(), lib = L.createLegoLibrary();
  const pack = L.exportLegoPack(w, [
    { id: "skin", kind: "facet", facet: "material", path: "source" },
    { id: "motion", kind: "facet", facet: "behavior", path: "source" },
    { id: "dash", kind: "capability", path: "source", capability: "dash" },
    { id: "ui", kind: "view", path: "source" }
  ]);
  L.importLegoPack(lib, pack);
  const proposal = R.proposeRemix(w, lib, "target", ["skin", "motion", { item_id: "dash", replace: "old" }, "ui"]);
  assert.ok(proposal.ok); assert.equal(proposal.status, "CANDIDATE"); assert.equal(proposal.created_new_atoms, 0); assert.equal(proposal.reused_atoms, 4);
  assert.deepEqual(proposal.ops[0].tile.facets.connect.place, [7, 2, 9]);
  assert.deepEqual(proposal.ops[0].tile.facets.connect.rotation, [0, 0.5, 0]);

  const ws = MT.createWorkspace(w), before = MT.structHash(ws.live), staged = R.stageRemix(ws, proposal, "human:mixer");
  assert.ok(staged.ok); assert.equal(staged.status, "READY");
  const committed = MT.commitPlan(ws, staged.plan.id); assert.ok(committed.ok);
  assert.deepEqual(ws.live.tiles.target.facets.material, w.tiles.source.facets.material);
  assert.deepEqual(ws.live.tiles.target.facets.behavior, w.tiles.source.facets.behavior);
  assert.deepEqual(ws.live.tiles.target.view, w.tiles.source.view);
  assert.equal(ws.live.tiles.target.capabilities.some((x) => x.id === "dash"), true);
  assert.equal(ws.live.tiles.target.capabilities.some((x) => x.id === "old"), false);
  assert.ok(MT.rollback(ws, committed.receipt.rollback_token).ok); assert.equal(MT.structHash(ws.live), before);
});

test("whole-body remix is still reuse and preserves the receiver's identity, state and placement", () => {
  const w = lab(), lib = L.createLegoLibrary();
  L.importLegoPack(lib, L.exportLegoPack(w, [{ id: "donor_body", kind: "body", path: "source" }]));
  const targetState = MT.clone(w.tiles.target.state), targetProv = MT.clone(w.tiles.target.provenance);
  const proposal = R.proposeRemix(w, lib, "target", ["donor_body"]);
  assert.ok(proposal.ok); assert.equal(proposal.created_new_atoms, 0);
  const draft = proposal.ops[0].tile;
  assert.equal(draft.id, "target"); assert.equal(draft.name, "Receiver");
  assert.deepEqual(draft.state, targetState); assert.deepEqual(draft.provenance, targetProv);
  assert.deepEqual(draft.facets.connect.place, [7, 2, 9]); assert.deepEqual(draft.facets.connect.rotation, [0, 0.5, 0]);
});

test("incompatible Lego combinations HOLD as a preserved candidate instead of silently forcing them", () => {
  const w = lab(), lib = L.createLegoLibrary();
  L.importLegoPack(lib, L.exportLegoPack(w, [{ id: "skin", kind: "facet", facet: "material", path: "source" }]));
  const bad = R.proposeRemix(w, lib, "target", [{ item_id: "skin", slot: "view" }]);
  assert.equal(bad.ok, false); assert.equal(bad.status, "HOLD_INVALID_REMIX");

  const connectWorld = lab();
  connectWorld.tiles.donor = MT.createTile({ id: "donor", facets: { connect: { sockets: [{ id: "need", kind: "attach", pos: [0,0,0] }], bridges: [] } } });
  const pack = L.exportLegoPack(connectWorld, [{ id: "connect", kind: "facet", facet: "connect", path: "donor" }]);
  L.importLegoPack(lib, pack);
  const proposal = R.proposeRemix(w, lib, "target", ["connect"]);
  assert.ok(proposal.ok); assert.equal(proposal.warnings[0].code, "CONNECT_REMIX_REQUIRES_GRAPH_VALIDATION");
  const ws = MT.createWorkspace(w), staged = R.stageRemix(ws, proposal);
  assert.ok(staged.ok || staged.status === "HOLD_INVALID_COMBINATION");
});
