// Item icons. Each cosmetic is rendered once in an offscreen scene to a small
// image, then cached in IndexedDB so later visits never render it again.
import * as THREE from 'three';
import { item } from '/shared/cosmetics/catalog.js';
import { DEFAULT_LOADOUT, resolveOutfit } from '/shared/cosmetics/catalog.js';
import { buildRig } from './rig.js';
import { Animator } from './animator.js';
import { getClips } from './anims/index.js';
import { pickaxeMesh, gliderMesh } from './cosmetics.js';
import { gunMesh } from './character.js';

const SIZE = 160;
const VERSION = 4; // bump when the look of icons changes
let renderer = null, scene = null, camera = null;

function setup() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE, false);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#e8f1ff', '#445577', 1.7));
  const key = new THREE.DirectionalLight('#fff4e0', 2.2);
  key.position.set(2, 3, -3);
  scene.add(key);
  camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
}

function snap(obj, cam, look) {
  setup();
  scene.add(obj);
  camera.position.set(...cam);
  camera.lookAt(...look);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(obj);
  return url;
}

function rigIcon(loadout, { cam, look, clip, t = 0, rot = -0.4 }) {
  const rig = buildRig(resolveOutfit(loadout));
  const a = new Animator(rig);
  a.lower.play(clip || 'idle', { restart: true, fade: 0 });
  a.upper.play(clip || 'idle', { restart: true, fade: 0 });
  for (const l of [a.lower, a.upper]) { l.action.time = t; l.action.timeScale = 0; }
  a.mixer.update(0);
  rig.root.rotation.y = rot; // the rig faces -z at rotation 0
  if (rig.fxUpdate) rig.fxUpdate(1);
  const url = snap(rig.root, cam, look);
  a.dispose();
  return url;
}

function render(it) {
  const base = { ...DEFAULT_LOADOUT, emotes: [...DEFAULT_LOADOUT.emotes], colours: {} };
  switch (it.type) {
    case 'outfit': return rigIcon({ ...base, outfit: it.id }, { cam: [0.5, 1.75, -2.1], look: [0, 1.5, 0] });
    case 'backBling': return rigIcon({ ...base, backBling: it.id }, { cam: [-0.6, 1.55, 2.6], look: [0, 1.25, 0], rot: 0.35 });
    case 'emote': return rigIcon(base, { cam: [1.3, 1.1, -4.2], look: [0, 1.0, 0], clip: `emote.${it.clip}`, t: getClips().get(`emote.${it.clip}`).duration * 0.4 });
    case 'pickaxe': {
      const m = pickaxeMesh(it.id);
      m.rotation.set(0, 0.6, -0.9);
      return snap(m, [0.3, 0.3, -3.0], [0, 0, -0.5]);
    }
    case 'glider': {
      const m = gliderMesh(it.id);
      m.position.y = -2.6; m.rotation.x = 0.35;
      return snap(m, [0, 0.5, -5.5], [0, 0, 0]);
    }
    case 'wrap': {
      const m = gunMesh('ar', 3, it.id);
      m.scale.setScalar(2.2);
      m.rotation.y = -0.6;
      return snap(m, [0, 0.1, -2.6], [0, 0, -0.1]);
    }
    default: return null;
  }
}

// 2D icons for things with no 3D model.
function flat(it) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d');
  const { a, b } = it.spec;
  if (it.type === 'contrail') {
    const gr = g.createLinearGradient(0, SIZE, SIZE, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.4, a); gr.addColorStop(1, b);
    g.strokeStyle = gr; g.lineWidth = 16; g.lineCap = 'round';
    g.beginPath(); g.moveTo(20, 140); g.bezierCurveTo(60, 60, 100, 130, 140, 24); g.stroke();
    g.fillStyle = b;
    for (let i = 0; i < 9; i++) { g.globalAlpha = 0.9 - i * 0.08; g.beginPath(); g.arc(30 + i * 14, 120 - i * 10 + Math.sin(i * 1.7) * 12, 4 + (i % 3), 0, 7); g.fill(); }
  } else if (it.type === 'banner') {
    g.fillStyle = a; g.strokeStyle = b; g.lineWidth = 8;
    const s = it.spec.shape;
    g.beginPath();
    if (s === 'round') g.arc(80, 80, 58, 0, 7);
    else if (s === 'shield') { g.moveTo(26, 22); g.lineTo(134, 22); g.lineTo(134, 86); g.quadraticCurveTo(80, 150, 26, 86); g.closePath(); }
    else if (s === 'pennant') { g.moveTo(24, 20); g.lineTo(136, 80); g.lineTo(24, 140); g.closePath(); }
    else { g.rect(26, 20, 108, 112); }
    g.fill(); g.stroke();
    g.fillStyle = b; g.font = 'bold 56px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText({ star: '★', bolt: '⚡', leaf: '❦', crown: '♛', moon: '☾', flame: '♨', wave: '≈', heart: '♥', skull: '☠', sun: '☀', owl: '◉', flake: '❄', claw: '⋔', clover: '☘', fist: '✊', eye: '◉', lion: '♞', arrow: '➤', cloud: '☁', gem: '◆', wing: '❧', blade: '†', gear: '⚙', flower: '✿', wolf: '♘', arc: '◠' }[it.spec.icon] || '★', 80, 82);
  } else if (it.type === 'loadingScreen') {
    const gr = g.createLinearGradient(0, 0, SIZE, SIZE);
    gr.addColorStop(0, a); gr.addColorStop(1, b);
    g.fillStyle = gr; g.fillRect(0, 0, SIZE, SIZE);
    g.fillStyle = 'rgba(255,255,255,.85)'; g.font = 'bold 20px sans-serif'; g.textAlign = 'center'; g.fillText(it.name, 80, 84, 140);
  }
  return c.toDataURL('image/png');
}

// ---------------------------------------------------------------- cache

let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open('twoweeks-icons', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('icons');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  return dbPromise;
}
const idbGet = async (k) => { const d = await db(); if (!d) return null; return new Promise((r) => { try { const q = d.transaction('icons').objectStore('icons').get(k); q.onsuccess = () => r(q.result || null); q.onerror = () => r(null); } catch { r(null); } }); };
const idbPut = async (k, v) => { const d = await db(); if (!d) return; try { d.transaction('icons', 'readwrite').objectStore('icons').put(v, k); } catch { /* cache is optional */ } };

const memory = new Map();
let chain = Promise.resolve();

// Resolves to a data URL (or null if the item has no icon). Renders are queued
// one at a time so a page of 40 tiles never stalls a frame.
export function getIcon(id) {
  if (memory.has(id)) return memory.get(id);
  const it = item(id);
  const p = chain.then(async () => {
    const key = `${id}@${VERSION}`;
    const cached = await idbGet(key);
    if (cached) return cached;
    await new Promise((r) => setTimeout(r, 0));
    let url = null;
    try { url = it.type === 'contrail' || it.type === 'banner' || it.type === 'loadingScreen' ? flat(it) : render(it); } catch (e) { console.warn('icon failed', id, e.message); }
    if (url) idbPut(key, url);
    return url;
  });
  chain = p.catch(() => {});
  memory.set(id, p);
  return p;
}
