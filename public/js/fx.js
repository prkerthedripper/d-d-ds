// Short combat animations. Everything is CSS-driven and self-removing, so a
// missed frame or a spammed button can never leave junk on screen.

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
  app.classList.remove('fx-shake', 'fx-shake-hard');
  // Force a reflow so the same class can retrigger back to back.
  void app.offsetWidth;
  app.classList.add(intensity === 'hard' ? 'fx-shake-hard' : 'fx-shake');
  setTimeout(() => app.classList.remove('fx-shake', 'fx-shake-hard'), 500);
}

function tint(colour, ms = 420) {
  flash(`<div class="fx-tint" style="--c:${colour};animation-duration:${ms}ms"></div>`, ms);
}

function floatText(text, cls = '') {
  flash(`<div class="fx-float ${cls}">${text}</div>`, 1100);
}

/** The spell card that flies in and out. */
function spellCard(name, cls) {
  flash(`<div class="fx-card ${cls}"><span class="fx-card-name">${name}</span></div>`, 1400);
}

function particles(cls, count = 14) {
  const bits = Array.from({ length: count }, (_, i) => {
    const angle = (360 / count) * i + Math.random() * 20;
    const dist = 90 + Math.random() * 120;
    return `<i style="--a:${angle}deg;--d:${dist}px;--delay:${Math.random() * 90}ms"></i>`;
  }).join('');
  flash(`<div class="fx-burst ${cls}">${bits}</div>`, 1000);
}

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Play one combat animation.
 * @param {{type:string, spell?:string, damage?:number, heal?:number, crit?:boolean, label?:string}} fx
 */
export function playFx(fx = {}) {
  if (!fx || fx.type === 'none') return;
  if (document.hidden) return; // no point animating in a background tab

  const dmg = Number(fx.damage) || 0;
  const heal = Number(fx.heal) || 0;
  if (fx.spell) spellCard(esc(fx.spell), `card-${fx.type}`);

  switch (fx.type) {
    case 'crit': // natural 20 — gold explosion, hard shake
      particles('burst-gold', 20);
      tint('#e8c86a', 520);
      shake('hard');
      floatText('CRITICAL!', 'float-crit');
      if (dmg) floatText(`-${dmg}`, 'float-dmg');
      break;

    case 'fumble': // natural 1 — dark smoke
      flash('<div class="fx-smoke"></div>', 950);
      floatText('MISS', 'float-miss');
      break;

    case 'slash': // melee
      flash('<div class="fx-slash"><i></i><i></i><i></i></div>', 520);
      if (dmg) { shake(); floatText(`-${dmg}`, 'float-dmg'); }
      break;

    case 'arcane': // generic magic — purple blast
      particles('burst-arcane', 16);
      tint('#8a6bff');
      if (dmg) floatText(`-${dmg}`, 'float-dmg');
      break;

    case 'radiant':
    case 'holy':
      particles('burst-holy', 16);
      tint('#e8c86a');
      if (dmg) floatText(`-${dmg}`, 'float-dmg');
      break;

    case 'fire':
      particles('burst-fire', 18);
      tint('#e2603a');
      if (dmg) { shake(); floatText(`-${dmg}`, 'float-dmg'); }
      break;

    case 'cold':
      particles('burst-cold', 14);
      tint('#5fb8d8');
      if (dmg) floatText(`-${dmg}`, 'float-dmg');
      break;

    case 'necrotic':
      flash('<div class="fx-smoke"></div>', 950);
      tint('#4b2d6b');
      if (dmg) floatText(`-${dmg}`, 'float-dmg');
      break;

    case 'heal': // green glow
      particles('burst-heal', 14);
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
      if (dmg) { shake(); floatText(`-${dmg}`, 'float-dmg'); }
      break;
  }

  // A big hit always shakes the screen red on top of its own effect.
  if (dmg >= 15 && fx.type !== 'crit') {
    tint('#c0392b', 320);
    shake();
  }
}
