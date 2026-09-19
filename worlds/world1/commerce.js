'use strict';

// World #1 policy module. It uses MorphTile matter and merge/rollback machinery, but none of
// these fees or market rules are MorphTile defaults.
const MT = require('../../core/morphtile.js');

const positiveInt = (v, name) => { if (!Number.isSafeInteger(v) || v <= 0) throw new Error(name + ' must be a positive integer'); return v; };
const id = (v, name) => { if (typeof v !== 'string' || !/^[A-Za-z0-9_-]+$/.test(v)) throw new Error(name + ' needs a plain id'); return v; };
const fee = (amount, bps) => Math.ceil(amount * bps / 10000);
const stock = (bag, item, amount) => { bag[item] = (bag[item] || 0) + amount; if (!bag[item]) delete bag[item]; };
const take = (bag, item, amount) => { if ((bag[item] || 0) < amount) throw new Error('not enough ' + item); stock(bag, item, -amount); };
const player = (s, who) => s.players[id(who, 'player')] || (() => { throw new Error('no player ' + who); })();
const summary = (s) => ({ active_auctions: Object.values(s.auctions).filter((x) => x.status === 'open').length, active_popups: Object.values(s.popups).filter((x) => x.status === 'open').length, treasury: s.treasury, revision: s.revision });
const stateHash = (s) => { const x = MT.clone(s); delete x.receipts; return MT.hashOf(x); };

function createCommerceState(options) {
  options = options || {};
  return { format: 'morphtile-world1-commerce', version: '0.1', time: 0, revision: 0,
    config: { auction_buyer_fee_bps: options.auction_buyer_fee_bps == null ? 1200 : options.auction_buyer_fee_bps,
      auction_seller_fee_bps: options.auction_seller_fee_bps == null ? 1200 : options.auction_seller_fee_bps,
      popup_deploy_cost: options.popup_deploy_cost == null ? 40 : options.popup_deploy_cost,
      popup_duration: options.popup_duration == null ? 86400 : options.popup_duration },
    players: {}, auctions: {}, popups: {}, treasury: 0, receipts: [] };
}

function expire(next) {
  for (const shop of Object.values(next.popups)) if (shop.status === 'open' && next.time >= shop.expires_at) {
    const owner = player(next, shop.owner); for (const item of Object.keys(shop.inventory)) stock(owner.inventory, item, shop.inventory[item]);
    shop.inventory = {}; shop.status = 'expired'; shop.expired_at = next.time;
  }
  for (const listing of Object.values(next.auctions)) if (listing.status === 'open' && listing.expires_at != null && next.time >= listing.expires_at) {
    stock(player(next, listing.seller).inventory, listing.item, listing.remaining); listing.remaining = 0; listing.status = 'expired';
  }
}

