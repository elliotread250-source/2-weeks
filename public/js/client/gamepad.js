// Controller support (standard-mapping gamepads: Xbox, PlayStation, Switch Pro).
// This file only turns a raw gamepad snapshot into game actions; InputController
// feeds them through the same code path as keyboard keys, so a controller can
// never do anything a keyboard cannot.

export const DEADZONE = 0.18;

// Button index (standard mapping) -> action name.
export const PAD_BUTTONS = {
  0: 'jump', 1: 'crouch', 2: 'interact', 3: 'build', 4: 'slotPrev', 5: 'slotNext', 6: 'aim', 7: 'fire',
  8: 'map', 10: 'sprint', 11: 'edit', 12: 'wall', 13: 'floor', 14: 'ramp', 15: 'cone',
};

// Radial deadzone with the live range rescaled to 0..1, so small drift does
// nothing and full deflection still reaches 1.
export function stick(x, y, dead = DEADZONE) {
  const m = Math.hypot(x, y);
  if (m < dead) return { x: 0, y: 0 };
  const k = (Math.min(1, m) - dead) / (1 - dead) / m;
  return { x: x * k, y: y * k };
}

// Snapshot -> { move: {x, y}, look: {x, y}, held: Set<action> }
export function readPad(pad) {
  const held = new Set();
  if (!pad) return { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, held };
  pad.buttons.forEach((b, i) => { if ((b.pressed || b.value > 0.5) && PAD_BUTTONS[i]) held.add(PAD_BUTTONS[i]); });
  const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes;
  return { move: stick(lx, ly), look: stick(rx, ry), held };
}

// Right-stick look speed in radians per second at full deflection. The curve
// keeps fine aim gentle and still allows a fast flick.
export function lookRate(v, sensitivity = 1) {
  return Math.sign(v) * Math.pow(Math.abs(v), 1.7) * 3.4 * sensitivity;
}

export function activePad() {
  const list = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of list) if (p && p.connected && p.mapping === 'standard') return p;
  return null;
}
