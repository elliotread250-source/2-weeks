// Every tunable number in the game lives here. Values are taken from Fortnite
// Battle Royale where a direct equivalent exists, then scaled for a small
// Rebirth Island style map and a ~12 minute match. Player-facing strings are
// in names.js.
import {
  WEAPON_NAMES, WEAPON_SHORT, CONSUMABLE_NAMES, CONSUMABLE_SHORT, AMMO_NAMES, MATERIAL_NAMES,
  PICKAXE_NAME, RARITY_NAMES,
} from './names.js';

// Simulation rate. The renderer interpolates between ticks.
export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;

// Build grid. Fortnite tiles are 512uu wide x 384uu tall (5.12m x 3.84m).
export const TILE = 5;
export const LEVEL_H = 3.75;
export const BUILD_COST = 10;
export const MAX_MATS = 999;
export const BUILD_RANGE = 1; // tiles in front of the player

export const WATER_LEVEL = 0;
export const WORLD_HALF = 420;

export const PLAYER = {
  radius: 0.45,
  height: 1.85,
  eye: 1.6,
  stepHeight: 0.6,
  runSpeed: 5.6,
  sprintSpeed: 7.4,
  adsSpeed: 3.4,
  healSpeed: 2.8,
  crouchSpeed: 3.0,
  crouchHeight: 1.35, // hit volume height while crouched
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
  { id: 0, name: RARITY_NAMES[0], color: '#b4b4b4', dark: '#6d6d6d' },
  { id: 1, name: RARITY_NAMES[1], color: '#69bb2d', dark: '#2f6d12' },
  { id: 2, name: RARITY_NAMES[2], color: '#3fa6f2', dark: '#1a5c9c' },
  { id: 3, name: RARITY_NAMES[3], color: '#b84fe8', dark: '#622089' },
  { id: 4, name: RARITY_NAMES[4], color: '#f39a32', dark: '#9a4b0c' },
];

