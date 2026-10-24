// Draws player builds from sim events: placement, edits, damage, completion,
// collapse and destruction. Also owns the blueprint preview and the edit tile
// overlay, which the local client drives from its own fighter state.
import * as THREE from 'three';
import { TILE, LEVEL_H } from '/shared/config.js';
import { GRID, CONE_RISE, FLOOR_T, coneHeights } from '/shared/sim/building.js';
import { getTextures } from './textures.js';

const T = TILE, H = LEVEL_H;
const GROW_TIME = 0.28;
const DIR_ROT = [Math.PI / 2, -Math.PI / 2, 0, Math.PI];

function tileUV(g, cols, rows, c, r) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (c + uv.getX(i)) / cols, (r + uv.getY(i)) / rows);
  }
}

// One THREE geometry per solid tile of a piece.
export function pieceGeometries(p) {
  const x0 = p.gx * T, z0 = p.gz * T;
  const geos = [];
  const edits = p.edits || new Set();
  const WALL_T = 0.3;
  if (p.type === 'wall') {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (edits.has(r * 3 + c)) continue;
        const u0 = (c * T) / 3, v0 = (r * H) / 3;
        let g;
        if (p.axis === 'x') {
          g = new THREE.BoxGeometry(T / 3, H / 3, WALL_T);
          g.translate(x0 + u0 + T / 6, p.baseY + v0 + H / 6, z0);
        } else {
          g = new THREE.BoxGeometry(WALL_T, H / 3, T / 3);
          g.translate(x0, p.baseY + v0 + H / 6, z0 + u0 + T / 6);
        }
        tileUV(g, 3, 3, c, r);
        geos.push(g);
      }
    }
  } else if (p.type === 'floor') {
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        if (edits.has(r * 2 + c)) continue;
        const g = new THREE.BoxGeometry(T / 2, FLOOR_T, T / 2);
        g.translate(x0 + c * (T / 2) + T / 4, p.baseY - FLOOR_T / 2, z0 + r * (T / 2) + T / 4);
        tileUV(g, 2, 2, c, r);
        geos.push(g);
      }
    }
  } else if (p.type === 'ramp') {
    const len = Math.hypot(T, H);
    const g = new THREE.BoxGeometry(T, FLOOR_T, len);
    g.rotateX(-Math.atan2(H, T));
    g.rotateY(DIR_ROT[p.dir]);
    g.translate(x0 + T / 2, p.baseY + H / 2 - FLOOR_T / 2, z0 + T / 2);
    geos.push(g);
  } else {
    const c = coneHeights(p);
    const top = p.baseY + CONE_RISE;
    const v = [[x0, c[0], z0], [x0 + T, c[1], z0], [x0 + T, c[2], z0 + T], [x0, c[3], z0 + T], [x0 + T / 2, top, z0 + T / 2]];
    const pos = [], uv = [];
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]];
    for (const t of [[0, 4, 1], [1, 4, 2], [2, 4, 3], [3, 4, 0]]) for (const i of t) { pos.push(...v[i]); uv.push(...uvs[i]); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    geos.push(g);
  }
  return geos;
}

