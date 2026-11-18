// The Controls screen:
//  * Buttons: bind any controller button to any action (per mode: on foot, in the SUV, command view)
//  * Sticks & feel: live stick test, look sensitivity, invert Y, aim assist, deadzone, vibration...
//  * Calibrate: a wizard that learns the raw layout of controllers the browser doesn't report in the
//    standard layout (common over Bluetooth)
import { isHatRest, decodeHat, guessMap, BTN } from './gamepad.js';
import { controls, ACTIONS, MODE_NAMES } from './controls.js';

const STEPS = [
  { key: 'lx', kind: 'stick', text: 'Push the LEFT stick all the way RIGHT' },
  { key: 'ly', kind: 'stick', text: 'Push the LEFT stick all the way DOWN' },
  { key: 'rx', kind: 'stick', text: 'Push the RIGHT stick all the way RIGHT' },
  { key: 'ry', kind: 'stick', text: 'Push the RIGHT stick all the way DOWN' },
  { key: 0, text: 'Press A' },
  { key: 1, text: 'Press B' },
  { key: 2, text: 'Press X' },
  { key: 3, text: 'Press Y' },
  { key: 4, text: 'Press LB (left bumper)' },
  { key: 5, text: 'Press RB (right bumper)' },
  { key: 6, text: 'Pull LT (left trigger) all the way' },
  { key: 7, text: 'Pull RT (right trigger) all the way' },
  { key: 8, text: 'Press View (small button, two squares)' },
  { key: 9, text: 'Press Menu (small button, three lines)' },
  { key: 10, text: 'Click the LEFT stick down' },
  { key: 11, text: 'Click the RIGHT stick down' },
  { key: 12, kind: 'dpad', dir: 'up', text: 'Press D-pad UP' },
  { key: 13, kind: 'dpad', dir: 'down', text: 'Press D-pad DOWN' },
  { key: 14, kind: 'dpad', dir: 'left', text: 'Press D-pad LEFT' },
  { key: 15, kind: 'dpad', dir: 'right', text: 'Press D-pad RIGHT' },
];

export class PadSetup {
  constructor(pad) {
    this.pad = pad;
    this.el = document.getElementById('padSetup');
    this.prompt = document.getElementById('padSetupPrompt');
    this.progress = document.getElementById('padSetupProgress');
    this.info = document.getElementById('padSetupInfo');
    this.live = document.getElementById('padSetupLive');
    this.open = false;
    this.onClose = null;
    this.tab = 'buttons';
    this.mode = 'field';
    this.focus = 0;
    this.listening = null; // action id waiting for a button press
    this.padPrev = [];
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('input', (e) => this.onSetting(e));
    document.getElementById('psResetBindings').addEventListener('click', () => { controls.resetBindings(); this.renderBindings(); });
    document.getElementById('psResetSettings').addEventListener('click', () => { controls.resetSettings(); this.renderSettings(); });
    document.getElementById('padSetupStart').addEventListener('click', () => this.begin());
    document.getElementById('padSetupSkip').addEventListener('click', () => this.next(null));
    document.getElementById('padSetupReset').addEventListener('click', () => {
      this.pad.setCustomMap(null);
      this.message('Custom mapping cleared — using the automatic layout.');
    });
    document.getElementById('padSetupClose').addEventListener('click', () => this.close());
  }

  show() {
    this.open = true;
    this.step = -1;
    this.listening = null;
    this.el.classList.remove('hidden');
    this.prompt.textContent = 'Connect your controller and press any button, then press Start calibration.';
    this.progress.textContent = '';
    this.setTab(this.tab);
    this.renderBindings();
    this.renderSettings();
    this.padPrev = this.padButtons();
    this.loop();
  }

  close() {
    this.open = false;
    this.listening = null;
    this.step = -1;
    this.el.classList.add('hidden');
    this.onClose?.();
  }

  setTab(tab) {
    this.tab = tab;
    for (const b of this.el.querySelectorAll('[data-ps-tab]')) b.classList.toggle('on', b.dataset.psTab === tab);
    for (const pg of this.el.querySelectorAll('[data-ps-page]')) pg.classList.toggle('hidden', pg.dataset.psPage !== tab);
    this.listening = null;
  }

  visibleActions() { return ACTIONS[this.mode].filter((a) => !a.hidden); }

  renderBindings() {
    for (const b of this.el.querySelectorAll('[data-ps-mode]')) b.classList.toggle('on', b.dataset.psMode === this.mode);
    const list = this.visibleActions();
    this.focus = Math.min(this.focus, list.length - 1);
    document.getElementById('psBindings').innerHTML = list.map((a, k) => `
      <div class="bind ${k === this.focus ? 'focus' : ''} ${this.listening === a.id ? 'listening' : ''}" data-bind="${a.id}">
        <span class="lbl">${a.label}</span>
        <span class="btn">${this.listening === a.id ? 'press…' : controls.label(this.mode, a.id)}</span>
        <span class="clr" data-clear="${a.id}" title="Unbind">✕</span>
      </div>`).join('');
  }

