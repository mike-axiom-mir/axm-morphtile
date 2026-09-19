# World #1 commerce matter

`worlds/world1/commerce.js` implements Mike's World #1 rules without making them MorphTile defaults.

- Auction house: configurable fee on buyer and seller, paid for broad convenience.
- Physical direct trade: both parties must be declared present at one location; zero transaction percentage.
- Popup store: one fixed deployment cost, persistent stock/prices/expiry, zero sale percentage.
- Offline owner: popup state remains ordinary deterministic state.
- NPC attendant: an actual assigned actor.
- Optional player-owned AI: may propose a bounded price only within owner rules; it cannot settle or mint anything.
- World authority: inventory, balances, expiry and settlement remain deterministic and revision checked.
- P2P direction: hash-verified portable saves and receipts; stale revisions HOLD instead of double spending.

`createCommerceTile()` stores the commerce ledger inside ordinary MorphTile logic matter. Updating it produces a
normal `facet.swap` candidate that must pass clone → plan → commit and can roll back exactly.

Evidence: `test/world1-commerce.js`.
