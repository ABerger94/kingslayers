// Xbox (and any "standard"-mapped) controller support via the browser Gamepad API.
// The pad is read once per frame. Analog values (sticks, triggers) are exposed directly; digital
// buttons are translated into the same virtual keys / mouse actions the keyboard uses, so the
// shooter and command code paths stay the same regardless of input device.

// Standard mapping button indices
export const BTN = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, LS: 10, RS: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
};

const STICK_DEADZONE = 0.18;
const TRIGGER_THRESHOLD = 0.35;

function stick(x, y) {
  const m = Math.hypot(x, y);
  if (m < STICK_DEADZONE) return [0, 0];
  // Radial deadzone, rescaled so movement starts smoothly from zero
  const k = Math.min(1, (m - STICK_DEADZONE) / (1 - STICK_DEADZONE)) / m;
  return [x * k, y * k];
}

export class Gamepad {
  constructor() {
    this.connected = false;
    this.id = '';
    this.lx = 0; this.ly = 0; this.rx = 0; this.ry = 0; this.lt = 0; this.rt = 0;
    this.buttons = new Array(17).fill(false);
    this.prev = new Array(17).fill(false);
    this.raw = null;
    this.lastUsed = -1e9; // timestamp of last meaningful input, to decide which device is "active"
    this.onConnect = null;
    addEventListener('gamepadconnected', (e) => this.onConnect?.(e.gamepad.id, true));
    addEventListener('gamepaddisconnected', (e) => this.onConnect?.(e.gamepad.id, false));
  }

  poll(now) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) {
      if (!p || !p.connected) continue;
      if (p.mapping === 'standard') { gp = p; break; }
      gp = gp || p;
    }
    this.prev = this.buttons.slice();
    this.raw = gp;
    this.connected = !!gp;
    if (!gp) {
      this.lx = this.ly = this.rx = this.ry = this.lt = this.rt = 0;
      this.buttons.fill(false);
      return;
    }
    this.id = gp.id;
    [this.lx, this.ly] = stick(gp.axes[0] || 0, gp.axes[1] || 0);
    [this.rx, this.ry] = stick(gp.axes[2] || 0, gp.axes[3] || 0);
    const b = gp.buttons;
    for (let i = 0; i < this.buttons.length; i++) this.buttons[i] = !!(b[i] && (b[i].pressed || b[i].value > 0.5));
    this.lt = b[BTN.LT] ? b[BTN.LT].value : 0;
    this.rt = b[BTN.RT] ? b[BTN.RT].value : 0;
    this.buttons[BTN.LT] = this.lt > TRIGGER_THRESHOLD;
    this.buttons[BTN.RT] = this.rt > TRIGGER_THRESHOLD;
    if (this.lx || this.ly || this.rx || this.ry || this.lt > 0.1 || this.rt > 0.1 || this.buttons.some(Boolean)) this.lastUsed = now;
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
