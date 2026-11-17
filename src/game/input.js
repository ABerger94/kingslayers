// Keyboard / mouse state shared by the shooter and command modes.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed this frame
    this.mouse = { x: 0, y: 0, dx: 0, dy: 0, left: false, right: false, wheel: 0, leftClicked: false, rightClicked: false, leftReleased: false };
    this.locked = false;
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      // Chrome occasionally reports a huge bogus delta right after pointer lock engages
      if (this.locked && Math.abs(e.movementX) < 250 && Math.abs(e.movementY) < 250) {
        this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftClicked = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightClicked = true; }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) { this.mouse.left = false; this.mouse.leftReleased = true; }
      if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
  }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }

  lock() { if (!this.locked) this.canvas.requestPointerLock?.(); }
  unlock() { if (this.locked) document.exitPointerLock?.(); }

  endFrame() {
    this.pressed.clear();
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    this.mouse.leftClicked = false; this.mouse.rightClicked = false; this.mouse.leftReleased = false;
  }
}
