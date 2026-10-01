// DOM HUD: health/shield bars, hotbar, mats, minimap, storm timer, kill feed.
import { WEAPONS, CONSUMABLES, RARITIES, PLAYER } from './config.js';
import { TERRAIN_SIZE, paintMinimap, POIS, poiAt } from './terrain.js';
import { formatTime } from './util.js';
import { iconSVG } from './icons.js';

const $ = (s) => document.querySelector(s);

export class HUD {
  constructor() {
    this.root = $('#hud');
    this.shieldFill = $('#bars .shield .fill');
    this.shieldText = $('#bars .shield span');
    this.healthFill = $('#bars .health .fill');
    this.healthText = $('#bars .health span');
    this.hotbar = $('#hotbar');
    this.ammo = $('#ammo-readout');
    this.alive = $('#alive-count');
    this.kills = $('#kill-count');
    this.stormInfo = $('#storm-info');
    this.poiName = $('#poi-name');
    this.killfeed = $('#killfeed');
    this.centerMsg = $('#center-msg');
    this.subMsg = $('#sub-msg');
    this.prompt = $('#prompt');
    this.progress = $('#progress');
    this.progressFill = $('#progress .fill');
    this.progressText = $('#progress span');
    this.crosshair = $('#crosshair');
    this.hitmarkerEl = $('#hitmarker');
    this.vignette = $('#vignette');
    this.stormVig = $('#storm-vignette');
    this.dmgDir = $('#damage-dir');
    this.scope = $('#scope');
    this.matEls = {};
    for (const el of document.querySelectorAll('#mats .mat')) this.matEls[el.dataset.mat] = el;
    this.pieceEls = {};
    for (const el of document.querySelectorAll('#build-bar .piece')) this.pieceEls[el.dataset.piece] = el;
    this.matGainEl = $('#mat-gain');
    this.modeTag = $('#mode-tag');
    this.minimap = $('#minimap');
    this.bigmap = $('#bigmap-canvas');
    this.mapBase = document.createElement('canvas');
    this.mapBase.width = this.mapBase.height = 360;
    paintMinimap(this.mapBase);
    this.cache = {};
    this.msgT = 0;
    this.hitT = 0;
    this.kickV = 0;
    this.gain = { mat: '', n: 0, t: 0 };
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
  }

  set(key, el, value, prop = 'textContent') {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    el[prop] = value;
  }

  message(text, sub = '', dur = 3) {
    this.centerMsg.textContent = text;
    this.subMsg.textContent = sub;
    this.centerMsg.classList.add('show');
    this.msgT = dur;
  }

  feed(text, mine = false) {
    const d = document.createElement('div');
    d.textContent = text;
    if (mine) d.className = 'me';
    this.killfeed.prepend(d);
    while (this.killfeed.children.length > 6) this.killfeed.lastChild.remove();
    setTimeout(() => d.remove(), 6000);
  }

  hitMarker(head) {
    this.hitT = 0.18;
    this.hitmarkerEl.classList.toggle('head', !!head);
  }

  kick(k) {
    this.kickV = Math.min(1.5, this.kickV + k);
  }

  matGain(mat, n) {
    if (this.gain.mat === mat && this.gain.t > 0) this.gain.n += n;
    else this.gain = { mat, n, t: 0 };
    this.gain.t = 1.2;
    this.matGainEl.textContent = `+${this.gain.n} ${mat}`;
    this.matGainEl.classList.add('show');
  }

  damageFlash(fromPos) {
    this.vignette.style.opacity = 1;
    this.vigT = 0.35;
    if (fromPos && this.playerRef) {
      const p = this.playerRef;
      const dx = fromPos.x - p.pos.x, dz = fromPos.z - p.pos.z;
      const y = this.camYaw;
      // Angle from camera forward, clockwise, which is what CSS rotate wants.
      const rel = Math.atan2(dx * Math.cos(y) - dz * Math.sin(y), -dx * Math.sin(y) - dz * Math.cos(y));
      const arc = document.createElement('div');
      arc.className = 'arc';
      arc.style.transform = `rotate(${rel}rad)`;
      this.dmgDir.appendChild(arc);
      setTimeout(() => arc.remove(), 700);
    }
  }

