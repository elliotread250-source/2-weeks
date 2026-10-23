// Customisable key binds. Every action maps to one input code: a keyboard
// `event.code` (KeyW, ShiftLeft, Digit1...) or a mouse button (Mouse0 = left,
// Mouse1 = middle, Mouse2 = right, Mouse3/Mouse4 = side buttons).
const STORE = 'twoweeks.binds.v1';
const SETTINGS_STORE = 'twoweeks.settings.v1';

export const ACTIONS = [
  { id: 'forward', label: 'Move forward', group: 'Movement', def: 'KeyW' },
  { id: 'back', label: 'Move back', group: 'Movement', def: 'KeyS' },
  { id: 'left', label: 'Move left', group: 'Movement', def: 'KeyA' },
  { id: 'right', label: 'Move right', group: 'Movement', def: 'KeyD' },
  { id: 'jump', label: 'Jump / glider', group: 'Movement', def: 'Space' },
  { id: 'sprint', label: 'Sprint', group: 'Movement', def: 'ShiftLeft' },
  { id: 'fire', label: 'Fire / place / select tiles', group: 'Combat', def: 'Mouse0' },
  { id: 'aim', label: 'Aim down sights', group: 'Combat', def: 'Mouse2' },
  { id: 'reload', label: 'Reload', group: 'Combat', def: 'KeyR' },
  { id: 'interact', label: 'Pick up / search', group: 'Combat', def: 'KeyE' },
  { id: 'pickaxe', label: 'Pickaxe', group: 'Inventory', def: 'Digit1' },
  { id: 'slot1', label: 'Slot 1', group: 'Inventory', def: 'Digit2' },
  { id: 'slot2', label: 'Slot 2', group: 'Inventory', def: 'Digit3' },
  { id: 'slot3', label: 'Slot 3', group: 'Inventory', def: 'Digit4' },
  { id: 'slot4', label: 'Slot 4', group: 'Inventory', def: 'Digit5' },
  { id: 'slot5', label: 'Slot 5', group: 'Inventory', def: 'Digit6' },
  { id: 'build', label: 'Toggle build mode', group: 'Building', def: 'KeyQ' },
  { id: 'wall', label: 'Wall', group: 'Building', def: 'KeyZ' },
  { id: 'floor', label: 'Floor', group: 'Building', def: 'KeyX' },
  { id: 'ramp', label: 'Ramp / stairs', group: 'Building', def: 'KeyC' },
  { id: 'cone', label: 'Cone / roof', group: 'Building', def: 'KeyV' },
  { id: 'matCycle', label: 'Change material', group: 'Building', def: 'KeyT' },
  { id: 'edit', label: 'Edit', group: 'Building', def: 'KeyF' },
  { id: 'editReset', label: 'Reset edit', group: 'Building', def: 'Mouse2' },
  { id: 'map', label: 'Map', group: 'Other', def: 'KeyM' },
];

export const DEFAULT_BINDS = Object.fromEntries(ACTIONS.map((a) => [a.id, a.def]));
export const DEFAULT_SETTINGS = { confirmEditOnRelease: true, sensitivity: 1, shadows: true, detail: 'high' };

function load(key, defaults) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...defaults };
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return { ...defaults };
  }
}

function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
}

export const binds = load(STORE, DEFAULT_BINDS);
export const settings = load(SETTINGS_STORE, DEFAULT_SETTINGS);

export function setBind(action, code) {
  binds[action] = code;
  save(STORE, binds);
}

export function resetBinds() {
  Object.assign(binds, DEFAULT_BINDS);
  save(STORE, binds);
}

export function setSetting(key, value) {
  settings[key] = value;
  save(SETTINGS_STORE, settings);
}

const NAMED = {
  Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5',
  Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
  AltLeft: 'L-Alt', AltRight: 'R-Alt', Tab: 'Tab', CapsLock: 'Caps', Enter: 'Enter', Backspace: 'Bksp',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'",
  Comma: ',', Period: '.', Slash: '/', Backslash: '\\', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
};

export function keyLabel(code) {
  if (!code) return 'None';
  if (NAMED[code]) return NAMED[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

export function label(action) {
  return keyLabel(binds[action]);
}
