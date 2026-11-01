// Trade offers are preview records between preview friends; nothing is sent.
export const TRADE_LIMIT = 10;
const validId = value => typeof value === 'string' && /^[\w-]{1,64}$/.test(value);
export const pendingTrades = state => state.tradeOffers.filter(offer => offer.status === 'pending');
export function proposeTrade(state, name, offer, now = Date.now()) {
  if (!state.friends.includes(name)) return { ok: false, error: 'Trades are between friends.' };
  if (state.blocked.includes(name)) return { ok: false, error: 'Unblock this person first.' };
  if (pendingTrades(state).filter(offer => offer.direction === 'out').length >= TRADE_LIMIT) return { ok: false, error: 'You have the maximum number of pending trades.' };
  const alloy = Number(offer.alloy) || 0;
  if (!Number.isSafeInteger(alloy) || alloy < 0 || alloy > 1000000) return { ok: false, error: 'Enter an Alloy amount between 0 and 1,000,000.' };
  if (alloy > state.previewAlloy) return { ok: false, error: 'Your preview balance is too low for that offer.' };
  const item = offer.item && state.savedAssets.includes(offer.item) ? offer.item : '';
  if (!alloy && !item) return { ok: false, error: 'Offer Alloy, an accessory, or both.' };
  if (pendingTrades(state).some(open => open.counterpart === name && open.alloy === alloy && open.item === item)) return { ok: false, error: 'That offer is already pending with this friend.' };
  state.tradeOffers.push({ id: `trade-${state.tradeOffers.length + 1}-${alloy}`, direction: 'out', counterpart: name, alloy, item, status: 'pending', at: now });
  return { ok: true };
}
export function cancelTrade(state, id) {
  const offer = state.tradeOffers.find(entry => entry.id === id && entry.status === 'pending');
  if (!offer) return false;
  offer.status = 'cancelled';
  return true;
}
export function acceptTrade(state, id, now = Date.now()) {
  const offer = state.tradeOffers.find(entry => entry.id === id && entry.status === 'pending');
  if (!offer || offer.direction !== 'in') return false;
  if (offer.alloy) state.previewAlloy = Math.min(state.previewAlloy + offer.alloy, 1000000000);
  if (validId(offer.item) && !state.savedAssets.includes(offer.item)) state.savedAssets = [...state.savedAssets, offer.item].slice(0, 200);
  offer.status = 'accepted';
  offer.at = now;
  return true;
}
