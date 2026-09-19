const test = require('node:test'), assert = require('node:assert');
const MT = require('../core/morphtile.js'), Market = require('../worlds/world1/commerce.js');
const run = (state, event, by) => { const r = Market.transact(state, event, by); assert.ok(r.ok, r.detail || r.status); return r.state; };
const opened = () => {
  let s = Market.createCommerceState({ auction_buyer_fee_bps: 1000, auction_seller_fee_bps: 1000, popup_deploy_cost: 40, popup_duration: 100 });
  s = run(s, { type: 'player.open', player: 'seller', balance: 100, inventory: { metal: 10, food: 4 } });
  s = run(s, { type: 'player.open', player: 'buyer', balance: 1000, inventory: {} }); return s;
};

test('auction charges both sides for convenience and settles inventory once', () => {
  let s = opened(); s = run(s, { type: 'auction.list', listing: 'metal_1', seller: 'seller', item: 'metal', amount: 4, unit_price: 100 });
  const r = Market.transact(s, { type: 'auction.buy', listing: 'metal_1', buyer: 'buyer', amount: 2, expected_revision: s.revision }); assert.ok(r.ok); s = r.state;
  assert.deepEqual(r.receipt.outcome, { layer: 'auction', gross: 200, buyer_fee: 20, seller_fee: 20, transaction_cut: 40 });
  assert.equal(s.players.buyer.balance, 780); assert.equal(s.players.seller.balance, 280); assert.equal(s.treasury, 40); assert.equal(s.players.buyer.inventory.metal, 2);
  const stale = Market.transact(s, { type: 'auction.buy', listing: 'metal_1', buyer: 'buyer', amount: 1, expected_revision: s.revision - 1 }); assert.equal(stale.status, 'HOLD_STALE_REVISION');
});

test('physical direct trade has no percentage cut and requires both parties at a location', () => {
  let s = opened(), treasury = s.treasury; const bad = Market.transact(s, { type: 'direct.trade', seller: 'seller', buyer: 'buyer', item: 'food', amount: 1, price: 50 }); assert.equal(bad.status, 'HOLD_INVALID_TRANSACTION');
  const absent = Market.transact(s, { type: 'direct.trade', seller: 'seller', buyer: 'buyer', item: 'food', amount: 1, price: 50, location: 'resort-square', present: ['seller'] }); assert.equal(absent.status, 'HOLD_INVALID_TRANSACTION');
  const r = Market.transact(s, { type: 'direct.trade', seller: 'seller', buyer: 'buyer', item: 'food', amount: 2, price: 80, location: 'resort-square', present: ['seller', 'buyer'] }); assert.ok(r.ok); s = r.state;
  assert.equal(r.receipt.outcome.transaction_cut, 0); assert.equal(s.treasury, treasury); assert.equal(s.players.seller.balance, 180); assert.equal(s.players.buyer.balance, 920);
});

test('popup charges infrastructure once, persists offline, takes no sale percentage and returns stock at expiry', () => {
  let s = opened(); let r = Market.transact(s, { type: 'popup.open', popup: 'cave_shop', owner: 'seller', location: 'danger-cave', duration: 10 }); assert.ok(r.ok); s = r.state;
  assert.equal(s.players.seller.balance, 60); assert.equal(s.treasury, 40);
  s = run(s, { type: 'popup.stock', popup: 'cave_shop', item: 'metal', amount: 3, unit_price: 25 });
  const saved = Market.importCommerce(JSON.parse(JSON.stringify(Market.exportCommerce(s)))); assert.equal(saved.status, 'VERIFIED'); s = saved.state;
  r = Market.transact(s, { type: 'popup.buy', popup: 'cave_shop', buyer: 'buyer', item: 'metal', amount: 2 }); assert.ok(r.ok); s = r.state;
  assert.equal(r.receipt.outcome.transaction_cut, 0); assert.equal(s.players.seller.balance, 110); assert.equal(s.treasury, 40);
  s = run(s, { type: 'tick', dt: 10 }); assert.equal(s.popups.cave_shop.status, 'expired'); assert.equal(s.players.seller.inventory.metal, 8);
});

test('AI attendant may propose only inside owner bounds; the world still validates settlement', () => {
  let s = opened(); s = run(s, { type: 'popup.open', popup: 'ai_shop', owner: 'seller', location: 'tower-road' }); s = run(s, { type: 'popup.stock', popup: 'ai_shop', item: 'metal', amount: 2, unit_price: 30 });
  s = run(s, { type: 'popup.assign_npc', popup: 'ai_shop', actor: 'npc_merchant', ai_bridge: 'player-local-ai', bounds: { minimum_prices: { metal: 25 } } });
  assert.equal(Market.proposeAITrade(s, { popup: 'ai_shop', buyer: 'buyer', item: 'metal', amount: 1, unit_price: 20 }).status, 'HOLD_OUTSIDE_OWNER_BOUNDS');
  const proposal = Market.proposeAITrade(s, { popup: 'ai_shop', buyer: 'buyer', item: 'metal', amount: 1, unit_price: 25 }); assert.equal(proposal.status, 'PROPOSED_NOT_SETTLED');
  assert.equal(s.players.buyer.inventory.metal, undefined, 'proposal cannot move an item');
  const settled = Market.transact(s, proposal.proposal, 'ai:player-local'); assert.ok(settled.ok); assert.equal(settled.state.players.buyer.inventory.metal, 1); assert.equal(settled.receipt.outcome.unit_price, 25);
});

test('World #1 commerce is ordinary candidate matter with rollback, not a MorphTile default', () => {
  const w = MT.createWorld('World #1'), tile = Market.createCommerceTile(opened()); w.tiles[tile.id] = tile; const ws = MT.createWorkspace(w), before = MT.structHash(ws.live);
  const planned = Market.planCommerceEvent(ws.live.tiles.mt_world1_market, { type: 'popup.open', popup: 'resort_shop', owner: 'seller', location: 'resort' }, 'human'); assert.ok(planned.ok);
  const c = MT.cloneBody(ws); assert.ok(MT.editCandidate(ws, c, planned.op).ok); const receipt = MT.commitPlan(ws, MT.planMerge(ws, [c]).id).receipt;
  assert.equal(Market.commerceFromTile(ws.live.tiles.mt_world1_market).popups.resort_shop.status, 'open'); assert.ok(MT.rollback(ws, receipt.rollback_token).exact); assert.equal(MT.structHash(ws.live), before);
  assert.equal(MT.seedWorld().tiles.mt_world1_market, undefined, 'neutral MorphTile does not impose World #1 commerce');
});
