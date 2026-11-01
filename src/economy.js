// Preview economy rules: a daily claim and friend gifts against the demo balance.
export const DAILY_REWARD = 25;
export const GIFT_MIN = 10;
export const GIFT_MAX = 500;
export const dayKey = now => new Date(now).toISOString().slice(0, 10);
export function canClaimDaily(state, now = Date.now()) {
  return state.lastDailyClaim !== dayKey(now);
}
export function claimDaily(state, now = Date.now()) {
  if (!canClaimDaily(state, now)) return { ok: false, error: 'You already claimed today’s Alloy.' };
  state.lastDailyClaim = dayKey(now);
  state.previewAlloy = Math.min(state.previewAlloy + DAILY_REWARD, 1000000000);
  return { ok: true, amount: DAILY_REWARD };
}
export function sendGift(state, name, amount, now = Date.now()) {
  if (!state.friends.includes(name)) return { ok: false, error: 'Gifts go to friends on your list.' };
  if (!Number.isSafeInteger(amount) || amount < GIFT_MIN || amount > GIFT_MAX) return { ok: false, error: `Choose between ${GIFT_MIN} and ${GIFT_MAX} Alloy.` };
  if (state.previewAlloy < amount) return { ok: false, error: 'Your preview balance is too low for that gift.' };
  if (state.gifts.filter(gift => gift.to === name && dayKey(gift.at) === dayKey(now)).length >= 5) return { ok: false, error: 'That friend already received five gifts today.' };
  state.previewAlloy -= amount;
  const gift = { id: `gift-${state.gifts.length + 1}-${amount}`, to: name, amount, at: now };
  state.gifts.push(gift);
  return { ok: true, gift };
}
export const recentGifts = state => state.gifts.slice(-6).reverse();