  update(dt, game) {
    const p = game.player;
    this.playerRef = p;
    this.camYaw = game.controller.camYaw;

    if (this.msgT > 0) {
      this.msgT -= dt;
      if (this.msgT <= 0) { this.centerMsg.classList.remove('show'); this.subMsg.textContent = ''; }
    }
    this.hitT -= dt;
    this.hitmarkerEl.style.opacity = this.hitT > 0 ? 1 : 0;
    if (this.vigT > 0) { this.vigT -= dt; if (this.vigT <= 0) this.vignette.style.opacity = 0; }
    if (this.gain.t > 0) { this.gain.t -= dt; if (this.gain.t <= 0) this.matGainEl.classList.remove('show'); }

    // Bars.
    const hp = Math.ceil(p.hp), sh = Math.ceil(p.shield);
    this.set('hpw', this.healthFill.style, `${(hp / PLAYER.maxHealth) * 100}%`, 'width');
    this.set('hpt', this.healthText, String(hp));
    this.set('shw', this.shieldFill.style, `${(sh / PLAYER.maxShield) * 100}%`, 'width');
    this.set('sht', this.shieldText, String(sh));

    // Crosshair spread.
    const c = game.controller;
    this.kickV = Math.max(0, this.kickV - dt * 6);
    let gap = 6;
    const w = p.weapon;
    if (w) {
      const spec = WEAPONS[w.type];
      const moving = Math.hypot(p.vel.x, p.vel.z) > 1;
      let s = c.ads ? spec.adsSpread : spec.spread;
      if (spec.pellets === 1) s += p.bloom + (moving ? 0.015 : 0) + (p.onGround ? 0 : 0.035);
      gap = 4 + s * 500 + this.kickV * 6;
    }
    gap = Math.round(gap);
    if (this.cache.gap !== gap) {
      this.cache.gap = gap;
      const [t, b, l, r] = this.crosshair.querySelectorAll('i');
      t.style.top = `${-gap - 8}px`; b.style.top = `${gap}px`;
      l.style.left = `${-gap - 8}px`; r.style.left = `${gap}px`;
    }
    this.set('xh', this.crosshair, c.buildMode || c.editMode ? 'build' : '', 'className');
    this.set('scope', this.scope, c.scoped ? 'on' : '', 'className');
    this.crosshair.style.display = c.scoped || p.state !== 'ground' || !p.alive ? 'none' : 'block';

    // Hotbar.
    const sig = JSON.stringify([p.selected, c.buildMode, p.slots.map((s) => s && [s.type, s.rarity, s.count, s.mag])]);
    if (this.cache.hot !== sig) {
      this.cache.hot = sig;
      let html = `<div class="slot pick ${p.selected === 0 && !c.buildMode ? 'sel' : ''}"><span class="num">1</span>${iconSVG('pickaxe')}</div>`;
      p.slots.forEach((s, i) => {
        const sel = p.selected === i + 1 && !c.buildMode ? 'sel' : '';
        if (!s) { html += `<div class="slot ${sel}"><span class="num">${i + 2}</span></div>`; return; }
        if (s.kind === 'weapon') {
          html += `<div class="slot r${s.rarity} ${sel}" title="${WEAPONS[s.type].name}"><span class="num">${i + 2}</span>${iconSVG(s.type)}<span class="cnt">${s.mag}</span></div>`;
        } else {
          const cs = CONSUMABLES[s.type];
          html += `<div class="slot r${cs.rarity} ${sel}" title="${cs.name}"><span class="num">${i + 2}</span>${iconSVG(s.type)}<span class="cnt">x${s.count}</span></div>`;
        }
      });
      this.hotbar.innerHTML = html;
    }

    // Ammo readout.
    let ammoText = '';
    if (c.buildMode) ammoText = '';
    else if (w) ammoText = `${w.mag} <small>/ ${p.ammo[WEAPONS[w.type].ammo]}</small>`;
    this.set('ammo', this.ammo, ammoText, 'innerHTML');

    // Materials.
    for (const m of ['wood', 'brick', 'metal']) {
      this.set(`m${m}`, this.matEls[m].querySelector('b'), String(p.mats[m]));
      this.set(`ms${m}`, this.matEls[m], `mat ${c.buildMode && c.buildMat === m ? 'sel' : ''}`, 'className');
    }
    this.set('building', this.root, c.buildMode ? 'building' : '', 'className');
    for (const [k, el] of Object.entries(this.pieceEls)) {
      this.set(`pc${k}`, el, `piece ${c.buildPiece === k ? 'sel' : ''}`, 'className');
    }
    this.set('mode', this.modeTag, c.editMode ? 'EDIT MODE' : c.buildMode ? `BUILD: ${c.buildMat.toUpperCase()}` : '');

    // Counters.
    this.set('alive', this.alive, String(game.aliveCount()));
    this.set('kills', this.kills, String(p.kills));

    const st = game.storm;
    let stormText = '';
    if (game.phase === 'bus') stormText = `Bus doors close in ${formatTime(game.bus.timeLeft)}`;
    else if (st.mode === 'wait') stormText = `Storm shrinks in ${formatTime(st.timer)}`;
    else if (st.mode === 'shrink') stormText = `Storm shrinking ${formatTime(st.timer)}`;
    else if (st.mode === 'done') stormText = 'Final circle';
    if (game.resurgence) stormText += ' · Resurgence ON';
    this.set('storm', this.stormInfo, stormText);
    const poi = poiAt(p.pos.x, p.pos.z);
    this.set('poi', this.poiName, poi ? poi.name : '');

    const out = st.mode !== 'idle' && st.outside(p.pos) && p.alive;
    this.stormVig.style.opacity = out ? 1 : 0;

    this.drawMap(this.minimap, game, true);
    if (c.mapOpen) this.drawMap(this.bigmap, game, false);
  }

