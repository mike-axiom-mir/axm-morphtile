# Portable creation rollback — 2026-09-20

The Creation Director's real six-machine fixture imports one tile, one definition and one word.
On base `b6b086edb70fd4657495fcf01cb9fcdedceafdaf`, immediately rolling the installation back returned
`exact: true` because structural hashes matched, but left `words: {}` on a world that previously omitted
`words`. The full-world hash changed from `5b1a8339c88d5031641625f90ce8f198e2e29fb3288af5020a75dea4287bf2fb`
to `bbaa02655b9280c1b22845e363ea0600eec798101581e7256ce4927d00e1294c`.

The repair records only the presence of the three optional structural registries on new receipts and
replays that shape after restoring their entries. It neither copies the full world into a receipt nor
overwrites non-empty later content. Existing structural-drift refusal remains in force.

Local evidence on Node 24.19.0 / Linux:

- `npm test`: 179 passed, zero failed/skipped.
- New tests cover fresh, explicitly empty and legacy omitted registry shapes; saved-workspace rollback;
  later-content refusal; and unchanged replay for old receipts without the new metadata.
- `npm run build` succeeded; the checked-in standalone workshop carries the same repair.
- `npm run conformance` regenerated seven vectors unchanged.

Scope: immediate structural-installation rollback preserves the complete world representation. This does
not change the existing policy for runtime signals or time after a commit, and it does not retroactively
invent presence information for old receipts.
