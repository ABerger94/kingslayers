// The campaign hub between battles: campaign map & briefings, the settlement (free placement),
// the Depot (the Handler's shop), the army roster, and the keep (prisoners).
import {
  ITEMS, GUN_IDS, BUILDINGS, BEACON_UPGRADES, MISSIONS, SQUAD_TYPES,
  saveCampaign, missionStatus, count, popCap, armySize, canAfford, pay, costText, production, reinforceCost,
  prisonerAction, endingOptions, chooseEnding, ENDINGS, log,
} from './campaign.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// Map positions for the campaign map (0..1)
const NODES = {
  raid: { x: 0.55, y: 0.24, label: 'Hanmer' },
  defense: { x: 0.24, y: 0.46, label: 'Sycharth' },
  convoy: { x: 0.6, y: 0.5, label: 'Royal road' },
  shrewsbury: { x: 0.78, y: 0.74, label: 'Shrewsbury' },
  endless: { x: 0.2, y: 0.62, label: 'Endless Siege' },
};

export class Hub {
  constructor(campaign, { onDeploy, onQuit }) {
    this.c = campaign;
    this.onDeploy = onDeploy;
    this.onQuit = onQuit;
    this.el = $('hub');
    this.tab = 'campaign';
    this.selected = null;
    this.placing = null;
    this.ghost = null;
    this.opts = { sabotage: 0, scale: 'standard' };
    this.el.addEventListener('click', (e) => this.onClick(e));
    this.el.addEventListener('change', (e) => this.onChange(e));
  }

  show() {
    this.el.classList.remove('hidden');
    if (!this.selected) this.selected = this.firstAvailable();
    this.render();
  }
  hide() { this.el.classList.add('hidden'); }

  firstAvailable() {
    for (const id of ['defense', 'raid', 'shrewsbury', 'convoy', 'endless']) {
      const s = missionStatus(this.c, id);
      if (s === 'required' || s === 'available') return id;
    }
    return 'raid';
  }

  save() { saveCampaign(this.c); }

