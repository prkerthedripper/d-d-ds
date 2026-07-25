// Page rendering + user actions.
import {
  state, api, esc, mod, signed, avatar, hpBar, nameOf, ago, isDM, myChars,
  toast, on, render, loadMe, openCampaign, portraitOf,
} from './core.js';
import { icon, itemTile } from './icons.js';
import { pickImage } from './images.js';

export const NAV = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'characters', label: 'Characters', icon: 'shield' },
  { id: 'inventory', label: 'Inventory', icon: 'backpack' },
  { id: 'dice', label: 'Dice Roller', icon: 'dice' },
  { id: 'combat', label: 'Combat', icon: 'swords' },
  { id: 'spells', label: 'Spells', icon: 'sparkles' },
  { id: 'codex', label: 'Codex', icon: 'book' },
  { id: 'notes', label: 'Notes', icon: 'notes' },
  { id: 'chat', label: 'Chat', icon: 'chat' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const ABILITIES = [['str', 'STR'], ['dex', 'DEX'], ['con', 'CON'], ['int', 'INT'], ['wis', 'WIS'], ['cha', 'CHA']];
const ABILITY_NAME = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const COINS = [['pp', 'Platinum'], ['gp', 'Gold'], ['ep', 'Electrum'], ['sp', 'Silver'], ['cp', 'Copper']];

// Plain-language definitions for the "What does this mean?" helper. Kept to a
// sentence or two on purpose — this is a nudge, not a rulebook.
const GLOSSARY = {
  'Armor Class': 'How hard you are to hit. An attacker has to roll this number or higher to land a hit on you.',
  'AC': 'Armor Class — how hard you are to hit. An attacker has to roll this number or higher to hit you.',
  'Saving Throw': 'A roll to resist something nasty — a fireball, poison, a trap. Roll a d20 and add the matching ability.',
  'Ability Check': 'A roll to see if you can do something tricky. Roll a d20 and add the ability that fits, like Strength to lift a gate.',
  'Advantage': 'Roll two d20s and use the higher one. It means the odds are in your favour.',
  'Disadvantage': 'Roll two d20s and use the lower one. Something is making this harder for you.',
  'Bonus Action': 'A small, quick extra thing you can do on your turn on top of your main action — like a fast healing word.',
  'Reaction': 'A single quick response you can make even when it is not your turn, like swinging at an enemy who runs past.',
  'Concentration': 'Some spells need focus to keep going. If you take damage you must roll to hold it, and you can only concentrate on one spell at a time.',
  'Initiative': 'The roll at the start of a fight that decides turn order. Higher goes first.',
  'DC': 'Difficulty Class — the number you need to reach on a roll to succeed. The DM sets it.',
  'Proficiency Bonus': 'A bonus you add to things your character is trained in. It grows as you level up.',
  'Modifier': 'The small number you add to a d20 roll, based on how good your character is at that ability.',
  'Cantrip': 'A simple spell you can cast as often as you like — it never uses a spell slot.',
  'Spell Slot': 'A charge for casting your bigger spells. You get a limited number, and a long rest refills them.',
  'Hit Points': 'Your health. At 0 you fall unconscious and start making death saves.',
  'Death Save': 'When you are down at 0 HP, you roll a d20 each turn. 10 or higher succeeds. Three successes and you stabilise; three failures and you die.',
  'Critical Hit': 'A natural 20 on an attack. It always hits and you roll your damage dice twice.',
  'Temp HP': 'Temporary hit points — a buffer that soaks up damage before your real HP, and does not stack.',
  'Long Rest': 'About 8 hours of rest. It restores your HP and spell slots.',
  'Dodge': 'Spend your action to focus on defence — attacks against you have disadvantage until your next turn.',
};

/** A tappable term that opens its plain-language definition. */
function term(word, label) {
  return `<button class="term" data-act="glossary" data-term="${esc(word)}">${esc(label || word)}</button>`;
}

on('glossary', (el) => { state.modal = { name: 'glossary', term: el.dataset.term }; render(); });

on('toggle-simple', () => {
  state.simple = !state.simple;
  localStorage.setItem('dndds-simple', state.simple ? '1' : '0');
  toast(state.simple ? 'Simple mode on — plain language' : 'Advanced mode on — full D&D terms');
  render();
});

const selected = () => state.characters.find((c) => c.id === state.selectedCharId)
  || myChars()[0] || state.characters[0] || null;

const val = (form, name) => form.querySelector(`[name="${name}"]`)?.value ?? '';
const num = (form, name) => Number(val(form, name)) || 0;

// ================================================================= gate

export function gateView() {
  const login = state.authMode === 'login';
  return `
  <div class="gate">
    <div class="gate-card">
      <div class="brand">
        <div class="brand-mark">${icon('dragon', { size: 26 })}</div>
        <div><div class="brand-name" style="color:var(--ink)">D&amp;D DS</div>
        <div class="brand-sub">Dripper Studios</div></div>
      </div>
      <h1>${login ? 'Welcome back' : 'Create your account'}</h1>
      <p class="muted" style="text-align:center;margin:6px 0 18px">
        ${login ? 'Sign in to join your party.' : 'No email verification — just pick a password.'}
      </p>
      <form data-act="${login ? 'login' : 'register'}">
        ${login ? '' : `<label class="field"><span>Display name</span>
          <input name="username" data-keep="u" placeholder="Lyra" required /></label>`}
        <label class="field"><span>Email</span>
          <input name="email" data-keep="e" type="email" placeholder="you@example.com" required /></label>
        <label class="field"><span>Password</span>
          <input name="password" data-keep="p" type="password" placeholder="At least 6 characters" required /></label>
        <button class="btn primary wide" type="submit">${login ? 'Sign in' : 'Create account'}</button>
      </form>
      <p class="muted" style="text-align:center;margin-top:14px">
        ${login ? 'New here?' : 'Already have an account?'}
        <a href="#" data-act="toggle-auth">${login ? 'Create an account' : 'Sign in'}</a>
      </p>
    </div>
  </div>`;
}

on('toggle-auth', () => { state.authMode = state.authMode === 'login' ? 'register' : 'login'; render(); });

on('login', async (form) => {
  await api('POST', '/api/auth/login', { email: val(form, 'email'), password: val(form, 'password') });
  await loadMe();
  await autoOpen();
  render();
});

on('register', async (form) => {
  await api('POST', '/api/auth/register', {
    username: val(form, 'username'), email: val(form, 'email'), password: val(form, 'password'),
  });
  await loadMe();
  render();
  toast(`Welcome, ${state.user.username}!`);
});

async function autoOpen() {
  const last = localStorage.getItem('dndds-campaign');
  const target = state.campaigns.find((c) => c.id === last) || state.campaigns[0];
  if (target) await openCampaign(target.id);
}

// ================================================================= lobby

export function lobbyView() {
  return `
  <div class="gate">
    <div class="gate-card" style="max-width:520px">
      <div class="brand">
        <div class="brand-mark">${icon('dragon', { size: 26 })}</div>
        <div><div class="brand-name" style="color:var(--ink)">D&amp;D DS</div>
        <div class="brand-sub">Dripper Studios</div></div>
      </div>
      <h1 style="text-align:left">Hey ${esc(state.user.username)}</h1>
      <p class="muted" style="margin:6px 0 18px">Pick a campaign, or start one as the DM.</p>

      ${state.invites.length ? `
        <h3 style="font-size:14px;margin-bottom:8px">Invites</h3>
        <div class="stack" style="margin-bottom:20px">
          ${state.invites.map((i) => `
            <div class="card spread">
              <div>
                <div style="font-weight:650">${esc(i.name)}</div>
                <div class="tiny">Invited by ${esc(i.dmName)}</div>
              </div>
              <div class="row">
                <button class="btn sm" data-act="invite-decline" data-id="${i.id}">Decline</button>
                <button class="btn sm primary" data-act="invite-accept" data-id="${i.id}">Join</button>
              </div>
            </div>`).join('')}
        </div>` : ''}

      <div class="stack" style="margin-bottom:18px">
        ${state.campaigns.length ? state.campaigns.map((c) => `
          <button class="card spread" style="cursor:pointer;text-align:left;width:100%"
                  data-act="open-campaign" data-id="${c.id}">
            <div>
              <div style="font-weight:650">${esc(c.name)}</div>
              <div class="tiny">${c.role === 'dm' ? 'You are the DM' : 'Player'}</div>
            </div>
            <span class="tag">Open</span>
          </button>`).join('')
        : '<p class="muted">No campaigns yet. Ask your DM to invite this email, or create one below.</p>'}
      </div>

      <form data-act="create-campaign" class="card">
        <h3>Start a campaign</h3>
        <label class="field"><span>Campaign name</span>
          <input name="name" data-keep="cn" placeholder="The Lost Mines" required /></label>
        <button class="btn primary wide" type="submit">Create as DM</button>
      </form>

      <p style="text-align:center;margin-top:16px">
        <a href="#" data-act="logout">Sign out</a>
      </p>
    </div>
  </div>`;
}

on('open-campaign', (el) => openCampaign(el.dataset.id));

on('create-campaign', async (form) => {
  const { campaign } = await api('POST', '/api/campaigns', { name: val(form, 'name') });
  await loadMe();
  await openCampaign(campaign.id);
  toast('Campaign created — invite your friends in Settings.');
});

on('invite-accept', async (el) => {
  const { campaignId } = await api('POST', `/api/invites/${el.dataset.id}/accept`);
  await loadMe();
  await openCampaign(campaignId);
});

on('invite-decline', async (el) => {
  await api('POST', `/api/invites/${el.dataset.id}/decline`);
  await loadMe();
  render();
});

on('logout', async () => {
  await api('POST', '/api/auth/logout');
  localStorage.removeItem('dndds-campaign');
  location.reload();
});

// ================================================================= shell

export function shellView() {
  return `
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">${icon('dragon', { size: 26 })}</div>
        <div><div class="brand-name">D&amp;D DS</div><div class="brand-sub">Dripper Studios</div></div>
      </div>
      <nav class="nav">
        ${NAV.map((n) => `
          <button class="${state.page === n.id ? 'active' : ''}" data-act="go" data-page="${n.id}">
            <span class="icon">${icon(n.icon)}</span>${n.label}
          </button>`).join('')}
      </nav>
      <div class="side-foot">
        <div class="side-label">Current campaign</div>
        <button class="side-campaign" data-act="switch-campaign">
          <span class="cmark">${icon('book', { size: 16 })}</span>
          <span class="cname">${esc(state.campaign.name)}</span>
          ${icon('chevron', { size: 15 })}
        </button>
        <div class="online-pill">
          <span class="online-dot"></span>
          <span>${state.online.length} online</span>
          <button class="btn sm" style="margin-left:auto;padding:5px 9px" data-act="theme"
            title="Switch theme">${icon(state.theme === 'dark' ? 'sun' : 'moon', { size: 14 })}</button>
        </div>
      </div>
    </aside>

    <div class="main">
      ${topbarView()}
      <div class="content">${pageView()}</div>
    </div>

    <nav class="mobile-bar">
      ${NAV.map((n) => `
        <button class="${state.page === n.id ? 'active' : ''}" data-act="go" data-page="${n.id}">
          <span class="icon">${icon(n.icon, { size: 20 })}</span>${n.label.split(' ')[0]}
        </button>`).join('')}
    </nav>
  </div>
  ${state.rollRequests.length ? rollRequestView() : ''}
  ${state.turnAlert ? turnAlertView() : ''}
  ${state.modal ? modalView() : ''}`;
}

// ---------------------------------------------------------------- roll requests

/** The prompt a player sees when the DM asks them for a check, save or init. */
function rollRequestView() {
  const req = state.rollRequests[0];
  const ch = myChars()[0] || state.characters.find((c) => c.ownerId === state.user.id) || null;
  const skills = state.srd.skills || {};

  // Which ability governs this roll, and the bonus from the player's sheet.
  let ability = req.ability || 'wis';
  if (req.skill && skills[req.skill]) ability = skills[req.skill];
  const abMod = ch ? mod(ch.stats?.[ability]) : 0;
  let bonus = abMod + (req.proficient ? (ch?.profBonus || 2) : 0);
  if (req.kind === 'init') bonus = ch ? (ch.initBonus ?? abMod) : 0;

  const title = req.kind === 'save'
    ? `${ABILITY_NAME[ability] || 'Ability'} saving throw`
    : req.kind === 'init'
      ? 'Roll for initiative'
      : `${req.skill || ABILITY_NAME[ability] || 'Ability'} check`;

  const label = req.label || title;
  const glossTerm = req.kind === 'save' ? 'Saving Throw' : req.kind === 'init' ? 'Initiative' : 'Ability Check';
  const modeNote = req.mode === 'advantage' ? ' with advantage'
    : req.mode === 'disadvantage' ? ' with disadvantage' : '';

  return `
  <div class="rollreq-wrap">
    <div class="rollreq">
      <div class="rr-flag">${icon('dice', { size: 14 })} The DM wants a roll</div>
      <h2>${esc(title)}${modeNote}</h2>
      ${req.note ? `<p class="rr-note">${esc(req.note)}</p>` : `<p class="rr-note">${state.simple ? 'Tap Roll — the app adds your bonus for you.' : term(glossTerm, 'What is this?')}</p>`}
      ${ch ? `<div class="rr-bonus">Your bonus: <b>${signed(bonus)}</b>${req.secret ? ' · <span class="tiny">secret — only the DM sees it</span>' : ''}</div>`
        : '<p class="rr-note">Make a character first so the app knows your bonus.</p>'}
      <div class="row" style="margin-top:14px">
        <button class="btn primary grow" data-act="answer-roll"
          data-id="${req.id}" data-bonus="${bonus}" data-label="${esc(label)}">
          ${icon('dice', { size: 16 })} Roll${modeNote}</button>
        <button class="btn" data-act="dismiss-roll" data-id="${req.id}">Later</button>
      </div>
    </div>
  </div>`;
}

on('answer-roll', async (el) => {
  const req = state.rollRequests.find((r) => r.id === el.dataset.id);
  if (!req) return;
  state.rollRequests = state.rollRequests.filter((r) => r.id !== req.id);
  render();

  const bonus = Number(el.dataset.bonus) || 0;
  let formula = `1d20${signed(bonus)}`;
  if (req.mode === 'advantage') formula = formula.replace(/^1d20/, '2d20kh1');
  if (req.mode === 'disadvantage') formula = formula.replace(/^1d20/, '2d20kl1');

  const r = await api('POST', `/api/campaigns/${state.campaign.id}/roll-requests/respond`, {
    formula, label: el.dataset.label, dc: req.dc, secret: req.secret,
  });
  const p = r.roll?.pass;
  toast(p === true ? `Success! Rolled ${r.roll.total}`
    : p === false ? `Not enough — rolled ${r.roll.total}`
      : `Rolled ${r.roll.total}`, p === true ? 'ok' : p === false ? 'err' : '');
});

on('dismiss-roll', (el) => {
  state.rollRequests = state.rollRequests.filter((r) => r.id !== el.dataset.id);
  render();
});

// ---------------------------------------------------------------- action economy

const turnKey = (c) => `${state.combat.round}:${state.combat.turnIndex}:${c?.id}`;

/** Reset the tracker when a new turn begins, then read/update it. */
function economyFor(c) {
  const key = turnKey(c);
  if (!state.economy || state.economy.key !== key) {
    state.economy = { key, action: false, bonus: false };
  }
  return state.economy;
}
function useEconomy(kind) {
  if (state.economy) state.economy[kind] = true;
}

/** The three-slot "what have I used this turn" strip. */
function economyStrip(c) {
  const e = economyFor(c);
  const speed = (c.charId && state.characters.find((x) => x.id === c.charId)?.speed) || c.speed || 30;
  const slot = (used, ic, name) => `
    <div class="eco ${used ? 'used' : ''}">
      ${icon(used ? 'check' : ic, { size: 14 })}
      <span>${name}</span>
    </div>`;
  return `<div class="eco-row">
    ${slot(e.action, 'sword', state.simple ? 'Main thing' : 'Action')}
    ${slot(e.bonus, 'zap', state.simple ? 'Quick thing' : 'Bonus')}
    <div class="eco"><span>${icon('arrowRight', { size: 14 })}</span><span>${speed} ft move</span></div>
  </div>`;
}

// ---------------------------------------------------------------- death saves

/** The downed-at-0-HP screen: pips and a death-save button. */
function deathSaveView(c) {
  const ds = c.deathSaves || { s: 0, f: 0 };
  const pip = (on, cls) => `<span class="pip ${cls} ${on ? 'on' : ''}"></span>`;
  const row = (n, cls) => Array.from({ length: 3 }, (_, i) => pip(i < n, cls)).join('');

  if (c.dead) return `<div class="death"><h3 class="death-dead">${esc(c.name)} has died.</h3></div>`;
  if (c.stable) return `<div class="death"><h3 class="death-stable">Stable</h3>
    <p class="turn-hint">${esc(c.name)} is holding on at 0 HP. A little healing brings them back.</p></div>`;

  return `
  <div class="death">
    <p class="turn-hint">${esc(c.name)} is down at 0 HP. Roll a ${term('Death Save', 'death save')} — 10 or higher succeeds.</p>
    <div class="death-pips">
      <div><span class="tiny">Successes</span><div class="pips">${row(ds.s, 'good')}</div></div>
      <div><span class="tiny">Failures</span><div class="pips">${row(ds.f, 'bad')}</div></div>
    </div>
    <button class="btn primary wide" style="margin-top:14px" data-act="death-save" data-id="${c.id}">
      ${icon('dice', { size: 16 })} Roll death save</button>
  </div>`;
}

on('death-save', async (el) => {
  const r = await api('POST', `/api/campaigns/${state.campaign.id}/combat/death-save`, { combatantId: el.dataset.id });
  toast(r.revived ? 'Natural 20 — back up with 1 HP!'
    : r.dead ? 'Three failures — they have died.'
      : r.stable ? 'Stable at 0 HP.'
        : `Death save: ${r.roll}`, r.revived || r.stable ? 'ok' : r.dead ? 'err' : '');
});

/** Full-screen turn takeover: action cards, weapons and spells all in one place. */
function turnAlertView() {
  // Re-read the live combatant so HP / downed state stay fresh across patches.
  const c = state.combat.combatants.find((x) => x.id === state.turnAlert.id) || state.turnAlert;
  const sheet = c.charId ? state.characters.find((x) => x.id === c.charId) : null;
  const playerName = sheet ? nameOf(sheet.ownerId) : c.name;
  const tab = state.turnTab || 'menu';
  const downed = c.downed || c.dead || c.stable;

  // The fly-in plays once per turn. Without this any re-render — a dice roll from
  // someone else, a HP change — would restart it and the popup would flash.
  const settled = state.turnAlertShown ? 'settled' : '';

  return `
  <div class="turn-alert ${settled}">
    <div class="turn-card ${settled}">
      <div class="turn-flash">Round ${state.combat.round}</div>
      <h1>${esc(playerName.toUpperCase())},<br />IT’S YOUR TURN!</h1>

      <div class="row" style="justify-content:center;margin:14px 0 10px">
        ${avatar(c.name, 'xl', portraitOf(c))}
      </div>
      <h2 style="font-size:20px">${esc(c.name)}</h2>
      <p class="muted" style="margin-top:3px">${c.hp}/${c.maxHp} HP · AC ${c.ac}</p>
      ${conditionChips(c, false)}
      ${downed ? '' : economyStrip(c)}

      <div class="turn-body">${downed ? deathSaveView(c) : turnStepView(c, sheet, tab)}</div>

      <div class="row" style="margin-top:16px">
        ${tab === 'menu'
          ? '<button class="btn grow" data-act="dismiss-turn">Close</button>'
          : `<button class="btn grow" data-act="turn-tab" data-tab="menu">
              ${icon('chevron', { size: 15, cls: 'flip' })} Back</button>`}
        <button class="btn primary grow" data-act="end-my-turn">
          End my turn ${icon('arrowRight', { size: 15 })}</button>
      </div>
    </div>
  </div>`;
}

/**
 * One decision at a time: a short menu first, then the choices for whatever you
 * picked. Plain wording throughout — this is the screen people use mid-game.
 */
function turnStepView(c, sheet, step) {
  const foes = livingFoes(c);
  const attacks = sheet?.attacks?.length ? sheet.attacks : (c.attacks || []);
  const knows = (sheet?.spells || []).length;

  if (step === 'attacks') {
    if (!attacks.length) return '<p class="muted">You have no weapons set up yet. Add one on your character page.</p>';
    if (!foes.length) return '<p class="muted">Nothing left standing to attack.</p>';
    return `<p class="turn-hint">Pick your weapon, then who to hit.</p>${attackCards(c, sheet)}`;
  }
  if (step === 'spells') {
    return `<p class="turn-hint">Pick a spell, then who to aim it at.</p>${spellCards(c, sheet)}`;
  }
  if (step === 'other') {
    return `<p class="turn-hint">Other things you can do this turn.</p>${actionCards(c)}`;
  }

  // The menu.
  return `
  <p class="turn-hint">What do you want to do?</p>
  <div class="stack">
    <button class="turn-choice" data-act="turn-tab" data-tab="attacks">
      <span class="tc-ic">${icon('sword', { size: 22 })}</span>
      <span class="tc-text">
        <b>Attack someone</b>
        <i>${attacks.length ? `${attacks.length} weapon${attacks.length === 1 ? '' : 's'} · ${foes.length} enemy${foes.length === 1 ? '' : 'ies'} up` : 'No weapons yet'}</i>
      </span>
      ${icon('chevron', { size: 16, cls: 'flip-r' })}
    </button>

    ${knows ? `
      <button class="turn-choice" data-act="turn-tab" data-tab="spells">
        <span class="tc-ic">${icon('sparkles', { size: 22 })}</span>
        <span class="tc-text">
          <b>Cast a spell</b>
          <i>${knows} spell${knows === 1 ? '' : 's'} you know</i>
        </span>
        ${icon('chevron', { size: 16, cls: 'flip-r' })}
      </button>` : ''}

    <button class="turn-choice" data-act="quick-defend" data-actor="${c.id}">
      <span class="tc-ic">${icon('shield', { size: 22 })}</span>
      <span class="tc-text">
        <b>Defend yourself</b>
        <i>Damage against you is halved until your next turn</i>
      </span>
    </button>

    <button class="turn-choice" data-act="turn-tab" data-tab="other">
      <span class="tc-ic">${icon('backpack', { size: 22 })}</span>
      <span class="tc-text">
        <b>Something else</b>
        <i>Aim, help an ally, dodge, grab or shove something</i>
      </span>
      ${icon('chevron', { size: 16, cls: 'flip-r' })}
    </button>
  </div>`;
}

on('quick-defend', async (el) => {
  await api('POST', `/api/campaigns/${state.campaign.id}/combat/action`, {
    actorId: el.dataset.actor, actionId: 'defend',
  });
  useEconomy('action');
  toast('Defending — incoming damage halved');
});

const livingFoes = (me) => state.combat.combatants.filter((x) => x.id !== me.id && x.hp > 0 && x.type === 'enemy');
const livingAllies = (me) => state.combat.combatants.filter((x) => x.id !== me.id && x.hp > 0 && x.type !== 'enemy');

/** The tactical action cards everyone gets. */
function actionCards(c) {
  // Quick/Power live under "Attack someone", so they are not repeated here.
  const actions = (state.srd.actions || []).filter((a) => !['quick', 'power'].includes(a.id));
  return `<div class="action-grid">
    ${actions.map((a) => `
      <button class="action-card" data-act="pick-action" data-id="${a.id}" data-actor="${c.id}">
        <span class="action-ic">${icon(a.icon, { size: 20 })}</span>
        <span class="action-name">${esc(a.name)}</span>
        <span class="action-blurb">${esc(a.blurb)}</span>
      </button>`).join('')}
  </div>`;
}

/** Weapon attacks — pick the weapon, then the target. */
function attackCards(c, sheet) {
  const attacks = sheet?.attacks?.length ? sheet.attacks : (c.attacks || []);
  const foes = livingFoes(c);
  if (!attacks.length) return '<p class="muted">No attacks on your sheet yet — add one on your character page.</p>';
  if (!foes.length) return '<p class="muted">Nothing left standing to attack.</p>';

  return `<div class="stack">
    ${attacks.slice(0, 5).map((a, ai) => `
      <div class="card" style="padding:10px">
        <div style="font-weight:650;font-size:14px;margin-bottom:7px">
          ${icon('sword', { size: 14 })} ${esc(a.name)}
          <span class="tiny mono">${signed(a.toHit)} · ${esc(a.damage)}</span>
        </div>
        <div class="row">
          ${foes.map((e) => `
            <button class="btn sm" data-act="turn-attack"
              data-attacker="${c.id}" data-target="${e.id}" data-index="${ai}">
              ${esc(e.name)} <span class="tiny">${e.hp}hp</span>
            </button>`).join('')}
        </div>
      </div>`).join('')}
  </div>`;
}

/** Known spells, with slot counts and the right targets for each. */
function spellCards(c, sheet) {
  if (!sheet) return '<p class="muted">Only player characters cast spells here.</p>';
  const known = (sheet.spells || [])
    .map((name) => state.srd.spells.find((s) => s.name === name))
    .filter(Boolean)
    .sort((a, b) => a.level - b.level);

  if (!known.length) {
    return '<p class="muted">No spells known yet — star some on the Spells page.</p>';
  }

  const effects = state.srd.spellEffects || {};
  const slotsLeft = (lvl) => {
    const raw = sheet.slots?.[lvl];
    const s = typeof raw === 'object' ? raw : { max: raw || 0, used: 0 };
    return (s.max || 0) - (s.used || 0);
  };

  return `<div class="stack">
    ${known.map((spell) => {
      const fx = effects[spell.name];
      const left = spell.level === 0 ? Infinity : slotsLeft(spell.level);
      const out = left <= 0;
      // Healing and buffs go on friends; everything else on enemies.
      const helpful = fx && ['heal', 'buff'].includes(fx.kind) && fx.target !== 'enemy';
      const targets = helpful ? [c, ...livingAllies(c)] : livingFoes(c);
      const selfOnly = !fx || fx.kind === 'utility';

      return `
      <div class="card spell-card ${out ? 'spent' : ''}" style="padding:10px">
        <div class="spread">
          <div>
            <span style="font-weight:650;font-size:14px">${esc(spell.name)}</span>
            <span class="tag grey">${spell.level === 0 ? 'Cantrip' : `Lv ${spell.level}`}</span>
            ${fx?.bonusAction ? `<span class="tag term-tag" data-act="glossary" data-term="Bonus Action">Bonus</span>` : ''}
            ${fx?.concentration ? `<span class="tag grey term-tag" data-act="glossary" data-term="Concentration">Conc.</span>` : ''}
          </div>
          <span class="tiny">${spell.level === 0 ? 'at will' : `${Math.max(0, left)} slot${left === 1 ? '' : 's'}`}</span>
        </div>
        <div class="tiny" style="margin:4px 0 7px">
          ${fx ? spellSummary(fx) : 'Roleplay effect — the DM decides what happens.'}
        </div>
        ${out ? '<span class="tiny">No slots left.</span>' : `
          <div class="row">
            ${selfOnly
              ? `<button class="btn sm" data-act="cast" data-caster="${c.id}" data-spell="${esc(spell.name)}">Cast</button>`
              : targets.map((t) => `
                  <button class="btn sm ${helpful ? '' : 'primary'}" data-act="cast"
                    data-caster="${c.id}" data-spell="${esc(spell.name)}" data-target="${t.id}">
                    ${t.id === c.id ? 'Myself' : esc(t.name)}
                    ${t.id !== c.id ? `<span class="tiny">${t.hp}hp</span>` : ''}
                  </button>`).join('') || '<span class="tiny">No valid targets.</span>'}
          </div>`}
      </div>`;
    }).join('')}
  </div>`;
}

/** One-line mechanical summary of a spell effect. */
function spellSummary(fx) {
  switch (fx.kind) {
    case 'attack': return `Spell attack · ${fx.damage} ${fx.type}${fx.rays > 1 ? ` × ${fx.rays}` : ''}`;
    case 'save': return `${fx.save.toUpperCase()} save · ${fx.damage ? `${fx.damage} ${fx.type}` : fx.condition}${fx.half ? ' (half on save)' : ''}`;
    case 'auto': return `Always hits · ${fx.damage} ${fx.type}`;
    case 'heal': return `Heals ${fx.heal}${fx.addMod ? ' + your modifier' : ''}`;
    case 'mark': return `Marks a target · +${fx.bonus} damage on your hits`;
    case 'buff': return `Applies ${fx.condition}`;
    default: return 'The DM decides the effect.';
  }
}

on('turn-tab', (el) => { state.turnTab = el.dataset.tab; render(); });

on('pick-action', async (el) => {
  const action = (state.srd.actions || []).find((a) => a.id === el.dataset.id);
  if (!action) return;

  // Actions that need a target or a description get a small follow-up.
  if (action.needsTarget || action.freeText) {
    state.pendingAction = { actionId: action.id, actorId: el.dataset.actor };
    state.modal = { name: 'action-target' };
    return render();
  }

  await api('POST', `/api/campaigns/${state.campaign.id}/combat/action`, {
    actorId: el.dataset.actor, actionId: action.id,
  });
  useEconomy(action.bonusAction ? 'bonus' : 'action');
  toast(action.name);
});

on('cast', async (el) => {
  const r = await api('POST', `/api/campaigns/${state.campaign.id}/combat/cast`, {
    casterId: el.dataset.caster,
    spellName: el.dataset.spell,
    targetId: el.dataset.target || undefined,
  });
  // Bonus-action spells (like Healing Word) spend the quick slot, not the main one.
  const eff = (state.srd.spellEffects || {})[el.dataset.spell];
  useEconomy(eff?.bonusAction ? 'bonus' : 'action');
  toast(r.damage ? `${el.dataset.spell}: ${r.damage} damage`
    : r.heal ? `${el.dataset.spell}: healed ${r.heal}`
      : `${el.dataset.spell} cast`);
});

on('dismiss-turn', () => { state.turnAlert = null; render(); });

on('turn-attack', async (el) => {
  const r = await api('POST', `/api/campaigns/${state.campaign.id}/combat/attack`, {
    attackerId: el.dataset.attacker,
    targetId: el.dataset.target,
    index: Number(el.dataset.index),
    mode: state.rollMode || 'normal',
  });
  useEconomy('action');
  toast(r.hit ? `${r.crit ? 'CRIT! ' : ''}Hit for ${r.damage}` : `Miss (rolled ${r.attackRoll})`);
});

on('end-my-turn', async () => {
  state.turnAlert = null;
  render();
  await api('POST', `/api/campaigns/${state.campaign.id}/combat/next-turn`);
});

on('go', (el) => { state.page = el.dataset.page; state.filter = ''; render(); });
on('theme', () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('dndds-theme', state.theme);
  render();
});
on('switch-campaign', () => { state.campaign = null; render(); });

