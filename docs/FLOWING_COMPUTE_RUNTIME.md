# Flowing Compute Runtime v0.1 — experimental MorphTile integration

Status: **EXPERIMENTAL / NON-CANON / unmerged**

## Why this exists

MorphTile already has much of the physical behavior that Flowing Compute research kept rediscovering:

- sleeping capabilities that cost no runtime state until woken;
- pure `pendingWakes` reads;
- hash-verified cold regions and nested cold subtrees;
- replay from genesis/checkpoints;
- exact rollback;
- content-addressed kits/words and portable matter;
- "nothing computed unless read" as an explicit direction.

The missing substrate was one level above those mechanisms: a small deterministic way to say **which derived contracts are affected by one mutation, which exact artifacts may be reused, and when a whole new generation becomes current**.

This module does that without importing the large experimental AXM Compute Substrate stack.

## Provenance

The architectural pattern is adapted from the experimental research lane
`mike-axiom-mir/axm-compute-substrate`, especially its bounded findings around:

- affected-contract closure instead of universal recomputation;
- dormant versus hot state;
- exact artifact identity;
- atomic multi-contract generations;
- rollback by lineage;
- explicit HOLD when dependency or policy context is unknown.

No cryptographic witness/key-rotation machinery is imported here. That research belongs to hostile or independent multi-authority operation and is not a default requirement for ordinary MorphTile matter.

**Mike-provided foundation provenance:** Mike states that MorphTile's original foundation/direction was developed with Anthropic-side models rather than ChatGPT. The Git history identifies Mike/web-flow and does not independently encode model authorship, so this note preserves that supplied provenance without presenting it as independently proven repository metadata.

## Runtime contract

`experimental/flowing-runtime.js` owns only:

1. a registry of named state contracts and their source selectors;
2. an exact current artifact reference for each contract;
3. mutation planning: `UPDATE_REQUIRED` or `REUSE_EXACT`;
4. contract-local route recording;
5. staging that has **no authority**;
6. one atomic generation pointer;
7. append-only generation/commit/rollback receipts;
8. ancestor-only rollback;
9. a non-canonical hot plane for already-verified artifact bodies;
10. export/import verification.

It deliberately does **not** own:

- artifact byte storage;
- a universal cache;
- a universal incremental algorithm;
- contract-specific routing policy;
- network or multi-host authority;
- CANON/merge authority;
- a forced audit cadence.

A future library (including the open Lego Library work) may store content-addressed bytes. Cold Matter may store world regions. Another host may store other artifacts. Flowing Runtime keeps only their exact identities.

## Shape

```text
mutation selectors
       |
       v
contract dependency closure
       |
       +--> affected contract ----> caller's local policy/route ----> new artifact ref
       |
       +--> unaffected contract -------------------------------> exact old artifact ref
                                                                    |
                                                                    v
                                                          STAGED generation
                                                          (not current yet)
                                                                    |
                                                               commit once
                                                                    |
                                                                    v
                                                           CURRENT generation
```

A hot artifact is only a session optimization:

```text
exact dormant artifact ref
          |
       verify bytes
          |
          v
   non-canonical hot copy

sleep/restart drops hot copy
current generation does not change
```

## Selector rule

v0.1 supports exact selectors, prefix `*`, recursive prefix `/**`, and global `**`.

Example:

```js
{
  id: "cold:region_1",
  depends_on: ["morphtile:tile/region_1/**"],
  allowed_routes: ["cold-region-rewrite"]
}
```

A mutation to `morphtile:tile/region_1/part_2` affects that region contract but not
`cold:region_0` or `cold:region_2`.

If a mutation selector is not claimed by any registered contract, planning returns
`HOLD_UNKNOWN_SELECTOR`. The runtime does not infer that unknown work is harmless.

## Policy boundary

The runtime determines **what is affected**, not **how every affected contract should update**.

An affected contract must name a route accepted by that contract. This is deliberate:
Flowing Compute research measured different break-even behavior for dependency graphs,
render assets, large capability registries and large file-identity bodies. A universal
"incremental" route would be dishonest.

## Atomicity

`stageGeneration` builds and verifies the complete next generation but leaves the current
head untouched. Only `commitGeneration` moves the current generation.

That means two contracts may prepare new artifacts independently without exposing a half-new
world. Either the complete generation commits or the old generation remains current.

## Rollback

Rollback moves the current pointer only to a real ancestor generation. A preserved sibling
branch is not a rollback target merely because it has an older/similar sequence.

The runtime stores artifact references, not historical bytes. A host that promises physical
rollback must preserve the referenced artifacts in its chosen content store.

## MorphTile proof in this PR

The test uses the real `experimental/cold-matter.js` contract:

- three cold regions are frozen;
- each region becomes one Flow contract;
- the whole live-world hash is a fourth contract;
- one state mutation inside `region_1/part_2` updates only `cold:region_1` plus `world:live`;
- region 0 and region 2 are reused by exact hash;
- staging leaves G0 current;
- commit advances all affected refs together;
- restart/export loses only the non-canonical hot plane, not the generation head;
- unknown selectors HOLD;
- unapproved routes HOLD;
- stale plans HOLD;
- sibling rollback HOLDs;
- tampered exported generation evidence is rejected.

## Why this belongs near MorphTile

This is not creation strategy. It is a general representation/runtime rule:

> a new world generation should replace only contracts whose inputs actually changed.

That fits MorphTile's existing principles:

- depth before bridges;
- every interface is a surface over the same matter;
- sleeping capability has zero active cost;
- nothing computed unless read;
- leaving must preserve truth and replayability.

For now it remains under `experimental/`. Promotion into core should happen only after at least one additional native MorphTile contract (not only Cold Matter) uses it without private workarounds.

## Truth boundary

- one-process deterministic JavaScript logic plus Node cold-matter test fixtures;
- artifact hashes prove content identity, not semantic quality;
- hot state is a cache, never authority;
- exact artifact availability after rollback remains a host/storage responsibility;
- no RAM, energy, throughput or universal speed claim is made here;
- no claim that all MorphTile dependencies are already mapped;
- no claim that the Compute Substrate's later witness/security research is required here.

## Neutral conformance proof

MorphTile now pins the exact Neutral Compute Substrate v0.1 vector file under `conformance/neutral-compute-v0.1.json` with its source receipt beside it.

The test adapter is MorphTile-native and imports only `experimental/flowing-runtime.js`; it does not import the neutral runtime implementation.

The first vector run failed and exposed real gaps in raw-byte artifact identity and recursive namespace selector semantics. A second run exposed an unexported descendant-reactivation surface. After repairing those boundaries, the unchanged pinned vector file passed completely while all existing MorphTile tests, build and native conformance stayed green.

See `evidence/NEUTRAL_COMPUTE_CONFORMANCE_V01.md` for exact heads, workflow runs, failures and final evidence.

This is evidence that the runtime contract can survive a differently shaped implementation. It is not evidence that MorphTile should acquire a mandatory dependency on the neutral package.
