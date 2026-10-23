// The item shop. The rotation is a pure function of the date, so every server
// instance (and a test) computes the same shelves and nothing needs syncing.
import { all } from '../cosmetics/catalog.js';
import { Rng } from '../math/util.js';
import { hashStr, dayKey } from './economy.js';

const sellable = () => all().filter((i) => i.shop && !i.free);

// Featured: three Epic-or-better items. Daily: six items across types.
export function rotationFor(day = dayKey()) {
  const rng = new Rng(hashStr(`shop:${day}`));
  const pool = sellable().sort((a, b) => (a.id < b.id ? -1 : 1));
  const take = (list, n) => {
    const out = [];
    const bag = [...list];
    while (out.length < n && bag.length) out.push(bag.splice(Math.floor(rng.random() * bag.length), 1)[0].id);
    return out;
  };
  const featured = take(pool.filter((i) => i.rarity >= 3), 3);
  const rest = pool.filter((i) => !featured.includes(i.id));
  // Make sure the daily shelf always has at least one outfit.
  const outfits = take(rest.filter((i) => i.type === 'outfit' && i.rarity <= 3), 2);
  const others = take(rest.filter((i) => !outfits.includes(i.id) && i.type !== 'outfit'), 4);
  return { day, featured, daily: [...outfits, ...others] };
}

export const inShop = (id, day) => {
  const r = rotationFor(day);
  return r.featured.includes(id) || r.daily.includes(id);
};
