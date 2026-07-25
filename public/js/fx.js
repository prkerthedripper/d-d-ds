// Combat animations. Everything is CSS-driven and self-removing, so a missed
// frame or a spammed button can never leave junk on screen. The goal is short,
// punchy, readable hits — each element type has its own colour, particle shape
// and screen feedback so a fireball never looks like a sword swing.

const LAYER_ID = 'fxlayer';

function layer() {
  let el = document.getElementById(LAYER_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = LAYER_ID;
    document.body.append(el);
  }
  return el;
}

/** Add a node, then bin it once its animation is done. */
function flash(html, ms) {
  const el = document.createElement('div');
  el.innerHTML = html;
  const node = el.firstElementChild;
  layer().append(node);
  setTimeout(() => node.remove(), ms);
  return node;
}

function shake(intensity = 'hit') {
  const app = document.querySelector('.app') || document.body;
  app.classList.remove('fx-shake', 'fx-shake-hard', 'fx-shake-soft');
  // Force a reflow so the same class can retrigger back to back.
  void app.offsetWidth;
  const cls = intensity === 'hard' ? 'fx-shake-hard' : intensity === 'soft' ? 'fx-shake-soft' : 'fx-shake';
  app.classList.add(cls);
  setTimeout(() => app.classList.remove('fx-shake', 'fx-shake-hard', 'fx-shake-soft'), 600);
}

/** Radial colour wash over the whole screen. */
function tint(colour, ms = 420) {
  flash(`<div class="fx-tint" style="--c:${colour};animation-duration:${ms}ms"></div>`, ms);
}

/** Pulsing colour at the screen edges — reads as "you got hit". */
function vignette(colour, ms = 620) {
  flash(`<div class="fx-vignette" style="--c:${colour};--ms:${ms}ms"></div>`, ms);
}

/** A hollow ring that expands and fades — an impact shockwave. */
function shockwave(colour, ms = 620) {
  flash(`<div class="fx-wave" style="--c:${colour};animation-duration:${ms}ms"></div>`, ms);
}

/** Rising damage / healing number, nudged sideways so repeats don't stack. */
function floatText(text, cls = '', jitter = 46) {
  const jx = (Math.random() * 2 - 1) * jitter;
  const rot = (Math.random() * 2 - 1) * 8;
  flash(`<div class="fx-float ${cls}" style="--jx:${jx.toFixed(0)}px;--rot:${rot.toFixed(1)}deg">${text}</div>`, 1150);
}

/** The spell name card that flies in and out. */
function spellCard(name, cls) {
  flash(`<div class="fx-card ${cls}"><span class="fx-card-name">${name}</span></div>`, 1400);
}

/**
 * A ring of particles thrown out from the centre. Each bit gets a random target
 * offset, size, spin and delay so no two bursts look the same. `grav` biases the
 * vertical drift — negative makes embers and motes rise, positive lets sparks
 * fall.
 */
function particles(cls, count = 16, { grav = 40, spin = 240, size = 10, dist = [90, 210] } = {}) {
  const bits = Array.from({ length: count }, () => {
    const ang = Math.random() * Math.PI * 2;
    const d = dist[0] + Math.random() * (dist[1] - dist[0]);
    const tx = Math.cos(ang) * d;
    const ty = Math.sin(ang) * d + grav;
    const sz = size * (0.55 + Math.random() * 0.9);
    const sp = (Math.random() * 2 - 1) * spin;
    return `<i style="--tx:${tx.toFixed(0)}px;--ty:${ty.toFixed(0)}px;--sz:${sz.toFixed(1)}px;`
      + `--sp:${sp.toFixed(0)}deg;--delay:${(Math.random() * 110).toFixed(0)}ms"></i>`;
  }).join('');
  flash(`<div class="fx-burst ${cls}">${bits}</div>`, 1050);
}

/** A jagged lightning bolt down the middle of the screen. */
function lightning() {
  const cx = 50;
  let d = `M ${cx} 0`;
  for (let y = 8; y <= 100; y += 8 + Math.random() * 6) {
    const x = cx + (Math.random() * 2 - 1) * 9;
    d += ` L ${x.toFixed(1)} ${Math.min(y, 100).toFixed(1)}`;
  }
  flash(`<div class="fx-bolt"><svg viewBox="0 0 100 100" preserveAspectRatio="none">
    <path d="${d}"/></svg></div>`, 520);
}

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** A big centre-screen banner for the game's dramatic beats. */
export function announce(title, sub = '', cls = '') {
  if (document.hidden) return;
  flash(`<div class="fx-announce ${cls}">
    <div class="an-bar">
      <h3>${esc(title)}</h3>
      ${sub ? `<p>${esc(sub)}</p>` : ''}
    </div>
  </div>`, 1750);
}

// A damage type coming off the server (fire, cold, thunder…) picks a richer
// visual than the spell's generic tag would. Physical types and heals fall
// through to whatever `fx.type` already said.
const BY_DMG = {
  fire: 'fire', cold: 'cold', lightning: 'lightning', thunder: 'thunder',
  radiant: 'radiant', necrotic: 'necrotic', poison: 'poison', acid: 'poison',
  force: 'force', psychic: 'psychic',
};

/**
 * Play one combat animation.
 * @param {{type:string, dmgType?:string, spell?:string, damage?:number,
 *   heal?:number, crit?:boolean, name?:string, label?:string}} fx
 */