  // Interaction prompt + progress bar.
  setPrompt(html) {
    if (this.cache.prompt === html) return;
    this.cache.prompt = html;
    this.prompt.innerHTML = html || '';
    this.prompt.classList.toggle('show', !!html);
  }

  setProgress(frac, label) {
    if (frac == null) { this.progress.classList.remove('show'); return; }
    this.progress.classList.add('show');
    this.progressFill.style.width = `${Math.min(1, frac) * 100}%`;
    this.progressText.textContent = label || '';
  }

  drawMap(canvas, game, mini) {
    const ctx = canvas.getContext('2d');
    const S = canvas.width;
    const p = game.player;
    // Minimap is a zoomed window around the player; big map shows everything.
    const viewSize = mini ? 160 : TERRAIN_SIZE;
    const cx = mini ? p.pos.x : 0, cz = mini ? p.pos.z : 0;
    const scale = S / viewSize;
    const toS = (x, z) => [(x - cx) * scale + S / 2, (z - cz) * scale + S / 2];

    ctx.fillStyle = '#2fb6e8';
    ctx.fillRect(0, 0, S, S);
    const baseScale = this.mapBase.width / TERRAIN_SIZE;
    const sx = (cx - viewSize / 2 + TERRAIN_SIZE / 2) * baseScale;
    const sz = (cz - viewSize / 2 + TERRAIN_SIZE / 2) * baseScale;
    ctx.drawImage(this.mapBase, sx, sz, viewSize * baseScale, viewSize * baseScale, 0, 0, S, S);

    if (!mini) {
      ctx.font = 'bold 15px Oswald, sans-serif';
      ctx.textAlign = 'center';
      for (const poi of POIS) {
        const [x, y] = toS(poi.x, poi.z);
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillText(poi.name.toUpperCase(), x + 1, y + 1);
        ctx.fillStyle = '#fff';
        ctx.fillText(poi.name.toUpperCase(), x, y);
      }
    }

    // Storm: purple outside current circle, white ring for the next one.
    const st = game.storm;
    if (st.mode !== 'idle') {
      const [scx, scz] = toS(st.center.x, st.center.y);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, S, S);
      ctx.arc(scx, scz, st.radius * scale, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(130,50,220,.45)';
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#d9a8ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(scx, scz, st.radius * scale, 0, Math.PI * 2);
      ctx.stroke();
      const [ncx, ncz] = toS(st.next.c.x, st.next.c.y);
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ncx, ncz, st.next.r * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Bus route.
    if (game.phase === 'bus' || (!mini && game.bus && game.time < 40)) {
      const b = game.bus;
      const [ax, az] = toS(b.start.x, b.start.z);
      const [bx, bz] = toS(b.end.x, b.end.z);
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = '#ffe94a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ax, az); ctx.lineTo(bx, bz); ctx.stroke();
      ctx.setLineDash([]);
      const [px, pz] = toS(b.pos.x, b.pos.z);
      ctx.fillStyle = '#2e86de';
      ctx.fillRect(px - 5, pz - 4, 10, 8);
    }

    // Player arrow.
    const [px, pz] = toS(p.pos.x, p.pos.z);
    const yaw = game.controller.camYaw;
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-yaw);
    ctx.fillStyle = '#ffe94a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