  renderSettings() {
    const st = controls.settings;
    for (const el of this.el.querySelectorAll('[data-set]')) {
      const k = el.dataset.set;
      if (el.type === 'checkbox') el.checked = !!st[k]; else el.value = st[k];
    }
    for (const el of this.el.querySelectorAll('[data-val]')) {
      const v = st[el.dataset.val];
      el.textContent = el.dataset.val === 'lookSensitivity' ? `${v.toFixed(2)}×` : v.toFixed(2);
    }
  }

  onSetting(e) {
    const el = e.target;
    if (!el.dataset.set) return;
    controls.settings[el.dataset.set] = el.type === 'checkbox' ? el.checked : parseFloat(el.value);
    controls.save();
    this.renderSettings();
  }

  onClick(e) {
    const t = e.target;
    if (t.dataset.psTab) { this.setTab(t.dataset.psTab); return; }
    if (t.dataset.psMode) { this.mode = t.dataset.psMode; this.focus = 0; this.listening = null; this.renderBindings(); return; }
    if (t.dataset.clear) { controls.unbind(this.mode, t.dataset.clear); this.renderBindings(); return; }
    const row = t.closest && t.closest('[data-bind]');
    if (row) {
      this.focus = this.visibleActions().findIndex((a) => a.id === row.dataset.bind);
      this.startListening(row.dataset.bind);
    }
  }

  startListening(id) {
    this.listening = id;
    this.listenSince = performance.now();
    this.waitForRelease = true; // ignore the button that's still held from selecting the row
    this.renderBindings();
  }

  // Standardized pad buttons (through the browser layout / calibration) for this frame
  padButtons() { return this.pad.buttons.slice(); }

  // Remapping and controller navigation of this screen
  updateButtonsTab() {
    const cur = this.padButtons();
    const hit = (b) => cur[b] && !this.padPrev[b];
    if (this.listening) {
      if (this.waitForRelease) { if (!cur.some(Boolean)) this.waitForRelease = false; }
      else {
        const b = cur.findIndex((v, i) => v && !this.padPrev[i]);
        if (b >= 0) { controls.bind(this.mode, this.listening, b); this.listening = null; this.renderBindings(); }
        else if (performance.now() - this.listenSince > 8000) { this.listening = null; this.renderBindings(); }
      }
    } else {
      const n = this.visibleActions().length;
      let moved = false;
      if (hit(BTN.DOWN)) { this.focus = (this.focus + 1) % n; moved = true; }
      if (hit(BTN.UP)) { this.focus = (this.focus - 1 + n) % n; moved = true; }
      if (hit(BTN.RIGHT)) { this.focus = Math.min(n - 1, this.focus + Math.ceil(n / 2)); moved = true; }
      if (hit(BTN.LEFT)) { this.focus = Math.max(0, this.focus - Math.ceil(n / 2)); moved = true; }
      if (hit(BTN.RB) || hit(BTN.LB)) {
        const modes = Object.keys(MODE_NAMES);
        this.mode = modes[(modes.indexOf(this.mode) + (hit(BTN.RB) ? 1 : modes.length - 1)) % modes.length];
        this.focus = 0; moved = true;
      }
      if (moved) this.renderBindings();
      if (hit(BTN.A)) this.startListening(this.visibleActions()[this.focus].id);
      else if (hit(BTN.B)) this.close();
    }
    this.padPrev = cur;
  }

  drawStick(id, x, y) {
    const cv = document.getElementById(id);
    if (!cv) return;
    const g = cv.getContext('2d'), W = cv.width, R = W / 2 - 6;
    g.clearRect(0, 0, W, W);
    g.strokeStyle = 'rgba(242,234,216,0.25)'; g.lineWidth = 1;
    g.beginPath(); g.arc(W / 2, W / 2, R, 0, 7); g.stroke();
    g.beginPath(); g.arc(W / 2, W / 2, R * (controls.settings.deadzone || 0.15), 0, 7); g.stroke();
    g.fillStyle = (x || y) ? '#e0b341' : 'rgba(242,234,216,0.5)';
    g.beginPath(); g.arc(W / 2 + x * R, W / 2 + y * R, 9, 0, 7); g.fill();
  }

  updateFeelTab() {
    const p = this.pad;
    this.drawStick('psStickL', p.lx, p.ly);
    this.drawStick('psStickR', p.rx, p.ry);
    document.getElementById('psLT').style.width = `${p.lt * 100}%`;
    document.getElementById('psRT').style.width = `${p.rt * 100}%`;
    const names = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', '▲', '▼', '◀', '▶'];
    document.getElementById('psPressed').textContent = p.buttons.map((v, i) => (v ? names[i] : null)).filter(Boolean).join(' ') || ' ';
    const cur = this.padButtons();
    if (cur[BTN.B] && !this.padPrev[BTN.B]) this.close();
    this.padPrev = cur;
  }

