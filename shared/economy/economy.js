// Coin rules, in one place so the server, the offline estimator and the end-of-match
// screen all agree. Nothing here touches a database.

export const ECONOMY = {
  elim: 10,
  assist: 4,
  // Best of: placed in the top half, top ten, top three, won.
  placement: { half: 5, top10: 20, top3: 35, win: 100 },
  survivalPerMin: 1,
  survivalCap: 15,
  offlineRate: 0.5, // offline matches pay half, because bots are easier
  offlineDailyCap: 500,
  offlineMinGapS: 60, // two offline results can't be closer than this
  dailyLogin: 25,
};

export function placementBonus(placement, total) {
  const p = ECONOMY.placement;
  if (placement === 1) return p.win;
  if (placement <= 3) return p.top3;
  if (placement <= 10) return p.top10;
  if (placement <= Math.ceil(total / 2)) return p.half;
  return 0;
}

// What a finished match pays. `r` = { placement, total, kills, assists, survivalS }.
export function matchReward(r, offline = false) {
  const parts = {
    eliminations: r.kills * ECONOMY.elim,
    assists: (r.assists || 0) * ECONOMY.assist,
    placement: placementBonus(r.placement, r.total),
    survival: Math.min(ECONOMY.survivalCap, Math.floor(r.survivalS / 60) * ECONOMY.survivalPerMin),
  };
  let total = parts.eliminations + parts.assists + parts.placement + parts.survival;
  if (offline) {
    for (const k of Object.keys(parts)) parts[k] = Math.floor(parts[k] * ECONOMY.offlineRate);
    total = Object.values(parts).reduce((a, b) => a + b, 0);
  }
  return { parts, total };
}

// An offline result comes from the client, so it only counts if it could have happened.
export function plausibleOffline(r) {
  const ints = ['placement', 'total', 'kills', 'assists', 'survivalS'];
  if (!ints.every((k) => Number.isInteger(r[k]) && r[k] >= 0)) return false;
  return r.total >= 2 && r.total <= 100 && r.placement >= 1 && r.placement <= r.total
    && r.kills <= r.total - 1 && r.assists <= r.total && r.survivalS <= 1800
    // you cannot have eliminated people and also placed last, or vice versa
    && !(r.placement === r.total && r.kills > r.total / 2);
}

// Day and week keys. All resets are in UTC so the server and every client agree.
export const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

// Weekly challenges reset Thursday 13:00 UTC; the key is the date of that reset.
export function weekKey(t = Date.now()) {
  const d = new Date(t);
  const THU = 4;
  const back = (d.getUTCDay() - THU + 7) % 7;
  const reset = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back, 13, 0, 0);
  const at = reset > t ? reset - 7 * 86400000 : reset;
  return new Date(at).toISOString().slice(0, 10);
}

export function nextDailyReset(t = Date.now()) {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

export function nextWeeklyReset(t = Date.now()) {
  return Date.parse(`${weekKey(t)}T13:00:00Z`) + 7 * 86400000;
}

// Small string hash for seeding (fnv-1a).
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
