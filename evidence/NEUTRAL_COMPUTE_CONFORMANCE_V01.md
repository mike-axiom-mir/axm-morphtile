# Neutral Compute v0.1 — independent MorphTile conformance receipt

Date: 2026-09-20  
Status: **EXPERIMENTAL / NON-CANON / PR #5**

## Vector provenance

MorphTile consumes the exact committed Neutral Compute Substrate vector file as data:

- repository: `mike-axiom-mir/axm-compute-substrate`
- source commit: `997aee5706ee2d4335c6059b16db1a1fe844bb6d`
- source path: `conformance/vectors.json`
- Git blob: `ec5366ede678b621c43690292eff5b5e47503e47`
- local copy: `conformance/neutral-compute-v0.1.json`

`conformance/neutral-compute-v0.1.SOURCE.json` records the same pin.

No Neutral Compute runtime implementation code is copied into MorphTile. The adapter/test is MorphTile-native and calls `experimental/flowing-runtime.js`.

## First independent run — failure retained

Exact MorphTile head: `4cd773e93aeeebb170f07587e66e10bbc28bf6ee`

GitHub Actions:

- run: `35483448589`
- job: `106005302330`
- result: **FAIL**
- existing + prior Flow tests: **130 PASS**
- new neutral-conformance tests: **2 FAIL**

The failures exposed real contract mismatches:

1. MorphTile's native Flow artifact references did not preserve a raw-byte `hash_kind`; the neutral byte-identity primitive therefore failed.
2. selector `source:**` was treated as `REUSE_EXACT` for `source:graph/...`, because the matcher supported `/**`, one-star prefix and global `**`, but not general trailing-`**` namespace recursion.
3. That wrong dependency classification cascaded into multiple stage cases as `HOLD_REUSE_OVERRIDE`.
4. Correct bytes could not wake because native wake verification re-hashed them as canonical JSON rather than raw bytes.

The vector file was not weakened.

## First repair — one integration miss retained

Repair head: `92425cc4c7967f2da639b3693016d03377761de1`

Changes were limited to the experimental Flow runtime:

- general trailing-`**` selector support;
- explicit `canonical-json` / `bytes` artifact hash kinds;
- raw-byte SHA-256 verification through MorphTile's existing `MT.sha256`;
- byte-safe hot state;
- descendant `reactivate(...)` implementation.

GitHub Actions:

- run: `35483506430`
- job: `106005467216`
- result: **FAIL**
- tests: **131 PASS / 1 FAIL**

At this point the neutral hash-primitives test passed. The sole remaining failure was:

`expected REACTIVATED; actual HOLD_NOT_IMPLEMENTED`

Cause: the reactivation function existed but was omitted from `module.exports`. This was an integration/export mistake, not a vector or lineage-policy disagreement.

## Final green result

Final tested head: `9a5a3f21728c36470b0607066bc2a08e0ac4473b`

GitHub Actions:

- run: `35483544928`
- job: `106005571928`
- result: **SUCCESS**
- `npm test`: **132/132 PASS**
- Neutral Compute hash primitives: **PASS**
- Neutral Compute pinned vector suite: **PASS**
- `npm run build`: **PASS**; one-file workshop 238.7 kB in this run
- MorphTile's own `npm run conformance`: **PASS**; 7 native MorphTile cases / 79 kB vectors

The final repair only exported the already-tested `reactivate` function.

## What this establishes

Within the committed Neutral Compute v0.1 cases, two differently shaped implementations now agree on the observable substrate contract:

1. Neutral Compute's own zero-dependency JavaScript reference runtime.
2. MorphTile's independent native Flowing Runtime built around MorphTile's own hashing, cold/sleep architecture and world principles.

MorphTile does **not** import the neutral runtime.

The shared cases cover:

- selective dependency invalidation;
- exact reuse of unaffected contracts;
- unknown-selector HOLD;
- route-required / route-not-allowed HOLD;
- non-authoritative staging;
- logical atomic generation commit;
- stale-base refusal;
- verified non-canonical hot state and restart dormancy;
- raw-byte and canonical-JSON identity;
- ancestor rollback;
- descendant reactivation;
- sibling refusal;
- real recomputation with identical output still recorded as UPDATE;
- persisted-runtime tamper refusal.

## Truth boundary

This is a cross-repository behavioral conformance result, not proof that:

- MorphTile should depend on the neutral package;
- either runtime has durable fsync/database commit semantics;
- dependency maps are complete for arbitrary products;
- historical artifact bytes will always remain available;
- any measured speed/RAM/energy improvement follows from conformance;
- multi-host uniqueness, hostile-host security or cryptographic authority are solved;
- passing vectors grants merge or CANON authority.

`core/morphtile.js` was not changed by this conformance repair.
