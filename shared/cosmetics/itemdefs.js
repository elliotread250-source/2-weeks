// Everything that is not an outfit: back blings, pickaxes, gliders, contrails,
// weapon wraps, banners, loading screens. Compact rows, expanded in catalog.js.
// Rarity 0..4 = Common, Uncommon, Rare, Epic, Legendary.

// [name, rarity, kind, colour A, colour B]
export const BACK_BLINGS = [
  ['Trail Pack', 0, 'pack', '#8d6e63', '#f4d03f'], ['Scout Satchel', 0, 'sack', '#a1887f', '#6d4c41'], ['Wool Scarf', 0, 'scarf', '#c0392b', '#f5b7b1'],
  ['Camp Roll', 0, 'bedroll', '#5d6d7e', '#a04000'], ['Tin Lantern', 1, 'lantern', '#7f8c8d', '#f9e79f'], ['Hunter Quiver', 1, 'quiver', '#6e2c00', '#d7ccc8'],
  ['Blue Cape', 1, 'cape', '#2e86de', '#f4d03f'], ['Spare Tank', 1, 'tank', '#2980b9', '#d5d8dc'], ['Moss Shell', 2, 'shell', '#558b2f', '#8bc34a'],
  ['Jet Mini', 2, 'jetpack', '#7f8c8d', '#ff7043'], ['Crimson Cape', 2, 'cape', '#a93226', '#f5b041'], ['Banner Pole', 2, 'flag', '#8e44ad', '#f4d03f'],
  ['Round Shield', 2, 'shield', '#9aa0a6', '#c0392b'], ['Songbird Wings', 2, 'wings', '#f8c471', '#ffffff'], ['Rocker Axe', 3, 'guitar', '#e91e63', '#212121'],
  ['Storm Wings', 3, 'wings', '#5dade2', '#ecf0f1'], ['Ember Jets', 3, 'jetpack', '#e67e22', '#f1c40f'], ['Crystal Shell', 3, 'shell', '#76d7c4', '#e8f8f5'],
  ['Twin Blades', 3, 'sword', '#d6eaf8', '#8e44ad'], ['Orbit Drone', 3, 'drone', '#566573', '#00e5ff'], ['Royal Cape', 3, 'cape', '#6c3483', '#ffd700'],
  ['Night Quiver', 3, 'quiver', '#1b2631', '#a569bd'], ['Deep Tanks', 2, 'tank', '#154360', '#f4d03f'], ['Bronze Shield', 3, 'shield', '#b9770e', '#f9e79f'],
  ['Phoenix Wings', 4, 'wings', '#e74c3c', '#f4d03f'], ['Aurora Cape', 4, 'cape', '#1abc9c', '#8e44ad'], ['Star Drone', 4, 'drone', '#f4d03f', '#ffffff'],
  ['Thunder Pack', 4, 'jetpack', '#2c3e50', '#00e5ff'], ['Dragon Shell', 4, 'shell', '#c0392b', '#ffd700'], ['Sun Blade', 4, 'sword', '#ffd700', '#e67e22'],
  ['Void Banner', 4, 'flag', '#1b1b2f', '#a569bd'],
];

