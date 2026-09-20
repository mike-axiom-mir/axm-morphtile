# Flowing Compute Runtime v0.1 — MorphTile integration evidence

Date: 2026-09-20  
Status: **EXPERIMENTAL / NON-CANON / open PR #5**

## Source identity

Implementation branch head before this evidence note: `48a2553bf3fb605c7f6ffc6ff370c69a8d81305d`.

The pull-request verification workflow tested GitHub's synthetic merge ref
`f8c060941291bb1fa944d67842a4e961c0e447e3`, combining that exact implementation
head with base `4346df01ed18cd1336064f9323d7766ff4f6338a`.

GitHub Actions:

- run: `35482587890`
- job: `106002945914`
- environment: Ubuntu 24.04.5, Node 22.23.2
- conclusion: **success**

## Verification

The shared MorphTile verification workflow passed:

- `npm test`: **130/130 tests passed**;
  - previous main suite: 123 tests;
  - Flowing Runtime adds 7 focused tests through the existing cold-matter test surface.
- `npm run build`: PASS; generated one-file workshop was 238.7 kB in this run.
- `npm run conformance`: PASS; 7 conformance cases regenerated.

## What is proven in the focused tests

Using the existing real `experimental/cold-matter.js` storage contract:

1. three cold regions are registered as independent state contracts;
2. the full live-world identity is a fourth contract;
3. mutation selector `morphtile:tile/region_1/part_2` affects only:
   - `cold:region_1`
   - `world:live`
4. `cold:region_0` and `cold:region_2` are reused by their exact previous hashes;
5. staging a generation does not move current authority;
6. one commit advances the complete generation;
7. dormant artifact bytes may be verified into a non-canonical hot plane;
8. export/restart drops the hot plane but keeps the exact generation head;
9. unknown source selectors return `HOLD_UNKNOWN_SELECTOR`;
10. an affected contract without a route returns `HOLD_ROUTE_REQUIRED`;
11. a route outside that contract's allowlist returns `HOLD_ROUTE_NOT_ALLOWED`;
12. plans/stages are bound to their exact base generation;
13. rollback accepts ancestors and rejects a preserved sibling generation;
14. tampered exported generation/runtime evidence is rejected.

## Overlap boundary

Before publication, open PRs were rechecked:

- PR #3: profile saves + lazy child-world substrate;
- PR #4: content-addressed Lego Library + Remix Bench.

This PR deliberately does not implement profile/save policy or artifact byte storage.
It owns only dependency closure, artifact-reference generation truth, hot/dormant session
separation and atomic generation/rollback receipts.

The workflow file matches the test/build/conformance workflow already used by PRs #3/#4.

## Provenance boundary

The design is adapted from bounded Flowing Compute findings in
`mike-axiom-mir/axm-compute-substrate`, but the implementation is native MorphTile code
and does not import the later witness/key-rotation stack.

Mike states that MorphTile's original foundation/direction was developed with Anthropic-side
models rather than ChatGPT. Repository Git metadata does not independently encode model
authorship; the integration documentation records that as Mike-provided provenance rather
than an independently verified repository fact.

## Truth boundary

- this is a deterministic generation/reference runtime, not an artifact store;
- hashes establish byte/canonical identity only;
- contract-specific update algorithms remain outside this generic runtime;
- physical rollback requires the host to retain historical artifact bytes;
- no performance, RAM, energy or universal efficiency claim is made by this PR;
- no network, hostile multi-host authority, merge authority or CANON authority is added;
- promotion from `experimental/` should wait for another native MorphTile contract beyond
  Cold Matter to use the runtime without a private workaround.
