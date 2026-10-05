// Every tunable number in the game lives here. Values are taken from Fortnite
// Battle Royale where a direct equivalent exists, then scaled for a small
// Rebirth Island style map and a ~12 minute match.

// Build grid. Fortnite tiles are 512uu wide x 384uu tall (5.12m x 3.84m).
export const TILE = 5;
export const LEVEL_H = 3.75;
export const BUILD_COST = 10;
export const MAX_MATS = 999;
export const BUILD_RANGE = 1; // tiles in front of the player

export const WATER_LEVEL = 0;
export const WORLD_HALF = 280;

export const PLAYER = {
  radius: 0.45,
  height: 1.85,
  eye: 1.6,
  stepHeight: 0.6,
  runSpeed: 5.6,
  sprintSpeed: 7.4,
  adsSpeed: 3.4,
  healSpeed: 2.8,
  swimSpeed: 3.2,
  jumpVel: 8.6,
  gravity: 24,
  maxHealth: 100,
  maxShield: 100,
  skydiveFall: 26,
  skydiveDive: 42,
  skydiveSpeed: 18,
  glideFall: 6.5,
  glideSpeed: 14,
  autoGlideHeight: 38,
};

export const RARITIES = [
  { id: 0, name: 'Common', color: '#b4b4b4', dark: '#6d6d6d' },
  { id: 1, name: 'Uncommon', color: '#69bb2d', dark: '#2f6d12' },
  { id: 2, name: 'Rare', color: '#3fa6f2', dark: '#1a5c9c' },
  { id: 3, name: 'Epic', color: '#b84fe8', dark: '#622089' },
  { id: 4, name: 'Legendary', color: '#f39a32', dark: '#9a4b0c' },
];

// Per-rarity arrays are [common, uncommon, rare, epic, legendary]. A null
// damage entry means the weapon never rolls at that rarity.
export const WEAPONS = {
  ar: {
    name: 'Assault Rifle', short: 'AR', ammo: 'medium', auto: true,
    damage: [30, 31, 33, 35, 36], fireRate: 5.5, mag: 30,
    reload: [2.7, 2.6, 2.5, 2.4, 2.3], spread: 0.022, adsSpread: 0.008, bloom: 0.006,
    headMult: 1.5, range: 160, structureMult: 1, pellets: 1, zoom: 1.6,
  },
  pump: {
    name: 'Pump Shotgun', short: 'PUMP', ammo: 'shells', auto: false,
    damage: [80, 85, 90, 95, 100], fireRate: 0.75, mag: 5,
    reload: [5.0, 4.8, 4.6, 4.4, 4.2], spread: 0.085, adsSpread: 0.07, bloom: 0,
    headMult: 2.0, range: 45, structureMult: 1, pellets: 10, zoom: 1.2,
  },
  smg: {
    name: 'Submachine Gun', short: 'SMG', ammo: 'light', auto: true,
    damage: [16, 17, 18, 19, 20], fireRate: 11, mag: 30,
    reload: [2.3, 2.2, 2.1, 2.0, 1.9], spread: 0.035, adsSpread: 0.022, bloom: 0.004,
    headMult: 1.75, range: 90, structureMult: 1, pellets: 1, zoom: 1.3,
  },
  pistol: {
    name: 'Pistol', short: 'PISTOL', ammo: 'light', auto: false,
    damage: [24, 25, 26, 27, 28], fireRate: 6.75, mag: 16,
    reload: [1.5, 1.45, 1.4, 1.35, 1.3], spread: 0.02, adsSpread: 0.01, bloom: 0.01,
    headMult: 2.0, range: 90, structureMult: 1, pellets: 1, zoom: 1.3,
  },
  sniper: {
    name: 'Bolt-Action Sniper', short: 'SNIPER', ammo: 'heavy', auto: false,
    damage: [null, null, 105, 110, 116], fireRate: 0.33, mag: 1,
    reload: [3.2, 3.2, 3.0, 2.9, 2.8], spread: 0.12, adsSpread: 0.0, bloom: 0,
    headMult: 2.5, range: 450, structureMult: 0.6, pellets: 1, zoom: 5, scope: true,
  },
  rocket: {
    name: 'Rocket Launcher', short: 'ROCKET', ammo: 'rockets', auto: false,
    damage: [null, null, null, 110, 121], fireRate: 0.75, mag: 1,
    reload: [3.6, 3.6, 3.6, 3.4, 3.2], spread: 0.01, adsSpread: 0.005, bloom: 0,
    headMult: 1, range: 300, structureMult: 4, pellets: 1, zoom: 1.4,
    projectile: { speed: 65, splash: 4.5, structureDamage: 400 },
  },
};