// [name, rarity, head, handle colour, head colour, trim colour]
export const PICKAXES = [
  ['Field Pick', 0, 'pick', '#8d5a3b', '#9ad0ec', '#e9f7ff'], ['Timber Axe', 0, 'axe', '#8d5a3b', '#b0bec5', '#eceff1'], ['Iron Hammer', 0, 'hammer', '#6d4c41', '#78909c', '#cfd8dc'],
  ['Garden Shovel', 0, 'shovel', '#a1887f', '#90a4ae', '#cfd8dc'], ['Candy Hook', 1, 'candy', '#f5f5f5', '#e53935', '#ffffff'], ['Wrench Wrecker', 1, 'wrench', '#455a64', '#e67e22', '#ffcc80'],
  ['Stone Club', 1, 'club', '#6d4c41', '#8d8d8d', '#bdbdbd'], ['Harvest Scythe', 1, 'scythe', '#5d4037', '#b0bec5', '#eceff1'], ['Steel Mallet', 2, 'mallet', '#37474f', '#90a4ae', '#cfd8dc'],
  ['Trident Tip', 2, 'trident', '#1a5276', '#48c9b0', '#d1f2eb'], ['Bone Breaker', 2, 'bone', '#d7ccc8', '#efebe9', '#ffffff'], ['Glow Pick', 2, 'pick', '#1b2631', '#00e5ff', '#e0ffff'],
  ['Sunset Axe', 2, 'axe', '#4e342e', '#ff7043', '#ffe0b2'], ['Gilded Hammer', 3, 'hammer', '#4e342e', '#ffd700', '#fff59d'], ['Crystal Scythe', 3, 'scythe', '#311b92', '#b388ff', '#ede7f6'],
  ['Storm Trident', 3, 'trident', '#0d47a1', '#82b1ff', '#e3f2fd'], ['Frost Pick', 3, 'pick', '#37474f', '#80deea', '#ffffff'], ['Rose Wrench', 3, 'wrench', '#880e4f', '#f48fb1', '#fce4ec'],
  ['Ember Club', 3, 'club', '#3e2723', '#ff5722', '#ffab91'], ['Starfall Shovel', 3, 'shovel', '#1a237e', '#ffd54f', '#fff8e1'], ['Dragon Axe', 4, 'axe', '#212121', '#c0392b', '#ffd700'],
  ['Aurora Pick', 4, 'pick', '#004d40', '#69f0ae', '#e0f2f1'], ['Void Scythe', 4, 'scythe', '#120a2a', '#7c4dff', '#d1c4e9'], ['Solar Hammer', 4, 'hammer', '#bf360c', '#ffeb3b', '#fffde7'],
  ['Prism Mallet', 4, 'mallet', '#263238', '#ea80fc', '#ffffff'],
];

// [name, rarity, shape, colour A, colour B]
export const GLIDERS = [
  ['Standard Wing', 0, 'delta', '#2e86de', '#ffffff'], ['Rain Brolly', 0, 'umbrella', '#e74c3c', '#f4d03f'], ['Paper Kite', 0, 'kite', '#f4d03f', '#e67e22'],
  ['Canvas Sail', 1, 'sail', '#ecf0f1', '#2e86de'], ['Meadow Wing', 1, 'delta', '#27ae60', '#d4efdf'], ['Pennant Flyer', 1, 'banner', '#8e44ad', '#f4d03f'],
  ['Gull Glider', 2, 'wings', '#ecf0f1', '#85c1e9'], ['Manta Ray', 2, 'manta', '#1a5276', '#5dade2'], ['Whirl Rotor', 2, 'rotor', '#e67e22', '#34495e'],
  ['Polka Brolly', 2, 'umbrella', '#e91e63', '#ffffff'], ['Ember Wing', 3, 'delta', '#e74c3c', '#f4d03f'], ['Aurora Sail', 3, 'sail', '#1abc9c', '#8e44ad'],
  ['Storm Manta', 3, 'manta', '#34495e', '#00e5ff'], ['Phoenix Kite', 3, 'kite', '#e67e22', '#c0392b'], ['Royal Banner', 3, 'banner', '#6c3483', '#ffd700'],
  ['Skylark Wings', 4, 'wings', '#f8c471', '#ffffff'], ['Void Manta', 4, 'manta', '#120a2a', '#a569bd'], ['Sun Rotor', 4, 'rotor', '#ffd700', '#e67e22'],
  ['Prism Wing', 4, 'delta', '#b388ff', '#69f0ae'], ['Starlit Brolly', 4, 'umbrella', '#1a237e', '#ffd54f'],
];

