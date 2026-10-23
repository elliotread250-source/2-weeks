// Every clip, by name. `emote.N` follows EMOTE_NAMES (1-based).
import * as THREE from 'three';
import { locomotionClips } from './locomotion.js';
import { airClips } from './air.js';
import { weaponClips } from './weapons.js';
import { toolClips } from './tools.js';
import { reactionClips } from './reactions.js';
import { emoteClips } from './emotes.js';

let library = null;

export function getClips() {
  if (library) return library;
  library = new Map();
  for (const c of [...locomotionClips(), ...airClips(), ...weaponClips(), ...toolClips(), ...reactionClips(), ...emoteClips()]) {
    library.set(c.name, c);
  }
  // Hit reactions play on top of everything else, so store them as additive.
  for (const n of ['hit.front', 'hit.back', 'hit.left', 'hit.right', 'hit.head']) THREE.AnimationUtils.makeClipAdditive(library.get(n));
  for (const c of library.values()) {
    if (/\.fire$/.test(c.name)) THREE.AnimationUtils.makeClipAdditive(c);
  }
  return library;
}

export { WEAPON_CLASSES, classOfWeapon } from './weapons.js';