// Per-rarity arrays are [common, uncommon, rare, epic, legendary]. A null
// damage entry means the weapon never rolls at that rarity.
export const WEAPONS = {
  ar: {
    name: WEAPON_NAMES.ar, short: WEAPON_SHORT.ar, ammo: 'medium', auto: true,
    damage: [30, 31, 33, 35, 36], fireRate: 5.5, mag: 30,
    reload: [2.7, 2.6, 2.5, 2.4, 2.3], spread: 0.022, adsSpread: 0.008, bloom: 0.006,
    headMult: 1.5, range: 160, structureMult: 1, pellets: 1, zoom: 1.6, recoil: { pitch: 0.011, yaw: 0.004 },
  },
  pump: {
    name: WEAPON_NAMES.pump, short: WEAPON_SHORT.pump, ammo: 'shells', auto: false,
    damage: [80, 85, 90, 95, 100], fireRate: 0.75, mag: 5,
    reload: [5.0, 4.8, 4.6, 4.4, 4.2], spread: 0.085, adsSpread: 0.07, bloom: 0,
    headMult: 2.0, range: 45, structureMult: 1, pellets: 10, zoom: 1.2, recoil: { pitch: 0.06, yaw: 0.01 },
  },
  smg: {
    name: WEAPON_NAMES.smg, short: WEAPON_SHORT.smg, ammo: 'light', auto: true,
    damage: [16, 17, 18, 19, 20], fireRate: 11, mag: 30,
    reload: [2.3, 2.2, 2.1, 2.0, 1.9], spread: 0.035, adsSpread: 0.022, bloom: 0.004,
    headMult: 1.75, range: 90, structureMult: 1, pellets: 1, zoom: 1.3, recoil: { pitch: 0.007, yaw: 0.005 },
  },
  pistol: {
    name: WEAPON_NAMES.pistol, short: WEAPON_SHORT.pistol, ammo: 'light', auto: false,
    damage: [24, 25, 26, 27, 28], fireRate: 6.75, mag: 16,
    reload: [1.5, 1.45, 1.4, 1.35, 1.3], spread: 0.02, adsSpread: 0.01, bloom: 0.01,
    headMult: 2.0, range: 90, structureMult: 1, pellets: 1, zoom: 1.3, recoil: { pitch: 0.02, yaw: 0.004 },
  },
  sniper: {
    name: WEAPON_NAMES.sniper, short: WEAPON_SHORT.sniper, ammo: 'heavy', auto: false,
    damage: [null, null, 105, 110, 116], fireRate: 0.33, mag: 1,
    reload: [3.2, 3.2, 3.0, 2.9, 2.8], spread: 0.12, adsSpread: 0.0, bloom: 0,
    headMult: 2.5, range: 450, structureMult: 0.6, pellets: 1, zoom: 5, scope: true, recoil: { pitch: 0.07, yaw: 0.005 },
  },
  rocket: {
    name: WEAPON_NAMES.rocket, short: WEAPON_SHORT.rocket, ammo: 'rockets', auto: false,
    damage: [null, null, null, 110, 121], fireRate: 0.75, mag: 1,
    reload: [3.6, 3.6, 3.6, 3.4, 3.2], spread: 0.01, adsSpread: 0.005, bloom: 0,
    headMult: 1, range: 300, structureMult: 4, pellets: 1, zoom: 1.4,
    projectile: { speed: 65, splash: 4.5, structureDamage: 400 }, recoil: { pitch: 0.05, yaw: 0 },
  },
  // Semi-auto shotgun: faster than the pump, weaker per shell.
  tac: {
    name: WEAPON_NAMES.tac, short: WEAPON_SHORT.tac, ammo: 'shells', auto: false,
    damage: [66, 70, 73, 77, 80], fireRate: 2.0, mag: 8,
    reload: [6.2, 5.9, 5.6, 5.3, 5.0], spread: 0.09, adsSpread: 0.075, bloom: 0,
    headMult: 1.75, range: 40, structureMult: 1, pellets: 10, zoom: 1.2, recoil: { pitch: 0.035, yaw: 0.008 },
  },
  // Three-round burst. fireRate counts bursts per second.
  burst: {
    name: WEAPON_NAMES.burst, short: WEAPON_SHORT.burst, ammo: 'medium', auto: false, burst: { shots: 3, gap: 0.085 },
    damage: [28, 29, 31, 32, 34], fireRate: 2.3, mag: 30,
    reload: [2.9, 2.8, 2.7, 2.6, 2.5], spread: 0.018, adsSpread: 0.006, bloom: 0.004,
    headMult: 1.5, range: 180, structureMult: 1, pellets: 1, zoom: 1.8, recoil: { pitch: 0.012, yaw: 0.003 },
  },
  // Slow, precise, no scope overlay: rewards aim over volume.
  dmr: {
    name: WEAPON_NAMES.dmr, short: WEAPON_SHORT.dmr, ammo: 'medium', auto: false,
    damage: [null, 40, 42, 44, 46], fireRate: 2.6, mag: 20,
    reload: [null, 3.0, 2.9, 2.8, 2.7], spread: 0.03, adsSpread: 0.002, bloom: 0.012,
    headMult: 2.2, range: 300, structureMult: 0.8, pellets: 1, zoom: 3, recoil: { pitch: 0.03, yaw: 0.004 },
  },
  revolver: {
    name: WEAPON_NAMES.revolver, short: WEAPON_SHORT.revolver, ammo: 'medium', auto: false,
    damage: [54, 57, 60, 63, 66], fireRate: 1.6, mag: 6,
    reload: [3.6, 3.5, 3.4, 3.3, 3.2], spread: 0.018, adsSpread: 0.004, bloom: 0.02,
    headMult: 2.4, range: 120, structureMult: 1, pellets: 1, zoom: 1.5, recoil: { pitch: 0.045, yaw: 0.006 },
  },
};

// Pickaxe: 20 to players like Fortnite, 50 to builds, 100 on a weak point.
export const PICKAXE = {
  name: PICKAXE_NAME, short: 'PICK', playerDamage: 20, structureDamage: 50,
  harvestDamage: 50, cooldown: 0.5, range: 2.6,
};

