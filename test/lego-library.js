const test = require("node:test");
const assert = require("node:assert/strict");
const MT = require("../core/morphtile.js");
const L = require("../library/lego-library.js");

function sourceWorld() {
  const w = MT.createWorld("Library lab");
  const source = MT.createTile({
    id: "source", name: "Source",
    facets: { material: { type: "primitive", source: null, data: { color: [0.9, 0.2, 0.4], pattern: "checker", scale: 0.2 } } },
    capabilities: [{ id: "jump", grants: { vars: { jumps: 0 } }, wake: { mode: "manual" } }],
    view: { title: "Source view", body: [{ text: "Reusable" }] }
  });
  const target = MT.createTile({ id: "target", name: "Target" });
  w.tiles.source = source; w.tiles.target = target;
  return w;
}

test("one pack may carry a finished product and separate Lego while identical objects deduplicate", () => {
  const w = sourceWorld();
  const pack = L.exportLegoPack(w, [
    { id: "finished", kind: "kit", path: "source", provenance: { source: "self-created" } },
    { id: "skin", kind: "facet", facet: "material", path: "source", provenance: { source: "self-created" } },
    { id: "skin_again", kind: "facet", facet: "material", path: "source", provenance: { source: "downloaded", ref: "example:item" } },
    { id: "jump", kind: "capability", path: "source", capability: "jump" },
    { id: "view", kind: "view", path: "source" }
  ], { name: "Mixed Lego" });
  assert.equal(pack.entries.length, 5);
  assert.equal(pack.expect.unique_objects, 4);
  assert.equal(L.verifyLegoPack(pack).status, "VERIFIED");
  assert.equal(pack.entries.find((x) => x.id === "skin").object_ref, pack.entries.find((x) => x.id === "skin_again").object_ref);
});

test("library import verifies hashes and stores one object behind multiple labels/provenance records", () => {
  const w = sourceWorld(), lib = L.createLegoLibrary();
  const pack = L.exportLegoPack(w, [
    { id: "skin_a", kind: "facet", facet: "material", path: "source", provenance: { source: "self-created" } },
    { id: "skin_b", kind: "facet", facet: "material", path: "source", provenance: { source: "licensed-download", license_ref: "opaque:123" } }
  ]);
  const result = L.importLegoPack(lib, pack);
  assert.ok(result.ok); assert.equal(result.objects_added, 1); assert.equal(Object.keys(lib.objects).length, 1); assert.equal(Object.keys(lib.items).length, 2);
  const back = L.exportLibraryPack(lib, ["skin_a", "skin_b"]);
  assert.equal(L.verifyLegoPack(back).status, "VERIFIED");
});

test("tampering with a pack or a content-addressed object is held", () => {
  const w = sourceWorld(), pack = L.exportLegoPack(w, [{ id: "skin", kind: "facet", facet: "material", path: "source" }]);
  const tampered = MT.clone(pack); tampered.entries[0].name = "silently changed";
  assert.equal(L.verifyLegoPack(tampered).status, "HOLD_HASH_MISMATCH");
  const badObject = MT.clone(pack), ref = badObject.entries[0].object_ref;
  badObject.objects[ref].data.data.color = [0, 0, 0];
  badObject.expect.sha256 = MT.hashOf({ entries: badObject.entries, objects: badObject.objects });
  assert.equal(L.verifyLegoPack(badObject).status, "HOLD_OBJECT_HASH_MISMATCH");
});

test("a finished kit from the library still arrives through ordinary MorphTile import ops", () => {
  const source = sourceWorld(), lib = L.createLegoLibrary();
  L.importLegoPack(lib, L.exportLegoPack(source, [{ id: "finished", kind: "kit", path: "source" }]));
  const dest = MT.createWorld("Destination"), proposal = L.proposeLibraryUse(dest, lib, "finished");
  assert.ok(proposal.ok); assert.equal(proposal.status, "READY"); assert.ok(proposal.ops.some((x) => x.op === "tile.add"));
  const ws = MT.createWorkspace(dest), c = MT.cloneBody(ws);
  for (const op of proposal.ops) assert.ok(MT.editCandidate(ws, c, op).ok);
  const plan = MT.planMerge(ws, [c]); assert.equal(plan.status, "READY"); assert.ok(MT.commitPlan(ws, plan.id).ok);
  assert.ok(ws.live.tiles.source);
});