// ---------------------------------------------------------------- topbar

function turnOrder() {
  if (state.combat.active && state.combat.combatants.length) {
    return state.combat.combatants.map((c) => ({
      name: c.name,
      sub: c.type === 'enemy' ? 'Enemy' : c.sub || 'Ally',
      image: portraitOf(c),
    }));
  }
  return state.characters.map((c) => ({
    name: c.name, sub: c.class || 'Adventurer', ownerId: c.ownerId, image: c.portrait,
  }));
}

function topbarView() {
  const list = turnOrder();
  const idx = state.combat.active ? state.combat.turnIndex % Math.max(1, list.length) : -1;
  const current = list[idx];

  return `
  <header class="topbar">
    <div class="tt-label">${icon('swords', { size: 18 })} Turn Tracker</div>
    <div class="tt-row">
      ${list.slice(0, 8).map((c, i) => `
        <div class="tt-chip ${i === idx ? 'on' : ''}">
          ${avatar(c.name, c.ownerId && state.online.includes(c.ownerId) ? 'on' : '', c.image || '')}
          <div><div class="nm">${esc(c.name)}</div><div class="sub">${esc(c.sub)}</div></div>
        </div>`).join('')
      || '<span class="muted">No characters yet</span>'}
    </div>
    ${current ? `<div class="tt-turn">${esc(current.name)}’s Turn</div>` : ''}
    ${state.combat.active && isDM()
      ? `<button class="btn primary sm" data-act="next-turn">Next Player ${icon('arrowRight', { size: 14 })}</button>`
      : ''}
  </header>`;
}

// ================================================================= pages

function pageView() {
  switch (state.page) {
    case 'home': return homeView();
    case 'characters': return charactersView();
    case 'inventory': return inventoryView();
    case 'dice': return diceView();
    case 'combat': return combatView();
    case 'spells': return spellsView();
    case 'codex': return codexView();
    case 'notes': return notesView();
    case 'chat': return chatView();
    case 'settings': return settingsView();
    default: return homeView();
  }
}

