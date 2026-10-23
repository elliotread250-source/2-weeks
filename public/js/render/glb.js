// Optional: replace the procedural body with an authored .glb that uses a
// Mixamo-style skeleton. Drop files in public/assets/characters/ and call
// loadGlbRig('/assets/characters/name.glb'). Nothing depends on it: if the file
// is missing the game keeps the procedural character.
//
// How it works: bones are renamed to this project's bone names, so every clip in
// render/anims binds without changes. Mixamo rigs rest in a T-pose with
// different local axes, so poses will look off until per-bone rest corrections
// are added to RETARGET_FIX; the structure for that is here.
import * as THREE from 'three';

export const MIXAMO = {
  hips: 'Hips', spine1: 'Spine', spine2: 'Spine1', spine3: 'Spine2', neck: 'Neck', head: 'Head',
  upperArmL: 'LeftArm', lowerArmL: 'LeftForeArm', handL: 'LeftHand',
  upperArmR: 'RightArm', lowerArmR: 'RightForeArm', handR: 'RightHand',
  upperLegL: 'LeftUpLeg', lowerLegL: 'LeftLeg', footL: 'LeftFoot',
  upperLegR: 'RightUpLeg', lowerLegR: 'RightLeg', footR: 'RightFoot',
};

// Per-bone rest-pose corrections (quaternion pre-multiplied onto each clip rotation).
export const RETARGET_FIX = {};

const strip = (n) => n.replace(/^mixamorig[:_]?/i, '');

// Pure helper (tested): which of our bone names a glTF bone name maps to.
export function ourBoneName(gltfName) {
  const s = strip(gltfName);
  return Object.keys(MIXAMO).find((k) => MIXAMO[k] === s) || null;
}

export async function loadGlbRig(url, scale = 1) {
  const head = await fetch(url, { method: 'HEAD' }).catch(() => null);
  if (!head || !head.ok) return null;
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url);
  let skinned = null;
  gltf.scene.traverse((o) => { if (o.isSkinnedMesh && !skinned) skinned = o; });
  if (!skinned) return null;
  const bones = {};
  for (const b of skinned.skeleton.bones) {
    const ours = ourBoneName(b.name);
    if (ours) { b.name = ours; bones[ours] = b; }
  }
  if (Object.keys(bones).length < 18) return null; // not a full humanoid rig
  skinned.castShadow = true;
  skinned.frustumCulled = false;
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.scale.setScalar(scale);
  tilt.add(gltf.scene);
  root.add(tilt);
  const socket = (name, parent, pos) => { const g = new THREE.Object3D(); g.name = name; g.position.set(...pos); parent.add(g); return g; };
  return {
    root, tilt, mesh: skinned, skeleton: skinned.skeleton, bones,
    sockets: { right: socket('sockR', bones.handR, [0, 0, 0]), left: socket('sockL', bones.handL, [0, 0, 0]), back: socket('sockBack', bones.spine3, [0, 0, 0]), head: socket('sockHead', bones.head, [0, 0, 0]) },
    face: { set() {}, current: '' }, lod: new THREE.Object3D(), outfit: {},
  };
}
