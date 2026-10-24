// Keyboard and mouse. Look angles update instantly every frame (so aiming never
// waits for a sim tick); everything else is folded into one command per tick,
// including presses that happen between ticks.
import { binds, settings } from './binds.js';
import { HELD, ACT, PIECES, emptyCommand } from '/shared/sim/controller.js';

const SLOT_ACTIONS = ['pickaxe', 'slot1', 'slot2', 'slot3', 'slot4', 'slot5'];

export class InputController {
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.hooks = hooks; // {running(), rebinding(), onLockChange(bool), localFighter()}
    this.keys = new Set();
    this.mdx = 0; this.mdy = 0;
    this.yaw = 0;
    this.pitch = -0.1;
    this.locked = false;
    this.mapOpen = false;
    this.seq = 0;
    this.shoulder = 1;
    this.wheel = null;
    this.emoteReq = 0;
    this.resetEdges();
    this.bind();
  }

  resetEdges() {
    this.act = 0;
    this.slot = -1;
    this.slotStep = 0;
    this.piece = -1;
    this.matStep = 0;
    this.emoteReq = 0;
  }

  held(action) { return this.keys.has(binds[action]); }

  // Every action bound to this input code, so a shared button (aim + reset
  // edit on right mouse) triggers both.
  actionsFor(code) {
    return Object.keys(binds).filter((a) => binds[a] === code);
  }

  down(code) {
    if (this.keys.has(code)) return;
    this.keys.add(code);
    for (const a of this.actionsFor(code)) {
      switch (a) {
        case 'jump': this.act |= ACT.JUMP; break;
        case 'fire': this.act |= ACT.FIRE; break;
        case 'interact': this.act |= ACT.INTERACT; break;
        case 'reload': this.act |= ACT.RELOAD; break;
        case 'build': this.act |= ACT.BUILD; break;
        case 'edit': this.act |= ACT.EDIT; break;
        case 'editReset': this.act |= ACT.EDIT_RESET; break;
        case 'aim': this.act |= ACT.AIM; break;
        case 'matCycle': this.act |= ACT.MAT; break;
        case 'swapShoulder': this.act |= ACT.SHOULDER; this.shoulder = -this.shoulder; break;
        case 'emote': this.openWheel(); break;
        case 'drop': this.act |= ACT.DROP; break;
        case 'map': this.mapOpen = !this.mapOpen; break;
        default:
          if (SLOT_ACTIONS.includes(a)) this.slot = SLOT_ACTIONS.indexOf(a);
          else if (PIECES.includes(a)) this.piece = PIECES.indexOf(a);
      }
    }
  }

  up(code) {
    if (!this.keys.delete(code)) return;
    if (this.actionsFor(code).includes('fire')) this.act |= ACT.FIRE_UP;
    if (this.actionsFor(code).includes('emote')) this.closeWheel();
  }

  // Hold the emote key: the mouse picks one of six slots. A quick tap with no
  // movement plays the first equipped emote.
  openWheel() {
    const slots = this.hooks.emoteSlots ? this.hooks.emoteSlots() : [];
    this.wheel = { x: 0, y: 0, sel: -1, at: performance.now(), slots };
    this.hooks.onWheel?.(this.wheel);
  }

  closeWheel() {
    const w = this.wheel;
    if (!w) return;
    this.wheel = null;
    this.hooks.onWheel?.(null);
    let sel = w.sel;
    if (sel < 0 && performance.now() - w.at < 250) sel = 0;
    const clip = sel >= 0 ? w.slots[sel] : 0;
    if (clip) this.emoteReq = clip;
  }

  bind() {
    const c = this.canvas;
    const bound = () => new Set(Object.values(binds));
    window.addEventListener('keydown', (e) => {
      if (!this.hooks.running() || this.hooks.rebinding()) return;
      if (e.code === 'Space' || e.code === 'Tab' || bound().has(e.code)) e.preventDefault();
      this.down(e.code);
    });
    window.addEventListener('keyup', (e) => this.up(e.code));
    c.addEventListener('mousedown', (e) => {
      if (!this.hooks.running()) return;
      if (!this.locked) { this.lock(); return; }
      e.preventDefault();
      this.down(`Mouse${e.button}`);
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button >= 3) e.preventDefault(); // keep side buttons from navigating back
      this.up(`Mouse${e.button}`);
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      if (this.wheel) {
        const w = this.wheel;
        w.x = Math.max(-90, Math.min(90, w.x + e.movementX));
        w.y = Math.max(-90, Math.min(90, w.y + e.movementY));
        if (Math.hypot(w.x, w.y) > 28) {
          // Six wedges, first one straight up, clockwise.
          const a = (Math.atan2(w.x, -w.y) + Math.PI * 2) % (Math.PI * 2);
          w.sel = Math.floor((a + Math.PI / 6) / (Math.PI / 3)) % 6;
        }
        this.hooks.onWheel?.(w);
        return;
      }
      this.mdx += e.movementX;
      this.mdy += e.movementY;
    });
    window.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      const f = this.hooks.localFighter();
      const step = e.deltaY > 0 ? 1 : -1;
      if (f && f.buildMode) this.matStep = step;
      else this.slotStep = step;
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === c;
      if (!this.locked) this.keys.clear();
      this.hooks.onLockChange(this.locked);
    });
  }

  lock() {
    const p = this.canvas.requestPointerLock?.();
    if (p && p.catch) p.catch(() => {});
  }

  // Apply mouse movement to the look angles. Runs every rendered frame.
  updateLook(f) {
    if (f) f.shoulder = this.shoulder;
    let sens = 0.0022 * (settings.sensitivity || 1);
    if (f && f.scoped) sens *= 0.25;
    else if (f && f.ads) sens *= 0.6;
    this.yaw -= this.mdx * sens;
    this.pitch -= this.mdy * sens;
    this.pitch = Math.max(-1.45, Math.min(1.35, this.pitch));
    this.mdx = 0; this.mdy = 0;
  }

  // Build this tick's command and clear the edge events it consumed.
  sample() {
    const cmd = emptyCommand();
    cmd.seq = ++this.seq;
    cmd.yaw = this.yaw;
    cmd.pitch = this.pitch;
    cmd.mz = (this.held('forward') ? 1 : 0) - (this.held('back') ? 1 : 0);
    cmd.mx = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0);
    let held = 0;
    if (this.held('fire')) held |= HELD.FIRE;
    if (this.held('aim')) held |= HELD.AIM;
    if (this.held('jump')) held |= HELD.JUMP;
    if (this.held('sprint')) held |= HELD.SPRINT;
    if (this.held('crouch')) held |= HELD.CROUCH;
    if (this.held('interact')) held |= HELD.INTERACT;
    if (this.held('forward')) held |= HELD.FORWARD;
    if (settings.confirmEditOnRelease) held |= HELD.CONFIRM_RELEASE;
    cmd.held = held;
    cmd.act = this.act;
    cmd.slot = this.slot;
    cmd.slotStep = this.slotStep;
    cmd.piece = this.piece;
    cmd.matStep = this.matStep;
    cmd.emote = this.emoteReq || (this.held('forward') || this.held('back') || this.held('left') || this.held('right') ? -1 : 0);
    this.resetEdges();
    return cmd;
  }
}
