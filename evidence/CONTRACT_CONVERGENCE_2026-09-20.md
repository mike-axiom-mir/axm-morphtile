# Core contract convergence — 2026-09-20

Base: `a579182ae585e5722ac87dd0cc8209963b18d000`. Node 24.19.0, Linux, no dependencies.

Interface PR #8 (`7cbd220cdb87686b9fa67c4c2c7e5e4e946d98bd`) and Capability PR #9
(`cd36d0d2b9b4fc45b0fd5822954c3cdaffbb6fc9`) supplied the regression cases.
Running those cases on the base reproduced four failures and one passing valid-shape control.
Both production repairs belong in core: every caller uses the same authored descriptor contract.

The Interface regression's final assertion originally treated `cloneBody()`'s returned candidate id as an
object with a `body`. Once the rejection worked, that assertion threw. It now reads the documented
`ws.candidates[id].world` without weakening the original rejection or no-mutation claims.
Capability's regression is preserved unchanged. Four pre-existing Lego/Remix fixture descriptors used
`wake.mode` even though the documented/runtime field is `wake.on`; their manual fixtures now use `on`.

Verified on the repaired tree:

- `npm test`: 176 tests passed, zero failed or skipped (153 previous default tests, 12 descriptor tests,
  and 11 existing Flowing/neutral-conformance tests now included through `test/flowing-runtime.js`).
- `npm run build`: single-file workshop generated successfully.
- `npm run conformance`: all seven vectors regenerated with no vector changes.
- Added cases cover numeric lookalikes, invalid containers, duplicate capability ids, zero thresholds,
  native defaults, no mutation after rejection, whole-tile/text/world entry paths, correct named-signal
  behavior, exact replay, and legacy missing-name wildcard refusal.

This is descriptor validation, not proof that arbitrary granted logic is semantically correct. No
specialist implementation is imported by core, no new wake mode is introduced, and no new visual-quality
or hardware claim is made. MorphTile core remains independent and has no runtime dependencies or I/O.