// ---------------------------------------------------------------- home

/** Castle-and-dragon silhouette behind the hero — drawn, so nothing to load. */
const HERO_ART = `
<svg class="hero-art" viewBox="0 0 900 300" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="hh" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b79bff" stop-opacity=".30"/>
      <stop offset="1" stop-color="#b79bff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <circle cx="690" cy="78" r="34" fill="#f6e6b4" opacity=".16"/>
  <path d="M470 300 L470 190 L530 150 L590 190 L590 300Z" fill="url(#hh)"/>
  <g fill="#160f33" opacity=".55">
    <path d="M600 300 L600 150 L625 132 L650 150 L650 300Z"/>
    <path d="M655 300 L655 108 L682 86 L709 108 L709 300Z"/>
    <path d="M714 300 L714 140 L740 120 L766 140 L766 300Z"/>
    <path d="M771 300 L771 168 L795 150 L819 168 L819 300Z"/>
    <path d="M596 156h227v144H596z"/>
    <path d="M625 126l-4-22 8 6 6-14 6 14 8-6-4 22z"/>
    <path d="M682 80l-4-24 8 7 6-16 6 16 8-7-4 24z"/>
  </g>
  <g fill="#0d0824" opacity=".7">
    <path d="M0 300 L0 232 L60 196 L128 240 L196 202 L268 246 L330 214 L392 252 L392 300Z"/>
    <path d="M820 300 L820 222 L868 192 L900 214 L900 300Z"/>
  </g>
  <g fill="#0b0620" opacity=".8" transform="translate(742 62) scale(.92)">
    <path d="M0 24c14-10 30-14 46-10 8-14 24-22 40-20-10 6-16 16-16 26 14-2 28 4 36 16-12-4-24-2-34 6-8 6-12 16-10 26-10-12-26-18-42-16 6-8 6-18 0-26-6 6-14 8-20 6z"/>
    <path d="M86 20c10-6 22-6 32 0-8 0-16 4-20 12-2-6-6-10-12-12z"/>
  </g>
</svg>`;

function homeView() {
  const recent = state.rolls.slice(0, 5);
  const quick = [
    ['dice', 'dice', 'Dice Roller'],
    ['combat', 'swords', 'Initiative Tracker'],
    ['spells', 'sparkles', 'Spells'],
    ['chat', 'chat', 'Party Chat'],
  ];

  return `
  <div class="hero">
    ${HERO_ART}
    <h1>Welcome back, <span class="gold">${esc(state.user.username)}</span>!</h1>
    <p>${esc(state.campaign.description
      || 'Your epic adventure continues. Gather your party, roll initiative, and make your legend.')}</p>
    <button class="btn" data-act="go" data-page="characters">
      ${icon('users', { size: 16 })} View Party</button>
  </div>

  <div class="grid g3">
    <div class="card">
      <div class="card-head">${icon('notes', { size: 17 })}<h3>Session Info</h3></div>
      <div class="serif" style="font-size:20px;font-weight:700">${esc(state.campaign.name)}</div>
      <p class="muted" style="margin-top:6px">
        ${esc(state.campaign.sessionTitle || 'Session 1')}
      </p>
      <p class="tiny" style="margin-top:10px">
        <span style="color:var(--accent);font-weight:650">DM:</span> ${esc(nameOf(state.campaign.dmId))}
      </p>
      <button class="quick-row" style="margin-top:16px" data-act="go" data-page="notes">
        ${icon('notes', { size: 16 })} View Session Notes</button>
    </div>

    <div class="card">
      <div class="card-head">${icon('users', { size: 17 })}<h3>Party</h3></div>
      ${state.characters.length ? `
        <div class="stack">
          ${state.characters.map((c) => `
            <div class="row" style="flex-wrap:nowrap">
              ${avatar(c.name, state.online.includes(c.ownerId) ? 'on' : '', c.portrait)}
              <div class="grow">
                <div class="spread">
                  <span style="font-size:13.5px;font-weight:650">${esc(c.name)}</span>
                  <span class="tiny mono">${c.hp}/${c.maxHp}</span>
                </div>
                <div class="tiny">Level ${c.level} ${esc(c.class)}</div>
                ${hpBar(c.hp, c.maxHp)}
              </div>
              ${isDM() || c.ownerId === state.user.id ? `
                <button class="btn sm" data-act="modal" data-name="adjust-hp" data-id="${c.id}"
                  title="Adjust HP">${icon('heart', { size: 14 })}</button>` : ''}
            </div>`).join('')}
        </div>
        <button class="quick-row" style="margin-top:16px" data-act="go" data-page="characters">
          ${icon('shield', { size: 16 })} View All Characters</button>`
      : `<div class="empty">
          <div class="big">${icon('users', { size: 40 })}</div>
          <p style="font-weight:650;color:var(--ink)">No characters added yet.</p>
          <p class="tiny">Invite your party and add characters to get started.</p>
          <button class="btn primary" style="margin-top:14px" data-act="go" data-page="characters">
            ${icon('users', { size: 15 })} Manage Party</button>
        </div>`}
    </div>

    <div class="card">
      <div class="card-head">${icon('zap', { size: 17 })}<h3>Quick Access</h3></div>
      <div class="stack">
        ${quick.map(([p, ic, t]) => `
          <button class="quick-row" data-act="go" data-page="${p}">
            ${icon(ic, { size: 17 })} ${t}
            <span class="chev">${icon('chevron', { size: 15 })}</span>
          </button>`).join('')}
      </div>
    </div>
  </div>

  <div class="grid g2" style="margin-top:18px">
    <div class="card">
      <div class="card-head">
        ${icon('dice', { size: 17 })}<h3>Recent Rolls</h3>
        <button class="btn sm" data-act="go" data-page="dice">View All</button>
      </div>
      ${recent.length ? recent.map((r) => `
        <div class="roll-line">
          <div class="roll-total">${r.total}</div>
          <div class="grow">
            <div style="font-size:13.5px;font-weight:600">${esc(nameOf(r.userId))}</div>
            <div class="tiny"><span class="mono">${esc(r.formula)}</span>
              ${r.label ? ` · ${esc(r.label)}` : ''}</div>
          </div>
          <span class="tiny">${ago(r.createdAt)}</span>
        </div>`).join('')
      : `<div class="empty">
          <div class="big">${icon('dice', { size: 40 })}</div>
          <p>No rolls yet — head to the Dice Roller.</p>
        </div>`}
    </div>

    <div class="card">
      <div class="card-head">
        ${icon('book', { size: 17 })}<h3>Campaign Notes</h3>
        <button class="btn sm" data-act="go" data-page="notes">View All Notes</button>
      </div>
      ${state.notes.length ? state.notes.slice(0, 5).map((n) => `
        <div class="roll-line">
          <div class="grow">
            <div style="font-size:13.5px;font-weight:650">${esc(n.title)}</div>
            <div class="tiny">${esc(n.body.slice(0, 70))}${n.body.length > 70 ? '…' : ''}</div>
          </div>
          ${n.dmOnly ? '<span class="tag red">DM</span>' : ''}
        </div>`).join('')
      : `<div class="empty">
          <div class="big">${icon('book', { size: 40 })}</div>
          <p style="font-weight:650;color:var(--ink)">No campaign notes yet.</p>
          <p class="tiny">Capture important moments, plot hooks, and session recaps here.</p>
          <button class="btn primary" style="margin-top:14px" data-act="modal" data-name="new-note">
            ${icon('plus', { size: 15 })} New Note</button>
        </div>`}
    </div>
  </div>`;
}

// ---------------------------------------------------------------- characters

function charactersView() {
  const c = selected();
  return `
  <div class="page-head spread">
    <div><h1>Characters</h1><p>The whole party, live.</p></div>
    <button class="btn primary" data-act="modal" data-name="new-char">+ New Character</button>
  </div>

  <div class="grid g-side">
    <div class="stack">
      ${state.characters.map((ch) => `
        <button class="card row" style="cursor:pointer;text-align:left;flex-wrap:nowrap;border-color:${ch.id === c?.id ? 'var(--accent)' : 'var(--line)'}"
                data-act="select-char" data-id="${ch.id}">
          ${avatar(ch.name, state.online.includes(ch.ownerId) ? 'on' : '', ch.portrait)}
          <div class="grow">
            <div style="font-weight:650;font-size:14px">${esc(ch.name)}</div>
            <div class="tiny">Lv ${ch.level} ${esc(ch.race)} ${esc(ch.class)}</div>
            ${hpBar(ch.hp, ch.maxHp)}
          </div>
        </button>`).join('') || '<p class="muted">No characters yet.</p>'}
    </div>
    ${c ? sheetView(c) : `<div class="card empty"><div class="big">${icon('shield', { size: 34 })}</div>Create a character to get started.</div>`}
  </div>`;
}

function sheetView(c) {
  const mine = c.ownerId === state.user.id || isDM();
  const skills = state.srd.skills || {};
  const totalWeight = c.items.reduce((sum, i) => sum + i.weight * i.qty, 0);

  return `
  <div class="stack">
    <div class="card">
      <div class="row" style="flex-wrap:nowrap;align-items:flex-start">
        <div class="portrait-slot">
          ${avatar(c.name, 'lg', c.portrait)}
          ${mine ? `<button class="portrait-edit" data-act="set-portrait" data-id="${c.id}"
            title="Change picture">${icon('edit', { size: 13 })}</button>` : ''}
        </div>
        <div class="grow">
          <div class="spread">
            <div>
              <h2 style="font-size:21px">${esc(c.name)}</h2>
              <p class="muted">Level ${c.level} ${esc(c.race)} ${esc(c.class)}</p>
              ${isDM() ? `
                <label class="row" style="margin-top:6px">
                  <span class="tiny">Played by</span>
                  <select data-change="assign-char" data-id="${c.id}" style="width:auto">
                    ${state.members.map((m) => `
                      <option value="${m.id}" ${m.id === c.ownerId ? 'selected' : ''}>
                        ${esc(m.username)} (${esc(m.email)})</option>`).join('')}
                  </select>
                </label>`
              : `<p class="tiny">Played by ${esc(nameOf(c.ownerId))}</p>`}
            </div>
            ${mine ? `<div class="row">
              <button class="btn sm" data-act="modal" data-name="edit-char" data-id="${c.id}">Edit</button>
              <button class="btn sm danger" data-act="delete-char" data-id="${c.id}">Delete</button>
            </div>` : ''}
          </div>

          <div class="spread" style="margin-top:12px">
            <strong style="font-size:19px">${c.hp}<span class="muted" style="font-size:14px"> / ${c.maxHp} HP</span>
            ${c.tempHp ? `<span class="tag" style="margin-left:6px">+${c.tempHp} temp</span>` : ''}</strong>
            ${mine ? `<div class="row">
              ${[-5, -1, 1, 5].map((d) => `<button class="btn sm" data-act="hp" data-id="${c.id}" data-d="${d}">${signed(d)}</button>`).join('')}
            </div>` : ''}
          </div>
          ${hpBar(c.hp, c.maxHp)}
        </div>
      </div>
    </div>

    <div class="card">
      <h3>Ability Scores</h3>
      <div class="grid" style="grid-template-columns:repeat(6,1fr);gap:8px">
        ${ABILITIES.map(([k, label]) => `
          <button class="stat-box" data-act="roll-quick" data-formula="d20${signed(mod(c.stats[k]))}" data-label="${label} check">
            <div class="k">${label}</div>
            <div class="v">${signed(mod(c.stats[k]))}</div>
            <div class="m">${c.stats[k] ?? 10}</div>
          </button>`).join('')}
      </div>
      <div class="grid" style="grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px">
        <div class="stat-box"><div class="k">AC</div><div class="v">${c.ac}</div></div>
        <div class="stat-box"><div class="k">Init</div><div class="v">${signed(c.initBonus)}</div></div>
        <div class="stat-box"><div class="k">Speed</div><div class="v">${c.speed}</div><div class="m">ft</div></div>
        <div class="stat-box"><div class="k">Prof</div><div class="v">${signed(c.profBonus)}</div></div>
      </div>
      <p class="tiny" style="margin-top:8px">Tap an ability to roll a d20 check with it.</p>
    </div>

    <div class="card">
      <div class="spread"><h3 style="margin:0">Conditions</h3>
        ${mine ? '<button class="btn sm" data-act="modal" data-name="conditions">Manage</button>' : ''}</div>
      <div class="row" style="margin-top:10px">
        ${c.conditions.length ? c.conditions.map((n) => `<span class="tag red">${esc(n)}</span>`).join('')
          : '<span class="muted">None — feeling great.</span>'}
      </div>
    </div>

    <div class="card">
      <div class="spread"><h3 style="margin:0">Attacks</h3>
        ${mine ? `<button class="btn sm" data-act="modal" data-name="new-attack">
          ${icon('plus', { size: 13 })} Add</button>` : ''}</div>
      <div class="stack" style="margin-top:10px">
        ${(c.attacks || []).length ? c.attacks.map((a, i) => `
          <div class="spread">
            <div class="row">
              ${icon('sword', { size: 15 })}
              <div>
                <div style="font-weight:650;font-size:13.5px">${esc(a.name)}</div>
                <div class="tiny mono">${signed(a.toHit)} to hit · ${esc(a.damage)} ${esc(a.type || '')}</div>
              </div>
            </div>
            <div class="row">
              <button class="btn sm" data-act="roll-quick" data-formula="d20${signed(a.toHit)}"
                data-label="${esc(a.name)} attack">Roll</button>
              ${mine ? `<button class="btn sm danger" data-act="attack-del" data-id="${c.id}" data-i="${i}">
                ${icon('trash', { size: 13 })}</button>` : ''}
            </div>
          </div>`).join('')
        : '<p class="muted">No attacks yet. Add one so this character can fight in combat.</p>'}
      </div>
    </div>

    <div class="card">
      <h3>Spell Slots</h3>
      <div class="row">
        ${Object.entries(c.slots || {}).map(([lvl, s]) => {
          const slot = typeof s === 'object' ? s : { max: s || 0, used: 0 };
          if (!slot.max) return '';
          return `<div class="stat-box" style="min-width:64px">
            <div class="k">Lv ${lvl}</div>
            <div class="v">${slot.max - slot.used}<span class="m">/${slot.max}</span></div>
            ${mine ? `<div class="row" style="justify-content:center;gap:4px;margin-top:4px">
              <button class="btn sm" data-act="slot" data-id="${c.id}" data-lvl="${lvl}" data-d="1">−</button>
              <button class="btn sm" data-act="slot" data-id="${c.id}" data-lvl="${lvl}" data-d="-1">+</button>
            </div>` : ''}
          </div>`;
        }).join('') || '<span class="muted">No slots set. Use Edit to add them.</span>'}
      </div>
      ${mine ? `<button class="btn sm" style="margin-top:12px" data-act="long-rest" data-id="${c.id}">${icon('bed', { size: 15 })} Long Rest (restore all)</button>` : ''}
    </div>

    <div class="card">
      <h3>Skills</h3>
      <div class="grid g2" style="gap:2px">
        ${Object.entries(skills).map(([name, ability]) => {
          const bonus = mod(c.stats[ability]);
          return `<button class="spread" style="background:none;border:0;padding:6px 2px;cursor:pointer;text-align:left"
            data-act="roll-quick" data-formula="d20${signed(bonus)}" data-label="${esc(name)}">
            <span style="font-size:13.5px">${esc(name)} <span class="tiny">${ability.toUpperCase()}</span></span>
            <span class="mono">${signed(bonus)}</span>
          </button>`;
        }).join('')}
      </div>
    </div>

    <div class="card">
      <div class="spread"><h3 style="margin:0">Coins &amp; Load</h3>
        <span class="tiny">${totalWeight.toFixed(1)} lbs carried</span></div>
      <div class="grid" style="grid-template-columns:repeat(5,1fr);gap:8px;margin-top:10px">
        ${COINS.map(([k, label]) => `
          <div class="stat-box"><div class="k">${label.slice(0, 2)}</div>
          <div class="v">${c.coins?.[k] ?? 0}</div></div>`).join('')}
      </div>
      ${mine ? '<button class="btn sm wide" style="margin-top:10px" data-act="modal" data-name="coins">Edit coins</button>' : ''}
    </div>
  </div>`;
}

on('select-char', (el) => { state.selectedCharId = el.dataset.id; render(); });

on('assign-char', async (el) => {
  await api('PATCH', `/api/characters/${el.dataset.id}/owner`, { userId: el.value });
  toast('Character assigned');
});

