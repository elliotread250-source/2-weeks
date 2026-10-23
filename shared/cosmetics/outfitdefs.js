// Outfit recipes. 8 starter outfits plus 60 more in 12 archetypes of 5. Every
// name and look is original. A recipe is a palette plus part choices that
// public/js/render/rig.js turns into a character:
//   shirt pants skin hair pack accent gloves   colours
//   hairStyle  head part: short spiky pony cap mohawk helmet knight astro chef
//              ninja robot ears hood tophat crown diver rock
//   bling      back item: pack cape wings sword guitar tank jetpack shell quiver
//              scarf bedroll sack lantern
//   top        torso layer: none jacket armor coat apron vest
//   fx         neon (glowing trims) or shadow (dark, pulsing)

const SKINS = ['#f2c49b', '#c68642', '#f5d0b0', '#8d5524', '#ffdbac', '#e0ac69', '#f1c27d', '#a86b3c'];

// The original eight: kept first so ids outfit_0..7 never change.
const STARTERS = [
  ['Rookie Blue', { shirt: '#2e86de', pants: '#34495e', skin: SKINS[0], hair: '#5b3a1e', pack: '#e67e22', accent: '#f1c40f', gloves: '#2c3e50', hairStyle: 'short', bling: 'pack' }],
  ['Ruby Runner', { shirt: '#e74c3c', pants: '#2c3e50', skin: SKINS[1], hair: '#111111', pack: '#f1c40f', accent: '#ecf0f1', gloves: '#111111', hairStyle: 'spiky', bling: 'cape' }],
  ['Forest Scout', { shirt: '#27ae60', pants: '#6d4c41', skin: SKINS[2], hair: '#d4a017', pack: '#8e44ad', accent: '#f39c12', gloves: '#5d4037', hairStyle: 'pony', bling: 'wings' }],
  ['Violet Vandal', { shirt: '#8e44ad', pants: '#1c2833', skin: SKINS[3], hair: '#222222', pack: '#1abc9c', accent: '#ff6fb5', gloves: '#1c2833', hairStyle: 'cap', bling: 'sword' }],
  ['Amber Ace', { shirt: '#f39c12', pants: '#5d6d7e', skin: SKINS[4], hair: '#b03a2e', pack: '#2e86de', accent: '#2c3e50', gloves: '#7f8c8d', hairStyle: 'mohawk', bling: 'pack' }],
  ['Teal Trooper', { shirt: '#16a085', pants: '#4a235a', skin: SKINS[5], hair: '#3e2723', pack: '#e74c3c', accent: '#f7dc6f', gloves: '#4a235a', hairStyle: 'helmet', bling: 'cape' }],
  ['Snow Strummer', { shirt: '#ecf0f1', pants: '#c0392b', skin: SKINS[6], hair: '#4e342e', pack: '#2c3e50', accent: '#c0392b', gloves: '#c0392b', hairStyle: 'short', bling: 'guitar' }],
  ['Pink Pulse', { shirt: '#ff6fb5', pants: '#283747', skin: SKINS[1], hair: '#f7dc6f', pack: '#58d68d', accent: '#ffffff', gloves: '#ff6fb5', hairStyle: 'pony', bling: 'wings' }],
];

