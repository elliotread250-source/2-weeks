// A skinned, bone-driven character built entirely in code. Body parts are
// rounded low-poly shapes bound to an 18-bone skeleton and merged into one
// SkinnedMesh (one draw call), coloured per vertex from the outfit's palette.
// Sockets hang off the hand, back and head bones for held items and back bling.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BONES } from './anims/pose.js';

// Bone rest offsets from the parent (metres, character faces -Z, +Y up).
const REST = {
  hips: ['', [0, 0.92, 0]],
  spine1: ['hips', [0, 0.12, 0]], spine2: ['spine1', [0, 0.14, 0]], spine3: ['spine2', [0, 0.16, 0]],
  neck: ['spine3', [0, 0.2, 0]], head: ['neck', [0, 0.07, 0]],
  upperArmL: ['spine3', [-0.27, 0.1, 0]], lowerArmL: ['upperArmL', [0, -0.27, 0]], handL: ['lowerArmL', [0, -0.25, 0]],
  upperArmR: ['spine3', [0.27, 0.1, 0]], lowerArmR: ['upperArmR', [0, -0.27, 0]], handR: ['lowerArmR', [0, -0.25, 0]],
  upperLegL: ['hips', [-0.12, -0.04, 0]], lowerLegL: ['upperLegL', [0, -0.43, 0]], footL: ['lowerLegL', [0, -0.42, 0]],
  upperLegR: ['hips', [0.12, -0.04, 0]], lowerLegR: ['upperLegR', [0, -0.43, 0]], footR: ['lowerLegR', [0, -0.42, 0]],
};

export const SKELETON_HEIGHT = 1.98;

// Per-vertex weights that blend bones along a vertical chain, so a torso bends
// and a knee or elbow skins smoothly instead of splitting. chain: [[bone, y]...]
// sorted by ascending y; below the first / above the last is rigid.
function chainWeights(geo, chain, index) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    let a, b, k = 0;
    if (y <= chain[0][1]) { a = b = chain[0][0]; } else if (y >= chain[chain.length - 1][1]) { a = b = chain[chain.length - 1][0]; } else {
      for (let c = 0; c < chain.length - 1; c++) {
        if (y >= chain[c][1] && y <= chain[c + 1][1]) {
          a = chain[c][0]; b = chain[c + 1][0];
          k = (y - chain[c][1]) / (chain[c + 1][1] - chain[c][1]);
          k = k * k * (3 - 2 * k);
          break;
        }
      }
    }
    si[i * 4] = index[a]; si[i * 4 + 1] = index[b];
    sw[i * 4] = 1 - k; sw[i * 4 + 1] = k;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
}