  message(t) { this.prompt.textContent = t; }

  begin() {
    const gp = this.pad.find();
    if (!gp) { this.message('No controller found. Press any button on it so the browser can see it, then try again.'); return; }
    this.gpId = gp.id;
    this.rest = Array.from(gp.axes);
    this.restButtons = gp.buttons.map((b) => b.pressed || b.value > 0.5);
    this.map = { buttons: {} };
    this.used = new Set();
    this.step = 0;
    this.waitRelease = true;
    this.showStep();
  }

  showStep() {
    if (this.step >= STEPS.length) { this.finish(); return; }
    this.message(STEPS[this.step].text);
    this.progress.textContent = `Step ${this.step + 1} of ${STEPS.length} — or click Skip if your controller doesn't have it`;
  }

  next(binding) {
    if (this.step < 0 || this.step >= STEPS.length) return;
    const s = STEPS[this.step];
    if (binding) {
      if (s.kind === 'stick') this.map[s.key] = binding;
      else this.map.buttons[s.key] = binding;
      if (binding.b !== undefined) this.used.add('b' + binding.b);
      if (binding.a !== undefined && s.kind === 'stick') this.used.add('a' + binding.a);
    }
    this.step++;
    this.waitRelease = true;
    this.showStep();
  }

  finish() {
    // Fill anything skipped from the automatic guess so the pad still works
    const gp = this.pad.find();
    if (gp) {
      const guess = guessMap(gp, this.rest);
      for (const k of ['lx', 'ly', 'rx', 'ry']) if (!this.map[k]) this.map[k] = guess[k];
      for (const [k, v] of Object.entries(guess.buttons)) if (!this.map.buttons[k]) this.map.buttons[k] = v;
    }
    this.pad.restId = ''; // re-read the resting state with the new mapping
    this.pad.id = this.gpId;
    this.pad.setCustomMap(this.map);
    this.step = -1;
    this.message('All set! Your controller mapping is saved in this browser. Close this window to play.');
    this.progress.textContent = '';
  }

  // Look for the one input that moved away from rest
  detect(gp, s) {
    // buttons
    if (s.kind !== 'stick') {
      for (let i = 0; i < gp.buttons.length; i++) {
        const b = gp.buttons[i];
        if ((b.pressed || b.value > 0.6) && !this.restButtons[i] && !this.used.has('b' + i)) return { b: i };
      }
    }
    // axes
    let best = -1, bestD = 0;
    for (let i = 0; i < gp.axes.length; i++) {
      const r = this.rest[i], v = gp.axes[i];
      if (isHatRest(r)) {
        if (s.kind === 'dpad' && !isHatRest(v) && decodeHat(v)[s.dir]) return { h: i, dir: s.dir };
        continue;
      }
      if (s.kind !== 'stick' && this.used.has('a' + i)) continue; // don't steal a stick axis for a button
      const d = Math.abs(v - r);
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best >= 0 && bestD > 0.6) {
      const r = this.rest[best], v = gp.axes[best];
      return { a: best, rest: r, full: v > r ? 1 : -1 };
    }
    return null;
  }

  idle(gp) {
    for (let i = 0; i < gp.buttons.length; i++) if ((gp.buttons[i].pressed || gp.buttons[i].value > 0.3) && !this.restButtons[i]) return false;
    for (let i = 0; i < gp.axes.length; i++) if (Math.abs(gp.axes[i] - this.rest[i]) > 0.3) return false;
    return true;
  }

  loop() {
    if (!this.open) return;
    requestAnimationFrame(() => this.loop());
    if (this.tab === 'buttons') this.updateButtonsTab();
    if (this.tab === 'feel') this.updateFeelTab();
    const gp = this.pad.find();
    if (!gp) { this.info.textContent = 'No controller detected yet — press a button on it.'; this.live.textContent = ''; return; }
    this.info.textContent = `${gp.id} — browser layout: ${gp.mapping || 'non-standard'}${this.pad.customMap ? ' (custom mapping saved)' : ''}`;
    const pressed = gp.buttons.map((b, i) => (b.pressed || b.value > 0.5 ? i : null)).filter((i) => i !== null);
    this.live.textContent = `axes: ${gp.axes.map((v, i) => `${i}:${v.toFixed(2)}`).join('  ')}\nbuttons held: ${pressed.join(', ') || 'none'}`;
    if (this.step < 0 || this.step >= STEPS.length) return;
    if (this.waitRelease) { if (this.idle(gp)) this.waitRelease = false; return; }
    const found = this.detect(gp, STEPS[this.step]);
    if (found) this.next(found);
  }
}