// 12 archetypes: shared part choices, then 5 named colour variants each.
// variant: [name, shirt, pants, accent, extra]
const ARCHETYPES = [
  { key: 'soldier', hairStyle: 'helmet', bling: 'pack', top: 'vest', gloves: '#2b2b2b', hair: '#3a2a1a', pack: '#4b5320', variants: [
    ['Sergeant Flint', '#556b2f', '#3e4a2a', '#c8b560'], ['Corporal Ash', '#6b6f73', '#3d4147', '#d0d0d0'], ['Recon Vale', '#7a6a4f', '#4a4030', '#e0c070'],
    ['Heavy Brick', '#8a3b2e', '#3a2a28', '#f0a050'], ['Night Patrol', '#1f2a3a', '#10161f', '#4fc3f7'] ] },
  { key: 'scientist', hairStyle: 'short', bling: 'pack', top: 'coat', gloves: '#e8e8e8', hair: '#2a2a2a', pack: '#9ad0ec', variants: [
    ['Dr. Quill', '#f2f2f2', '#2c3e50', '#2e86de'], ['Prof. Fizz', '#e8f6ef', '#34495e', '#27ae60'], ['Lab Tech Nia', '#eef0f7', '#4a235a', '#8e44ad'],
    ['Dr. Voltage', '#fff6d6', '#2c3e50', '#f1c40f'], ['Chemist Rue', '#f9e6e6', '#1c2833', '#e74c3c'] ] },
  { key: 'skater', hairStyle: 'cap', bling: 'pack', top: 'jacket', gloves: '#333333', hair: '#6b4423', pack: '#e67e22', variants: [
    ['Kickflip Kai', '#e67e22', '#2e4053', '#f4d03f'], ['Grind Jules', '#3498db', '#17202a', '#ecf0f1'], ['Half-Pipe Pia', '#e91e63', '#34495e', '#fff176'],
    ['Rail Rex', '#2ecc71', '#212f3d', '#f39c12'], ['Neon Nollie', '#6c5ce7', '#0b0c10', '#55efc4'] ] },
  { key: 'knight', hairStyle: 'knight', bling: 'sword', top: 'armor', gloves: '#6b7280', hair: '#222222', pack: '#9aa0a6', variants: [
    ['Sir Rivet', '#9aa0a6', '#5f6368', '#c0392b'], ['Dame Ember', '#c0392b', '#5d4037', '#f5b041'], ['Steel Warden', '#7f8c8d', '#2c3e50', '#2e86de'],
    ['Gilded Paladin', '#d4ac0d', '#7d6608', '#ffffff'], ['Hollow Knight', '#2c2c34', '#16161c', '#a569bd'] ] },
  { key: 'robot', hairStyle: 'robot', bling: 'jetpack', top: 'armor', gloves: '#566573', hair: '#2c3e50', pack: '#85929e', skin: '#aab7b8', variants: [
    ['Unit 7', '#aab7b8', '#566573', '#2e86de'], ['Rusty-9', '#a04000', '#6e2c00', '#f5b041'], ['Chrome Courier', '#d5d8dc', '#7f8c8d', '#e74c3c'],
    ['Glitchbot', '#1abc9c', '#16a085', '#f4d03f'], ['Volt Sentinel', '#2c3e50', '#1b2631', '#58d68d'] ] },
  { key: 'astronaut', hairStyle: 'astro', bling: 'tank', top: 'vest', gloves: '#e8e8e8', hair: '#4a3a2a', pack: '#d0d3d4', variants: [
    ['Orbit Ollie', '#f4f6f7', '#d5d8dc', '#e74c3c'], ['Moon Walker', '#e5e8e8', '#abb2b9', '#3498db'], ['Nebula Pilot', '#6c3483', '#4a235a', '#f5b7b1'],
    ['Solar Scout', '#f39c12', '#b9770e', '#fdebd0'], ['Void Drifter', '#17202a', '#0b0f14', '#76d7c4'] ] },
  { key: 'mascot', hairStyle: 'ears', bling: 'shell', top: 'none', gloves: '#f8f9f9', hair: '#5d4037', pack: '#a1887f', variants: [
    ['Mossback Tortoise', '#6b8e23', '#556b2f', '#d4e157'], ['Glimmer Moth', '#d7bde2', '#8e44ad', '#fff59d'], ['Cinder Fox', '#e67e22', '#ba4a00', '#fdebd0'],
    ['Puddle Frog', '#27ae60', '#1e8449', '#f9e79f'], ['Thunder Yak', '#6e2c00', '#4e342e', '#f4d03f'] ] },
  { key: 'ninja', hairStyle: 'ninja', bling: 'quiver', top: 'jacket', gloves: '#17202a', hair: '#111111', pack: '#4a4a4a', variants: [
    ['Shade Runner', '#1c2833', '#0b0f14', '#c0392b'], ['Ink Blade', '#2c3e50', '#17202a', '#f4f6f7'], ['Crimson Whisper', '#922b21', '#2b0f0d', '#f5b041'],
    ['Frost Shadow', '#5d6d7e', '#2e4053', '#85c1e9'], ['Jade Shuriken', '#196f3d', '#0b3d20', '#abebc6'] ] },
  { key: 'explorer', hairStyle: 'cap', bling: 'bedroll', top: 'vest', gloves: '#6d4c41', hair: '#5b3a1e', pack: '#8d6e63', variants: [
    ['Trailblazer Tess', '#a1887f', '#5d4037', '#f4d03f'], ['Dune Digger', '#e6c07b', '#8d6e63', '#c0392b'], ['Jungle Jack', '#558b2f', '#33691e', '#fff176'],
    ['Cartographer Moe', '#8d6e63', '#37474f', '#ffcc80'], ['Cliff Scaler', '#455a64', '#263238', '#ff7043'] ] },
  { key: 'rocker', hairStyle: 'rock', bling: 'guitar', top: 'jacket', gloves: '#111111', hair: '#d81b60', pack: '#e91e63', variants: [
    ['Riff Raven', '#17202a', '#212f3d', '#e91e63'], ['Neon Strummer', '#6c3483', '#1b2631', '#00e5ff'], ['Punk Pixie', '#e74c3c', '#17202a', '#f4d03f'],
    ['Glam Ghoul', '#4a235a', '#1c1c1c', '#c8e6c9'], ['Bassline Bo', '#1a237e', '#0d1136', '#ffab00'] ] },
  { key: 'chef', hairStyle: 'chef', bling: 'sack', top: 'apron', gloves: '#f2f2f2', hair: '#4e342e', pack: '#bcaaa4', variants: [
    ['Chef Crumb', '#f8f9f9', '#2c3e50', '#e74c3c'], ['Sous Sizzle', '#f5eef8', '#4a235a', '#f39c12'], ['Baker Bun', '#fdf2e9', '#6e2c00', '#f1948a'],
    ['Grill Master Gus', '#fadbd8', '#212f3d', '#d35400'], ['Sushi Sensei', '#e8f8f5', '#1b2631', '#16a085'] ] },
  { key: 'diver', hairStyle: 'diver', bling: 'tank', top: 'vest', gloves: '#1b2631', hair: '#222222', pack: '#f4d03f', variants: [
    ['Reef Rover', '#1abc9c', '#154360', '#f4d03f'], ['Deep Dive Dan', '#2471a3', '#1b2631', '#f7dc6f'], ['Coral Captain', '#ec7063', '#1a5276', '#fdebd0'],
    ['Kelp Keeper', '#229954', '#145a32', '#d4efdf'], ['Abyss Agent', '#1b2631', '#0b0f14', '#00e5ff'] ] },
];

