// Controller actions, their default buttons, and the player's own bindings and stick settings.
// Sticks are fixed: LEFT stick moves (or pans the command camera), RIGHT stick looks (or moves the
// command cursor). Every button can be bound to any action, per mode. Saved in the browser.
// Standard-layout button indices (shared with gamepad.js)
export const BTN = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, LS: 10, RS: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
};

const KEY = 'timefall.controls.v1';

export const BUTTON_NAMES = {
  [BTN.A]: 'A', [BTN.B]: 'B', [BTN.X]: 'X', [BTN.Y]: 'Y', [BTN.LB]: 'LB', [BTN.RB]: 'RB', [BTN.LT]: 'LT', [BTN.RT]: 'RT',
  [BTN.VIEW]: 'View', [BTN.MENU]: 'Menu', [BTN.LS]: 'L3', [BTN.RS]: 'R3',
  [BTN.UP]: 'D-pad ▲', [BTN.DOWN]: 'D-pad ▼', [BTN.LEFT]: 'D-pad ◀', [BTN.RIGHT]: 'D-pad ▶',
};
export const buttonName = (b) => (b === null || b === undefined ? '—' : BUTTON_NAMES[b] || `Button ${b}`);

// mode -> [{ id, label, def (default button), hold? }]
export const ACTIONS = {
  field: [
    { id: 'fire', label: 'Fire / swing sword', def: BTN.RT, hold: true },
    { id: 'aim', label: 'Aim down sights / sword block', def: BTN.LT, hold: true },
    { id: 'sprint', label: 'Sprint', def: BTN.LS, hold: true },
    { id: 'reload', label: 'Reload', def: BTN.X },
    { id: 'interact', label: 'Capture officer / enter & exit SUV', def: BTN.Y },
    { id: 'melee', label: 'Switch sword ⇄ gun', def: BTN.B },
    { id: 'nextWeapon', label: 'Next weapon', def: BTN.RB },
    { id: 'buckler', label: 'Arm buckler (hold)', def: BTN.LB, hold: true },
    { id: 'hammer', label: 'Sledgehammer bash', def: BTN.RS },
    { id: 'airstrike', label: 'Airstrike', def: BTN.LEFT },
    { id: 'gunship', label: 'Gunship', def: BTN.RIGHT },
    { id: 'c4', label: 'Breaching charge (C4)', def: BTN.UP },
    { id: 'supply', label: 'Supply drop', def: BTN.DOWN },
    { id: 'command', label: 'Switch to command view', def: BTN.VIEW },
    { id: 'settings', label: 'Pause & controller settings', def: BTN.MENU },
  ],
  vehicle: [
    { id: 'accelerate', label: 'Accelerate', def: BTN.RT, hold: true },
    { id: 'brake', label: 'Brake / reverse', def: BTN.LT, hold: true },
    { id: 'handbrake', label: 'Handbrake', def: BTN.B, hold: true },
    { id: 'exit', label: 'Exit vehicle', def: BTN.Y },
  ],
  command: [
    { id: 'select', label: 'Select (hold and move to box-select)', def: BTN.A, hold: true },
    { id: 'order', label: 'Move / attack order', def: BTN.B },
    { id: 'hold', label: 'Hold position', def: BTN.X },
    { id: 'charge', label: 'Charge', def: BTN.Y },
    { id: 'advance', label: 'Advance (attack-move)', def: BTN.UP },
    { id: 'retreat', label: 'Retreat', def: BTN.DOWN },
    { id: 'airstrikeC', label: 'Airstrike at cursor', def: BTN.LEFT },
    { id: 'gunshipC', label: 'Gunship at cursor', def: BTN.RIGHT },
    { id: 'prevSquad', label: 'Previous squad', def: BTN.LB },
    { id: 'nextSquad', label: 'Next squad', def: BTN.RB },
    { id: 'zoomOut', label: 'Zoom out', def: BTN.LT, hold: true },
    { id: 'zoomIn', label: 'Zoom in', def: BTN.RT, hold: true },
    { id: 'selectAll', label: 'Select all squads', def: BTN.LS },
    { id: 'formation', label: 'Next formation', def: BTN.RS },
    { id: 'pause', label: 'Tactical pause', def: BTN.MENU },
    { id: 'field', label: 'Back to the field', def: BTN.VIEW },
  ],
};
export const MODE_NAMES = { field: 'On foot', vehicle: 'In the SUV', command: 'Command view' };

export const DEFAULT_SETTINGS = {
  lookSensitivity: 1.0, // multiplier
  invertY: false,
  aimAssist: true,
  deadzone: 0.15,
  vibration: true,
  sprintToggle: true, // press sprint once to run until you stop moving (otherwise hold)
  swapSticks: false, // for controllers that report the sticks the wrong way round
};

function defaults() {
  const b = {};
  for (const [mode, list] of Object.entries(ACTIONS)) {
    b[mode] = {};
    for (const a of list) if (!a.hidden) b[mode][a.id] = a.def;
  }
  return b;
}

export class Controls {
  constructor() {
    this.bindings = defaults();
    this.settings = { ...DEFAULT_SETTINGS };
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s) {
        for (const mode of Object.keys(this.bindings)) Object.assign(this.bindings[mode], (s.bindings || {})[mode] || {});
        Object.assign(this.settings, s.settings || {});
      }
    } catch { /* storage unavailable */ }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ bindings: this.bindings, settings: this.settings })); } catch { /* ignore */ }
  }

  button(mode, id) { return this.bindings[mode][id]; }

  // Bind a button to an action. If another action in the same mode used it, they swap.
  bind(mode, id, button) {
    const map = this.bindings[mode];
    const old = map[id];
    for (const [other, b] of Object.entries(map)) if (other !== id && b === button) map[other] = old ?? null;
    map[id] = button;
    this.save();
  }

  unbind(mode, id) { this.bindings[mode][id] = null; this.save(); }

  resetBindings() { this.bindings = defaults(); this.save(); }
  resetSettings() { this.settings = { ...DEFAULT_SETTINGS }; this.save(); }

  label(mode, id) { return buttonName(this.button(mode, id)); }
}

export const controls = new Controls();
