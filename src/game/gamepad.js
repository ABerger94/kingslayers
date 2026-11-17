// Xbox (and other) controller support via the browser Gamepad API.
// The pad is read once per frame. Analog values (sticks, triggers) are exposed directly; digital
// buttons are translated into the same virtual keys / mouse actions the keyboard uses, so the
// shooter and command code paths stay the same regardless of input device.
//
// Browsers report controllers in one of two ways:
//  * "standard" mapping (most Xbox pads in Chrome/Edge over USB or the Xbox wireless adapter)
//  * a raw, non-standard layout (common over Bluetooth): buttons in a different order, triggers as
//    axes that rest at -1, and the D-pad as a single "hat" axis.
// We handle both: standard pads are read directly; non-standard pads go through a layout guessed
// from their resting state, or through a mapping the player recorded in Controller Setup.

// Standard mapping button indices
export const BTN = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, LS: 10, RS: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
};

const STICK_DEADZONE = 0.18;
const TRIGGER_THRESHOLD = 0.35;
const STORAGE_PREFIX = 'kingslayers.padmap.';

function stick(x, y) {
  const m = Math.hypot(x, y);
  if (m < STICK_DEADZONE) return [0, 0];
  // Radial deadzone, rescaled so movement starts smoothly from zero
  const k = Math.min(1, (m - STICK_DEADZONE) / (1 - STICK_DEADZONE)) / m;
  return [x * k, y * k];
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// DirectInput-style hat switch: one axis encodes all 8 D-pad directions; > 1 means centred
export function isHatRest(v) { return v > 1.05 && v < 1.5; }
export function decodeHat(v) {
  const d = { up: false, down: false, left: false, right: false };
  if (v === undefined || v > 1.05 || v < -1.05) return d;
  const step = Math.round((v + 1) / (2 / 7)); // 0..7 clockwise from up
  d.up = step === 0 || step === 1 || step === 7;
  d.right = step >= 1 && step <= 3;
  d.down = step >= 3 && step <= 5;
  d.left = step >= 5 && step <= 7;
  return d;
}

function loadMap(id) {
  try { const s = localStorage.getItem(STORAGE_PREFIX + id); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function saveMap(id, map) {
  try { if (map) localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(map)); else localStorage.removeItem(STORAGE_PREFIX + id); } catch { /* storage unavailable */ }
}

// A best guess for a non-standard pad, from how it looks at rest:
//  - an axis resting above 1 is the D-pad hat
//  - axes resting near -1 are the triggers
//  - the remaining axes, in order, are left X, left Y, right X, right Y
//  - buttons: the gapped HID layout (A0 B1 X3 Y4 LB6 RB7 View10 Menu11 L3 13 R3 14) when there are
//    15+ buttons, otherwise the XInput order (A B X Y LB RB View Menu L3 R3)
export function guessMap(gp, rest) {
  const map = { buttons: {}, guessed: true };
  const hat = rest.findIndex(isHatRest);
  const triggers = [], sticks = [];
  rest.forEach((v, i) => {
    if (i === hat) return;
    if (v < -0.9) triggers.push(i); else sticks.push(i);
  });
  const st = (i) => (i === undefined ? null : { a: i, rest: 0, full: 1 });
  map.lx = st(sticks[0]); map.ly = st(sticks[1]); map.rx = st(sticks[2]); map.ry = st(sticks[3]);
  const gapped = gp.buttons.length >= 15;
  const order = gapped ? [0, 1, 3, 4, 6, 7, null, null, 10, 11, 13, 14] : [0, 1, 2, 3, 4, 5, null, null, 6, 7, 8, 9];
  order.forEach((b, i) => { if (b !== null && b < gp.buttons.length) map.buttons[i] = { b }; });
  // triggers: analog axes if present, otherwise buttons
  if (triggers.length >= 2) {
    map.buttons[BTN.LT] = { a: triggers[0], rest: rest[triggers[0]], full: 1 };
    map.buttons[BTN.RT] = { a: triggers[1], rest: rest[triggers[1]], full: 1 };
  } else if (gapped) {
    map.buttons[BTN.LT] = { b: 8 }; map.buttons[BTN.RT] = { b: 9 };
  }
  if (hat >= 0) {
    map.buttons[BTN.UP] = { h: hat, dir: 'up' }; map.buttons[BTN.DOWN] = { h: hat, dir: 'down' };
    map.buttons[BTN.LEFT] = { h: hat, dir: 'left' }; map.buttons[BTN.RIGHT] = { h: hat, dir: 'right' };
  } else if (!gapped && gp.buttons.length >= 14) {
    map.buttons[BTN.UP] = { b: 10 }; map.buttons[BTN.DOWN] = { b: 11 }; map.buttons[BTN.LEFT] = { b: 12 }; map.buttons[BTN.RIGHT] = { b: 13 };
  }
  return map;
}

// Value (0..1) of one bound control
export function readBinding(gp, bd) {
  if (!bd) return 0;
  if (bd.b !== undefined) { const b = gp.buttons[bd.b]; return b ? Math.max(b.value || 0, b.pressed ? 1 : 0) : 0; }
  if (bd.h !== undefined) return decodeHat(gp.axes[bd.h])[bd.dir] ? 1 : 0;
  if (bd.a !== undefined) {
    const raw = gp.axes[bd.a];
    if (raw === undefined) return 0;
    return clamp((raw - bd.rest) / ((bd.full - bd.rest) || 1), 0, 1);
  }
  return 0;
}

// Value (-1..1) of a bound stick axis
function readStickAxis(gp, bd) {
  if (!bd) return 0;
  const raw = gp.axes[bd.a];
  if (raw === undefined) return 0;
  return clamp((raw - bd.rest) / ((bd.full - bd.rest) || 1), -1, 1);
}

export class Gamepad {
  constructor() {
    this.connected = false;
    this.id = '';
    this.mapping = '';
    this.lx = 0; this.ly = 0; this.rx = 0; this.ry = 0; this.lt = 0; this.rt = 0;
    this.buttons = new Array(17).fill(false);
    this.prev = new Array(17).fill(false);
    this.raw = null;
    this.rest = null; // resting axis values, captured when the pad first appears
    this.restId = '';
    this.customMap = null;
    this.layout = 'standard'; // 'standard' | 'custom' | 'guessed'
    this.suspended = false; // while Controller Setup is open
    this.lastUsed = -1e9; // timestamp of last meaningful input, to decide which device is "active"
    this.onConnect = null;
    addEventListener('gamepadconnected', (e) => this.onConnect?.(e.gamepad.id, true));
    addEventListener('gamepaddisconnected', (e) => { this.restId = ''; this.onConnect?.(e.gamepad.id, false); });
  }

  // Pick the controller to use (prefer one with the standard layout)
  find() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) {
      if (!p || !p.connected) continue;
      if (p.mapping === 'standard') return p;
      gp = gp || p;
    }
    return gp;
  }

  setCustomMap(map) {
    this.customMap = map;
    if (this.id) saveMap(this.id, map);
  }

  poll(now) {
    const gp = this.find();
    this.prev = this.buttons.slice();
    this.raw = gp;
    this.connected = !!gp && !this.suspended;
    if (!this.connected) {
      this.lx = this.ly = this.rx = this.ry = this.lt = this.rt = 0;
      this.buttons.fill(false);
      return;
    }
    if (this.restId !== gp.id || !this.rest || this.rest.length !== gp.axes.length) {
      this.rest = Array.from(gp.axes);
      this.restId = gp.id;
      this.id = gp.id;
      this.mapping = gp.mapping;
      this.customMap = loadMap(gp.id);
      this.guess = gp.mapping === 'standard' ? null : guessMap(gp, this.rest);
    }
    const map = this.customMap || this.guess;
    this.layout = this.customMap ? 'custom' : this.guess ? 'guessed' : 'standard';
    if (map) this.readMapped(gp, map);
    else this.readStandard(gp);
    if (this.lx || this.ly || this.rx || this.ry || this.lt > 0.1 || this.rt > 0.1 || this.buttons.some(Boolean)) this.lastUsed = now;
  }

  readStandard(gp) {
    // An axis that rests far from centre isn't really a stick: treat its rest value as zero
    const ax = (i) => {
      const v = gp.axes[i] || 0, r = this.rest[i] || 0;
      return Math.abs(r) > 0.5 ? clamp(v - r, -1, 1) : v;
    };
    [this.lx, this.ly] = stick(ax(0), ax(1));
    [this.rx, this.ry] = stick(ax(2), ax(3));
    const b = gp.buttons;
    for (let i = 0; i < this.buttons.length; i++) this.buttons[i] = !!(b[i] && (b[i].pressed || b[i].value > 0.5));
    this.lt = b[BTN.LT] ? b[BTN.LT].value : 0;
    this.rt = b[BTN.RT] ? b[BTN.RT].value : 0;
    this.buttons[BTN.LT] = this.lt > TRIGGER_THRESHOLD;
    this.buttons[BTN.RT] = this.rt > TRIGGER_THRESHOLD;
  }

  readMapped(gp, map) {
    [this.lx, this.ly] = stick(readStickAxis(gp, map.lx), readStickAxis(gp, map.ly));
    [this.rx, this.ry] = stick(readStickAxis(gp, map.rx), readStickAxis(gp, map.ry));
    for (let i = 0; i < this.buttons.length; i++) this.buttons[i] = readBinding(gp, map.buttons[i]) > 0.5;
    this.lt = readBinding(gp, map.buttons[BTN.LT]);
    this.rt = readBinding(gp, map.buttons[BTN.RT]);
    this.buttons[BTN.LT] = this.lt > TRIGGER_THRESHOLD;
    this.buttons[BTN.RT] = this.rt > TRIGGER_THRESHOLD;
  }

  down(b) { return this.buttons[b]; }
  hit(b) { return this.buttons[b] && !this.prev[b]; }
  released(b) { return !this.buttons[b] && this.prev[b]; }

  // True if the controller was the most recently used input device
  active(now) { return this.connected && now - this.lastUsed < 4000; }

  rumble(strong, weak, ms) {
    const a = this.raw && this.raw.vibrationActuator;
    if (!a || !a.playEffect) return;
    try {
      a.playEffect('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }).catch(() => {});
    } catch { /* not supported */ }
  }
}

// ---------------------------------------------------------------------------- bindings
// Field (third-person shooter)
//   Left stick move · Right stick look · LT aim / block · RT fire / swing · LB/RB previous/next weapon
//   X reload · Y enter/exit SUV · A (hold) or L3 sprint · B sword <-> gun (handbrake in the SUV)
//   D-pad left airstrike · D-pad right gunship · D-pad up breaching charge · D-pad down grenade launcher
//   View: command mode
export function applyFieldBindings(pad, input) {
  input.virtual.clear();
  if (!pad.connected) { input.padSprint = false; return; }
  const press = (code) => { input.pressed.add(code); };
  if (pad.hit(BTN.VIEW)) press('Tab');
  if (pad.hit(BTN.X)) press('KeyR');
  if (pad.hit(BTN.Y)) press('KeyF');
  if (pad.hit(BTN.LEFT)) press('KeyZ');
  if (pad.hit(BTN.RIGHT)) press('KeyX');
  if (pad.hit(BTN.UP)) press('KeyG');
  if (pad.hit(BTN.DOWN)) press('Digit3');
  if (pad.hit(BTN.B)) press('KeyQ');
  if (pad.hit(BTN.LB)) input.mouse.wheel -= 1;
  if (pad.hit(BTN.RB)) input.mouse.wheel += 1;
  // Sprint: hold A, or click the left stick (stays on until the stick is released)
  if (pad.hit(BTN.LS)) input.padSprint = !input.padSprint;
  if (!pad.lx && !pad.ly) input.padSprint = false;
  if (pad.down(BTN.A) || input.padSprint) input.virtual.add('ShiftLeft');
  if (pad.down(BTN.B)) input.virtual.add('Space');
  // Triggers act as the mouse buttons
  syncButton(pad, input, BTN.RT, 'left');
  syncButton(pad, input, BTN.LT, 'right');
}

// Command (RTS) mode
//   Left stick pan camera · Right stick move cursor · LT/RT zoom out/in
//   A select (hold + move to box-select; works on the side panel too) · B order / cancel
//   LB/RB cycle through your regiments · L3 select all · R3 hand selected back to the AI
//   X hold · Y build palisade · D-pad up advance · D-pad down retreat
//   D-pad left airstrike at cursor · D-pad right gunship at cursor · Menu pause · View back to field
export function applyCommandBindings(pad, input, rts, dt) {
  input.virtual.clear();
  if (!pad.connected) return;
  const press = (code) => { input.pressed.add(code); };
  if (pad.hit(BTN.VIEW)) press('Tab');
  if (pad.hit(BTN.MENU)) press('Space');
  if (pad.hit(BTN.X)) press('KeyH');
  if (pad.hit(BTN.Y)) press('KeyB');
  if (pad.hit(BTN.UP)) rts.command('advance');
  if (pad.hit(BTN.DOWN)) press('KeyR');
  if (pad.hit(BTN.LEFT)) press('KeyZ');
  if (pad.hit(BTN.RIGHT)) press('KeyX');
  if (pad.hit(BTN.RS)) press('KeyG');
  if (pad.hit(BTN.LS)) rts.selectAll();
  if (pad.hit(BTN.LB)) rts.cycleSelection(-1);
  if (pad.hit(BTN.RB)) rts.cycleSelection(1);
  input.mouse.wheel += (pad.lt - pad.rt) * dt * 9;

  // Virtual cursor on the right stick (accelerates the longer you push)
  const m = input.mouse;
  const mag = Math.hypot(pad.rx, pad.ry);
  if (mag > 0) {
    const speed = 350 + 1100 * mag * mag;
    m.x = Math.max(0, Math.min(innerWidth - 1, m.x + pad.rx / mag * mag * speed * dt));
    m.y = Math.max(0, Math.min(innerHeight - 1, m.y + pad.ry / mag * mag * speed * dt));
  }

  // A = left click. Over HTML panels (roster, order buttons) it presses the element under the cursor.
  if (pad.hit(BTN.A)) {
    const el = document.elementFromPoint(m.x, m.y);
    const ui = el && el.closest && el.closest('#rtsPanel button, #rtsPanel .reg');
    if (ui) ui.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: m.x, clientY: m.y }));
    else { m.left = true; m.leftClicked = true; input.padHeld.left = true; }
  }
  if (pad.released(BTN.A) && input.padHeld.left) { m.left = false; m.leftReleased = true; input.padHeld.left = false; }
  if (pad.hit(BTN.B)) m.rightClicked = true;
}

// Mirror a pad button onto a mouse button without clobbering a real mouse press
function syncButton(pad, input, btn, which) {
  const m = input.mouse;
  if (pad.hit(btn)) {
    m[which] = true;
    if (which === 'left') m.leftClicked = true; else m.rightClicked = true;
    input.padHeld[which] = true;
  } else if (pad.released(btn) && input.padHeld[which]) {
    m[which] = false;
    if (which === 'left') m.leftReleased = true;
    input.padHeld[which] = false;
  }
}

// Releases anything the pad was holding (used when switching modes)
export function releasePadButtons(input) {
  for (const which of ['left', 'right']) {
    if (input.padHeld[which]) { input.mouse[which] = false; input.padHeld[which] = false; }
  }
  input.virtual.clear();
}