const RARITY_ORDER = [0, 1, 2, 3, 4];

function hueShift(hex, deg) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  h = (h + deg / 360 + 1) % 1;
  const f = (p, q, t) => { t = (t + 1) % 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3);
  return `#${[r, g, b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`;
}

export function buildOutfitDefs() {
  const defs = [];
  STARTERS.forEach(([name, recipe], i) => {
    defs.push({
      id: `outfit_${i}`, name, rarity: 0, series: 'Starter', free: true, recipe: { top: 'none', ...recipe },
      desc: 'Part of your starter set. Everyone begins with it.', styles: [],
    });
  });
  ARCHETYPES.forEach((a, ai) => {
    a.variants.forEach(([name, shirt, pants, accent], vi) => {
      const rarity = RARITY_ORDER[(vi + ai) % 5];
      const recipe = {
        shirt, pants, accent, skin: a.skin || SKINS[(ai * 3 + vi) % SKINS.length], hair: a.hair, pack: a.pack,
        gloves: a.gloves, hairStyle: a.hairStyle, bling: a.bling, top: a.top,
      };
      // Series: glowing trims on some Epics, dark pulsing material on some Legendaries.
      let series = '';
      if (rarity === 3 && (ai + vi) % 2 === 0) { series = 'Neon'; recipe.fx = 'neon'; }
      if (rarity === 4 && (ai + vi) % 2 === 1) { series = 'Shadow'; recipe.fx = 'shadow'; recipe.shirt = '#15151c'; recipe.pants = '#0d0d12'; recipe.gloves = '#0d0d12'; }
      const styles = [];
      if (rarity >= 2) {
        styles.push({ id: 'alt', name: 'Alt Palette', set: { shirt: hueShift(recipe.shirt, 140), pants: hueShift(recipe.pants, 140), accent: hueShift(accent, 140) } });
        styles.push({ id: 'bare', name: 'No Headgear', set: { hairStyle: 'short' } });
      }
      if (rarity >= 3) styles.push({ id: 'bare2', name: 'No Backpiece', set: { bling: 'none' } });
      if (rarity >= 3) styles.push({ id: 'gold', name: 'Gilded', set: { accent: '#ffd700', gloves: '#ffd700' }, unlock: `milestone_${['wins_1', 'kills_50', 'matches_25'][(ai + vi) % 3]}` });
      defs.push({
        id: `outfit_${a.key}_${vi + 1}`, name, rarity, series: series || a.key[0].toUpperCase() + a.key.slice(1),
        customisable: rarity <= 2 && vi % 2 === 0,
        desc: `${name}. A ${a.key} look in ${shirt === '#f2f2f2' ? 'white' : 'bold colour'} with its own attitude.`,
        recipe, styles,
      });
    });
  });
  return defs;
}

// Colours offered when customising an outfit: curated so nothing clashes badly.
export const PALETTE = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#2e86de', '#8e44ad',
  '#ff6fb5', '#ecf0f1', '#95a5a6', '#34495e', '#2c3e50', '#6d4c41', '#d4ac0d', '#111111',
];

export { hueShift };
