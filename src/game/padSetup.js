// Controller Setup: a short wizard that records which raw button/axis the player's controller uses
// for each action, for pads the browser doesn't report in the standard layout. Also shows a live
// readout, which is handy for diagnosing a misbehaving controller.
import { isHatRest, decodeHat, guessMap } from './gamepad.js';

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
    this.pad.suspended = true;
    this.step = -1;
    this.el.classList.remove('hidden');
    this.prompt.textContent = 'Connect your controller and press any button, then press Start mapping.';
    this.progress.textContent = '';
    this.loop();
  }

  close() {
    this.open = false;
    this.pad.suspended = false;
    this.el.classList.add('hidden');
    this.onClose?.();
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
