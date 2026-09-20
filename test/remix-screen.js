const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const MT = require("../core/morphtile.js");

test("library and remix modules also expose browser globals without network dependencies", () => {
  const context = vm.createContext({ MorphTile: MT, self: {} });
  context.self = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../library/lego-library.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../remix/remix-bench.js"), "utf8"), context);
  assert.equal(typeof context.MorphTileLegoLibrary.createLegoLibrary, "function");
  assert.equal(typeof context.MorphTileRemixBench.proposeRemix, "function");
});

test("the separate Remix screen is local-only and exposes import/export plus stage/commit/rollback", () => {
  const html = fs.readFileSync(path.join(__dirname, "../remix/bench.html"), "utf8");
  for (const text of ["Import Lego Pack", "Export library", "Stage selected remix", "Commit staged", "Rollback last", "created new atoms: 0"]) assert.ok(html.includes(text), text);
  assert.ok(html.includes("../core/morphtile.js"));
  assert.ok(html.includes("../library/lego-library.js"));
  assert.ok(html.includes("./remix-bench.js"));
  assert.ok(!/https?:\/\//i.test(html), "screen must not depend on network URLs");
});