const color = new THREE.Color();
function paint(geo, hex) {
  color.set(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = color.r; arr[i * 3 + 1] = color.g; arr[i * 3 + 2] = color.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

function hairParts(o) {
  const h = o.hair;
  switch (o.hairStyle) {
    case 'spiky':
      return [[0.41, 0.1, 0.41, 0, 0.42, 0, h], [0.1, 0.18, 0.1, -0.12, 0.52, 0.05, h, 0, 0, 0.3], [0.1, 0.22, 0.1, 0, 0.55, 0, h],
        [0.1, 0.18, 0.1, 0.12, 0.52, 0.05, h, 0, 0, -0.3], [0.1, 0.16, 0.1, 0, 0.5, 0.14, h, -0.4, 0, 0], [0.41, 0.08, 0.1, 0, 0.37, -0.17, h]];
    case 'cap':
      return [[0.42, 0.14, 0.42, 0, 0.44, 0, o.accent], [0.42, 0.04, 0.2, 0, 0.38, -0.27, o.accent], [0.08, 0.04, 0.08, 0, 0.52, 0, o.pack]];
    case 'pony':
      return [[0.41, 0.12, 0.41, 0, 0.42, 0, h], [0.41, 0.08, 0.1, 0, 0.36, -0.17, h], [0.12, 0.34, 0.12, 0, 0.26, 0.26, h, 0.3, 0, 0], [0.13, 0.06, 0.13, 0, 0.42, 0.22, o.accent]];
    case 'mohawk':
      return [[0.39, 0.04, 0.39, 0, 0.4, 0, h], [0.08, 0.2, 0.42, 0, 0.5, 0.01, o.accent]];
    case 'helmet':
      return [[0.44, 0.22, 0.44, 0, 0.36, 0, o.accent], [0.36, 0.08, 0.04, 0, 0.26, -0.22, '#1b2631'], [0.06, 0.1, 0.06, 0.2, 0.36, 0, o.pack]];
    default:
      return [[0.41, 0.14, 0.41, 0, 0.42, 0, h], [0.41, 0.08, 0.1, 0, 0.36, -0.17, h], [0.06, 0.16, 0.36, -0.2, 0.3, 0.02, h], [0.06, 0.16, 0.36, 0.2, 0.3, 0.02, h]];
  }
}

function blingParts(o) {
  switch (o.bling) {
    case 'cape':
      return [[0.52, 0.85, 0.04, 0, 0.0, 0.2, o.pack, 0.12], [0.54, 0.06, 0.06, 0, 0.42, 0.18, o.accent]];
    case 'wings':
      return [[0.12, 0.2, 0.12, 0, 0.36, 0.24, o.accent], [0.5, 0.36, 0.04, -0.28, 0.44, 0.27, o.pack, 0, 0.3, 0.35], [0.5, 0.36, 0.04, 0.28, 0.44, 0.27, o.pack, 0, -0.3, -0.35]];
    case 'sword':
      return [[0.06, 0.85, 0.03, 0, 0.32, 0.25, '#d6eaf8', 0, 0, 0.6], [0.24, 0.06, 0.06, -0.05, 0.02, 0.25, o.accent, 0, 0, 0.6], [0.06, 0.2, 0.06, -0.12, -0.1, 0.25, '#5d4037', 0, 0, 0.6]];
    case 'guitar':
      return [[0.32, 0.34, 0.08, 0.05, 0.18, 0.25, o.pack, 0, 0, -0.4], [0.06, 0.5, 0.05, -0.12, 0.55, 0.25, '#4e342e', 0, 0, -0.4], [0.1, 0.1, 0.09, 0.05, 0.18, 0.25, '#111', 0, 0, -0.4]];
    default:
      return [[0.42, 0.46, 0.2, 0, 0.36, 0.26, o.pack], [0.34, 0.16, 0.06, 0, 0.26, 0.38, o.accent], [0.44, 0.06, 0.22, 0, 0.6, 0.26, o.accent],
        [0.05, 0.5, 0.04, -0.18, 0.36, 0.15, '#2d3436'], [0.05, 0.5, 0.04, 0.18, 0.36, 0.15, '#2d3436']];
  }
}

const rbox = (w, h, d, r = 0.03, seg = 1) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));