function applyRaw(next, event) {
  switch (event.type) {
    case 'player.open': {
      const who = id(event.player, 'player'); if (next.players[who]) throw new Error('player exists: ' + who);
      const balance = event.balance == null ? 0 : event.balance; if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('balance must be a non-negative integer');
      const inventory = {}; for (const k of Object.keys(event.inventory || {})) inventory[id(k, 'item')] = positiveInt(event.inventory[k], 'inventory amount');
      next.players[who] = { id: who, balance, inventory }; break;
    }
    case 'auction.list': {
      const listing = id(event.listing, 'listing'), seller = player(next, event.seller), item = id(event.item, 'item'), amount = positiveInt(event.amount, 'amount'), unit = positiveInt(event.unit_price, 'unit_price');
      if (next.auctions[listing]) throw new Error('listing exists: ' + listing); take(seller.inventory, item, amount);
      next.auctions[listing] = { id: listing, seller: seller.id, item, remaining: amount, unit_price: unit, status: 'open', expires_at: event.expires_at == null ? null : event.expires_at }; break;
    }
    case 'auction.buy': {
      const listing = next.auctions[event.listing]; if (!listing || listing.status !== 'open') throw new Error('auction is not open');
      const buyer = player(next, event.buyer), seller = player(next, listing.seller), amount = positiveInt(event.amount, 'amount'); if (listing.remaining < amount) throw new Error('not enough listed stock');
      const gross = listing.unit_price * amount, buyer_fee = fee(gross, next.config.auction_buyer_fee_bps), seller_fee = fee(gross, next.config.auction_seller_fee_bps), due = gross + buyer_fee;
      if (buyer.balance < due) throw new Error('buyer cannot cover price and auction fee');
      buyer.balance -= due; seller.balance += gross - seller_fee; next.treasury += buyer_fee + seller_fee; stock(buyer.inventory, listing.item, amount); listing.remaining -= amount; if (!listing.remaining) listing.status = 'sold';
      return { layer: 'auction', gross, buyer_fee, seller_fee, transaction_cut: buyer_fee + seller_fee };
    }
    case 'direct.trade': {
      if (!event.location) throw new Error('direct trade requires a physical world location');
      if (!Array.isArray(event.present) || !event.present.includes(event.seller) || !event.present.includes(event.buyer)) throw new Error('direct trade requires both parties to be present');
      const seller = player(next, event.seller), buyer = player(next, event.buyer), item = id(event.item, 'item'), amount = positiveInt(event.amount, 'amount'), price = positiveInt(event.price, 'price');
      take(seller.inventory, item, amount); if (buyer.balance < price) throw new Error('buyer cannot cover price'); buyer.balance -= price; seller.balance += price; stock(buyer.inventory, item, amount);
      return { layer: 'physical', location: event.location, gross: price, transaction_cut: 0 };
    }
    case 'popup.open': {
      const popup = id(event.popup, 'popup'), owner = player(next, event.owner); if (next.popups[popup]) throw new Error('popup exists: ' + popup); if (!event.location) throw new Error('popup requires a world location');
      const cost = next.config.popup_deploy_cost; if (owner.balance < cost) throw new Error('owner cannot cover popup deployment'); owner.balance -= cost; next.treasury += cost;
      next.popups[popup] = { id: popup, owner: owner.id, location: event.location, opened_at: next.time, expires_at: next.time + (event.duration == null ? next.config.popup_duration : positiveInt(event.duration, 'duration')), status: 'open', inventory: {}, prices: {}, attendant: null };
      return { layer: 'popup', infrastructure_cost: cost, transaction_cut: 0 };
    }
    case 'popup.stock': {
      const shop = next.popups[event.popup]; if (!shop || shop.status !== 'open') throw new Error('popup is not open'); const owner = player(next, shop.owner), item = id(event.item, 'item'), amount = positiveInt(event.amount, 'amount');
      take(owner.inventory, item, amount); stock(shop.inventory, item, amount); shop.prices[item] = positiveInt(event.unit_price, 'unit_price'); break;
    }
    case 'popup.buy': {
      const shop = next.popups[event.popup]; if (!shop || shop.status !== 'open' || next.time >= shop.expires_at) throw new Error('popup is not open');
      const buyer = player(next, event.buyer), owner = player(next, shop.owner), item = id(event.item, 'item'), amount = positiveInt(event.amount, 'amount'); if ((shop.inventory[item] || 0) < amount) throw new Error('not enough popup stock');
      const listed = positiveInt(shop.prices[item], 'unit_price'); let unit = listed;
      if (event.quoted_unit_price != null) {
        const minimum = shop.attendant && ((shop.attendant.bounds.minimum_prices || {})[item] || listed);
        if (!shop.attendant || !shop.attendant.ai_bridge || event.quoted_unit_price < minimum || event.quoted_unit_price > listed) throw new Error('quoted price is outside the owner-authorized AI bounds');
        unit = positiveInt(event.quoted_unit_price, 'quoted_unit_price');
      }
      const gross = unit * amount; if (buyer.balance < gross) throw new Error('buyer cannot cover price'); buyer.balance -= gross; owner.balance += gross; take(shop.inventory, item, amount); stock(buyer.inventory, item, amount);
      return { layer: 'popup', gross, unit_price: unit, infrastructure_cost_already_paid: next.config.popup_deploy_cost, transaction_cut: 0 };
    }
    case 'popup.assign_npc': {
      const shop = next.popups[event.popup]; if (!shop || shop.status !== 'open') throw new Error('popup is not open'); shop.attendant = { actor: id(event.actor, 'actor'), ai_bridge: event.ai_bridge || null, bounds: MT.clone(event.bounds || {}) }; break;
    }
    case 'tick': next.time = event.to == null ? next.time + positiveInt(event.dt, 'dt') : event.to; if (!Number.isSafeInteger(next.time) || next.time < 0) throw new Error('time must be a non-negative integer'); expire(next); break;
    default: throw new Error('unknown commerce event: ' + event.type);
  }
  return null;
}