  toast(text) {
    const t = $('hubToast');
    t.textContent = text;
    t.classList.add('on');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => t.classList.remove('on'), 3500);
  }

  // ------------------------------------------------------------------ rendering
  render() {
    const c = this.c;
    if (c.awaitingEnding || (c.ending && !c.endingShown) || this.showingEnding) { this.renderEnding(); return; }
    const inst = c.instability;
    const instCls = inst >= 80 ? 'crit' : inst >= 50 ? 'high' : inst >= 25 ? 'mid' : '';
    $('hubTop').innerHTML = `
      <div class="brand">TIMEFALL <small>Crown &amp; Caliber</small></div>
      <div class="act">Act ${c.act}</div>
      <div class="res"><span title="Silver: sent to the future to buy gear">⛁ ${c.res.silver}</span><span title="Food">🌾 ${c.res.food}</span><span title="Wood">🪵 ${c.res.wood}</span><span title="Intel from interrogations">🗝 ${c.res.intel}</span></div>
      <div class="inst ${instCls}" title="Timeline Instability: rises with modern tech and with changing history"><span>Timeline ${inst.toFixed(0)}%</span><div class="bar"><i style="width:${inst}%"></i></div></div>
      <button data-act="quit" class="secondary">Title screen</button>`;
    for (const b of $('hubTabs').querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === this.tab);
    const body = $('hubBody');
    if (this.tab === 'campaign') body.innerHTML = this.campaignHtml();
    if (this.tab === 'settlement') body.innerHTML = this.settlementHtml();
    if (this.tab === 'depot') body.innerHTML = this.depotHtml();
    if (this.tab === 'army') body.innerHTML = this.armyHtml();
    if (this.tab === 'keep') body.innerHTML = this.keepHtml();
    if (this.tab === 'campaign') this.drawMap();
    if (this.tab === 'settlement') this.initSettlementCanvas();
    const badge = $('hubTabs').querySelector('[data-tab="keep"] .badge');
    if (badge) badge.textContent = c.prisoners.length || '';
  }

  // ------------------------------------------------------------------ campaign map + briefing
  campaignHtml() {
    const c = this.c;
    const id = this.selected;
    const m = MISSIONS[id];
    const st = missionStatus(c, id);
    const owned = GUN_IDS.filter((g) => c.owned[g]);
    const gunOpts = (sel) => owned.map((g) => `<option value="${g}" ${g === sel ? 'selected' : ''}>${ITEMS[g].name}</option>`).join('');
    const canDeploy = st === 'available' || st === 'required';
    const statusText = { available: 'Available', required: 'Required — your settlement is under attack', done: 'Completed', locked: 'Locked', blocked: 'Sycharth must be defended first' }[st];
    const stock = ['c4', 'supply', 'gunship', 'airstrike'].map((k) => `<span>${ITEMS[k].name}: <b>${c.stock[k] || 0}</b></span>`).join('');
    return `
      <div class="campaign">
        <div class="mapWrap"><canvas id="campaignMap" width="560" height="420"></canvas>
          <div class="log">${c.log.slice(0, 5).map((l) => `<div>${esc(l)}</div>`).join('')}</div></div>
        <div class="brief">
          <p class="kicker">${esc(m.kind)} · Act ${m.act}</p>
          <h2>${esc(m.title)}</h2>
          <p class="status ${st}">${statusText}</p>
          <p>${esc(m.blurb)}</p>
          <p><b>Objective:</b> ${esc(m.win)}</p>
          <p><b>Enemy:</b> ${c.res.intel > 0 || c.completed[id] ? esc(m.enemy) : '<i>Unknown. Interrogate prisoners for intel.</i>'}</p>
          ${m.reward ? `<p><b>Reward:</b> ${m.reward} silver + loot</p>` : ''}
          ${id === 'endless' ? `<p>Best: ${c.endlessBest} waves</p>` : ''}
          <h3>Loadout</h3>
          <div class="loadout">
            <label>Primary <select data-loadout="0">${gunOpts(c.loadout[0])}</select></label>
            <label>Secondary <select data-loadout="1">${gunOpts(c.loadout[1])}</select></label>
          </div>
          <p class="small">Always carried: longsword, sledgehammer, arm buckler.${c.owned.suv ? ' The Armoured SUV deploys with you.' : ''}</p>
          <div class="stock">${stock}</div>
          ${c.res.intel > 0 ? `<label class="small">Spend intel on sabotage (−10% enemy each): <input type="range" min="0" max="${Math.min(3, c.res.intel)}" value="${this.opts.sabotage}" data-opt="sabotage"> ${this.opts.sabotage}</label>` : ''}
          ${id === 'shrewsbury' ? `<label class="small">Battle size <select data-opt="scale"><option value="standard" ${this.opts.scale === 'standard' ? 'selected' : ''}>Standard (~1,500 soldiers)</option><option value="epic" ${this.opts.scale === 'epic' ? 'selected' : ''}>Epic (~3,300 soldiers)</option></select></label>` : ''}
          <p class="small">Your army: ${c.squads.length} squads, ${armySize(c)} men${c.executionBuff ? ' · fired up after an execution (+morale)' : ''}</p>
          <button data-act="deploy" ${canDeploy ? '' : 'disabled'}>Deploy</button>
        </div>
      </div>`;
  }

  drawMap() {
    const cv = $('campaignMap');
    if (!cv) return;
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.fillStyle = '#2b2a20'; g.fillRect(0, 0, W, H);
    // hills
    for (let k = 0; k < 40; k++) {
      const x = (Math.sin(k * 12.9898) * 43758.5453 % 1 + 1) % 1 * W, y = (Math.sin(k * 78.233) * 12543.11 % 1 + 1) % 1 * H;
      g.fillStyle = 'rgba(120,130,80,0.10)'; g.beginPath(); g.arc(x, y, 30 + (k % 5) * 10, 0, 7); g.fill();
    }
    // Wales to the west
    g.fillStyle = 'rgba(70,110,60,0.25)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(W * 0.38, 0); g.bezierCurveTo(W * 0.32, H * 0.4, W * 0.42, H * 0.6, W * 0.34, H); g.lineTo(0, H); g.fill();
    g.fillStyle = 'rgba(242,234,216,0.35)'; g.font = 'italic 16px serif'; g.fillText('Cymru', 22, 30); g.fillText('England', W - 90, 30);
    // rivers Dee and Severn
    g.strokeStyle = 'rgba(90,140,170,0.7)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, H * 0.12); g.bezierCurveTo(W * 0.3, H * 0.2, W * 0.5, H * 0.05, W, H * 0.1); g.stroke();
    g.beginPath(); g.moveTo(W * 0.1, H * 0.9); g.bezierCurveTo(W * 0.4, H * 0.7, W * 0.7, H * 0.95, W, H * 0.68); g.stroke();
    // roads
    g.strokeStyle = 'rgba(200,170,110,0.4)'; g.lineWidth = 2; g.setLineDash([6, 6]);
    const P = (id) => [NODES[id].x * W, NODES[id].y * H];
    g.beginPath(); g.moveTo(...P('defense')); g.lineTo(...P('raid')); g.lineTo(...P('convoy')); g.lineTo(...P('shrewsbury')); g.stroke();
    g.setLineDash([]);
    for (const [id, n] of Object.entries(NODES)) {
      const st = missionStatus(this.c, id);
      if (id === 'endless' && st === 'locked') continue;
      const [x, y] = P(id);
      const col = { available: '#e0b341', required: '#e05a3a', done: '#7fa76f', locked: '#5c574b', blocked: '#8a7a55' }[st];
      g.fillStyle = col; g.strokeStyle = id === this.selected ? '#fff' : '#000'; g.lineWidth = id === this.selected ? 3 : 1.5;
      g.beginPath(); g.arc(x, y, id === 'shrewsbury' ? 13 : 10, 0, 7); g.fill(); g.stroke();
      if (st === 'required') { g.strokeStyle = 'rgba(224,90,58,0.6)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 18 + Math.sin(performance.now() / 200) * 3, 0, 7); g.stroke(); }
      g.fillStyle = '#f2ead8'; g.font = '13px sans-serif'; g.fillText(n.label, x + 15, y + 4);
    }
    cv.onclick = (e) => {
      const r = cv.getBoundingClientRect();
      const mx = (e.clientX - r.left) / r.width, my = (e.clientY - r.top) / r.height;
      for (const [id, n] of Object.entries(NODES)) {
        if (Math.hypot(mx - n.x, (my - n.y) * H / W) < 0.035 && !(id === 'endless' && missionStatus(this.c, id) === 'locked')) { this.selected = id; this.render(); return; }
      }
    };
  }

  // ------------------------------------------------------------------ settlement
  settlementHtml() {
    const c = this.c;
    const prod = production(c);
    const next = BEACON_UPGRADES[c.beacon + 1];
    const palette = ['house', 'farm', 'mill', 'barracks'].map((t) => {
      const b = BUILDINGS[t];
      return `<button data-place="${t}" class="${this.placing === t ? 'on' : ''}" ${canAfford(c, b.cost) ? '' : 'disabled'}><b>${b.name}</b> <small>${costText(b.cost)}</small><br><small>${b.desc}</small> <small class="have">×${count(c, t)}</small></button>`;
    }).join('');
    return `
      <div class="settlement">
        <div><canvas id="settleCanvas" width="640" height="400"></canvas>
          <p class="small">${this.placing ? `Placing a ${BUILDINGS[this.placing].name}: click an open spot. Right-click to cancel.` : 'Pick a building, then click anywhere on open ground to place it.'}</p></div>
        <div class="side">
          <h3>Build</h3>${palette}
          <h3>Temporal Beacon — level ${c.beacon}</h3>
          <p class="small">Depot tier ${c.beacon} unlocked. ${next ? `Upgrade to level ${c.beacon + 1} for ${costText(next)}.` : 'Fully upgraded.'}</p>
          ${next ? `<button data-act="beacon" ${canAfford(c, next) ? '' : 'disabled'}>Upgrade Beacon</button>` : ''}
          <h3>Between missions</h3>
          <p class="small">+${prod.food} food, +${prod.wood} wood · Population ${armySize(c)}/${popCap(c)}</p>
        </div>
      </div>`;
  }

  initSettlementCanvas() {
    const cv = $('settleCanvas');
    if (!cv) return;
    const draw = () => this.drawSettlement(cv);
    draw();
    const toN = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
    cv.onmousemove = (e) => { if (this.placing) { this.ghost = toN(e); draw(); } };
    cv.oncontextmenu = (e) => { e.preventDefault(); this.placing = null; this.ghost = null; this.render(); };
    cv.onclick = (e) => {
      if (!this.placing) return;
      const p = toN(e);
      if (!this.validSpot(p, this.placing)) { this.toast('Not enough room there.'); return; }
      const b = BUILDINGS[this.placing];
      if (!canAfford(this.c, b.cost)) { this.toast('Not enough resources.'); return; }
      pay(this.c, b.cost);
      this.c.buildings.push({ type: this.placing, x: p.x, y: p.y });
      log(this.c, `Built a ${b.name}.`);
      this.save();
      if (!canAfford(this.c, b.cost)) this.placing = null;
      this.render();
    };
  }

  validSpot(p, type) {
    const W = 640, H = 400, r = BUILDINGS[type].r;
    if (p.x * W < r || p.x * W > W - r || p.y * H < r + 40 || p.y * H > H - r) return false; // river along the top
    return this.c.buildings.every((b) => Math.hypot((b.x - p.x) * W, (b.y - p.y) * H) > BUILDINGS[b.type].r + r + 4);
  }

  drawSettlement(cv) {
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.fillStyle = '#4f6a35'; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 120; k++) { g.fillStyle = k % 2 ? 'rgba(90,120,60,0.35)' : 'rgba(60,80,40,0.3)'; g.fillRect((k * 97) % W, (k * 53) % H, 18, 10); }
    g.fillStyle = '#3d6a7d'; g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, 26); g.bezierCurveTo(W * 0.7, 46, W * 0.3, 18, 0, 38); g.fill();
    g.strokeStyle = 'rgba(160,130,80,0.6)'; g.lineWidth = 10; g.beginPath(); g.moveTo(0, H * 0.78); g.bezierCurveTo(W * 0.3, H * 0.6, W * 0.6, H * 0.9, W, H * 0.7); g.stroke();
    const drawB = (b, alpha = 1) => {
      const x = b.x * W, y = b.y * H;
      g.globalAlpha = alpha;
      switch (b.type) {
        case 'beacon': {
          g.fillStyle = '#2a3238'; g.fillRect(x - 10, y - 8, 20, 22);
          const grd = g.createRadialGradient(x, y - 18, 2, x, y - 18, 30); grd.addColorStop(0, 'rgba(120,230,255,0.9)'); grd.addColorStop(1, 'rgba(120,230,255,0)');
          g.fillStyle = grd; g.beginPath(); g.arc(x, y - 18, 30, 0, 7); g.fill();
          g.fillStyle = '#9ef'; g.fillRect(x - 3, y - 34, 6, 28);
          g.fillStyle = '#f2ead8'; g.font = 'bold 11px sans-serif'; g.fillText(`Beacon L${this.c.beacon}`, x - 28, y + 28);
          break;
        }
        case 'house':
          g.fillStyle = '#c9b48a'; g.fillRect(x - 14, y - 6, 28, 18);
          g.fillStyle = '#7a4a2a'; g.beginPath(); g.moveTo(x - 18, y - 6); g.lineTo(x, y - 20); g.lineTo(x + 18, y - 6); g.fill();
          break;
        case 'farm':
          g.fillStyle = '#b8a14a'; g.fillRect(x - 28, y - 20, 56, 40);
          g.strokeStyle = '#8a7a30'; g.lineWidth = 2; for (let k = -24; k <= 24; k += 8) { g.beginPath(); g.moveTo(x + k, y - 20); g.lineTo(x + k, y + 20); g.stroke(); }
          break;
        case 'mill':
          g.fillStyle = '#6d4c2c'; g.fillRect(x - 18, y - 10, 36, 22);
          g.fillStyle = '#8a6a44'; for (let k = 0; k < 4; k++) g.fillRect(x - 22 + k * 3, y + 14, 30, 4);
          g.fillStyle = '#ccc'; g.beginPath(); g.arc(x + 18, y - 10, 8, 0, 7); g.fill();
          break;
        case 'barracks':
          g.fillStyle = '#7d6a55'; g.fillRect(x - 28, y - 10, 56, 24);
          g.fillStyle = '#4a3a2a'; g.fillRect(x - 30, y - 16, 60, 8);
          g.fillStyle = '#e0b341'; g.fillRect(x + 20, y - 34, 2, 20); g.fillRect(x + 22, y - 34, 12, 8);
          break;
      }
      g.globalAlpha = 1;
    };
    for (const b of this.c.buildings) drawB(b);
    if (this.placing && this.ghost) {
      const ok = this.validSpot(this.ghost, this.placing);
      drawB({ type: this.placing, ...this.ghost }, 0.6);
      g.strokeStyle = ok ? '#8f8' : '#f66'; g.lineWidth = 2;
      g.beginPath(); g.arc(this.ghost.x * W, this.ghost.y * H, BUILDINGS[this.placing].r, 0, 7); g.stroke();
    }
  }

  // ------------------------------------------------------------------ the Depot
  depotHtml() {
    const c = this.c;
    const cards = Object.entries(ITEMS).map(([id, it]) => {
      const locked = it.tier > c.beacon;
      let action;
      if (locked) action = `<span class="lock">Beacon level ${it.tier} required</span>`;
      else if (it.kind === 'stock') action = `<span>Have ${c.stock[id] || 0}/${it.max}</span> <button data-buy="${id}" ${c.res.silver >= it.price && (c.stock[id] || 0) < it.max ? '' : 'disabled'}>Buy · ${it.price}</button>`;
      else if (c.owned[id]) action = '<span class="owned">Owned</span>';
      else action = `<button data-buy="${id}" ${c.res.silver >= it.price ? '' : 'disabled'}>Buy · ${it.price}</button>`;
      return `<div class="item ${locked ? 'locked' : ''}"><div class="tier">T${it.tier}</div><b>${it.name}</b><p>${it.desc}</p><small>Instability per use: ${it.inst >= 1 ? '+' + it.inst + '%' : it.inst >= 0.1 ? '+' + it.inst + '% / shot' : 'minimal'}</small><div class="buy">${action}</div></div>`;
    }).join('');
    return `<div class="depot"><p class="handler">Handler: "Silver you loot in 1403 is melted down and sent forward; I buy what you need with it and send it back. Upgrade the Beacon for heavier gear. And remember: every gadget I send cracks the timeline a little more."</p><div class="items">${cards}</div></div>`;
  }

  // ------------------------------------------------------------------ army
  armyHtml() {
    const c = this.c;
    const barracks = count(c, 'barracks');
    const rows = c.squads.map((s) => {
      const rf = reinforceCost(s);
      const can = rf.missing > 0 && canAfford(c, rf.cost) && armySize(c) + rf.missing <= popCap(c);
      const btn = rf.missing > 0 ? `<button data-reinforce="${s.id}" ${can ? '' : 'disabled'} title="${costText(rf.cost)}">Reinforce +${rf.missing} (${costText(rf.cost)})</button>` : '<span class="small">full strength</span>';
      return `<tr><td>${esc(s.name)}</td><td>${SQUAD_TYPES[s.type].label}</td><td>${s.men}/${SQUAD_TYPES[s.type].men}</td><td>${'★'.repeat(s.vet)}${'☆'.repeat(3 - s.vet)}</td><td>${s.lieutenant ? esc(s.lieutenant) : '—'}</td><td>${btn}</td></tr>`;
    }).join('');
    const recruit = Object.entries(SQUAD_TYPES).map(([t, d]) => {
      const cost = { food: d.food, wood: d.wood };
      const needB = d.needsBarracks || 1;
      const ok = barracks >= needB && canAfford(c, cost) && armySize(c) + d.men <= popCap(c);
      const why = barracks < needB ? `needs ${needB} barracks` : armySize(c) + d.men > popCap(c) ? 'build houses for population' : costText(cost);
      return `<button data-recruit="${t}" ${ok ? '' : 'disabled'}><b>${d.label}</b> (${d.men} men)<br><small>beats ${d.beats} · ${why}</small></button>`;
    }).join('');
    return `<div class="army"><table><tr><th>Squad</th><th>Type</th><th>Men</th><th>Veterancy</th><th>Lieutenant</th><th></th></tr>${rows || '<tr><td colspan="5">No squads. Recruit some!</td></tr>'}</table>
      <p class="small">Population ${armySize(c)}/${popCap(c)}. Squads that survive battles become veterans and fight harder; reinforcing a squad keeps its veterancy. Many of the men you lose in battle are only wounded and rejoin afterwards. Lieutenants (recruited prisoners) steady their squad's morale.</p>
      <h3>Recruit ${barracks ? '' : '<small>(build a Barracks in the settlement first)</small>'}</h3><div class="recruit">${recruit}</div></div>`;
  }

  // ------------------------------------------------------------------ keep
  keepHtml() {
    const c = this.c;
    const list = c.prisoners.map((p, k) => `<div class="prisoner"><b>${esc(p.name)}</b> <small>${esc(p.rank)}${p.hero ? ' — of royal blood' : ''}</small>
      <div class="acts"><button data-pris="${k}" data-do="ransom">Ransom (+${p.value} silver)</button><button data-pris="${k}" data-do="interrogate">Interrogate (+intel)</button>
      <button data-pris="${k}" data-do="recruit">Recruit (lieutenant?)</button><button data-pris="${k}" data-do="execute" class="danger">Execute</button></div></div>`).join('');
    return `<div class="keep"><h3>Prisoners</h3>${list || '<p>No prisoners. Wound royal officers in battle (not with explosives) and press <kbd>E</kbd> / <kbd>Y</kbd> to capture them.</p>'}
      <h3>Your standing</h3><p>Reputation <b>${c.reputation}</b> · Army loyalty <b>${c.loyalty}</b> · Executions ${c.executions} · Lieutenants: ${c.lieutenants.map(esc).join(', ') || 'none'}</p>
      <p class="small">Ransom brings silver. Interrogation brings intel (sabotage enemy armies before battle). Recruits may become lieutenants. Executions fire up your men for one battle but cost reputation and loyalty, and low loyalty causes desertions. Your choices shape the ending.</p>
      <h3>Chronicle</h3><div class="log">${c.log.map((l) => `<div>${esc(l)}</div>`).join('')}</div></div>`;
  }

  // ------------------------------------------------------------------ ending
  renderEnding() {
    const c = this.c;
    $('hubTop').innerHTML = '<div class="brand">TIMEFALL <small>Crown &amp; Caliber</small></div>';
    if (c.ending) {
      const e = ENDINGS[c.ending];
      c.endingShown = true;
      this.showingEnding = true; // stay on this screen until Continue
      this.save();
      $('hubBody').innerHTML = `<div class="ending"><h1>${e.title}</h1><p>${e.text}</p><p class="small">Timeline Instability: ${c.instability.toFixed(0)}% · Reputation ${c.reputation} · Executions ${c.executions}</p>
        <button data-act="continue">${c.ending === 'collapse' ? 'Start a new campaign' : 'Continue (Endless Siege unlocked)'}</button></div>`;
      return;
    }
    const opts = endingOptions(c).map((o) => `<div class="endOpt ${o.ok ? '' : 'locked'}"><h3>${o.title}</h3><p>${o.text}</p>${o.ok ? `<button data-ending="${o.id}">Choose</button>` : `<small>${o.need}</small>`}</div>`).join('');
    $('hubBody').innerHTML = `<div class="ending"><h1>King Henry IV is dead</h1><p>Shrewsbury is won. The Handler: "History is yours to shape now. Choose carefully. The timeline is at ${c.instability.toFixed(0)}%."</p><div class="endOpts">${opts}</div></div>`;
  }

  // ------------------------------------------------------------------ input
  onChange(e) {
    const t = e.target;
    if (t.dataset.loadout !== undefined) {
      const k = +t.dataset.loadout;
      this.c.loadout[k] = t.value;
      if (this.c.loadout[0] === this.c.loadout[1]) this.c.loadout[1 - k] = GUN_IDS.find((g) => this.c.owned[g] && g !== t.value) || this.c.loadout[1 - k];
      this.save();
      this.render();
    }
    if (t.dataset.opt) { this.opts[t.dataset.opt] = t.dataset.opt === 'sabotage' ? +t.value : t.value; this.render(); }
  }

  onClick(e) {
    const t = e.target.closest('button');
    if (!t || t.disabled) return;
    const c = this.c;
    if (t.dataset.tab) { this.tab = t.dataset.tab; this.placing = null; this.render(); return; }
    if (t.dataset.place) { this.placing = this.placing === t.dataset.place ? null : t.dataset.place; this.render(); return; }
    if (t.dataset.buy) {
      const it = ITEMS[t.dataset.buy];
      if (c.res.silver < it.price) return;
      c.res.silver -= it.price;
      if (it.kind === 'stock') c.stock[t.dataset.buy] = (c.stock[t.dataset.buy] || 0) + 1;
      else c.owned[t.dataset.buy] = true;
      log(c, `Bought ${it.name} from the Depot.`);
      this.toast(`${it.name} is on its way from the future.`);
      this.save(); this.render(); return;
    }
    if (t.dataset.recruit) {
      const d = SQUAD_TYPES[t.dataset.recruit];
      pay(c, { food: d.food, wood: d.wood });
      const names = { spear: ['Powys Spears', 'Clwyd Spears', 'Dee Valley Pikes'], sword: ['Teulu Blades', 'Marcher Swords', 'Gwynedd Blades'], archer: ['Gwent Bowmen', 'Cheshire Archers', 'Brecon Longbows'], cavalry: ['Welsh Horse', 'Border Riders', 'Teulu Lances'] }[t.dataset.recruit];
      const name = `${['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][c.nextSquad % 8]} ${names[c.nextSquad % names.length]}`;
      c.squads.push({ id: c.nextSquad++, name, type: t.dataset.recruit, men: d.men, vet: 0, battles: 0 });
      log(c, `Recruited ${name}.`);
      this.save(); this.render(); return;
    }
    if (t.dataset.reinforce) {
      const s = c.squads.find((q) => q.id === +t.dataset.reinforce);
      const rf = reinforceCost(s);
      pay(c, rf.cost);
      s.men += rf.missing;
      log(c, `${s.name} reinforced to full strength.`);
      this.save(); this.render(); return;
    }
    if (t.dataset.pris !== undefined) {
      this.toast(prisonerAction(c, +t.dataset.pris, t.dataset.do));
      this.save(); this.render(); return;
    }
    if (t.dataset.ending) { chooseEnding(c, t.dataset.ending); this.save(); this.render(); return; }
    switch (t.dataset.act) {
      case 'deploy': this.onDeploy(this.selected, { ...this.opts }); break;
      case 'beacon': {
        const cost = BEACON_UPGRADES[c.beacon + 1];
        if (!cost || !canAfford(c, cost)) return;
        pay(c, cost);
        c.beacon++;
        log(c, `The Temporal Beacon reached level ${c.beacon}. Depot tier ${c.beacon} unlocked.`);
        this.toast(`Beacon level ${c.beacon}: new gear in the Depot.`);
        this.save(); this.render(); break;
      }
      case 'continue':
        if (c.ending === 'collapse') { this.onQuit(true); return; }
        this.showingEnding = false; this.tab = 'campaign'; this.selected = 'endless'; this.render(); break;
      case 'quit': this.onQuit(false); break;
    }
  }
}

// ---------------------------------------------------------------- after-battle results screen
export function showResults(result, summary, onContinue) {
  const el = $('results');
  el.classList.remove('hidden');
  const won = result.outcome === 'victory';
  el.querySelector('.card').innerHTML = `
    <p class="kicker">${esc(MISSIONS[result.mission].title)}</p>
    <h1>${won ? 'VICTORY' : 'DEFEAT'}</h1>
    <p>${esc(result.text)}</p>
    <ul>${summary.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <p class="small">Your kills: ${result.kills} · Loot collected on the field: ${result.loot} silver${result.prisoners.length ? ` · Prisoners: ${result.prisoners.map((p) => esc(p.name)).join(', ')}` : ''}</p>
    <button id="resultsContinue">Return to the settlement</button>`;
  $('resultsContinue').onclick = onContinue;
}