// Pickaxe: 20 to players like Fortnite, 50 to builds, 100 on a weak point.
export const PICKAXE = {
  name: 'Default Pickaxe', short: 'PICK', playerDamage: 20, structureDamage: 50,
  harvestDamage: 50, cooldown: 0.5, range: 2.6,
};

export const CONSUMABLES = {
  bandage: { name: 'Bandages', short: 'BAND', rarity: 0, stack: 15, time: 3.5, health: 15, healthCap: 75, pickup: 5 },
  medkit: { name: 'Med Kit', short: 'MED', rarity: 1, stack: 3, time: 10, health: 100, healthCap: 100, pickup: 1 },
  minis: { name: 'Small Shield Potion', short: 'MINI', rarity: 1, stack: 6, time: 2, shield: 25, shieldCap: 50, pickup: 3 },
  bigpot: { name: 'Shield Potion', short: 'BIG POT', rarity: 2, stack: 3, time: 5, shield: 50, shieldCap: 100, pickup: 1 },
  chug: { name: 'Chug Jug', short: 'CHUG', rarity: 4, stack: 1, time: 15, health: 100, healthCap: 100, shield: 100, shieldCap: 100, pickup: 1 },
};

export const AMMO = {
  light: { name: 'Light Bullets', drop: 18, max: 999, color: '#d9d9d9' },
  medium: { name: 'Medium Bullets', drop: 20, max: 999, color: '#8fd16a' },
  heavy: { name: 'Heavy Bullets', drop: 6, max: 999, color: '#3e7fd9' },
  shells: { name: 'Shells', drop: 6, max: 999, color: '#e0663f' },
  rockets: { name: 'Rockets', drop: 3, max: 99, color: '#7a5a3a' },
};

// Wall vs floor/ramp/cone health from the Fortnite wiki: [start, max, seconds].
export const MATERIALS = {
  wood: { name: 'Wood', wall: [90, 150], other: [84, 140], time: 4 },
  brick: { name: 'Brick', wall: [90, 300], other: [93, 280], time: 11.5 },
  metal: { name: 'Metal', wall: [110, 500], other: [101, 460], time: 24.5 },
};
export const MAT_ORDER = ['wood', 'brick', 'metal'];

// Storm. Rebirth Island is small, so phases are short. Storm damage ignores
// shields and goes straight to health, same as Fortnite.
export const STORM_PHASES = [
  { wait: 75, shrink: 50, damage: 1, radius: 150 },
  { wait: 55, shrink: 45, damage: 1, radius: 95 },
  { wait: 45, shrink: 40, damage: 2, radius: 58 },
  { wait: 40, shrink: 35, damage: 5, radius: 32 },
  { wait: 30, shrink: 30, damage: 8, radius: 15 },
  { wait: 25, shrink: 30, damage: 10, radius: 0 },
];
export const STORM_START_RADIUS = 300;
// Rebirth Island's signature mode: you redeploy after dying while Resurgence
// is live. It switches off when this storm phase begins.
export const RESURGENCE_END_PHASE = 3;
export const RESURGENCE_DELAY = 8;

export const BOT_COUNT = 24;

export const LOOT_WEIGHTS = {
  floor: [40, 30, 18, 9, 3],
  chest: [10, 30, 32, 20, 8],
};