function transact(state, event, by) {
  try {
    if (!state || state.format !== 'morphtile-world1-commerce') throw new Error('not World #1 commerce state');
    if (event.expected_revision != null && event.expected_revision !== state.revision) return { ok: false, status: 'HOLD_STALE_REVISION', expected: event.expected_revision, actual: state.revision };
    const before = stateHash(state), next = MT.clone(state), outcome = applyRaw(next, MT.clone(event)); next.revision++;
    const receipt = { seq: next.revision, by: by || 'human', event: MT.clone(event), event_sha256: MT.hashOf(event), before, after: stateHash(next), outcome: outcome || { status: 'APPLIED' } };
    next.receipts.push(receipt); return { ok: true, status: 'APPLIED', state: next, receipt };
  } catch (e) { return { ok: false, status: 'HOLD_INVALID_TRANSACTION', detail: e.message }; }
}

function proposeAITrade(state, request) {
  const shop = state.popups[request.popup]; if (!shop || shop.status !== 'open' || !shop.attendant || !shop.attendant.ai_bridge) return { status: 'HOLD_NO_AI_ATTENDANT' };
  const item = request.item, amount = request.amount, listed = shop.prices[item], minimum = (shop.attendant.bounds.minimum_prices || {})[item] || listed;
  if (!listed || !Number.isSafeInteger(amount) || amount <= 0 || (shop.inventory[item] || 0) < amount) return { status: 'HOLD_UNAVAILABLE' };
  const offered = request.unit_price == null ? listed : request.unit_price;
  if (offered < minimum || offered > listed) return { status: 'HOLD_OUTSIDE_OWNER_BOUNDS', minimum, listed };
  return { status: 'PROPOSED_NOT_SETTLED', proposal: { type: 'popup.buy', popup: shop.id, buyer: request.buyer, item, amount, expected_revision: state.revision, quoted_unit_price: offered }, authority: 'world validation still required' };
}

function exportCommerce(state) { return { format: 'morphtile-world1-commerce-save', version: '0.1', state: MT.clone(state), expect: { sha256: MT.hashOf(state), revision: state.revision } }; }
function importCommerce(data) {
  if (!data || data.format !== 'morphtile-world1-commerce-save' || !data.state) return { ok: false, status: 'HOLD_NOT_COMMERCE_SAVE' };
  const observed = MT.hashOf(data.state); if (!data.expect || data.expect.sha256 !== observed) return { ok: false, status: 'HOLD_HASH_MISMATCH', claimed: data.expect && data.expect.sha256, observed };
  return { ok: true, status: 'VERIFIED', state: MT.clone(data.state) };
}

function createCommerceTile(state) {
  const s = MT.clone(state), sums = summary(s);
  return MT.createTile({ id: 'mt_world1_market', name: 'World #1 player markets', form_hints: ['ui_panel', 'website', 'tool'],
    view: { title: 'Player markets', body: [{ value: 'active_auctions', label: 'Auctions' }, { value: 'active_popups', label: 'Popups' }, { value: 'treasury', label: 'Infrastructure pool' }, { text: 'Convenience has a price. People make markets.' }] },
    facets: { mesh: { type: 'primitive', source: null, data: { shape: 'box', size: [1, 1, 1] } }, logic: { type: 'rule', data: { vars: sums, rules: [], commerce: s } }, connect: { sockets: [], bridges: [], place: [0, 0, 0] } } });
}
function commerceFromTile(tile) { const s = tile && tile.facets && tile.facets.logic && tile.facets.logic.data && tile.facets.logic.data.commerce; if (!s) throw new Error('tile has no World #1 commerce matter'); return MT.clone(s); }
function planCommerceEvent(tile, event, by) {
  const result = transact(commerceFromTile(tile), event, by); if (!result.ok) return result;
  const logic = MT.clone(tile.facets.logic), sums = summary(result.state); logic.data.commerce = result.state; logic.data.vars = sums;
  return Object.assign(result, { op: { op: 'facet.swap', id: tile.id, facet: 'logic', value: logic } });
}

module.exports = { createCommerceState, transact, proposeAITrade, exportCommerce, importCommerce, createCommerceTile, commerceFromTile, planCommerceEvent, stateHash, summary };
