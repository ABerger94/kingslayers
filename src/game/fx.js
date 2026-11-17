// Visual effects: bullet tracers, particles (blood, dirt, smoke, sparks), explosion fireballs,
// muzzle flashes, scorch marks and camera shake.
import * as THREE from 'three';
import { groundY } from './world.js';

const MAX_P = 6000;
const MAX_TRACERS = 200;

export class Fx {
  constructor(scene) {
    this.scene = scene;
    // ---- particles: CPU simulated, rendered as one Points cloud
    this.pPos = new Float32Array(MAX_P * 3);
    this.pVel = new Float32Array(MAX_P * 3);
    this.pCol = new Float32Array(MAX_P * 3);
    this.pSize = new Float32Array(MAX_P);
    this.pLife = new Float32Array(MAX_P);
    this.pMax = new Float32Array(MAX_P);
    this.pGrav = new Float32Array(MAX_P);
    this.pGrow = new Float32Array(MAX_P);
    this.pBase = new Float32Array(MAX_P * 3);
    this.pCount = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 600 } },
      vertexShader: `
        attribute float size; attribute vec3 color; varying vec3 vColor; uniform float scale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d);
          if (r > 0.25) discard;
          gl_FragColor = vec4(vColor, 1.0 - r * 3.0);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // ---- tracers
    this.trPos = new Float32Array(MAX_TRACERS * 6);
    this.trLife = new Float32Array(MAX_TRACERS);
    this.trCol = new Float32Array(MAX_TRACERS * 6);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.trCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.tracers.frustumCulled = false;
    scene.add(this.tracers);
    this.trNext = 0;

    // ---- fireballs
    this.fireballs = [];
    this.fireMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.fireGeo = new THREE.SphereGeometry(1, 12, 8);

    // ---- light flashes (pooled)
    this.flash = new THREE.PointLight(0xffc070, 0, 40, 2);
    scene.add(this.flash);
    this.flashT = 0;
    this.bigFlash = new THREE.PointLight(0xff9040, 0, 120, 2);
    scene.add(this.bigFlash);
    this.bigFlashT = 0;

    // ---- scorch decals
    this.scorchGeo = new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2);
    this.scorchMat = new THREE.MeshBasicMaterial({ color: 0x1a140e, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.scorches = [];

    this.shake = 0;
  }

  spawn(x, y, z, vx, vy, vz, r, g, b, size, life, grav = 9.8, grow = 0) {
    let i;
    if (this.pCount < MAX_P) i = this.pCount++;
    else i = (Math.random() * MAX_P) | 0;
    this.pPos[i * 3] = x; this.pPos[i * 3 + 1] = y; this.pPos[i * 3 + 2] = z;
    this.pVel[i * 3] = vx; this.pVel[i * 3 + 1] = vy; this.pVel[i * 3 + 2] = vz;
    this.pBase[i * 3] = r; this.pBase[i * 3 + 1] = g; this.pBase[i * 3 + 2] = b;
    this.pSize[i] = size; this.pLife[i] = life; this.pMax[i] = life; this.pGrav[i] = grav; this.pGrow[i] = grow;
  }

  blood(x, y, z, n = 8) {
    for (let k = 0; k < n; k++) {
      this.spawn(x, y, z, (Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3, 0.5 + Math.random() * 0.2, 0.02, 0.02, 0.18 + Math.random() * 0.12, 0.6 + Math.random() * 0.4);
    }
  }

  dirt(x, y, z, n = 6) {
    for (let k = 0; k < n; k++) {
      this.spawn(x, y, z, (Math.random() - 0.5) * 2, 2 + Math.random() * 3, (Math.random() - 0.5) * 2, 0.35, 0.28, 0.18, 0.2 + Math.random() * 0.15, 0.7);
    }
  }

  smoke(x, y, z, n, spread, size, life) {
    for (let k = 0; k < n; k++) {
      const s = 0.25 + Math.random() * 0.15;
      this.spawn(x + (Math.random() - 0.5) * spread, y + Math.random() * spread * 0.4, z + (Math.random() - 0.5) * spread,
        (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, s, s, s * 0.95, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), -0.3, size * 0.6);
    }
  }

  muzzle(pos, dir, big = false) {
    this.flash.position.copy(pos);
    this.flash.intensity = big ? 90 : 40;
    this.flashT = 0.05;
    for (let k = 0; k < (big ? 10 : 4); k++) {
      const s = Math.random() * (big ? 8 : 5);
      this.spawn(pos.x, pos.y, pos.z, dir.x * s + (Math.random() - 0.5), dir.y * s + (Math.random() - 0.5), dir.z * s + (Math.random() - 0.5), 1, 0.8, 0.4, big ? 0.35 : 0.2, 0.06, 0);
    }
  }

  tracer(a, b, color = [1, 0.85, 0.5]) {
    const i = this.trNext;
    this.trNext = (this.trNext + 1) % MAX_TRACERS;
    this.trPos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    this.trCol.set([color[0] * 0.3, color[1] * 0.3, color[2] * 0.3, color[0], color[1], color[2]], i * 6);
    this.trLife[i] = 0.08;
  }

  explosion(x, z, radius, camPos) {
    const y = groundY(x, z);
    const ball = new THREE.Mesh(this.fireGeo, this.fireMat.clone());
    ball.position.set(x, y + radius * 0.3, z);
    this.scene.add(ball);
    this.fireballs.push({ mesh: ball, t: 0, r: radius });
    this.smoke(x, y + 1, z, 30 + radius * 4, radius * 0.9, radius * 0.9, 3.5);
    for (let k = 0; k < 40 + radius * 4; k++) {
      const a = Math.random() * Math.PI * 2, s = 6 + Math.random() * radius * 2.4;
      this.spawn(x, y + 0.5, z, Math.cos(a) * s, 4 + Math.random() * 12, Math.sin(a) * s, 0.32, 0.24, 0.15, 0.25 + Math.random() * 0.35, 1.2 + Math.random());
    }
    for (let k = 0; k < 24; k++) {
      const a = Math.random() * Math.PI * 2, s = 10 + Math.random() * 20;
      this.spawn(x, y + 1, z, Math.cos(a) * s, 5 + Math.random() * 15, Math.sin(a) * s, 1, 0.7, 0.25, 0.25, 0.5 + Math.random() * 0.4, 9.8);
    }
    this.bigFlash.position.set(x, y + 4, z);
    this.bigFlash.intensity = 600 * radius / 7;
    this.bigFlashT = 0.18;
    const sc = new THREE.Mesh(this.scorchGeo, this.scorchMat);
    sc.scale.setScalar(radius * 0.8);
    sc.position.set(x, y + 0.08, z);
    this.scene.add(sc);
    this.scorches.push(sc);
    if (this.scorches.length > 80) this.scene.remove(this.scorches.shift());
    if (camPos) {
      const d = Math.hypot(camPos.x - x, camPos.z - z);
      this.shake = Math.max(this.shake, Math.max(0, 1.2 - d / 120) * radius / 7);
    }
  }

  update(dt) {
    // particles
    const P = this.pPos, V = this.pVel, C = this.pCol;
    for (let i = 0; i < this.pCount; i++) {
      this.pLife[i] -= dt;
      if (this.pLife[i] <= 0) {
        const last = --this.pCount;
        if (i !== last) {
          for (let q = 0; q < 3; q++) {
            P[i * 3 + q] = P[last * 3 + q]; V[i * 3 + q] = V[last * 3 + q]; this.pBase[i * 3 + q] = this.pBase[last * 3 + q];
          }
          this.pSize[i] = this.pSize[last]; this.pLife[i] = this.pLife[last]; this.pMax[i] = this.pMax[last];
          this.pGrav[i] = this.pGrav[last]; this.pGrow[i] = this.pGrow[last];
        }
        i--;
        continue;
      }
      V[i * 3 + 1] -= this.pGrav[i] * dt;
      if (this.pGrav[i] < 0) { V[i * 3] *= 0.98; V[i * 3 + 2] *= 0.98; V[i * 3 + 1] *= 0.97; }
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      this.pSize[i] += this.pGrow[i] * dt;
      const f = this.pLife[i] / this.pMax[i];
      const fade = this.pGrav[i] < 0 ? Math.min(1, f * 1.5) : 1;
      C[i * 3] = this.pBase[i * 3] * fade; C[i * 3 + 1] = this.pBase[i * 3 + 1] * fade; C[i * 3 + 2] = this.pBase[i * 3 + 2] * fade;
      // stop at ground
      if (this.pGrav[i] > 0 && (i & 3) === 0) {
        const gy = groundY(P[i * 3], P[i * 3 + 2]);
        if (P[i * 3 + 1] < gy) { P[i * 3 + 1] = gy; V[i * 3] = V[i * 3 + 1] = V[i * 3 + 2] = 0; }
      }
    }
    const geo = this.points.geometry;
    geo.setDrawRange(0, this.pCount);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;

    // tracers
    for (let i = 0; i < MAX_TRACERS; i++) {
      if (this.trLife[i] > 0) {
        this.trLife[i] -= dt;
        if (this.trLife[i] <= 0) this.trPos.fill(0, i * 6, i * 6 + 6);
      }
    }
    this.tracers.geometry.attributes.position.needsUpdate = true;
    this.tracers.geometry.attributes.color.needsUpdate = true;

    // fireballs
    for (let k = this.fireballs.length - 1; k >= 0; k--) {
      const f = this.fireballs[k];
      f.t += dt;
      const p = f.t / 0.6;
      f.mesh.scale.setScalar(f.r * (0.4 + p * 0.9));
      f.mesh.material.opacity = Math.max(0, 1 - p);
      f.mesh.material.color.setRGB(1, 0.7 - p * 0.4, 0.3 - p * 0.25);
      if (p >= 1) { this.scene.remove(f.mesh); f.mesh.material.dispose(); this.fireballs.splice(k, 1); }
    }
    this.flashT -= dt; if (this.flashT <= 0) this.flash.intensity = 0;
    this.bigFlashT -= dt; if (this.bigFlashT <= 0) this.bigFlash.intensity *= 0.8;
    this.shake *= Math.exp(-dt * 5);
  }
}