// Build the character. `outfit` is the palette/recipe object (see shared/cosmetics).
export function buildRig(outfit) {
  const o = { accent: '#f1c40f', gloves: '#2c3e50', hairStyle: 'short', bling: 'pack', ...outfit };

  // Skeleton.
  const bones = {};
  for (const name of BONES) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...REST[name][1]);
    bones[name] = b;
  }
  for (const name of BONES) if (REST[name][0]) bones[REST[name][0]].add(bones[name]);
  const list = BONES.map((n) => bones[n]);
  const index = Object.fromEntries(BONES.map((n, i) => [n, i]));

  const parts = [];
  // add(geo, bone-or-chain, colour): geo must already sit in bind-pose space.
  const add = (geo, target, hex) => {
    if (geo.index) geo = geo.toNonIndexed(); // RoundedBox is not indexed; merge needs them all alike
    paint(geo, hex);
    if (typeof target === 'string') {
      const n = geo.attributes.position.count;
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4).map((_, i) => (i % 4 === 0 ? index[target] : 0)), 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    } else chainWeights(geo, target, index);
    parts.push(geo);
  };
  const at = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => {
    if (rx || ry || rz) geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
    geo.translate(x, y, z);
    return geo;
  };

  const TORSO = [['hips', 0.96], ['spine1', 1.06], ['spine2', 1.18], ['spine3', 1.32]];
  // Torso and pelvis.
  add(at(rbox(0.4, 0.2, 0.27, 0.07, 2), 0, 0.98, 0), TORSO, o.pants);
  add(at(rbox(0.5, 0.5, 0.31, 0.1, 2), 0, 1.24, 0), TORSO, o.shirt);
  add(at(rbox(0.52, 0.07, 0.33, 0.02), 0, 1.35, 0), TORSO, o.accent); // chest band
  add(at(rbox(0.42, 0.05, 0.29, 0.02), 0, 1.0, 0), TORSO, '#3b2f2f'); // belt
  add(at(rbox(0.09, 0.06, 0.03, 0.01), 0, 1.0, -0.155), TORSO, '#d4ac0d'); // buckle
  add(at(rbox(0.11, 0.11, 0.07, 0.02), -0.19, 0.97, -0.15), TORSO, '#4e5b60'); // pouches
  add(at(rbox(0.11, 0.11, 0.07, 0.02), 0.19, 0.97, -0.15), TORSO, '#4e5b60');
  add(at(new THREE.CylinderGeometry(0.075, 0.09, 0.12, 8), 0, 1.5, 0), TORSO.concat([['neck', 1.6]]), o.skin);
  add(at(rbox(0.3, 0.07, 0.3, 0.03), 0, 1.5, 0), 'spine3', o.shirt); // collar

  // Head.
  add(at(rbox(0.37, 0.38, 0.35, 0.12, 2), 0, 1.79, 0), 'head', o.skin);
  add(at(rbox(0.04, 0.09, 0.07, 0.01), -0.2, 1.79, 0), 'head', o.skin); // ears
  add(at(rbox(0.04, 0.09, 0.07, 0.01), 0.2, 1.79, 0), 'head', o.skin);
  add(at(rbox(0.06, 0.08, 0.06, 0.02), 0, 1.76, -0.19), 'head', o.skin); // nose
  for (const [w, h, d, x, y, z, hex, rx = 0, ry = 0, rz = 0] of hairParts(o)) add(at(rbox(w, h, d, 0.025), x, 1.58 + y, z, rx, ry, rz), 'head', hex);

  // Arms and hands, then legs, mirrored.
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'L' : 'R';
    const ARM = [[`lowerArm${side}`, 1.12], [`upperArm${side}`, 1.22]];
    add(at(new THREE.SphereGeometry(0.105, 6, 4), s * 0.27, 1.46, 0), `upperArm${side}`, o.accent); // shoulder pad
    add(at(new THREE.CapsuleGeometry(0.075, 0.2, 2, 6), s * 0.27, 1.3, 0), ARM, o.shirt);
    add(at(new THREE.CapsuleGeometry(0.066, 0.2, 2, 6), s * 0.27, 1.04, 0), ARM, o.skin);
    add(at(rbox(0.15, 0.06, 0.15, 0.02), s * 0.27, 1.12, 0), ARM, o.shirt); // cuff
    add(at(rbox(0.15, 0.16, 0.18, 0.06, 2), s * 0.27, 0.86, -0.01), `hand${side}`, o.gloves); // big glove
    add(at(rbox(0.06, 0.09, 0.07, 0.02), s * 0.27 + (s < 0 ? 0.08 : -0.08), 0.88, -0.07, 0, 0, s * 0.3), `hand${side}`, o.gloves); // thumb

    const LEG = [[`lowerLeg${side}`, 0.4], [`upperLeg${side}`, 0.5]];
    add(at(new THREE.CapsuleGeometry(0.1, 0.3, 2, 6), s * 0.12, 0.68, 0), LEG, o.pants);
    add(at(new THREE.CapsuleGeometry(0.088, 0.3, 2, 6), s * 0.12, 0.23, 0), LEG, o.pants);
    add(at(rbox(0.15, 0.12, 0.06, 0.03), s * 0.12, 0.45, -0.09), LEG, o.accent); // knee pad
    add(at(rbox(0.18, 0.12, 0.3, 0.05, 2), s * 0.12, 0.07, -0.04), `foot${side}`, '#242424'); // boot
    add(at(rbox(0.19, 0.04, 0.32, 0.02), s * 0.12, 0.02, -0.04), `foot${side}`, '#f2f2f2'); // sole
    add(at(rbox(0.12, 0.03, 0.08, 0.01), s * 0.12, 0.11, -0.16), `foot${side}`, o.accent); // laces
  }

  // Back bling, bound to the chest.
  for (const [w, h, d, x, y, z, hex, rx = 0, ry = 0, rz = 0] of blingParts(o)) add(at(rbox(w, h, d, 0.02), x, 0.92 + y, z, rx, ry, rz), 'spine3', hex);

  const geometry = mergeGeometries(parts, false);
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += 0.5;
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.add(bones.hips);
  mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(list);
  mesh.bind(skeleton);

  // Sockets: where held items and accessories attach.
  const socket = (name, parent, pos, rot = [0, 0, 0]) => {
    const g = new THREE.Object3D();
    g.name = name;
    g.position.set(...pos);
    g.rotation.set(...rot);
    parent.add(g);
    return g;
  };
  const sockets = {
    right: socket('sockR', bones.handR, [0, -0.08, 0]),
    left: socket('sockL', bones.handL, [0, -0.08, 0]),
    back: socket('sockBack', bones.spine3, [0, 0, 0.18]),
    head: socket('sockHead', bones.head, [0, 0.2, 0]),
  };

  // Face: a transparent decal on the front of the head, drawn on a canvas.
  const face = makeFace(o, bones.head);

  // A tilt group lets the whole body pitch for skydiving without touching bones.
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.add(mesh);
  root.add(tilt);

  // Very low-poly stand-in for distance.
  const lod = buildLod(o);
  lod.visible = false;
  root.add(lod);

  return { root, tilt, mesh, skeleton, bones, sockets, face, lod, outfit: o };
}

