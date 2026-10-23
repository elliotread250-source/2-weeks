// Draws loot from sim state: floating weapon/consumable pickups with rarity
// beams, and chests / ammo boxes with opening lids.
import * as THREE from 'three';
import { RARITIES, AMMO } from '/shared/config.js';
import { itemRarity } from '/shared/sim/loot.js';
import { glowTexture } from './textures.js';
import { gunMesh } from './character.js';
import { itemCardCanvas } from '../ui/icons.js';

const MAT_COLORS = { wood: '#b5763d', brick: '#c0563b', metal: '#9aa5b1' };
const CONS_COLORS = { bandage: '#f5f5f5', medkit: '#e74c3c', minis: '#5dade2', bigpot: '#2e86de', chug: '#48c9b0' };

export class LootView {
  constructor(scene) {
    this.scene = scene;
    this.pickups = new Map(); // sim pickup id -> view
    this.chests = new Map();
    this.beamGeo = new THREE.CylinderGeometry(0.1, 0.42, 4.5, 12, 1, true);
    this.beamGeo.translate(0, 2.25, 0);
    this.glowGeo = new THREE.PlaneGeometry(1.8, 1.8).rotateX(-Math.PI / 2);
    this.sparkle = new THREE.SpriteMaterial({ map: glowTexture('#fff3a0'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  }

  // Shared rarity materials for the ground effects.
  rarityFx(r) {
    if (!this.fxCache) this.fxCache = [];
    if (this.fxCache[r]) return this.fxCache[r];
    const col = RARITIES[r].color;
    const c = document.createElement('canvas');
    c.width = 4; c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 128, 0, 0);
    grad.addColorStop(0, col + 'ff');
    grad.addColorStop(0.35, col + '88');
    grad.addColorStop(1, col + '00');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 128);
    const beamTex = new THREE.CanvasTexture(c);
    const fx = {
      beam: new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      glow: new THREE.MeshBasicMaterial({ map: glowTexture(col), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      spark: new THREE.SpriteMaterial({ map: glowTexture(col), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
    this.fxCache[r] = fx;
    return fx;
  }

  cardMaterial(item) {
    if (!this.cardMats) this.cardMats = new Map();
    const key = `${item.type}:${itemRarity(item)}`;
    if (!this.cardMats.has(key)) {
      const tex = new THREE.CanvasTexture(itemCardCanvas(item));
      tex.colorSpace = THREE.SRGBColorSpace;
      this.cardMats.set(key, new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    }
    return this.cardMats.get(key);
  }

  makeMesh(item) {
    const g = new THREE.Group();
    const rarity = itemRarity(item);
    const root = new THREE.Group();
    let card = null, glow = null, sparks = [];
    if (item.kind === 'weapon') {
      // The real gun model, scaled up so it reads from a distance.
      const gun = gunMesh(item.type, item.rarity);
      gun.scale.setScalar(1.35);
      gun.rotation.z = 0.25;
      g.add(gun);
    } else if (item.kind === 'consumable') {
      const c = CONS_COLORS[item.type];
      const m = item.type === 'bandage'
        ? new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 12), this.lam(c))
        : item.type === 'medkit'
          ? new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.42, 0.24), this.lam(c))
          : new THREE.Mesh(new THREE.SphereGeometry(item.type === 'minis' ? 0.2 : 0.3, 12, 10), this.lam(c));
      g.add(m);
    } else if (item.kind === 'ammo') {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.24), this.lam(AMMO[item.type].color)));
    } else {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.4), this.lam(MAT_COLORS[item.type])));
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    root.add(g);
    g.position.y = 0.55;
    if (item.kind === 'weapon' || item.kind === 'consumable') {
      const fx = this.rarityFx(rarity);
      const beam = new THREE.Mesh(this.beamGeo, fx.beam);
      glow = new THREE.Mesh(this.glowGeo, fx.glow);
      glow.position.y = 0.04;
      root.add(beam, glow);
      for (let i = 0; i < 3; i++) {
        const sp = new THREE.Sprite(fx.spark);
        sp.scale.setScalar(0.18);
        root.add(sp);
        sparks.push(sp);
      }
      card = new THREE.Sprite(this.cardMaterial(item));
      card.scale.set(0.95, 0.6, 1);
      card.position.y = 1.55;
      card.visible = false;
      root.add(card);
    }
    return { root, inner: g, card, glow, sparks };
  }

  makeChest(c) {
    const { type } = c;
    const g = new THREE.Group();
    let lid;
    if (type === 'chest') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.7), this.lam('#c8901e'));
      base.position.y = 0.28;
      lid = new THREE.Group();
      lid.position.set(0, 0.55, 0.35);
      const lm = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.25, 0.72), this.lam('#f4c430'));
      lm.position.set(0, 0.12, -0.35);
      lid.add(lm);
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.05), this.lam('#7a4b0c'));
      lock.position.set(0, 0.45, -0.37);
      g.add(base, lid, lock);
      const sp = new THREE.Sprite(this.sparkle);
      sp.scale.set(1.6, 1.6, 1);
      sp.position.y = 0.8;
      g.add(sp);
      g.userData.sparkle = sp;
    } else {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.5), this.lam('#6b7d4f'));
      base.position.y = 0.23;
      lid = new THREE.Group();
      lid.position.set(0, 0.45, 0.25);
      const lm = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.12, 0.52), this.lam('#8a9a64'));
      lm.position.set(0, 0.06, -0.25);
      lid.add(lm);
      g.add(base, lid);
    }
    g.position.set(c.pos.x, c.pos.y, c.pos.z);
    g.rotation.y = c.rot;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(g);
    this.chests.set(c.id, { c, mesh: g, lid, openT: 0 });
  }


  handle(ev) {
    switch (ev.type) {
      case 'pickupSpawned': {
        const pk = ev.pk;
        const { root, inner, card, glow, sparks } = this.makeMesh(pk.item);
        root.position.set(pk.pos.x, pk.pos.y, pk.pos.z);
        this.scene.add(root);
        this.pickups.set(pk.id, { pk, root, inner, card, glow, sparks });
        break;
      }
      case 'pickupRemoved': {
        const v = this.pickups.get(ev.pk.id);
        if (v) { this.scene.remove(v.root); this.pickups.delete(ev.pk.id); }
        break;
      }
      case 'chestPlaced': this.makeChest(ev.c); break;
      case 'chestOpened': {
        const v = this.chests.get(ev.c.id);
        if (v && v.mesh.userData.sparkle) v.mesh.userData.sparkle.visible = false;
        break;
      }
      case 'chestMoved': {
        const v = this.chests.get(ev.c.id);
        if (v) v.mesh.position.y = ev.c.pos.y;
        break;
      }
      default:
    }
  }

  update(dt, time, viewer) {
    for (const v of this.pickups.values()) {
      const { pk } = v;
      v.root.position.set(pk.pos.x, pk.pos.y, pk.pos.z);
      v.inner.rotation.y = time * 1.5 + pk.phase;
      v.inner.position.y = 0.55 + Math.sin(time * 2 + pk.phase) * 0.1;
      if (v.glow) {
        const pulse = 1 + Math.sin(time * 3 + pk.phase) * 0.15;
        v.glow.scale.set(pulse, 1, pulse);
        v.sparks.forEach((sp, i) => {
          const a = time * 1.8 + pk.phase + (i * Math.PI * 2) / 3;
          const h = ((time * 0.6 + i / 3 + pk.phase) % 1);
          sp.position.set(Math.cos(a) * 0.45, 0.1 + h * 1.6, Math.sin(a) * 0.45);
          sp.scale.setScalar(0.22 * (1 - h));
        });
      }
      // Rarity card floats over loot when you're close enough to care.
      if (v.card && viewer) {
        const d = Math.hypot(pk.pos.x - viewer.x, pk.pos.y - viewer.y, pk.pos.z - viewer.z);
        v.card.visible = pk.settled && d < 14;
        v.card.position.y = 1.55 + Math.sin(time * 2 + pk.phase) * 0.05;
      }
    }
    for (const v of this.chests.values()) {
      if (v.c.opened && v.openT < 1) {
        v.openT = Math.min(1, v.openT + dt * 3);
        v.lid.rotation.x = -v.openT * 1.6;
      }
      const sp = v.mesh.userData.sparkle;
      if (sp && sp.visible) {
        const s = 1.2 + Math.sin(time * 5 + v.c.pos.x) * 0.4;
        sp.scale.set(s, s, 1);
      }
    }
  }
}