export class BuildView {
  constructor(scene, hooks = {}) {
    this.scene = scene;
    this.hooks = hooks; // {destroyed(piece, mode, mat)}
    this.views = new Map(); // piece id -> {group, dmgMat}
    this.shaking = [];
    this.growing = [];
    this.time = 0;
    const tex = getTextures();
    this.mats = {};
    this.buildingMats = {};
    for (const m of ['wood', 'brick', 'metal']) {
      this.mats[m] = new THREE.MeshLambertMaterial({ map: tex[m], side: THREE.DoubleSide });
      this.buildingMats[m] = new THREE.MeshLambertMaterial({ map: tex[m], side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
    }
    this.blueprint = new THREE.MeshBasicMaterial({ map: tex.blueprint, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    this.blueprintBad = new THREE.MeshBasicMaterial({ color: '#ff4a4a', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    this.preview = new THREE.Group();
    this.preview.visible = false;
    scene.add(this.preview);
    this.previewKey = '';
    this.editGroup = new THREE.Group();
    this.editGroup.visible = false;
    scene.add(this.editGroup);
    this.editKey = '';
    this.tileMat = new THREE.MeshBasicMaterial({ color: '#7fd0ff', transparent: true, opacity: 0.35, depthTest: false, side: THREE.DoubleSide });
    this.tileSelMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, depthTest: false, side: THREE.DoubleSide });
  }

  fill(v, p) {
    v.group.clear();
    const mat = v.dmgMat || (p.built ? this.mats[p.mat] : this.buildingMats[p.mat]);
    for (const g of pieceGeometries(p)) {
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      v.group.add(m);
    }
  }

  ensureDmgMat(v, p) {
    if (v.dmgMat) return;
    v.dmgMat = (p.built ? this.mats : this.buildingMats)[p.mat].clone();
    for (const m of v.group.children) m.material = v.dmgMat;
  }

  handle(ev) {
    const p = ev.p;
    switch (ev.type) {
      case 'buildPlaced': {
        // `born` drives the grow-in pop; pieces that already exist (late join) skip it.
        const v = { group: new THREE.Group(), dmgMat: null, shakeT: 0, collapsing: false, born: ev.fresh === false || p.built ? -9 : this.time, baseY: p.baseY };
        if (v.born > -9) this.growing.push(v);
        this.views.set(p.id, v);
        this.scene.add(v.group);
        this.fill(v, p);
        break;
      }
      case 'buildChanged': {
        const v = this.views.get(p.id);
        if (v) this.fill(v, p);
        break;
      }
      case 'buildDamaged': {
        const v = this.views.get(p.id);
        if (!v) break;
        v.shakeT = 0.18;
        this.ensureDmgMat(v, p);
        v.dmgMat.color.setScalar(0.45 + 0.55 * Math.max(0, p.hp / p.maxHp));
        if (!this.shaking.includes(v)) this.shaking.push(v);
        break;
      }
      case 'buildCollapsing': {
        const v = this.views.get(p.id);
        if (!v) break;
        v.collapsing = true;
        this.ensureDmgMat(v, p);
        v.dmgMat.color.setScalar(0.55);
        v.shakeT = 2;
        if (!this.shaking.includes(v)) this.shaking.push(v);
        break;
      }
      case 'buildComplete': {
        const v = this.views.get(p.id);
        if (!v) break;
        if (v.dmgMat) { v.dmgMat.transparent = false; v.dmgMat.opacity = 1; v.dmgMat.needsUpdate = true; }
        else for (const m of v.group.children) m.material = this.mats[p.mat];
        break;
      }
      case 'buildDestroyed': {
        const v = this.views.get(p.id);
        if (!v) break;
        this.scene.remove(v.group);
        this.views.delete(p.id);
        this.shaking = this.shaking.filter((s) => s !== v);
        this.growing = this.growing.filter((s) => s !== v);
        if (this.hooks.destroyed) this.hooks.destroyed(p, ev.mode, this.mats[p.mat]);
        break;
      }
      default:
    }
  }

  update(dt) {
    this.time += dt;
    // Grow-in: a fresh piece rises from its base with a small overshoot, so
    // placing feels like it lands rather than appears.
    for (let i = this.growing.length - 1; i >= 0; i--) {
      const v = this.growing[i];
      const t = Math.min(1, (this.time - v.born) / GROW_TIME);
      const e = 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2); // easeOutBack
      const s = Math.max(0.05, e);
      v.group.scale.y = s;
      v.growY = v.baseY * (1 - s);
      v.group.position.y = v.growY;
      if (t >= 1) { v.group.scale.y = 1; v.group.position.y = 0; v.growY = 0; this.growing.splice(i, 1); }
    }
    for (let i = this.shaking.length - 1; i >= 0; i--) {
      const v = this.shaking[i];
      if (v.shakeT <= 0) { this.shaking.splice(i, 1); continue; }
      v.shakeT -= dt;
      const a = v.collapsing ? 0.05 : Math.max(0, v.shakeT) * 0.4;
      const gy = v.growY || 0;
      v.group.position.set((Math.random() - 0.5) * a, gy + (Math.random() - 0.5) * a * 0.5, (Math.random() - 0.5) * a);
      if (v.shakeT <= 0) v.group.position.set(0, gy, 0);
    }
  }

  setPreview(target, valid) {
    if (!target) { this.preview.visible = false; return; }
    const key = target.key + (target.dir ?? '') + valid;
    if (key !== this.previewKey) {
      this.previewKey = key;
      this.preview.clear();
      for (const g of pieceGeometries({ ...target, edits: new Set() })) this.preview.add(new THREE.Mesh(g, valid ? this.blueprint : this.blueprintBad));
    }
    this.preview.visible = true;
  }

  // Tile overlay for the edit session `e` ({piece, selected}) or null.
  setEdit(e) {
    if (!e) { this.editGroup.visible = false; this.editKey = ''; return; }
    const key = `${e.piece.id}:${e.selected.join(',')}`;
    if (key === this.editKey) return;
    this.editKey = key;
    this.editGroup.clear();
    const p = e.piece;
    const x0 = p.gx * T, z0 = p.gz * T;
    const [cols, rows] = GRID[p.type];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const sel = e.selected.includes(i);
        const pad = 0.08;
        let g;
        if (p.type === 'wall') {
          g = new THREE.PlaneGeometry(T / cols - pad, H / rows - pad);
          if (p.axis === 'z') g.rotateY(Math.PI / 2);
          const u = ((c + 0.5) * T) / cols, v = ((r + 0.5) * H) / rows;
          if (p.axis === 'x') g.translate(x0 + u, p.baseY + v, z0);
          else g.translate(x0, p.baseY + v, z0 + u);
        } else {
          g = new THREE.PlaneGeometry(T / cols - pad, T / rows - pad);
          g.rotateX(-Math.PI / 2);
          const y = p.type === 'floor' ? p.baseY + 0.05 : p.baseY + (p.type === 'ramp' ? H / 2 : CONE_RISE / 2);
          g.translate(x0 + ((c + 0.5) * T) / cols, y, z0 + ((r + 0.5) * T) / rows);
        }
        const m = new THREE.Mesh(g, sel ? this.tileSelMat : this.tileMat);
        m.renderOrder = 20;
        this.editGroup.add(m);
      }
    }
    this.editGroup.visible = true;
  }
}