// [name, rarity, pattern, colour A, colour B]  (trail behind you while skydiving)
export const CONTRAILS = [
  ['Cloud Wisp', 0, 'smoke', '#ffffff', '#cfd8dc'], ['Rose Ribbon', 1, 'ribbon', '#f48fb1', '#ffffff'], ['Bubble Stream', 1, 'bubbles', '#81d4fa', '#ffffff'],
  ['Ember Sparks', 2, 'sparks', '#ff7043', '#ffe082'], ['Mint Ribbon', 2, 'ribbon', '#69f0ae', '#e0f2f1'], ['Heart Trail', 2, 'hearts', '#ff4081', '#f8bbd0'],
  ['Star Dust', 3, 'stars', '#ffd54f', '#fff8e1'], ['Violet Smoke', 3, 'smoke', '#7e57c2', '#d1c4e9'], ['Lightning Line', 3, 'sparks', '#00e5ff', '#ffffff'],
  ['Rainbow Ribbon', 4, 'ribbon', '#ff5252', '#448aff'], ['Galaxy Trail', 4, 'stars', '#7c4dff', '#18ffff'], ['Gold Rush', 4, 'sparks', '#ffd700', '#ff6f00'],
];

// [name, rarity, kind, colour A, colour B]  (applied to every weapon you carry)
export const WRAPS = [
  ['Plain Steel', 0, 'solid', '#6c7a89', '#aab7b8'], ['Forest Camo', 0, 'camo', '#4b5320', '#2f3b14'], ['Desert Camo', 1, 'camo', '#c2a878', '#8d6e4a'],
  ['Racing Stripes', 1, 'stripes', '#e74c3c', '#ffffff'], ['Checker Flag', 1, 'checker', '#212121', '#f5f5f5'], ['Sky Gradient', 2, 'gradient', '#4fc3f7', '#e1f5fe'],
  ['Sunset Gradient', 2, 'gradient', '#ff7043', '#ffd54f'], ['Polka Dots', 2, 'dots', '#e91e63', '#ffffff'], ['Circuit Board', 2, 'circuit', '#1b5e20', '#76ff03'],
  ['Arctic Camo', 2, 'camo', '#cfd8dc', '#90a4ae'], ['Flame Job', 3, 'flames', '#ff5722', '#ffeb3b'], ['Neon Grid', 3, 'circuit', '#0d0d1a', '#00e5ff'],
  ['Violet Stripes', 3, 'stripes', '#7c4dff', '#ede7f6'], ['Tiger Stripes', 3, 'stripes', '#ff9800', '#212121'], ['Gold Plate', 4, 'solid', '#ffd700', '#fff59d'],
  ['Galaxy Swirl', 4, 'gradient', '#311b92', '#e040fb'], ['Obsidian', 4, 'solid', '#0d0d12', '#7c4dff'], ['Rainbow Dots', 3, 'dots', '#448aff', '#ffeb3b'],
  ['Holo Foil', 4, 'gradient', '#18ffff', '#ea80fc'], ['Lava Flow', 4, 'flames', '#b71c1c', '#ff9100'],
];