on('set-portrait', async (el) => {
  const image = await pickImage(420);
  if (!image) return;
  await api('PATCH', `/api/characters/${el.dataset.id}`, { portrait: image });
  toast('Picture updated');
});

on('hp', async (el) => {
  const c = state.characters.find((x) => x.id === el.dataset.id);
  const hp = Math.max(0, Math.min(c.maxHp, c.hp + Number(el.dataset.d)));
  await api('PATCH', `/api/characters/${c.id}`, { hp });
});

on('slot', async (el) => {
  const c = state.characters.find((x) => x.id === el.dataset.id);
  const slots = { ...c.slots };
  const lvl = el.dataset.lvl;
  const s = typeof slots[lvl] === 'object' ? { ...slots[lvl] } : { max: slots[lvl] || 0, used: 0 };
  s.used = Math.max(0, Math.min(s.max, s.used + Number(el.dataset.d)));
  slots[lvl] = s;
  await api('PATCH', `/api/characters/${c.id}`, { slots });
});

on('long-rest', async (el) => {
  const c = state.characters.find((x) => x.id === el.dataset.id);
  const slots = Object.fromEntries(Object.entries(c.slots || {}).map(([lvl, s]) => {
    const max = typeof s === 'object' ? s.max : s || 0;
    return [lvl, { max, used: 0 }];
  }));
  await api('PATCH', `/api/characters/${c.id}`, { slots, hp: c.maxHp, tempHp: 0, conditions: [] });
  toast(`${c.name} takes a long rest.`);
});

on('delete-char', async (el) => {
  if (!confirm('Delete this character for good?')) return;
  await api('DELETE', `/api/characters/${el.dataset.id}`);
  state.selectedCharId = null;
});

// ---------------------------------------------------------------- inventory