export function playFx(fx = {}) {
  if (!fx || fx.type === 'none') return;
  if (document.hidden) return; // no point animating in a background tab

  const dmg = Number(fx.damage) || 0;
  const heal = Number(fx.heal) || 0;
  const kind = BY_DMG[fx.dmgType] || fx.type;

  // Dramatic beats stand alone — they don't want a spell card or a hit number.
  if (kind === 'initiative') { announce('ROLL INITIATIVE', esc(fx.name || ''), 'an-init'); shake('soft'); return; }
  if (kind === 'down') { announce(`${esc(fx.name || 'A hero')} IS DOWN`, 'Make it count', 'an-down'); tint('#5b1622', 700); shake(); return; }

  if (fx.spell) spellCard(esc(fx.spell), `card-${kind}`);

  switch (kind) {
    case 'crit': // natural 20 — the full cinematic
      announce('CRITICAL HIT!', dmg ? `${dmg} damage` : '', 'an-crit');
      particles('burst-gold', 26, { size: 13, dist: [110, 260], grav: 60 });
      shockwave('#ffd24a');
      tint('#e8c86a', 560);
      shake('hard');
      if (dmg) floatText(`-${dmg}`, 'float-dmg float-big');
      break;

    case 'fumble': // natural 1 — dark smoke
      flash('<div class="fx-smoke"></div>', 950);
      floatText('MISS', 'float-miss');
      shake('soft');
      break;

    case 'slash': // melee
    case 'ranged':
      flash('<div class="fx-slash"><i></i><i></i><i></i></div>', 520);
      particles('burst-spark', 10, { size: 6, dist: [60, 140], grav: 90 });
      if (dmg) { shake(); vignette('#c0392b'); floatText(`-${dmg}`, 'float-dmg'); }
      break;

    case 'fire':
      particles('burst-fire', 22, { size: 11, dist: [70, 200], grav: -140, spin: 120 });
      tint('#e2603a', 480);
      shockwave('#ff7a3a');
      if (dmg) { shake(); vignette('#e2603a'); floatText(`-${dmg}`, 'float-dmg'); }
      break;

    case 'cold':
      particles('burst-cold', 20, { size: 12, dist: [80, 190], grav: 70, spin: 320 });
      tint('#5fb8d8', 480);
      flash('<div class="fx-frost"></div>', 720);
      if (dmg) floatText(`-${dmg}`, 'float-dmg float-cold');
      break;

    case 'lightning':
      lightning();
      particles('burst-lightning', 16, { size: 8, dist: [90, 220], grav: 30 });
      tint('#cfe0ff', 300);
      shake('hard');
      if (dmg) { vignette('#7aa8ff'); floatText(`-${dmg}`, 'float-dmg float-elec'); }
      break;

    case 'thunder':
      shockwave('#c7d2ff');
      shockwave('#9fb0ff', 780);
      particles('burst-force', 18, { size: 10, dist: [110, 250] });
      tint('#b7c6ff', 340);
      shake('hard');
      if (dmg) { vignette('#6d7dd6'); floatText(`-${dmg}`, 'float-dmg'); }
      break;

    case 'force':
      flash('<div class="fx-rune"></div>', 820);
      particles('burst-force', 16, { size: 10, dist: [80, 200] });
      shockwave('#c9b3ff');
      tint('#8a6bff', 420);
      if (dmg) floatText(`-${dmg}`, 'float-dmg float-arc');
      break;

    case 'arcane':
      flash('<div class="fx-rune"></div>', 820);
      particles('burst-arcane', 16, { size: 10, dist: [80, 200] });
      tint('#8a6bff', 440);
      if (dmg) floatText(`-${dmg}`, 'float-dmg float-arc');
      break;

    case 'psychic':
      particles('burst-psychic', 18, { size: 10, dist: [70, 190], spin: 360 });
      tint('#ff8ad0', 440);
      if (dmg) floatText(`-${dmg}`, 'float-dmg float-psy');
      break;

    case 'radiant':
    case 'holy':
      flash('<div class="fx-beam"></div>', 720);
      particles('burst-holy', 18, { size: 10, dist: [70, 200], grav: -40 });
      tint('#e8c86a', 520);
      if (dmg) floatText(`-${dmg}`, 'float-dmg float-holy');
      break;

    case 'necrotic':
      flash('<div class="fx-smoke"></div>', 950);
      particles('burst-necrotic', 16, { size: 11, dist: [60, 170], grav: -30 });
      tint('#4b2d6b', 520);
      if (dmg) floatText(`-${dmg}`, 'float-dmg float-nec');
      break;

    case 'poison':
      particles('burst-poison', 20, { size: 12, dist: [60, 170], grav: -120, spin: 90 });
      tint('#5fae32', 480);
      if (dmg) floatText(`-${dmg}`, 'float-dmg float-poison');
      break;

    case 'heal': // green glow, motes rising
      particles('burst-heal', 18, { size: 11, dist: [50, 160], grav: -150, spin: 80 });
      vignette('#2e9e5b', 700);
      tint('#2e9e5b', 620);
      floatText(`+${heal}`, 'float-heal');
      break;

    case 'mark':
      flash('<div class="fx-mark"></div>', 800);
      break;

    case 'shieldUp':
      flash('<div class="fx-shield"></div>', 800);
      break;

    case 'aim':
      flash('<div class="fx-aim"></div>', 700);
      break;

    case 'miss':
      floatText('MISS', 'float-miss');
      break;

    default:
      if (dmg) { shake(); vignette('#c0392b'); floatText(`-${dmg}`, 'float-dmg'); }
      break;
  }

  // A heavy blow always adds a red wash + shake on top of its own effect.
  if (dmg >= 15 && kind !== 'crit') {
    tint('#c0392b', 320);
    shake();
  }
}
