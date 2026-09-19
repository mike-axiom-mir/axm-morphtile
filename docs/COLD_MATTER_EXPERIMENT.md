# Cold matter experiment

This is an experimental Node/local-file adapter, not a claim that MorphTile creates memory.

`experimental/cold-matter.js` partitions a valid world by top-level attachment roots, writes each region as a
hash-verified payload, retains a small manifest/index, and can reconstruct one selected region without loading its
siblings. Region payloads carry canonical matter, required definitions/words, meaningful variables, awake state and
internal edges. Missing, malformed or hash-mismatched payloads HOLD.

The adapter supports:

- freeze to a previously empty directory;
- process restart followed by verified open;
- selective region wake;
- selective nested-child wake without realizing sibling tiles;
- mutation → sleep → restart → wake with state preserved;
- repeated sleep/wake;
- exact full-world hash reconstruction.

Run `npm run cold:measure` for the bounded synthetic measurement. It runs 600-, 1,500- and 3,000-tile samples in
separate Node processes and records realized tile/triangle counts, heap, RSS, warm cache eviction, cold storage size,
preserved-state size, construction, freeze and wake latency in `evidence/cold-matter-measurement.json`. Heap and RSS
are reported separately because a runtime allocator may retain pages even after JavaScript objects are released.
The report names the first tested scale where each measure is not beneficial, or the largest tested scale when that
boundary was not observed. These bounded synthetic runs are not universal hardware evidence.

Top-level regions have independent payloads. `wakeSubtree()` can additionally materialize only one nested path and
its ancestor shells; `sleepSubtree()` merges its changed matter/state back into the verified region payload without
rewriting its cold siblings. The implementation reads that region's JSON payload while verifying it, so this is
selective **resident realization**, not random-access parsing of a huge monolithic file.