export const CONSUMABLES = {
  bandage: { name: CONSUMABLE_NAMES.bandage, short: CONSUMABLE_SHORT.bandage, rarity: 0, stack: 15, time: 3.5, health: 15, healthCap: 75, pickup: 5 },
  medkit: { name: CONSUMABLE_NAMES.medkit, short: CONSUMABLE_SHORT.medkit, rarity: 1, stack: 3, time: 10, health: 100, healthCap: 100, pickup: 1 },
  minis: { name: CONSUMABLE_NAMES.minis, short: CONSUMABLE_SHORT.minis, rarity: 1, stack: 6, time: 2, shield: 25, shieldCap: 50, pickup: 3 },
  bigpot: { name: CONSUMABLE_NAMES.bigpot, short: CONSUMABLE_SHORT.bigpot, rarity: 2, stack: 3, time: 5, shield: 50, shieldCap: 100, pickup: 1 },
  grenade: { name: CONSUMABLE_NAMES.grenade, short: CONSUMABLE_SHORT.grenade, rarity: 1, stack: 6, time: 0, pickup: 3, throw: true },
  chug: { name: CONSUMABLE_NAMES.chug, short: CONSUMABLE_SHORT.chug, rarity: 4, stack: 1, time: 15, health: 100, healthCap: 100, shield: 100, shieldCap: 100, pickup: 1 },
};

export const AMMO = {
  light: { name: AMMO_NAMES.light, drop: 18, max: 999, color: '#d9d9d9' },
  medium: { name: AMMO_NAMES.medium, drop: 20, max: 999, color: '#8fd16a' },
  heavy: { name: AMMO_NAMES.heavy, drop: 6, max: 999, color: '#3e7fd9' },
  shells: { name: AMMO_NAMES.shells, drop: 6, max: 999, color: '#e0663f' },
  rockets: { name: AMMO_NAMES.rockets, drop: 3, max: 99, color: '#7a5a3a' },
};

// Wall vs floor/ramp/cone health from the Fortnite wiki: [start, max, seconds].
export const MATERIALS = {
  wood: { name: MATERIAL_NAMES.wood, wall: [90, 150], other: [84, 140], time: 4 },
  brick: { name: MATERIAL_NAMES.brick, wall: [90, 300], other: [93, 280], time: 11.5 },
  metal: { name: MATERIAL_NAMES.metal, wall: [110, 500], other: [101, 460], time: 24.5 },
};
export const MAT_ORDER = ['wood', 'brick', 'metal'];

// Storm. Rebirth Island is small, so phases are short. Storm damage ignores
// shields and goes straight to health, same as Fortnite.
export const STORM_PHASES = [
  { wait: 80, shrink: 60, damage: 1, radius: 230 },
  { wait: 60, shrink: 50, damage: 1, radius: 145 },
  { wait: 48, shrink: 44, damage: 2, radius: 88 },
  { wait: 42, shrink: 38, damage: 5, radius: 48 },
  { wait: 32, shrink: 32, damage: 8, radius: 22 },
  { wait: 25, shrink: 30, damage: 10, radius: 0 },
];
export const STORM_START_RADIUS = 450;
// Rebirth Island's signature mode: you redeploy after dying while Resurgence
// is live. It switches off when this storm phase begins.
export const RESURGENCE_END_PHASE = 3;
export const RESURGENCE_DELAY = 8;

export const BOT_COUNT = 24;

export const LOOT_WEIGHTS = {
  floor: [40, 30, 18, 9, 3],
  chest: [10, 30, 32, 20, 8],
};

// Determinism: the same seeds give byte-identical map data on server and client.
export const MAP_SEED = 20200421;
export const DECOR_SEED = 777;

// Damage falloff and headshot tuning that used to live inline in combat.
export const FALLOFF = {
  pump: { start: 7, span: 25, min: 0.25 },
  smg: { start: 25, span: 80, min: 0.6 },
  pistol: { start: 25, span: 80, min: 0.6 },
  tac: { start: 8, span: 20, min: 0.2 },
  revolver: { start: 35, span: 90, min: 0.65 },
};

// Thrown Frag Grenade: arcs under gravity, bounces off the world, blows after the fuse.
export const GRENADE = { speed: 17, up: 0.18, gravity: 22, fuse: 2.2, splash: 5.5, damage: 100, structureDamage: 250, bounce: 0.45 };

// Supply drops fall into the next safe circle when a storm phase begins.
export const SUPPLY = { fallSpeed: 9, height: 140, fromPhase: 1, everyPhases: 1 };

export const EMOTE_COUNT = 25;
export const EMOTE_COOLDOWN = 0.5;

export const INTERACT = { chestHold: 0.5, chestRange: 2.4, pickupRange: 2.2 };