// Eyes, brows and mouth on a small canvas. Expressions redraw only when changed.
function makeFace(o, head) {
  if (typeof document === 'undefined') return { set() {}, current: 'neutral' };
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 96;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.31, 0.23),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  mesh.rotation.y = Math.PI; // faces -Z
  mesh.position.set(0, 0.2, -0.178);
  head.add(mesh);
  const g = canvas.getContext('2d');
  const face = {
    current: '',
    set(expr) {
      if (expr === face.current) return;
      face.current = expr;
      g.clearRect(0, 0, 128, 96);
      const eye = (x, open) => {
        g.fillStyle = '#fff';
        g.beginPath(); g.ellipse(x, 40, 13, open, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1b1b1b';
        g.beginPath(); g.ellipse(x + 1, 41, 6, Math.min(open, 9), 0, 0, Math.PI * 2); g.fill();
      };
      g.strokeStyle = o.hair; g.lineWidth = 5; g.lineCap = 'round';
      g.fillStyle = '#7b3b2f';
      switch (expr) {
        case 'hurt':
          g.strokeStyle = '#1b1b1b'; g.lineWidth = 4;
          for (const x of [38, 90]) { g.beginPath(); g.moveTo(x - 9, 32); g.lineTo(x + 9, 48); g.moveTo(x + 9, 32); g.lineTo(x - 9, 48); g.stroke(); }
          g.fillStyle = '#7b3b2f'; g.beginPath(); g.ellipse(64, 72, 10, 8, 0, 0, Math.PI * 2); g.fill();
          break;
        case 'cheer':
          eye(38, 4); eye(90, 4);
          g.strokeStyle = o.hair; g.beginPath(); g.moveTo(26, 22); g.lineTo(50, 18); g.moveTo(78, 18); g.lineTo(102, 22); g.stroke();
          g.beginPath(); g.moveTo(40, 64); g.quadraticCurveTo(64, 94, 88, 64); g.closePath(); g.fill();
          break;
        case 'aim':
          eye(38, 13); eye(90, 3);
          g.beginPath(); g.moveTo(26, 20); g.lineTo(50, 24); g.moveTo(78, 22); g.lineTo(102, 18); g.stroke();
          g.strokeStyle = '#7b3b2f'; g.lineWidth = 4; g.beginPath(); g.moveTo(50, 72); g.lineTo(78, 72); g.stroke();
          break;
        case 'effort':
          eye(38, 8); eye(90, 8);
          g.beginPath(); g.moveTo(26, 28); g.lineTo(50, 20); g.moveTo(78, 20); g.lineTo(102, 28); g.stroke();
          g.fillRect(48, 66, 32, 10);
          break;
        default:
          eye(38, 13); eye(90, 13);
          g.beginPath(); g.moveTo(26, 22); g.lineTo(50, 20); g.moveTo(78, 20); g.lineTo(102, 22); g.stroke();
          g.strokeStyle = '#7b3b2f'; g.lineWidth = 4; g.beginPath(); g.moveTo(48, 70); g.quadraticCurveTo(64, 76, 80, 70); g.stroke();
      }
      tex.needsUpdate = true;
    },
  };
  face.set('neutral');
  return face;
}

function buildLod(o) {
  const parts = [];
  const add = (geo, x, y, z, hex) => { geo.translate(x, y, z); paint(geo, hex); parts.push(geo); };
  add(new THREE.BoxGeometry(0.5, 0.55, 0.3), 0, 1.22, 0, o.shirt);
  add(new THREE.BoxGeometry(0.36, 0.36, 0.34), 0, 1.78, 0, o.skin);
  add(new THREE.BoxGeometry(0.3, 0.92, 0.26), 0, 0.46, 0, o.pants);
  add(new THREE.BoxGeometry(0.62, 0.12, 0.2), 0, 1.4, 0, o.shirt);
  const m = new THREE.Mesh(mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); return g.toNonIndexed(); })), new THREE.MeshLambertMaterial({ vertexColors: true }));
  m.castShadow = false;
  return m;
}
