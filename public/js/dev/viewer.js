// Developer page: one character, any clip, any outfit. Also the shape of the locker preview.
import * as THREE from 'three';
import { buildRig } from '../render/rig.js';
import { Animator } from '../render/animator.js';
import { getClips } from '../render/anims/index.js';
import { OUTFITS } from '/shared/cosmetics/outfits.js';
import { gunMesh } from '../render/character.js';

const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fd4f7');
scene.add(new THREE.HemisphereLight('#d6efff', '#5f8f3e', 1.4));
const sun = new THREE.DirectionalLight('#fff1d6', 2);
sun.position.set(3, 6, 4);
scene.add(sun);
const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 32).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#7bc96b' }));
scene.add(floor);
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 50);
camera.position.set(0.0, 1.2, -4.6);
camera.lookAt(0, 1.0, 0);
camera.position.set(2.2, 1.3, -4);
camera.lookAt(0, 1.0, 0);

let rig, animator, held;
function load(i) {
  if (rig) scene.remove(rig.root);
  rig = buildRig(OUTFITS[i % OUTFITS.length]);
  rig.root.rotation.y = Math.PI * 0.12;
  scene.add(rig.root);
  animator = new Animator(rig);
}
load(Number(q.get('outfit') || 0));

const names = [...getClips().keys()].sort();
const ui = document.getElementById('ui');
const sel = document.createElement('select');
for (const n of names) sel.add(new Option(n, n));
const outfit = document.createElement('select');
OUTFITS.forEach((_, i) => outfit.add(new Option(`outfit ${i}`, i)));
const gun = document.createElement('select');
for (const g of ['none', 'ar', 'pump', 'smg', 'pistol', 'sniper', 'rocket']) gun.add(new Option(g, g));
ui.append(sel, outfit, gun);

function setClip(name, t = 0, speed = 1) {
  animator.lower.play(name, { restart: true, fade: 0 });
  animator.upper.play(name, { restart: true, fade: 0 });
  animator.oneShotUntil = 1e9;
  for (const l of [animator.lower, animator.upper]) { l.action.time = t; l.action.timeScale = speed; }
  animator.mixer.update(0);
}
function setGun(type) {
  const sock = rig.sockets.right;
  if (held) sock.remove(held);
  held = null;
  if (type && type !== 'none') {
    held = gunMesh(type, 3);
    held.rotation.x = -Math.PI / 2;
    sock.add(held);
  }
}
sel.onchange = () => setClip(sel.value);
outfit.onchange = () => { load(Number(outfit.value)); setClip(sel.value); };
gun.onchange = () => setGun(gun.value);
window.viewer = {
  setClip, setGun, load,
  freeze(name, t) { setClip(name, t, 0); },
  spin(a) { rig.root.rotation.y = a; },
  rig: () => rig,
};
setClip('idle');
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  animator.mixer.update(clock.getDelta());
  renderer.render(scene, camera);
});
if (q.get('clip')) setClip(q.get('clip'));
if (q.get('gun')) setGun(q.get('gun'));