// [name, rarity, shape, colour A, colour B, icon]
export const BANNERS = [
  ['Blue Star', 0, 'flag', '#2e86de', '#1b4f8a', 'star'], ['Red Bolt', 0, 'flag', '#e74c3c', '#922b21', 'bolt'], ['Green Leaf', 0, 'round', '#27ae60', '#145a32', 'leaf'],
  ['Gold Crown', 1, 'shield', '#f4d03f', '#9a7d0a', 'crown'], ['Purple Moon', 1, 'pennant', '#8e44ad', '#4a235a', 'moon'], ['Orange Flame', 1, 'flag', '#e67e22', '#a04000', 'flame'],
  ['Teal Wave', 1, 'round', '#1abc9c', '#0e6655', 'wave'], ['Pink Heart', 1, 'shield', '#ff6fb5', '#b0306e', 'heart'], ['Steel Skull', 2, 'shield', '#7f8c8d', '#2c3e50', 'skull'],
  ['Sun Burst', 2, 'round', '#f1c40f', '#d35400', 'sun'], ['Night Owl', 2, 'pennant', '#1b2631', '#5d6d7e', 'owl'], ['Frost Flake', 2, 'flag', '#85c1e9', '#2874a6', 'flake'],
  ['Dragon Claw', 2, 'shield', '#c0392b', '#1b1b1b', 'claw'], ['Lucky Clover', 2, 'round', '#2ecc71', '#186a3b', 'clover'], ['Thunder Fist', 3, 'shield', '#2980b9', '#f4d03f', 'fist'],
  ['Cosmic Eye', 3, 'round', '#6c3483', '#00e5ff', 'eye'], ['Royal Lion', 3, 'pennant', '#b9770e', '#ffd700', 'lion'], ['Neon Arrow', 3, 'flag', '#212121', '#00e676', 'arrow'],
  ['Storm Cloud', 3, 'round', '#566573', '#85c1e9', 'cloud'], ['Ruby Gem', 3, 'shield', '#e91e63', '#880e4f', 'gem'], ['Golden Wing', 4, 'shield', '#ffd700', '#ff6f00', 'wing'],
  ['Void Eye', 4, 'round', '#120a2a', '#d500f9', 'eye'], ['Phoenix Rise', 4, 'pennant', '#ff5722', '#ffd54f', 'flame'], ['Diamond King', 4, 'shield', '#18ffff', '#0277bd', 'crown'],
  ['Silver Blade', 2, 'flag', '#cfd8dc', '#455a64', 'blade'], ['Jade Dragon', 3, 'pennant', '#00695c', '#69f0ae', 'claw'], ['Copper Gear', 1, 'round', '#b87333', '#6e3b12', 'gear'],
  ['Cherry Bloom', 2, 'round', '#f8bbd0', '#c2185b', 'flower'], ['Midnight Wolf', 3, 'shield', '#0d1b2a', '#778da9', 'wolf'], ['Rainbow Arc', 4, 'flag', '#7c4dff', '#ff5252', 'arc'],
];

// [name, rarity, colour A, colour B, tagline]
export const LOADING_SCREENS = [
  ['Island Dawn', 0, '#ffb26b', '#2a5298', 'First light on the island.'], ['Storm Front', 1, '#434343', '#a64dff', 'The eye is closing in.'], ['Harbor Lights', 1, '#0f2027', '#2c7a9b', 'Night shift at the docks.'],
  ['Green Meadow', 0, '#a8e063', '#56ab2f', 'Soft grass, hard fights.'], ['Neon City Rain', 2, '#0f0c29', '#ff00cc', 'The glow never sleeps.'], ['Desert Noon', 2, '#f2994a', '#f2c94c', 'Hot sand, quick feet.'],
  ['Frozen Peak', 2, '#83a4d4', '#b6fbff', 'Cold air, clear shots.'], ['Crimson Sky', 3, '#cb2d3e', '#ef473a', 'Red sky at night.'], ['Aurora Night', 3, '#0b486b', '#f56217', 'Lights over the lake.'],
  ['Golden Hour', 4, '#fceabb', '#f8b500', 'The last circle glows.'],
];

// Emote rarities and prices by clip id 1..25 (names live in names.js).
export const EMOTE_RARITY = [0, 1, 1, 2, 0, 2, 2, 1, 1, 1, 1, 0, 3, 1, 2, 2, 3, 2, 1, 2, 3, 2, 2, 2, 3];
export const EMOTE_IDS = [
  'emote_wave', 'emote_dance_basic', 'emote_pogo_hop', 'emote_flex', 'emote_clap', 'emote_spin_cycle', 'emote_robot_march', 'emote_salute', 'emote_bow',
  'emote_thinker', 'emote_jumping_jacks', 'emote_shrug', 'emote_victory_pose', 'emote_slow_clap', 'emote_hip_roll', 'emote_windmill', 'emote_glide_step',
  'emote_cheer', 'emote_stretch', 'emote_shadow_box', 'emote_conductor', 'emote_heart_hands', 'emote_point_laugh', 'emote_squat_pump', 'emote_rock_out',
];