function inventoryView() {
  const c = selected();
  if (!c) return `<div class="card empty"><div class="big">${icon('backpack', { size: 34 })}</div>Make a character first.</div>`;
  const mine = c.ownerId === state.user.id || isDM();
  const q = state.filter.toLowerCase();
  const items = c.items.filter((i) => !q || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
  const weight = c.items.reduce((s, i) => s + i.weight * i.qty, 0);

  return `
  <div class="page-head spread">
    <div><h1>Inventory</h1><p>${esc(c.name)} · ${weight.toFixed(1)} lbs</p></div>
    <div class="row">
      <select data-change="pick-char" style="width:auto">
        ${state.characters.map((ch) => `<option value="${ch.id}" ${ch.id === c.id ? 'selected' : ''}>${esc(ch.name)}</option>`).join('')}
      </select>
      ${mine ? '<button class="btn primary" data-act="modal" data-name="new-item">+ Add Item</button>' : ''}
    </div>
  </div>

  <input placeholder="Search inventory…" data-live="filter" data-keep="inv-q" value="${esc(state.filter)}" style="margin-bottom:14px" />

  <div class="card pad0">
    <table class="responsive">
      <thead><tr><th>Item</th><th>Details</th><th>Weight</th><th>Qty</th><th></th></tr></thead>
      <tbody>
        ${items.length ? items.map((i) => `
          <tr>
            <td data-l="Item"><div class="row" style="flex-wrap:nowrap">
              ${itemTile(i.category, 34)}
              <div><strong>${esc(i.name)}</strong><div class="tiny">${esc(i.category)}</div></div>
            </div></td>
            <td data-l="Details" class="muted">${esc(i.details) || '—'}</td>
            <td data-l="Weight">${i.weight} lb</td>
            <td data-l="Qty">${i.qty}</td>
            <td data-l="">${mine ? `<div class="row" style="justify-content:flex-end">
              ${i.effect && i.effect.kind !== null ? `
                <button class="btn sm primary" data-act="use-item" data-id="${i.id}">
                  ${icon(i.effect.kind === 'heal' ? 'potion' : 'sparkles', { size: 13 })} Use</button>` : ''}
              <button class="btn sm" data-act="item-qty" data-id="${i.id}" data-d="-1">−</button>
              <button class="btn sm" data-act="item-qty" data-id="${i.id}" data-d="1">+</button>
              <button class="btn sm danger" data-act="item-del" data-id="${i.id}">${icon('trash', { size: 14 })}</button>
            </div>` : ''}</td>
          </tr>`).join('')
        : '<tr><td colspan="5" class="empty">Nothing here yet.</td></tr>'}
      </tbody>
    </table>
  </div>`;
}

on('filter', (el) => { state.filter = el.value; render(); });
on('pick-char', (el) => { state.selectedCharId = el.value; render(); });

on('item-qty', async (el) => {
  const c = selected();
  const item = c.items.find((i) => i.id === el.dataset.id);
  const qty = item.qty + Number(el.dataset.d);
  if (qty <= 0) return api('DELETE', `/api/items/${item.id}`);
  await api('PATCH', `/api/items/${item.id}`, { qty });
});

on('item-del', async (el) => { await api('DELETE', `/api/items/${el.dataset.id}`); });

on('use-item', async (el) => {
  const c = selected();
  const item = c.items.find((i) => i.id === el.dataset.id);
  await api('POST', `/api/items/${el.dataset.id}/use`);
  toast(`Used ${item?.name || 'item'}`);
});

// ---------------------------------------------------------------- dice

const DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

function diceView() {
  const last = state.rolls[0];
  const adv = state.rollMode || 'normal';
  return `
  <div class="page-head"><h1>Dice Roller</h1><p>Everyone in the campaign sees your rolls instantly.</p></div>

  <div class="grid g2">
    <div class="card" style="text-align:center">
      <div class="die ${state.rolling ? 'rolling' : ''}">${last ? Math.abs(last.total) : '20'}</div>
      ${last ? `
        <p class="muted mono" style="margin-top:14px">${esc(last.detail.replace(/~~/g, ''))}</p>
        <div style="font-size:44px;font-weight:800;line-height:1.1">${last.total}</div>
        <p class="tiny">${esc(nameOf(last.userId))} · ${esc(last.formula)} · ${ago(last.createdAt)}</p>`
      : '<p class="muted" style="margin-top:14px">Roll something.</p>'}
    </div>

    <div class="card">
      <h3>Roll Settings</h3>
      <div class="row" style="margin-bottom:14px">
        ${['advantage', 'normal', 'disadvantage'].map((m) => `
          <button class="pill ${adv === m ? 'on' : ''}" data-act="roll-mode" data-mode="${m}">
            ${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}
      </div>

      <form data-act="do-roll">
        <label class="field"><span>Formula</span>
          <input name="formula" data-keep="df" class="mono" value="${esc(state.formula || 'd20')}" data-live="formula-live" /></label>
        <label class="field"><span>Label (optional)</span>
          <input name="label" data-keep="dl" placeholder="Attack roll, Stealth check…" /></label>
        <button class="btn primary wide" type="submit">${icon('dice', { size: 16 })} Roll Dice</button>
      </form>

      <p class="tiny" style="margin:14px 0 6px">Quick dice</p>
      <div class="row">
        ${DICE.map((d) => `<button class="pill" data-act="set-formula" data-f="${d}">${d}</button>`).join('')}
        <button class="pill" data-act="set-formula" data-f="4d6kh3">4d6 drop low</button>
      </div>
    </div>
  </div>

  <div class="card" style="margin-top:16px">
    <h3>Party Roll Log</h3>
    ${state.rolls.length ? state.rolls.map((r) => `
      <div class="roll-line">
        <div class="roll-total">${r.total}</div>
        <div class="grow">
          <div style="font-size:13.5px"><strong>${esc(nameOf(r.userId))}</strong>${r.label ? ` — ${esc(r.label)}` : ''}
            ${r.pass === true ? '<span class="tag ok-tag">Success</span>' : r.pass === false ? '<span class="tag red">Failed</span>' : ''}
            ${r.secret ? '<span class="tag grey">secret</span>' : ''}
          </div>
          <div class="tiny mono">${esc(r.formula)} → ${esc(r.detail.replace(/~~/g, ''))}</div>
          <details class="why"><summary>Why ${r.total}?</summary>${rollWhy(r)}</details>
        </div>
        <span class="tiny">${ago(r.createdAt)}</span>
      </div>`).join('')
    : '<p class="muted">Nothing rolled yet.</p>'}
  </div>`;
}

on('roll-mode', (el) => { state.rollMode = el.dataset.mode; render(); });
on('set-formula', (el) => { state.formula = el.dataset.f; render(); });
on('formula-live', (el) => { state.formula = el.value; });

/** Advantage/disadvantage rewrites a leading d20 into 2d20kh1 / 2d20kl1. */
function applyMode(formula) {
  const mode = state.rollMode || 'normal';
  if (mode === 'normal') return formula;
  const keep = mode === 'advantage' ? 'kh1' : 'kl1';
  return formula.replace(/^\s*(\d*)d20/i, `2d20${keep}`);
}

async function sendRoll(formula, label) {
  state.rolling = true;
  render();
  try {
    await api('POST', `/api/campaigns/${state.campaign.id}/rolls`, { formula: applyMode(formula), label });
  } finally {
    setTimeout(() => { state.rolling = false; render(); }, 450);
  }
}

on('do-roll', (form) => sendRoll(val(form, 'formula'), val(form, 'label')));
on('roll-quick', (el) => sendRoll(el.dataset.formula, el.dataset.label));

/** Plain-language "here's how that number happened" for a roll-log entry. */
function rollWhy(r) {
  // detail looks like "[7, 3] + 5" or "[12] + 4" — pull the dice and the flat parts apart.
  const clean = String(r.detail || '').replace(/~~[^~]*~~/g, '').replace(/[[\]]/g, '');
  const lines = [];
  const diceMatch = String(r.detail || '').match(/\[([^\]]+)\]/);
  if (diceMatch) {
    const nums = diceMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
    lines.push(nums.length > 1
      ? `Dice rolled: ${nums.join(', ')} (kept for this roll)`
      : `The d20 came up <b>${nums[0]}</b>`);
  }
  const mods = clean.replace(/^[^+-]*/, '').trim();
  if (mods) lines.push(`Your bonus: ${esc(mods)}`);
  lines.push(`Total: <b>${r.total}</b>`);
  if (r.dc != null) {
    lines.push(r.pass
      ? `You needed ${r.dc} — <b>success!</b>`
      : `You needed ${r.dc} — not quite.`);
  }
  return `<div class="why-body">${lines.map((l) => `<div>${l}</div>`).join('')}</div>`;
}

// ---------------------------------------------------------------- combat

function combatView() {
  const { active, round, combatants, turnIndex, name } = state.combat;
  const dm = isDM();

  if (!active && !combatants.length) {
    return `
    <div class="page-head"><h1>Combat</h1><p>Initiative order, HP and conditions — synced to everyone.</p></div>
    <div class="card empty">
      <div class="big">${icon('swords', { size: 34 })}</div>
      <p>No encounter running.</p>
      ${dm ? '<button class="btn primary" style="margin-top:12px" data-act="start-combat">Start an Encounter</button>'
           : '<p class="tiny">Your DM starts the encounter.</p>'}
    </div>`;
  }

  const active_ = combatants[turnIndex % Math.max(1, combatants.length)];
  const waiting = combatants.filter((c) => c.init === null || c.init === undefined).length;
  const attacker = combatants.find((c) => c.id === state.attackFrom);

  return `
  <div class="page-head spread">
    <div><h1>${esc(name)}</h1>
      <p>Round ${round}${active_ ? ` · ${esc(active_.name)}’s turn` : ''}
      ${waiting ? ` · <span class="tag red">${waiting} still to roll initiative</span>` : ''}</p></div>
    ${dm ? `<div class="row">
      <button class="btn" data-act="modal" data-name="add-enemy">${icon('skull', { size: 15 })} Enemy</button>
      <button class="btn" data-act="add-party">${icon('users', { size: 15 })} Party</button>
      <button class="btn" data-act="roll-initiative-all">${icon('dice', { size: 15 })} Roll for all</button>
      <button class="btn" data-act="modal" data-name="request-roll">${icon('target', { size: 15 })} Request roll</button>
      <button class="btn primary" data-act="next-turn">Next Turn ${icon('arrowRight', { size: 15 })}</button>
      <button class="btn danger" data-act="end-combat">End</button>
    </div>` : ''}
  </div>

  ${whoseTurnBanner()}

  ${attacker ? `<div class="card" style="border-color:var(--accent);margin-bottom:14px">
    <div class="spread">
      <div>${icon('target', { size: 16 })} <strong>${esc(attacker.name)}</strong> —
        ${esc(attackNameOf(attacker, state.attackIndex))}: pick a target below.</div>
      <button class="btn sm" data-act="cancel-attack">Cancel</button>
    </div>
  </div>` : ''}

  <div class="grid g2">
    <div class="card">
      <h3>Initiative Order</h3>
      <div>
        ${combatants.length ? combatants.map((c, i) => initRow(c, i, turnIndex, dm)).join('')
        : '<p class="muted">Add combatants to begin.</p>'}
      </div>
    </div>

    <div class="card" style="display:flex;flex-direction:column;max-height:70dvh">
      <h3>Combat Log &amp; Chat</h3>
      ${chatBody()}
    </div>
  </div>`;
}

/** Elapsed time on the current turn, as m:ss. */
function turnClock() {
  const started = state.combat.turnStartedAt;
  // A combat saved before this field existed has 0 here, which would read as
  // decades. Treat anything missing or absurd as a turn that just started.
  const elapsed = started ? Date.now() - started : 0;
  const secs = elapsed > 0 && elapsed < 6 * 60 * 60 * 1000 ? Math.floor(elapsed / 1000) : 0;
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

/**
 * Update just the timer text once a second. Re-rendering the whole app for this
 * would restart every entrance animation — which made the turn popup flicker.
 */
export function tickTurnTimer() {
  const el = document.querySelector('[data-turn-timer]');
  if (!el) return;
  el.textContent = turnClock();
  el.parentElement?.classList.toggle('slow', turnClock() >= '1:30');
}

/**
 * Whose turn it is, from the viewer's point of view: your own call to arms,
 * "waiting for Parker" for everyone else, plus a timer and Skip for the DM.
 */
function whoseTurnBanner() {
  const { active, combatants, turnIndex, turnStartedAt } = state.combat;
  if (!active || !combatants.length) return '';

  const current = combatants[turnIndex % combatants.length];
  if (!current) return '';

  const sheet = current.charId ? state.characters.find((c) => c.id === current.charId) : null;
  const player = sheet ? nameOf(sheet.ownerId) : null;
  const mine = sheet && sheet.ownerId === state.user.id;

  const timer = turnClock();

  return `
  <div class="turn-banner ${mine ? 'mine' : ''}">
    ${avatar(current.name, '', portraitOf(current))}
    <div class="grow">
      <strong>${mine
        ? 'Your turn!'
        : player ? `Waiting for ${esc(player)}…` : `${esc(current.name)}’s turn`}</strong>
      <div class="tiny">${esc(current.name)} · round ${state.combat.round}</div>
    </div>
    ${mine ? `<button class="btn sm primary" data-act="open-turn">Take my turn</button>` : ''}
    ${isDM() ? `
      <span class="turn-timer" title="Time on this turn">
        ${icon('hourglass', { size: 13 })}<b data-turn-timer>${timer}</b></span>
      <button class="btn sm" data-act="skip-turn">Skip</button>` : ''}
  </div>`;
}

on('open-turn', () => {
  const { combatants, turnIndex } = state.combat;
  state.turnAlert = combatants[turnIndex % combatants.length];
  render();
});

on('skip-turn', async () => {
  await api('POST', `/api/campaigns/${state.campaign.id}/combat/next-turn`, { skipped: true });
  toast('Turn skipped');
});

/** Conditions as coloured icon chips, showing how many turns are left. */
function conditionChips(combatant, dm) {
  const list = (combatant.conditions || [])
    .map((c) => (typeof c === 'string' ? { name: c, turns: null } : c))
    .filter((c) => c && c.name);
  if (!list.length) return '';

  const look = state.srd.conditionLook || {};
  return `<div class="row cond-row">
    ${list.map((c) => {
      const l = look[c.name] || { icon: 'zap', tint: '#c0392b' };
      return `<span class="cond" style="--tint:${l.tint}" title="${esc(c.name)}"
        ${dm ? `data-act="cond-remove" data-id="${combatant.id}" data-name="${esc(c.name)}"` : ''}>
        ${icon(l.icon, { size: 12 })}<span>${esc(c.name)}</span>
        ${c.turns ? `<b>${c.turns}</b>` : ''}
      </span>`;
    }).join('')}
    ${dm ? `<button class="cond cond-add" data-act="modal" data-name="add-cond" data-id="${combatant.id}">
      ${icon('plus', { size: 12 })}</button>` : ''}
  </div>`;
}

on('cond-remove', async (el) => {
  await api('POST', `/api/campaigns/${state.campaign.id}/combat/condition`, {
    combatantId: el.dataset.id, name: el.dataset.name, remove: true,
  });
});

/** Name of a combatant's nth attack, preferring their live character sheet. */
function attackNameOf(combatant, index) {
  const sheet = combatant.charId ? state.characters.find((x) => x.id === combatant.charId) : null;
  const attacks = sheet?.attacks?.length ? sheet.attacks : (combatant.attacks || []);
  return attacks[index]?.name || 'attack';
}

/** One row of the initiative order, with whatever controls the viewer may use. */
function initRow(c, i, turnIndex, dm) {
  const sheet = c.charId ? state.characters.find((x) => x.id === c.charId) : null;
  const mine = sheet && sheet.ownerId === state.user.id;
  const canAct = dm || mine;
  const needsInit = c.init === null || c.init === undefined;
  const targeting = state.attackFrom && state.attackFrom !== c.id;
  // Match the server: a character's live sheet wins over the combat snapshot.
  const attacks = sheet?.attacks?.length ? sheet.attacks : (c.attacks || []);
  // A player may only attack on their own turn; the DM acts whenever.
  const myTurn = i === turnIndex % Math.max(1, state.combat.combatants.length);
  const canAttack = dm || (mine && myTurn);

  return `
  <div class="init-row ${i === turnIndex ? 'turn' : ''} ${c.hp <= 0 ? 'dead' : ''} ${targeting ? 'targetable' : ''}"
       ${targeting ? `data-act="pick-target" data-id="${c.id}"` : ''}>
    <span class="n">${i + 1}</span>
    <span class="mono" style="width:30px;font-weight:700">${needsInit ? '—' : c.init}</span>
    ${avatar(c.name, '', portraitOf(c))}
    <div class="grow">
      <div class="spread">
        <span style="font-weight:650;font-size:14px">
          ${c.type === 'enemy' ? icon('skull', { size: 13 }) : icon('shield', { size: 13 })} ${esc(c.name)}
        </span>
        <span class="tiny">${c.hp}/${c.maxHp} HP · AC ${c.ac}</span>
      </div>
      ${hpBar(c.hp, c.maxHp)}
      ${conditionChips(c, dm)}
      ${deathRow(c, canAttack)}

      ${needsInit && canAct ? `
        <button class="btn sm" style="margin-top:6px" data-act="roll-init-one" data-id="${c.id}">
          ${icon('dice', { size: 13 })} Roll initiative</button>` : ''}

      ${!needsInit && canAttack && c.hp > 0 && attacks.length ? `
        <div class="row" style="margin-top:6px">
          ${attacks.map((a, ai) => `
            <button class="btn sm" data-act="begin-attack" data-id="${c.id}" data-index="${ai}">
              ${icon('sword', { size: 13 })} ${esc(a.name)}
              <span class="tiny mono">${signed(a.toHit)} · ${esc(a.damage)}</span>
            </button>`).join('')}
        </div>`
      : (!needsInit && mine && !myTurn && c.hp > 0)
        ? '<div class="tiny" style="margin-top:6px">Wait for your turn to act.</div>' : ''}

      ${dm && c.type === 'enemy' && c.hp <= 0 ? `
        <button class="btn sm ${c.looted ? '' : 'primary'}" style="margin-top:6px"
          data-act="modal" data-name="loot" data-i="${i}" ${c.looted ? 'disabled' : ''}>
          ${icon('coin', { size: 13 })} ${c.looted ? 'Looted' : 'Collect loot'}</button>` : ''}
    </div>

    ${dm ? `<div class="row" style="flex-wrap:nowrap">
      ${[-5, -1, 1, 5].map((d) => `<button class="btn sm" data-act="c-hp" data-i="${i}" data-d="${d}">${signed(d)}</button>`).join('')}
      <button class="btn sm" data-act="modal" data-name="c-cond" data-i="${i}" title="Conditions">${icon('heart', { size: 14 })}</button>
      <button class="btn sm danger" data-act="c-del" data-i="${i}">${icon('x', { size: 14 })}</button>
    </div>` : ''}
  </div>`;
}

/** Death-save pips (and a roll button on the downed hero's own turn). */
function deathRow(c, canAct) {
  if (c.dead) return '<div class="tiny" style="margin-top:6px;color:var(--red);font-weight:700">Dead</div>';
  if (c.stable) return '<div class="tiny" style="margin-top:6px;color:var(--accent);font-weight:700">Stable at 0 HP</div>';
  if (!c.downed) return '';
  const ds = c.deathSaves || { s: 0, f: 0 };
  const pip = (on, cls) => `<span class="pip ${cls} ${on ? 'on' : ''}"></span>`;
  const row = (n, cls) => Array.from({ length: 3 }, (_, i) => pip(i < n, cls)).join('');
  return `
    <div class="death-inline">
      <span class="pips">${row(ds.s, 'good')}</span>
      <span class="pips">${row(ds.f, 'bad')}</span>
      ${canAct ? `<button class="btn sm" data-act="death-save" data-id="${c.id}">${icon('dice', { size: 12 })} Death save</button>` : ''}
    </div>`;
}

const saveCombat = (patch) => api('PUT', `/api/campaigns/${state.campaign.id}/combat`, { ...state.combat, ...patch });

on('start-combat', () => saveCombat({ active: true, round: 1, turnIndex: 0, combatants: [] }));
on('end-combat', () => saveCombat({ active: false, combatants: [], round: 1, turnIndex: 0 }));

on('add-party', () => saveCombat({
  active: true,
  combatants: [
    ...state.combat.combatants,
    ...state.characters
      .filter((c) => !state.combat.combatants.some((x) => x.charId === c.id))
      .map((c) => ({
        id: crypto.randomUUID(), charId: c.id, name: c.name, sub: c.class, type: 'pc',
        init: null, hp: c.hp, maxHp: c.maxHp, ac: c.ac, initBonus: c.initBonus,
        conditions: c.conditions || [], attacks: c.attacks || [],
      })),
  ],
}));

// ---- initiative

on('roll-init-one', async (el) => {
  const { init } = await api('POST', `/api/campaigns/${state.campaign.id}/combat/initiative`,
    { combatantId: el.dataset.id });
  toast(`Initiative: ${init}`);
});

on('roll-initiative-all', () => api('POST', `/api/campaigns/${state.campaign.id}/combat/initiative-all`));

// ---- attacks

on('begin-attack', (el) => {
  state.attackFrom = el.dataset.id;
  state.attackIndex = Number(el.dataset.index);
  render();
});

on('cancel-attack', () => { state.attackFrom = null; render(); });

on('pick-target', async (el) => {
  const attackerId = state.attackFrom;
  const index = state.attackIndex;
  state.attackFrom = null;
  render();

  const r = await api('POST', `/api/campaigns/${state.campaign.id}/combat/attack`, {
    attackerId, targetId: el.dataset.id, index, mode: state.rollMode || 'normal',
  });
  toast(r.hit ? `${r.crit ? 'CRIT! ' : ''}Hit for ${r.damage}` : `Miss (rolled ${r.attackRoll})`);
});

// Goes through the server so the log is written and players can end their own turn.
on('next-turn', () => api('POST', `/api/campaigns/${state.campaign.id}/combat/next-turn`));

on('c-hp', (el) => {
  const combatants = state.combat.combatants.map((c, i) => (
    i === Number(el.dataset.i)
      ? { ...c, hp: Math.max(0, Math.min(c.maxHp, c.hp + Number(el.dataset.d))) }
      : c
  ));
  const changed = combatants[Number(el.dataset.i)];
  if (changed.charId) api('PATCH', `/api/characters/${changed.charId}`, { hp: changed.hp }).catch(() => {});
  return saveCombat({ combatants });
});

on('c-del', (el) => saveCombat({
  combatants: state.combat.combatants.filter((_, i) => i !== Number(el.dataset.i)),
}));

// ---------------------------------------------------------------- spells

function spellsView() {
  const c = selected();
  const q = state.filter.toLowerCase();
  const lvl = state.spellLevel ?? 'all';
  const list = state.srd.spells.filter((s) => {
    if (lvl !== 'all' && s.level !== Number(lvl)) return false;
    if (state.spellsMine && !(c?.spells || []).includes(s.name)) return false;
    return !q || s.name.toLowerCase().includes(q) || s.classes.some((k) => k.toLowerCase().includes(q));
  });

  return `
  <div class="page-head spread">
    <div><h1>Spells</h1><p>5th Edition reference. Tap the star to add a spell to ${esc(c?.name || 'your character')}.</p></div>
  </div>

  <div class="row" style="margin-bottom:12px">
    <input placeholder="Search spells or class…" data-live="filter" data-keep="sp-q" value="${esc(state.filter)}" class="grow" />
    <button class="pill ${state.spellsMine ? 'on' : ''}" data-act="toggle-mine">${icon('star', { size: 14 })} Known</button>
  </div>

  <div class="row" style="margin-bottom:14px">
    ${['all', 0, 1, 2, 3].map((l) => `
      <button class="pill ${String(lvl) === String(l) ? 'on' : ''}" data-act="spell-level" data-l="${l}">
        ${l === 'all' ? 'All' : l === 0 ? 'Cantrips' : `Level ${l}`}</button>`).join('')}
  </div>

  <div class="stack">
    ${list.map((s) => {
      const known = (c?.spells || []).includes(s.name);
      return `
      <div class="card">
        <div class="spread">
          <div class="grow">
            <div class="row">
              <strong style="font-size:15px">${esc(s.name)}</strong>
              <span class="tag">${s.level === 0 ? 'Cantrip' : `Level ${s.level}`}</span>
              <span class="tag grey">${esc(s.school)}</span>
            </div>
            <p class="tiny" style="margin-top:5px">
              ${esc(s.time)} · ${esc(s.range)} · ${esc(s.comp)} · ${esc(s.duration)} · ${esc(s.classes.join(', '))}
            </p>
            <p class="muted" style="margin-top:7px">${esc(s.desc)}</p>
          </div>
          ${c ? `<button class="btn sm ${known ? 'primary' : ''}" data-act="know-spell" data-name="${esc(s.name)}">
            ${icon('star', { size: 15, fill: known })}</button>` : ''}
        </div>
      </div>`;
    }).join('') || '<div class="card empty">No spells match.</div>'}
  </div>`;
}

on('spell-level', (el) => { state.spellLevel = el.dataset.l; render(); });
on('toggle-mine', () => { state.spellsMine = !state.spellsMine; render(); });

on('know-spell', async (el) => {
  const c = selected();
  if (!c) return;
  const name = el.dataset.name;
  const spells = c.spells.includes(name) ? c.spells.filter((s) => s !== name) : [...c.spells, name];
  await api('PATCH', `/api/characters/${c.id}`, { spells });
});

// ---------------------------------------------------------------- codex

const KINDS = [
  { id: 'quest', label: 'Quests', one: 'Quest', icon: 'star', sub: 'Given by', statuses: ['Active', 'Completed', 'Failed', 'Rumour'] },
  { id: 'npc', label: 'NPCs', one: 'NPC', icon: 'users', sub: 'Role or race', statuses: ['Friendly', 'Neutral', 'Hostile', 'Unknown', 'Dead'] },
  { id: 'location', label: 'Locations', one: 'Location', icon: 'home', sub: 'Region', statuses: ['Visited', 'Known', 'Unexplored'] },
  { id: 'shop', label: 'Shops', one: 'Shop', icon: 'backpack', sub: 'Owner', statuses: ['Open', 'Closed'] },
  { id: 'event', label: 'Timeline', one: 'Event', icon: 'hourglass', sub: 'In-world date', statuses: [] },
];

const kindOf = (id) => KINDS.find((k) => k.id === id) || KINDS[0];

function codexView() {
  const tab = state.codexTab || 'quest';
  const kind = kindOf(tab);
  const q = state.filter.toLowerCase();

  let list = state.entries.filter((e) => e.kind === tab);
  if (q) list = list.filter((e) => `${e.title} ${e.subtitle} ${e.body}`.toLowerCase().includes(q));
  if (tab === 'event') list = [...list].reverse(); // timeline reads oldest first

  return `
  <div class="page-head spread">
    <div><h1>Campaign Codex</h1><p>Everything your party knows about the world.</p></div>
    <button class="btn primary" data-act="modal" data-name="new-entry">
      ${icon('plus', { size: 15 })} New ${kind.one}</button>
  </div>

  <div class="row" style="margin-bottom:14px">
    ${KINDS.map((k) => `
      <button class="pill ${tab === k.id ? 'on' : ''}" data-act="codex-tab" data-tab="${k.id}">
        ${icon(k.icon, { size: 14 })} ${k.label}
        <span class="tiny">${state.entries.filter((e) => e.kind === k.id).length}</span>
      </button>`).join('')}
  </div>

  <input placeholder="Search the codex…" data-live="filter" data-keep="cx-q"
         value="${esc(state.filter)}" style="margin-bottom:14px" />

  ${tab === 'event' ? timelineView(list) : `
    <div class="grid g2">
      ${list.map((e) => entryCard(e)).join('')
        || `<div class="card empty"><div class="big">${icon(kind.icon, { size: 34 })}</div>
            Nothing here yet. Add your first ${kind.one.toLowerCase()}.</div>`}
    </div>`}`;
}

function entryCard(e) {
  const mine = e.authorId === state.user.id || isDM();
  return `
  <div class="card entry-card">
    ${e.image ? `<div class="entry-img" style="background-image:url('${esc(e.image)}')"></div>` : ''}
    <div class="grow">
      <div class="spread">
        <div class="row">
          <strong style="font-size:15px">${esc(e.title)}</strong>
          ${e.status ? `<span class="tag ${e.status === 'Hostile' || e.status === 'Failed' || e.status === 'Dead' ? 'red' : ''}">${esc(e.status)}</span>` : ''}
          ${e.dmOnly ? `<span class="tag red">DM</span>` : ''}
        </div>
        ${mine ? `<div class="row" style="flex-wrap:nowrap">
          <button class="btn sm" data-act="modal" data-name="edit-entry" data-id="${e.id}">
            ${icon('edit', { size: 13 })}</button>
          <button class="btn sm danger" data-act="entry-del" data-id="${e.id}">
            ${icon('trash', { size: 13 })}</button>
        </div>` : ''}
      </div>
      ${e.subtitle ? `<div class="tiny" style="margin-top:3px">${esc(e.subtitle)}</div>` : ''}
      ${e.body ? `<p class="muted" style="margin-top:8px;white-space:pre-wrap">${esc(e.body)}</p>` : ''}
      ${e.kind === 'shop' ? shopStock(e) : ''}
    </div>
  </div>`;
}

/** Shop stock with a Buy button per line, priced against the buyer's purse. */
function shopStock(entry) {
  const stock = entry.data.stock || [];
  if (!stock.length) return '<p class="muted" style="margin-top:8px">Nothing in stock.</p>';

  // Players spend from their own character; the DM can buy for anyone.
  const buyers = isDM() ? state.characters : myChars();
  const buyer = buyers.find((c) => c.id === state.shopBuyerId) || buyers[0];

  return `
  <div style="margin-top:12px">
    ${buyers.length > 1 ? `
      <label class="row" style="margin-bottom:8px">
        <span class="tiny">Buying as</span>
        <select data-change="shop-buyer" style="width:auto">
          ${buyers.map((c) => `<option value="${c.id}" ${c.id === buyer?.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </label>` : ''}

    ${buyer ? `<div class="tiny" style="margin-bottom:8px">
      ${icon('coin', { size: 13 })} ${esc(buyer.name)} has ${purseText(buyer.coins)}</div>` : ''}

    <div class="stack">
      ${stock.map((s, i) => `
        <div class="spread shop-line">
          <div class="row" style="flex-wrap:nowrap">
            ${itemTile(s.category || guessCategory(s.name), 34)}
            <div>
              <div style="font-size:13.5px;font-weight:600">${esc(s.name)}</div>
              <div class="tiny mono">${esc(s.price || 'free')}</div>
            </div>
          </div>
          ${buyer
            ? `<button class="btn sm primary" data-act="buy-item"
                data-entry="${entry.id}" data-index="${i}" data-char="${buyer.id}">
                ${icon('plus', { size: 13 })} Buy</button>`
            : '<span class="tiny">No character</span>'}
        </div>`).join('')}
    </div>
  </div>`;
}

/** Best-guess category from an item name, so shop lines get sensible art. */
function guessCategory(name) {
  const n = String(name).toLowerCase();
  if (/potion|elixir|draught|flask/.test(n)) return 'Potion';
  if (/sword|axe|bow|dagger|mace|spear|club|hammer|blade|staff|crossbow/.test(n)) return 'Weapon';
  if (/armor|armour|shield|mail|plate|leather|helm/.test(n)) return 'Armor';
  if (/arrow|bolt|bullet|ammunition/.test(n)) return 'Ammunition';
  if (/scroll|tome|book|map/.test(n)) return 'Other';
  if (/gem|jewel|ring|amulet|relic/.test(n)) return 'Quest Item';
  return 'Gear';
}

const purseText = (coins) => ['pp', 'gp', 'sp', 'cp']
  .filter((k) => coins?.[k]).map((k) => `${coins[k]} ${k}`).join(', ') || '0 gp';

on('shop-buyer', (el) => { state.shopBuyerId = el.value; render(); });

on('buy-item', async (el) => {
  await api('POST', `/api/entries/${el.dataset.entry}/buy`, {
    characterId: el.dataset.char,
    index: Number(el.dataset.index),
    qty: 1,
  });
  toast('Bought — check your inventory');
});

function timelineView(list) {
  if (!list.length) {
    return `<div class="card empty"><div class="big">${icon('hourglass', { size: 34 })}</div>
      No events yet. Log what happened each session.</div>`;
  }
  return `<div class="timeline">
    ${list.map((e) => `
      <div class="tl-item">
        <div class="tl-dot"></div>
        <div class="card grow">
          <div class="spread">
            <div>
              <strong style="font-size:15px">${esc(e.title)}</strong>
              ${e.subtitle ? `<div class="tiny">${esc(e.subtitle)}</div>` : ''}
            </div>
            ${e.authorId === state.user.id || isDM() ? `<div class="row" style="flex-wrap:nowrap">
              <button class="btn sm" data-act="modal" data-name="edit-entry" data-id="${e.id}">
                ${icon('edit', { size: 13 })}</button>
              <button class="btn sm danger" data-act="entry-del" data-id="${e.id}">
                ${icon('trash', { size: 13 })}</button>
            </div>` : ''}
          </div>
          ${e.body ? `<p class="muted" style="margin-top:8px;white-space:pre-wrap">${esc(e.body)}</p>` : ''}
        </div>
      </div>`).join('')}
  </div>`;
}

on('codex-tab', (el) => { state.codexTab = el.dataset.tab; state.filter = ''; render(); });

on('entry-del', async (el) => {
  if (!confirm('Delete this entry?')) return;
  await api('DELETE', `/api/entries/${el.dataset.id}`);
});

function entryModal(e) {
  const kind = kindOf(e ? e.kind : state.codexTab);
  const draftImage = state.draftImage ?? e?.image ?? '';

  return `
  <h2>${e ? 'Edit' : 'New'} ${kind.one}</h2>
  <form data-act="save-entry" data-id="${e?.id || ''}" data-kind="${kind.id}">
    <div class="row" style="align-items:flex-start;flex-wrap:nowrap;margin-bottom:12px">
      <div class="portrait-slot">
        ${draftImage
          ? `<div class="avatar lg" style="background-image:url('${esc(draftImage)}')"></div>`
          : '<div class="avatar lg">?</div>'}
        <button type="button" class="portrait-edit" data-act="pick-entry-image"
          title="Add a picture">${icon('edit', { size: 13 })}</button>
      </div>
      <div class="grow">
        <label class="field"><span>Name</span>
          <input name="title" data-keep="et" value="${esc(e?.title || '')}" required /></label>
        <label class="field"><span>${kind.sub}</span>
          <input name="subtitle" data-keep="es" value="${esc(e?.subtitle || '')}" /></label>
      </div>
    </div>

    ${kind.statuses.length ? `<label class="field"><span>Status</span>
      <select name="status">
        ${['', ...kind.statuses].map((s) => `<option ${s === e?.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}
      </select></label>` : ''}

    <label class="field"><span>Details</span>
      <textarea name="body" data-keep="eb" style="min-height:130px"
        placeholder="${kind.id === 'quest' ? 'What needs doing, and what is the reward?'
          : kind.id === 'npc' ? 'What do they look like? What do they want?'
          : kind.id === 'shop' ? 'What kind of place is it?'
          : 'Anything worth remembering.'}">${esc(e?.body || '')}</textarea></label>

    ${kind.id === 'shop' ? `
      <p class="tiny" style="margin-bottom:6px">STOCK — one per line, as "Item = price"</p>
      <textarea name="stock" style="min-height:90px" placeholder="Potion of Healing = 50 gp
Rope, 50 ft = 1 gp">${esc((e?.data?.stock || []).map((s) => `${s.name} = ${s.price}`).join('\n'))}</textarea>
      <div style="height:12px"></div>` : ''}

    ${isDM() ? `<label class="row" style="margin-bottom:12px">
      <input type="checkbox" name="dmOnly" style="width:auto" ${e?.dmOnly ? 'checked' : ''} />
      <span class="muted">DM only — hide from players</span></label>` : ''}

    <div class="row">
      <button class="btn" type="button" data-act="close-modal">Cancel</button>
      <button class="btn primary grow" type="submit">Save</button>
    </div>
  </form>`;
}

on('pick-entry-image', async () => {
  const image = await pickImage(520);
  if (!image) return;
  state.draftImage = image;
  render();
});

on('save-entry', async (form) => {
  const kind = form.dataset.kind;
  const data = {};

  if (kind === 'shop') {
    // "Potion of Healing = 50 gp" per line
    data.stock = val(form, 'stock').split('\n')
      .map((line) => line.trim()).filter(Boolean)
      .map((line) => {
        const [name, price = ''] = line.split('=');
        return { name: name.trim(), price: price.trim() };
      });
  }

  const payload = {
    kind,
    title: val(form, 'title'),
    subtitle: val(form, 'subtitle'),
    body: val(form, 'body'),
    status: val(form, 'status'),
    data,
    dmOnly: !!form.querySelector('[name="dmOnly"]')?.checked,
  };
  if (state.draftImage !== undefined) payload.image = state.draftImage;

  if (form.dataset.id) await api('PATCH', `/api/entries/${form.dataset.id}`, payload);
  else await api('POST', `/api/campaigns/${state.campaign.id}/entries`, payload);

  state.draftImage = undefined;
  state.modal = null;
  render();
});

// ---------------------------------------------------------------- notes

function notesView() {
  return `
  <div class="page-head spread">
    <div><h1>Notes</h1><p>Shared with the party. DM notes stay hidden from players.</p></div>
    <button class="btn primary" data-act="modal" data-name="new-note">+ New Note</button>
  </div>

  <div class="stack">
    ${state.notes.length ? state.notes.map((n) => `
      <div class="card">
        <div class="spread">
          <div class="row">
            <strong style="font-size:15px">${esc(n.title)}</strong>
            ${n.dmOnly ? '<span class="tag red">DM only</span>' : ''}
          </div>
          <div class="row">
            <span class="tiny">${esc(nameOf(n.authorId))} · ${ago(n.updatedAt)}</span>
            ${n.authorId === state.user.id || isDM() ? `
              <button class="btn sm" data-act="modal" data-name="edit-note" data-id="${n.id}">Edit</button>
              <button class="btn sm danger" data-act="note-del" data-id="${n.id}">${icon('trash', { size: 14 })}</button>` : ''}
          </div>
        </div>
        <p class="muted" style="margin-top:9px;white-space:pre-wrap">${esc(n.body)}</p>
      </div>`).join('')
    : `<div class="card empty"><div class="big">${icon('notes', { size: 34 })}</div>No notes yet.</div>`}
  </div>`;
}

on('note-del', async (el) => {
  if (!confirm('Delete this note?')) return;
  await api('DELETE', `/api/notes/${el.dataset.id}`);
});

// ---------------------------------------------------------------- chat

function chatBody() {
  return `
  <div class="chat-log" id="chatlog">
    ${state.messages.map((m) => `
      <div class="msg">
        <div class="who">${esc(nameOf(m.userId))} <span class="tiny">${ago(m.createdAt)}</span></div>
        <div class="body">${esc(m.body)}</div>
      </div>`).join('') || '<p class="muted">No messages yet.</p>'}
  </div>
  <form data-act="send-msg" class="row" style="margin-top:12px;flex-wrap:nowrap">
    <input name="body" data-keep="chat" class="grow" placeholder="Say something…" autocomplete="off" />
    <button class="btn primary" type="submit">Send</button>
  </form>`;
}

function chatView() {
  return `
  <div class="page-head"><h1>Party Chat</h1><p>Everyone in the campaign, live.</p></div>
  <div class="card" style="display:flex;flex-direction:column;height:70dvh">${chatBody()}</div>`;
}

on('send-msg', async (form) => {
  const body = val(form, 'body').trim();
  if (!body) return;
  form.reset();
  await api('POST', `/api/campaigns/${state.campaign.id}/messages`, { body });
});

// ---------------------------------------------------------------- settings

function settingsView() {
  const dm = isDM();
  return `
  <div class="page-head"><h1>Settings</h1><p>Campaign, party and account.</p></div>

  <div class="grid g2">
    <div class="card">
      <h3>Campaign</h3>
      ${dm ? `
        <form data-act="save-campaign">
          <label class="field"><span>Name</span>
            <input name="name" data-keep="c-n" value="${esc(state.campaign.name)}" /></label>
          <label class="field"><span>Current session</span>
            <input name="sessionTitle" data-keep="c-s" value="${esc(state.campaign.sessionTitle || '')}" placeholder="Session 4: Into the Depths" /></label>
          <label class="field"><span>Description</span>
            <textarea name="description" data-keep="c-d">${esc(state.campaign.description)}</textarea></label>
          <button class="btn primary" type="submit">Save</button>
        </form>`
      : `<p class="muted">${esc(state.campaign.name)}</p>
         <p class="tiny" style="margin-top:6px">Only the DM can change campaign settings.</p>`}
    </div>

    <div class="card">
      <h3>Party (${state.members.length})</h3>
      <div class="stack divide">
        ${state.members.map((m) => `
          <div class="spread">
            <div class="row">
              ${avatar(m.username, state.online.includes(m.id) ? 'on' : '')}
              <div>
                <div style="font-weight:650;font-size:14px">${esc(m.username)}</div>
                <div class="tiny">${esc(m.email)}</div>
              </div>
            </div>
            <div class="row">
              <span class="tag ${m.role === 'dm' ? '' : 'grey'}">${m.role === 'dm' ? 'DM' : 'Player'}</span>
              ${dm && m.id !== state.user.id
                ? `<button class="btn sm danger" data-act="kick" data-id="${m.id}">Remove</button>` : ''}
            </div>
          </div>`).join('')}
      </div>

      ${dm ? `
        <h3 style="margin-top:18px">Invite by email</h3>
        <form data-act="invite" class="row" style="flex-wrap:nowrap">
          <input name="email" data-keep="inv" type="email" class="grow" placeholder="friend@example.com" required />
          <button class="btn primary" type="submit">Invite</button>
        </form>
        <p class="tiny" style="margin-top:8px">
          They sign up with that email and the invite is waiting for them.
        </p>
        ${state.campaignInvites.length ? `<div class="stack divide" style="margin-top:12px">
          ${state.campaignInvites.map((i) => `<div class="spread">
            <span class="muted">${esc(i.email)}</span>
            <span class="tag ${i.status === 'pending' ? '' : 'grey'}">${esc(i.status)}</span>
          </div>`).join('')}</div>` : ''}` : ''}
    </div>
  </div>

  <div class="card" style="margin-top:16px">
    <h3>Play style</h3>
    <div class="spread">
      <div>
        <div style="font-weight:650">${state.simple ? 'Simple mode' : 'Advanced mode'}</div>
        <p class="tiny">${state.simple
          ? 'Plain language and explained outcomes — best for new players.'
          : 'Full D&D terms, formulas and modifiers on show.'}</p>
      </div>
      <button class="btn ${state.simple ? 'primary' : ''}" data-act="toggle-simple">
        ${state.simple ? 'Switch to Advanced' : 'Switch to Simple'}</button>
    </div>
  </div>

  <div class="card" style="margin-top:16px">
    <h3>Account</h3>
    <p class="muted">${esc(state.user.username)} · ${esc(state.user.email)}</p>
    <div class="row" style="margin-top:12px">
      <button class="btn" data-act="theme">${icon(state.theme === 'dark' ? 'sun' : 'moon', { size: 15 })} ${state.theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
      <button class="btn" data-act="switch-campaign">Switch campaign</button>
      <button class="btn danger" data-act="logout">Sign out</button>
    </div>
  </div>`;
}

on('save-campaign', async (form) => {
  await api('PATCH', `/api/campaigns/${state.campaign.id}`, {
    name: val(form, 'name'),
    sessionTitle: val(form, 'sessionTitle'),
    description: val(form, 'description'),
  });
  toast('Campaign saved');
});

on('invite', async (form) => {
  await api('POST', `/api/campaigns/${state.campaign.id}/invites`, { email: val(form, 'email') });
  form.reset();
  toast('Invite sent — they will see it when they sign in.');
});

on('kick', async (el) => {
  if (!confirm('Remove this player from the campaign?')) return;
  await api('DELETE', `/api/campaigns/${state.campaign.id}/members/${el.dataset.id}`);
});

// ================================================================= modals

on('modal', (el) => {
  state.draftImage = undefined; // start each modal with a clean image draft
  state.modal = { name: el.dataset.name, id: el.dataset.id, i: el.dataset.i };
  render();
});

on('close-modal', () => { state.draftImage = undefined; state.modal = null; render(); });

/** Built lazily — only the open modal's body is evaluated. */
function modalBody(name) {
  switch (name) {
    case 'new-char': return charFormModal(null);
    case 'edit-char': return charFormModal(state.characters.find((c) => c.id === state.modal.id));
    case 'new-item': return itemModal();
    case 'new-note': return noteModal(null);
    case 'edit-note': return noteModal(state.notes.find((n) => n.id === state.modal.id));
    case 'add-enemy': return enemyModal();
    case 'new-attack': return attackModal();
    case 'loot': return lootModal();
    case 'adjust-hp': return adjustHpModal();
    case 'add-cond': return addConditionModal();
    case 'action-target': return actionTargetModal();
    case 'new-entry': return entryModal(null);
    case 'edit-entry': return entryModal(state.entries.find((e) => e.id === state.modal.id));
    case 'conditions': return conditionsModal();
    case 'c-cond': return combatantConditionsModal();
    case 'coins': return coinsModal();
    case 'glossary': return glossaryModal();
    case 'request-roll': return requestRollModal();
    default: return '';
  }
}

/** The plain-language definition popup for a single term. */
function glossaryModal() {
  const t = state.modal.term;
  const def = GLOSSARY[t] || 'No plain-language note for this one yet.';
  return `
    <h2>${esc(t)}</h2>
    <p style="font-size:15px;line-height:1.5;color:var(--ink);margin-top:6px">${esc(def)}</p>
    <button class="btn primary wide" style="margin-top:16px" data-act="close-modal">Got it</button>`;
}

/** The DM's "ask the party for a roll" builder. */
function requestRollModal() {
  const players = state.members.filter((m) => m.role !== 'dm');
  const skills = Object.keys(state.srd.skills || {});
  return `
    <h2>Request a roll</h2>
    <form data-act="send-roll-request" class="stack" style="margin-top:8px">
      <label class="field"><span>Who rolls?</span>
        <select name="to">
          <option value="all">Everyone</option>
          ${players.map((m) => `<option value="${m.id}">${esc(m.username)}</option>`).join('')}
        </select></label>

      <label class="field"><span>What kind of roll?</span>
        <select name="check">
          <optgroup label="Skill check">
            ${skills.map((s) => `<option value="skill:${esc(s)}">${esc(s)}</option>`).join('')}
          </optgroup>
          <optgroup label="Saving throw">
            ${ABILITIES.map(([k]) => `<option value="save:${k}">${ABILITY_NAME[k]} save</option>`).join('')}
          </optgroup>
          <optgroup label="Ability check">
            ${ABILITIES.map(([k]) => `<option value="check:${k}">${ABILITY_NAME[k]} check</option>`).join('')}
          </optgroup>
          <optgroup label="Other"><option value="init:">Initiative</option></optgroup>
        </select></label>

      <div class="row">
        <label class="field grow"><span>Difficulty (optional)</span>
          <input name="dc" type="number" min="1" max="40" placeholder="e.g. 15" /></label>
        <label class="field grow"><span>Roll type</span>
          <select name="mode">
            <option value="normal">Normal</option>
            <option value="advantage">Advantage</option>
            <option value="disadvantage">Disadvantage</option>
          </select></label>
      </div>

      <label class="row" style="gap:8px"><input type="checkbox" name="proficient" style="width:auto" /> <span>Add proficiency bonus</span></label>
      <label class="row" style="gap:8px"><input type="checkbox" name="secret" style="width:auto" /> <span>Secret — only I see the result</span></label>

      <div class="row" style="margin-top:6px">
        <button class="btn" type="button" data-act="close-modal">Cancel</button>
        <button class="btn primary grow" type="submit">${icon('dice', { size: 16 })} Send request</button>
      </div>
    </form>`;
}

on('send-roll-request', async (form) => {
  const raw = val(form, 'check') || 'check:wis';
  const [kind, which] = raw.split(':');
  const skills = state.srd.skills || {};
  const body = {
    to: val(form, 'to') || 'all',
    dc: val(form, 'dc'),
    mode: val(form, 'mode'),
    proficient: form.querySelector('[name="proficient"]')?.checked || false,
    secret: form.querySelector('[name="secret"]')?.checked || false,
  };
  if (kind === 'skill') {
    body.kind = 'check'; body.skill = which; body.ability = skills[which] || 'wis';
    body.label = `${which} check`;
  } else if (kind === 'save') {
    body.kind = 'save'; body.ability = which; body.label = `${ABILITY_NAME[which]} save`;
  } else if (kind === 'init') {
    body.kind = 'init'; body.ability = 'dex'; body.label = 'Initiative';
  } else {
    body.kind = 'check'; body.ability = which; body.label = `${ABILITY_NAME[which]} check`;
  }
  await api('POST', `/api/campaigns/${state.campaign.id}/roll-requests`, body);
  state.modal = null;
  render();
  toast(`Roll requested: ${body.label}`);
});

function modalView() {
  // The backdrop closes on its own clicks only — see the 'modal-backdrop'
  // handler. It must NOT stopPropagation, or every button inside would die.
  return `<div class="modal-bg" data-act="modal-backdrop">
    <div class="modal">${modalBody(state.modal.name)}</div>
  </div>`;
}

on('modal-backdrop', (el, ds, e) => {
  if (e.target !== el) return; // a click on the modal's contents, not the backdrop
  state.draftImage = undefined;
  state.modal = null;
  render();
});

function charFormModal(c) {
  const s = c?.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
  const slotMax = (lvl) => {
    const v = c?.slots?.[lvl];
    return typeof v === 'object' ? v.max : v || 0;
  };
  return `
  <h2>${c ? 'Edit' : 'New'} Character</h2>
  <form data-act="save-char" data-id="${c?.id || ''}">
    <label class="field"><span>Name</span><input name="name" data-keep="n" value="${esc(c?.name || '')}" required /></label>
    <div class="row">
      <label class="field grow"><span>Race</span>
        <select name="race">${['', ...state.srd.races].map((r) => `<option ${r === c?.race ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></label>
      <label class="field grow"><span>Class</span>
        <select name="class">${['', ...state.srd.classes].map((k) => `<option ${k === c?.class ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></label>
    </div>
    <div class="row">
      <label class="field grow"><span>Level</span><input name="level" type="number" min="1" max="20" value="${c?.level || 1}" /></label>
      <label class="field grow"><span>Max HP</span><input name="maxHp" type="number" min="1" value="${c?.maxHp || 10}" /></label>
      <label class="field grow"><span>AC</span><input name="ac" type="number" min="1" value="${c?.ac || 10}" /></label>
    </div>
    <div class="row">
      <label class="field grow"><span>Speed</span><input name="speed" type="number" value="${c?.speed ?? 30}" /></label>
      <label class="field grow"><span>Init bonus</span><input name="initBonus" type="number" value="${c?.initBonus ?? 0}" /></label>
      <label class="field grow"><span>Prof bonus</span><input name="profBonus" type="number" value="${c?.profBonus ?? 2}" /></label>
    </div>

    <p class="tiny" style="margin-bottom:6px">ABILITY SCORES</p>
    <div class="row">
      ${ABILITIES.map(([k, label]) => `
        <label class="field" style="flex:1;min-width:60px"><span>${label}</span>
          <input name="${k}" type="number" min="1" max="30" value="${s[k] ?? 10}" /></label>`).join('')}
    </div>

    <p class="tiny" style="margin-bottom:6px">SPELL SLOTS (max per level — leave 0 if you have none)</p>
    <div class="row">
      ${[1, 2, 3, 4, 5].map((l) => `
        <label class="field" style="flex:1;min-width:56px"><span>Lv ${l}</span>
          <input name="slot${l}" type="number" min="0" max="9" value="${slotMax(l)}" /></label>`).join('')}
    </div>

    <div class="row" style="margin-top:6px">
      <button class="btn" type="button" data-act="close-modal">Cancel</button>
      <button class="btn primary grow" type="submit">${c ? 'Save' : 'Create'}</button>
    </div>
  </form>`;
}

on('save-char', async (form) => {
  const stats = Object.fromEntries(ABILITIES.map(([k]) => [k, num(form, k)]));
  const slots = {};
  for (let l = 1; l <= 9; l++) {
    const max = l <= 5 ? num(form, `slot${l}`) : 0;
    const prev = state.characters.find((c) => c.id === form.dataset.id)?.slots?.[l];
    const used = typeof prev === 'object' ? Math.min(prev.used, max) : 0;
    slots[l] = { max, used };
  }
  const payload = {
    name: val(form, 'name'), race: val(form, 'race'), class: val(form, 'class'),
    level: num(form, 'level'), maxHp: num(form, 'maxHp'), ac: num(form, 'ac'),
    speed: num(form, 'speed'), initBonus: num(form, 'initBonus'), profBonus: num(form, 'profBonus'),
    stats, slots,
  };

  if (form.dataset.id) {
    await api('PATCH', `/api/characters/${form.dataset.id}`, payload);
  } else {
    const { id } = await api('POST', `/api/campaigns/${state.campaign.id}/characters`, payload);
    state.selectedCharId = id;
  }
  state.modal = null;
  render();
});

function itemModal() {
  const tab = state.itemTab || 'catalog';
  const q = (state.itemFilter || '').toLowerCase();
  const catalog = (state.srd.itemCatalog || [])
    .filter((i) => !q || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));

  return `
  <h2>Add Item</h2>
  <div class="row" style="margin-bottom:12px">
    <button class="pill ${tab === 'catalog' ? 'on' : ''}" data-act="item-tab" data-tab="catalog">
      ${icon('backpack', { size: 14 })} From the list</button>
    <button class="pill ${tab === 'custom' ? 'on' : ''}" data-act="item-tab" data-tab="custom">
      ${icon('plus', { size: 14 })} Custom</button>
  </div>

  ${tab === 'catalog' ? `
    <input placeholder="Search items…" data-live="item-filter" data-keep="itq"
      value="${esc(state.itemFilter || '')}" style="margin-bottom:10px" />
    <div class="stack" style="max-height:52dvh;overflow-y:auto">
      ${catalog.map((i, idx) => `
        <div class="spread" style="padding:9px 0;border-top:1px solid var(--line-soft)">
          <div class="row" style="flex-wrap:nowrap">
            ${itemTile(i.category, 34)}
            <div>
              <div style="font-size:13.5px;font-weight:650">${esc(i.name)}
                ${i.effect && i.effect.kind !== 'food' && i.effect.kind !== null
                  ? '<span class="tag" style="margin-left:4px">usable</span>' : ''}</div>
              <div class="tiny">${esc(i.details)}${i.price ? ` · ${esc(i.price)}` : ''}</div>
            </div>
          </div>
          <button class="btn sm primary" data-act="add-catalog-item" data-idx="${idx}"
            data-name="${esc(i.name)}">${icon('plus', { size: 13 })}</button>
        </div>`).join('') || '<p class="muted">Nothing matches.</p>'}
    </div>
    <button class="btn wide" style="margin-top:14px" data-act="close-modal">Done</button>`
  : `
    <form data-act="save-item">
      <label class="field"><span>Name</span><input name="name" data-keep="i" placeholder="Longbow" required /></label>
      <label class="field"><span>Category</span>
        <select name="category">${['Weapon', 'Armor', 'Potion', 'Gear', 'Quest Item', 'Ammunition', 'Other']
          .map((k) => `<option>${k}</option>`).join('')}</select></label>
      <label class="field"><span>Details</span><input name="details" placeholder="1d8 piercing, range 150/600 ft" /></label>
      <div class="row">
        <label class="field grow"><span>Weight (lbs)</span><input name="weight" type="number" step="0.1" value="0" /></label>
        <label class="field grow"><span>Quantity</span><input name="qty" type="number" min="1" value="1" /></label>
      </div>
      <div class="row">
        <button class="btn" type="button" data-act="close-modal">Cancel</button>
        <button class="btn primary grow" type="submit">Add</button>
      </div>
    </form>`}`;
}

on('item-tab', (el) => { state.itemTab = el.dataset.tab; render(); });
on('item-filter', (el) => { state.itemFilter = el.value; render(); });

on('add-catalog-item', async (el) => {
  const c = selected();
  const item = (state.srd.itemCatalog || []).find((i) => i.name === el.dataset.name);
  if (!item) return;
  await api('POST', `/api/characters/${c.id}/items`, {
    name: item.name, category: item.category, details: item.details,
    weight: item.weight, qty: 1, effect: item.effect,
  });
  toast(`Added ${item.name}`);
});

on('save-item', async (form) => {
  const c = selected();
  await api('POST', `/api/characters/${c.id}/items`, {
    name: val(form, 'name'), category: val(form, 'category'), details: val(form, 'details'),
    weight: num(form, 'weight'), qty: num(form, 'qty'),
  });
  state.modal = null;
  render();
});

function noteModal(n) {
  return `
  <h2>${n ? 'Edit' : 'New'} Note</h2>
  <form data-act="save-note" data-id="${n?.id || ''}">
    <label class="field"><span>Title</span><input name="title" data-keep="nt" value="${esc(n?.title || '')}" required /></label>
    <label class="field"><span>Body</span><textarea name="body" data-keep="nb" style="min-height:150px">${esc(n?.body || '')}</textarea></label>
    ${isDM() ? `<label class="row" style="margin-bottom:12px">
      <input type="checkbox" name="dmOnly" style="width:auto" ${n?.dmOnly ? 'checked' : ''} />
      <span class="muted">DM only — hide from players</span></label>` : ''}
    <div class="row">
      <button class="btn" type="button" data-act="close-modal">Cancel</button>
      <button class="btn primary grow" type="submit">Save</button>
    </div>
  </form>`;
}

on('save-note', async (form) => {
  const payload = {
    title: val(form, 'title'),
    body: val(form, 'body'),
    dmOnly: !!form.querySelector('[name="dmOnly"]')?.checked,
  };
  if (form.dataset.id) await api('PATCH', `/api/notes/${form.dataset.id}`, payload);
  else await api('POST', `/api/campaigns/${state.campaign.id}/notes`, payload);
  state.modal = null;
  render();
});

/** The enemy library: built-in 5e monsters plus anything the DM saved. */
function enemyModal() {
  const tab = state.enemyTab || 'library';
  const q = (state.enemyFilter || '').toLowerCase();

  const library = [
    ...state.presets.map((p) => ({ ...p, saved: true })),
    ...state.srd.monsters.map((m) => ({ ...m, saved: false })),
  ].filter((m) => !q || m.name.toLowerCase().includes(q));

  return `
  <h2>Add Enemy</h2>
  <div class="row" style="margin-bottom:12px">
    <button class="pill ${tab === 'library' ? 'on' : ''}" data-act="enemy-tab" data-tab="library">
      ${icon('book', { size: 14 })} Library</button>
    <button class="pill ${tab === 'custom' ? 'on' : ''}" data-act="enemy-tab" data-tab="custom">
      ${icon('plus', { size: 14 })} Custom</button>
  </div>

  ${tab === 'library' ? `
    <input placeholder="Search monsters…" data-live="enemy-filter" data-keep="mq"
           value="${esc(state.enemyFilter || '')}" style="margin-bottom:10px" />
    <label class="row" style="margin-bottom:10px">
      <span class="muted" style="font-size:13px">How many of each:</span>
      <input id="mcount" type="number" min="1" max="12" value="1" style="width:70px" />
    </label>
    <div class="stack">
      ${library.map((m) => `
        <div class="card" style="padding:11px">
          <div class="spread">
            <div class="grow">
              <div class="row">
                <strong style="font-size:14px">${esc(m.name)}</strong>
                ${m.cr ? `<span class="tag grey">CR ${esc(m.cr)}</span>` : ''}
                ${m.saved ? '<span class="tag">Saved</span>' : ''}
              </div>
              <div class="tiny" style="margin-top:3px">
                ${m.hp} HP · AC ${m.ac} · init ${signed(m.initBonus)}
                ${(m.attacks || []).length ? ` · ${m.attacks.map((a) => `${esc(a.name)} ${signed(a.toHit)} (${esc(a.damage)})`).join(', ')}` : ''}
              </div>
              ${m.note ? `<div class="tiny" style="margin-top:3px;font-style:italic">${esc(m.note)}</div>` : ''}
            </div>
            <div class="row" style="flex-wrap:nowrap">
              ${m.saved ? `<button class="btn sm danger" data-act="preset-del" data-id="${m.id}"
                title="Remove from library">${icon('trash', { size: 13 })}</button>` : ''}
              <button class="btn sm primary" data-act="add-from-library" data-name="${esc(m.name)}"
                data-saved="${m.saved ? '1' : '0'}">${icon('plus', { size: 13 })} Add</button>
            </div>
          </div>
        </div>`).join('') || '<p class="muted">Nothing matches.</p>'}
    </div>
    <button class="btn wide" style="margin-top:14px" data-act="close-modal">Done</button>`
  : `
    <form data-act="save-enemy">
      <label class="field"><span>Name</span><input name="name" data-keep="en" placeholder="Goblin Boss" required /></label>
      <div class="row">
        <label class="field grow"><span>HP</span><input name="hp" type="number" min="1" value="11" /></label>
        <label class="field grow"><span>AC</span><input name="ac" type="number" min="1" value="13" /></label>
        <label class="field grow"><span>Init bonus</span><input name="initBonus" type="number" value="2" /></label>
        <label class="field grow"><span>How many</span><input name="count" type="number" min="1" max="12" value="1" /></label>
      </div>

      <p class="tiny" style="margin-bottom:6px">ATTACK (so it can actually deal damage)</p>
      <div class="row">
        <label class="field grow"><span>Attack name</span><input name="atkName" placeholder="Scimitar" /></label>
        <label class="field" style="width:90px"><span>To hit</span><input name="atkToHit" type="number" value="4" /></label>
        <label class="field" style="width:110px"><span>Damage</span><input name="atkDamage" placeholder="1d6+2" /></label>
      </div>

      <p class="tiny" style="margin-bottom:4px">DROPS — one per line</p>
      <p class="tiny" style="margin-bottom:6px;color:var(--ink-3)">
        <code>Rusty Sword = 60%</code> · <code>Arrow x2d4 = 100%</code> · <code>gold = 2d6 gp</code><br />
        Leave the % off and it always drops. That is how you make drops random or fixed.
      </p>
      <textarea name="loot" style="min-height:78px" placeholder="Rusty Sword = 60%
gold = 2d6 gp"></textarea>
      <div style="height:12px"></div>

      <label class="row" style="margin-bottom:12px">
        <input type="checkbox" name="save" style="width:auto" checked />
        <span class="muted">Save to the library so you can reuse it</span>
      </label>

      <div class="row">
        <button class="btn" type="button" data-act="close-modal">Cancel</button>
        <button class="btn primary grow" type="submit">Add to combat</button>
      </div>
    </form>`}`;
}

on('enemy-tab', (el) => { state.enemyTab = el.dataset.tab; render(); });
on('enemy-filter', (el) => { state.enemyFilter = el.value; render(); });

/** Turn a library entry into that many combatants. */
function spawn(monster, count) {
  return Array.from({ length: count }, (_, i) => ({
    id: crypto.randomUUID(),
    name: count > 1 ? `${monster.name} ${i + 1}` : monster.name,
    sub: 'Enemy', type: 'enemy', init: null,
    hp: monster.hp, maxHp: monster.hp, ac: monster.ac,
    initBonus: monster.initBonus || 0, conditions: [],
    attacks: monster.attacks || [],
    loot: monster.loot || [], // each copy rolls its own drops
    looted: false,
  }));
}

/**
 * Parse the drops textarea.
 *   "Rusty Sword = 60%"  -> 60% chance of one
 *   "Arrow x2d4"         -> always drops, quantity rolled
 *   "gold = 2d6 gp"      -> coins
 */
function parseLoot(text) {
  return String(text || '').split('\n').map((line) => line.trim()).filter(Boolean)
    .map((line) => {
      const [left, right = ''] = line.split('=');
      const label = left.trim();

      if (/^(gold|coins?|money)$/i.test(label)) {
        const m = right.trim().match(/^([\dd+\-\s]+)\s*(cp|sp|ep|gp|pp)?/i);
        return { kind: 'coins', formula: (m?.[1] || '1d6').trim(), coin: (m?.[2] || 'gp').toLowerCase() };
      }

      const qtyMatch = label.match(/\s+x\s*([\dd+\-]+)$/i);
      const name = qtyMatch ? label.slice(0, qtyMatch.index).trim() : label;
      const chance = right.trim() ? parseInt(right, 10) : 100;

      return {
        name,
        qty: qtyMatch ? qtyMatch[1] : '1',
        chance: Number.isFinite(chance) ? Math.max(1, Math.min(100, chance)) : 100,
        category: guessCategory(name),
      };
    });
}

on('add-from-library', async (el) => {
  const source = el.dataset.saved === '1' ? state.presets : state.srd.monsters;
  const monster = source.find((m) => m.name === el.dataset.name);
  if (!monster) return;

  const count = Math.max(1, Math.min(12, Number(document.getElementById('mcount')?.value) || 1));
  await saveCombat({ active: true, combatants: [...state.combat.combatants, ...spawn(monster, count)] });
  toast(`Added ${count > 1 ? `${count}× ` : ''}${monster.name}`);
});

on('preset-del', async (el) => {
  await api('DELETE', `/api/campaigns/${state.campaign.id}/presets/${el.dataset.id}`);
  state.presets = state.presets.filter((p) => p.id !== el.dataset.id);
  render();
});

on('save-enemy', async (form) => {
  const attacks = val(form, 'atkName').trim()
    ? [{ name: val(form, 'atkName').trim(), toHit: num(form, 'atkToHit'), damage: val(form, 'atkDamage') || '1d6' }]
    : [];
  const monster = {
    name: val(form, 'name'), hp: num(form, 'hp'), ac: num(form, 'ac'),
    initBonus: num(form, 'initBonus'), attacks, loot: parseLoot(val(form, 'loot')),
  };

  if (form.querySelector('[name="save"]')?.checked) {
    await api('POST', `/api/campaigns/${state.campaign.id}/presets`, { ...monster, cr: '', speed: 30, note: '' });
    const { presets } = await api('GET', `/api/campaigns/${state.campaign.id}/presets`);
    state.presets = presets;
  }

  await saveCombat({
    active: true,
    combatants: [...state.combat.combatants, ...spawn(monster, Math.max(1, num(form, 'count')))],
  });
  state.modal = null;
  render();
});

function conditionsModal() {
  const c = selected();
  if (!c) return '<p class="muted">Create a character first.</p>';
  return `
  <h2>Conditions — ${esc(c.name)}</h2>
  <div class="stack">
    ${state.srd.conditions.map((cond) => {
      const has = c.conditions.includes(cond.name);
      return `<button class="card" style="text-align:left;cursor:pointer;border-color:${has ? 'var(--red)' : 'var(--line)'}"
        data-act="toggle-cond" data-name="${esc(cond.name)}">
        <div class="spread"><strong style="font-size:14px">${esc(cond.name)}</strong>${has ? '<span class="tag red">Active</span>' : ''}</div>
        <p class="tiny" style="margin-top:4px">${esc(cond.desc)}</p>
      </button>`;
    }).join('')}
  </div>
  <button class="btn wide" style="margin-top:14px" data-act="close-modal">Done</button>`;
}

on('toggle-cond', async (el) => {
  const c = selected();
  const name = el.dataset.name;
  const conditions = c.conditions.includes(name) ? c.conditions.filter((x) => x !== name) : [...c.conditions, name];
  await api('PATCH', `/api/characters/${c.id}`, { conditions });
});

function combatantConditionsModal() {
  const i = Number(state.modal.i);
  const c = state.combat.combatants[i];
  if (!c) return '<p class="muted">Gone.</p>';
  return `
  <h2>Conditions — ${esc(c.name)}</h2>
  <div class="row">
    ${state.srd.conditions.map((cond) => `
      <button class="pill ${(c.conditions || []).includes(cond.name) ? 'on' : ''}"
        data-act="toggle-c-cond" data-i="${i}" data-name="${esc(cond.name)}">${esc(cond.name)}</button>`).join('')}
  </div>
  <button class="btn wide" style="margin-top:14px" data-act="close-modal">Done</button>`;
}

on('toggle-c-cond', (el) => {
  const i = Number(el.dataset.i);
  const name = el.dataset.name;
  const combatants = state.combat.combatants.map((c, idx) => {
    if (idx !== i) return c;
    const list = c.conditions || [];
    return { ...c, conditions: list.includes(name) ? list.filter((x) => x !== name) : [...list, name] };
  });
  return saveCombat({ combatants });
});

/** DM: hang a condition on someone for N turns. */
function addConditionModal() {
  const target = state.combat.combatants.find((c) => c.id === state.modal.id);
  if (!target) return '<p class="muted">Gone.</p>';
  const look = state.srd.conditionLook || {};

  return `
  <h2>Condition — ${esc(target.name)}</h2>
  <form data-act="save-cond" data-id="${target.id}">
    <p class="tiny" style="margin-bottom:8px">PICK ONE</p>
    <div class="row" style="margin-bottom:14px">
      ${Object.keys(look).map((name, i) => `
        <label class="pill cond-pick">
          <input type="radio" name="cond" value="${esc(name)}" ${i === 0 ? 'checked' : ''} hidden />
          <span style="--tint:${look[name].tint}">${icon(look[name].icon, { size: 13 })} ${esc(name)}</span>
        </label>`).join('')}
    </div>

    <label class="field"><span>How many turns? (blank = until removed)</span>
      <input name="turns" type="number" min="1" max="99" placeholder="e.g. 3" /></label>
    <p class="tiny" style="margin-bottom:14px">
      It counts down at the end of their turn and clears itself.
    </p>

    <div class="row">
      <button class="btn" type="button" data-act="close-modal">Cancel</button>
      <button class="btn primary grow" type="submit">Apply</button>
    </div>
  </form>`;
}

on('save-cond', async (form) => {
  const name = form.querySelector('[name="cond"]:checked')?.value;
  const turns = val(form, 'turns');
  await api('POST', `/api/campaigns/${state.campaign.id}/combat/condition`, {
    combatantId: form.dataset.id, name, turns: turns === '' ? null : Number(turns),
  });
  state.modal = null;
  render();
});

/** Follow-up for actions that need a target or a description. */
function actionTargetModal() {
  const p = state.pendingAction;
  const action = (state.srd.actions || []).find((a) => a.id === p?.actionId);
  const actor = state.combat.combatants.find((c) => c.id === p?.actorId);
  if (!action || !actor) return '<p class="muted">Pick an action again.</p>';

  const targets = action.targetAlly ? livingAllies(actor) : livingFoes(actor);

  return `
  <h2>${esc(action.name)}</h2>
  <p class="muted" style="margin-bottom:14px">${esc(action.blurb)}</p>

  ${action.freeText ? `
    <form data-act="run-action">
      <label class="field"><span>What are you doing?</span>
        <input name="text" data-keep="atx" placeholder="Kick the barrel down the stairs" /></label>
      <div class="row">
        <button class="btn" type="button" data-act="close-modal">Cancel</button>
        <button class="btn primary grow" type="submit">Do it</button>
      </div>
    </form>`
  : `
    <p class="tiny" style="margin-bottom:8px">PICK A TARGET</p>
    <div class="stack">
      ${targets.map((t) => `
        <button class="card spread" style="cursor:pointer;text-align:left"
          data-act="run-action" data-target="${t.id}">
          <div class="row">${avatar(t.name, '', portraitOf(t))}
            <div><div style="font-weight:650;font-size:14px">${esc(t.name)}</div>
            <div class="tiny">${t.hp}/${t.maxHp} HP · AC ${t.ac}</div></div>
          </div>
          ${icon('arrowRight', { size: 16 })}
        </button>`).join('') || '<p class="muted">Nobody to target.</p>'}
    </div>
    <button class="btn wide" style="margin-top:14px" data-act="close-modal">Cancel</button>`}`;
}

on('run-action', async (el) => {
  const p = state.pendingAction;
  if (!p) return;
  const text = el.tagName === 'FORM' ? val(el, 'text') : '';

  state.modal = null;
  state.pendingAction = null;
  render();

  await api('POST', `/api/campaigns/${state.campaign.id}/combat/action`, {
    actorId: p.actorId, actionId: p.actionId, targetId: el.dataset.target, text,
  });
});

/** Quick HP change with a reason, from the home screen — not just combat. */
function adjustHpModal() {
  const c = state.characters.find((x) => x.id === state.modal.id);
  if (!c) return '<p class="muted">Character not found.</p>';
  const reasons = ['Trap', 'Fall', 'Poison', 'Rested', 'Second Wind', 'Environmental', 'Story'];

  return `
  <h2>${esc(c.name)} — ${c.hp}/${c.maxHp} HP</h2>
  <form data-act="save-hp" data-id="${c.id}">
    <div class="row" style="margin-bottom:12px">
      <button type="button" class="btn danger grow" data-act="hp-preset" data-amt="-5">−5</button>
      <button type="button" class="btn danger grow" data-act="hp-preset" data-amt="-1">−1</button>
      <button type="button" class="btn grow" data-act="hp-preset" data-amt="1">+1</button>
      <button type="button" class="btn grow" data-act="hp-preset" data-amt="5">+5</button>
    </div>

    <label class="field">
      <span>Amount (negative hurts, positive heals)</span>
      <input name="delta" id="hpdelta" type="number" data-keep="hpd" placeholder="e.g. -8 or 12" required />
    </label>

    <label class="field"><span>Why? (everyone sees this)</span>
      <input name="reason" data-keep="hpr" list="hpreasons" placeholder="Stepped on a trap" />
      <datalist id="hpreasons">${reasons.map((r) => `<option value="${r}">`).join('')}</datalist>
    </label>

    <div class="row">
      <button class="btn" type="button" data-act="close-modal">Cancel</button>
      <button class="btn primary grow" type="submit">Apply</button>
    </div>
  </form>`;
}

on('hp-preset', (el) => {
  const input = document.getElementById('hpdelta');
  if (input) { input.value = el.dataset.amt; input.focus(); }
});

on('save-hp', async (form) => {
  const delta = num(form, 'delta');
  if (!delta) return toast('Enter an amount', 'err');
  await api('POST', `/api/characters/${form.dataset.id}/hp`, {
    delta, reason: val(form, 'reason'),
  });
  toast(delta > 0 ? `Healed ${delta}` : `Took ${-delta} damage`);
  state.modal = null;
  render();
});

function lootModal() {
  const c = state.combat.combatants[Number(state.modal.i)];
  if (!c) return '<p class="muted">That enemy is gone.</p>';
  const loot = c.loot || [];

  return `
  <h2>Loot — ${esc(c.name)}</h2>
  ${loot.length ? `
    <p class="muted" style="margin-bottom:12px">
      Drop table — anything under 100% is rolled for, so each kill can differ.
    </p>
    <div class="stack" style="margin-bottom:16px">
      ${loot.map((l) => (l.kind === 'coins'
        ? `<div class="spread"><div class="row">${itemTile('Other', 30)}
            <span style="font-size:13.5px">Coins</span></div>
           <span class="tiny mono">${esc(l.formula)} ${esc(l.coin || 'gp')}</span></div>`
        : `<div class="spread"><div class="row">${itemTile(l.category || 'Gear', 30)}
            <span style="font-size:13.5px">${esc(l.name)}${l.qty && l.qty !== '1' ? ` ×${esc(l.qty)}` : ''}</span></div>
           <span class="tag ${(l.chance ?? 100) >= 100 ? '' : 'grey'}">${l.chance ?? 100}%</span></div>`)).join('')}
    </div>`
  : '<p class="muted" style="margin-bottom:16px">No drop table on this one — it will come up empty.</p>'}

  <label class="field"><span>Who picks it up?</span>
    <select name="who" id="lootwho">
      ${state.characters.map((ch) => `<option value="${ch.id}">${esc(ch.name)}</option>`).join('')}
    </select></label>

  <div class="row">
    <button class="btn" type="button" data-act="close-modal">Cancel</button>
    <button class="btn primary grow" data-act="do-loot" data-i="${state.modal.i}">
      ${icon('dice', { size: 15 })} Roll the drops</button>
  </div>`;
}

on('do-loot', async (el) => {
  const c = state.combat.combatants[Number(el.dataset.i)];
  const characterId = document.getElementById('lootwho')?.value;
  if (!characterId) return toast('Make a character first', 'err');

  const r = await api('POST', `/api/campaigns/${state.campaign.id}/combat/loot`, {
    combatantId: c.id, characterId,
  });

  const got = [
    ...r.items.map((i) => `${i.qty > 1 ? `${i.qty}× ` : ''}${i.name}`),
    ...(r.copper ? [`${Math.floor(r.copper / 100)} gp`] : []),
  ];
  toast(got.length ? `Got ${got.join(', ')}` : 'Nothing dropped');
  state.modal = null;
  render();
});

function attackModal() {
  const c = selected();
  if (!c) return '<p class="muted">Create a character first.</p>';
  const strMod = mod(c.stats.str);
  const dexMod = mod(c.stats.dex);

  return `
  <h2>Add Attack — ${esc(c.name)}</h2>
  <p class="muted" style="margin-bottom:14px">
    To hit is usually your ability modifier + proficiency (${signed(c.profBonus)}).
    Melee uses STR ${signed(strMod)}, finesse and ranged use DEX ${signed(dexMod)}.
  </p>
  <form data-act="save-attack">
    <label class="field"><span>Name</span>
      <input name="name" data-keep="an" placeholder="Longbow" required /></label>
    <div class="row">
      <label class="field grow"><span>To hit</span>
        <input name="toHit" type="number" value="${dexMod + c.profBonus}" /></label>
      <label class="field grow"><span>Damage</span>
        <input name="damage" placeholder="1d8+${dexMod}" value="1d8${signed(dexMod)}" /></label>
      <label class="field grow"><span>Type</span>
        <select name="type">${['slashing', 'piercing', 'bludgeoning', 'fire', 'cold', 'radiant', 'necrotic', 'force', 'poison', 'lightning', 'psychic', 'thunder', 'acid']
          .map((t) => `<option>${t}</option>`).join('')}</select></label>
    </div>
    <div class="row">
      <button class="btn" type="button" data-act="close-modal">Cancel</button>
      <button class="btn primary grow" type="submit">Add</button>
    </div>
  </form>`;
}

on('save-attack', async (form) => {
  const c = selected();
  const attacks = [...(c.attacks || []), {
    name: val(form, 'name'), toHit: num(form, 'toHit'),
    damage: val(form, 'damage') || '1d6', type: val(form, 'type'),
  }];
  await api('PATCH', `/api/characters/${c.id}`, { attacks });
  state.modal = null;
  render();
});

on('attack-del', async (el) => {
  const c = state.characters.find((x) => x.id === el.dataset.id);
  await api('PATCH', `/api/characters/${c.id}`, {
    attacks: c.attacks.filter((_, i) => i !== Number(el.dataset.i)),
  });
});

function coinsModal() {
  const c = selected();
  if (!c) return '<p class="muted">Create a character first.</p>';
  return `
  <h2>Coins — ${esc(c.name)}</h2>
  <form data-act="save-coins">
    <div class="row">
      ${COINS.map(([k, label]) => `
        <label class="field" style="flex:1;min-width:70px"><span>${label}</span>
          <input name="${k}" type="number" min="0" value="${c.coins?.[k] ?? 0}" /></label>`).join('')}
    </div>
    <div class="row">
      <button class="btn" type="button" data-act="close-modal">Cancel</button>
      <button class="btn primary grow" type="submit">Save</button>
    </div>
  </form>`;
}

on('save-coins', async (form) => {
  const c = selected();
  const coins = Object.fromEntries(COINS.map(([k]) => [k, num(form, k)]));
  await api('PATCH', `/api/characters/${c.id}`, { coins });
  state.modal = null;
  render();
});

export { autoOpen };
