// Item icons as SVG path data on a 64x32 grid. The HUD renders them as inline
// SVG; the 3D loot cards draw the same paths onto a canvas with Path2D.
import { RARITIES, CONSUMABLES } from './config.js';

const W = '#ffffff';

export const ICONS = {
  pickaxe: [
    ['M30 9 L35 9 L27 31 L22 31 Z', '#c99a6b'],
    ['M6 12 Q32 -4 58 12 L55 15 Q32 3 9 15 Z', '#bfe8ff'],
    ['M28 5 H37 V11 H28 Z', '#8a96a3'],
  ],
  ar: [
    ['M2 11 L13 11 L15 13 L15 19 L4 22 L2 19 Z M14 10 H45 V18 H14 Z M45 12 H62 V15 H45 Z M30 18 H36 L38 28 H32 Z M20 18 H25 L23 26 H18 Z M24 6 H34 V10 H24 Z', W],
  ],
  pump: [
    ['M2 12 L15 11 L17 18 L4 23 Z M15 10 H31 V18 H15 Z M31 10 H62 V13 H31 Z M31 14 H56 V17 H31 Z M18 18 H23 L21 25 H16 Z', W],
    ['M36 13 H49 V20 H36 Z', '#3b2a1e'],
  ],
  smg: [
    ['M2 10 H10 V12 H4 V16 H10 V18 H2 Z M10 9 H43 V17 H10 Z M43 11 H55 V14 H43 Z M26 17 H32 V30 H26 Z M14 17 H19 L17 25 H12 Z', W],
  ],
  pistol: [
    ['M12 8 H50 V15 H12 Z M15 15 H27 L24 29 H12 Z M27 15 H33 V19 H27 Z', W],
  ],
  sniper: [
    ['M2 12 L17 12 L19 19 L6 23 L2 20 Z M17 12 H39 V18 H17 Z M39 13 H63 V15 H39 Z M24 10 H27 V12 H24 Z M31 10 H34 V12 H31 Z M20 18 H25 L23 25 H18 Z', W],
    ['M19 5 H37 V10 H19 Z', '#9fd8ff'],
  ],
  rocket: [
    ['M4 9 H57 V19 H4 Z M56 7 H63 V21 H56 Z M22 19 H27 L26 27 H21 Z M36 19 H40 V25 H36 Z M28 5 H34 V9 H28 Z', W],
    ['M8 12 H52 V16 H8 Z', '#ffcf6b'],
  ],
  bandage: [
    ['M18 8 H46 V24 H18 Z', W],
    ['M18 13 H46 V15 H18 Z M18 18 H46 V20 H18 Z', '#d9c9b3'],
  ],
  medkit: [
    ['M26 4 H38 V8 H26 Z M16 8 H48 V27 H16 Z', W],
    ['M29 11 H35 V15 H39 V20 H35 V24 H29 V20 H25 V15 H29 Z', '#e74c3c'],
  ],
  minis: [
    ['M28 5 H36 V10 L42 17 Q44 27 32 27 Q20 27 22 17 L28 10 Z', '#7fd0ff'],
    ['M28 3 H36 V6 H28 Z', W],
  ],
  bigpot: [
    ['M26 6 H38 V11 L46 19 Q47 30 32 30 Q17 30 18 19 L26 11 Z', '#3fa6f2'],
    ['M26 2 H38 V7 H26 Z', W],
    ['M22 21 Q32 25 42 21 L41 25 Q32 29 23 25 Z', '#bfe8ff'],
  ],
  chug: [
    ['M20 8 H40 Q48 8 48 17 V29 H16 V17 Q16 8 20 8 Z', '#48c9b0'],
    ['M26 3 H34 V8 H26 Z M48 12 H54 Q57 12 57 16 V22 Q57 25 54 25 H48 V22 H53 V15 H48 Z', W],
    ['M22 18 H42 V22 H22 Z', '#e8fff9'],
  ],
};

export function iconKey(item) {
  if (!item) return 'pickaxe';
  return item.type;
}

export function iconSVG(key, cls = 'icon') {
  const parts = ICONS[key] || [];
  const paths = parts.map(([d, fill]) => `<path d="${d}" fill="${fill}"/>`).join('');
  return `<svg class="${cls}" viewBox="0 0 64 32" aria-hidden="true">${paths}</svg>`;
}

export function drawIcon(ctx, key, x, y, w, h) {
  const parts = ICONS[key] || [];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w / 64, h / 32);
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 1.5;
  for (const [d, fill] of parts) {
    ctx.fillStyle = fill;
    ctx.fill(new Path2D(d));
  }
  ctx.restore();
}

export function itemRarityIndex(item) {
  if (item.kind === 'weapon') return item.rarity;
  if (item.kind === 'consumable') return CONSUMABLES[item.type].rarity;
  return 0;
}

// Rarity card used above loot on the ground.
const cardCache = new Map();
export function itemCardCanvas(item) {
  const r = itemRarityIndex(item);
  const key = `${item.type}:${r}`;
  if (cardCache.has(key)) return cardCache.get(key);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 160;
  const g = c.getContext('2d');
  const rar = RARITIES[r];
  const grad = g.createLinearGradient(0, 0, 0, 160);
  grad.addColorStop(0, rar.color);
  grad.addColorStop(1, rar.dark);
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(8, 8, 240, 144, 18);
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.stroke();
  // Diagonal sheen like Fortnite item tiles.
  g.save();
  g.clip();
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(150, 0); g.lineTo(60, 160); g.lineTo(0, 160);
  g.fill();
  g.restore();
  drawIcon(g, item.type, 28, 30, 200, 100);
  cardCache.set(key, c);
  return c;
}
