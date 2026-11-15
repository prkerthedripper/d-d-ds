// Page rendering + user actions.
import {
  state, api, esc, mod, signed, avatar, hpBar, nameOf, ago, isDM, myChars,
  toast, fail, on, render, loadMe, openCampaign, refresh, portraitOf, sfx,
} from './core.js';
import { icon, itemTile } from './icons.js';
import { artPortrait, artSpell, artItem, CHARACTER_ART } from './art.js';
import { pickImage } from './images.js';
import { worldView, focusEntryOnMap } from './world.js';

export const NAV = [
  { id: 'home', label: 'Home', short: 'Campaign', icon: 'home' },
  { id: 'world', label: 'World', short: 'World', icon: 'compass' },
  { id: 'characters', label: 'Characters', short: 'Heroes', icon: 'shield' },
  { id: 'inventory', label: 'Inventory', short: 'Bag', icon: 'backpack' },
  { id: 'library', label: 'Item Library', short: 'Items', icon: 'gem' },
  { id: 'dice', label: 'Dice Roller', short: 'Dice', icon: 'dice' },
  { id: 'combat', label: 'Combat', short: 'Combat', icon: 'swords' },
  { id: 'spells', label: 'Powers', short: 'Powers', icon: 'sparkles' },
  { id: 'codex', label: 'Archive', short: 'Archive', icon: 'book' },
  { id: 'notes', label: 'Notes', short: 'Journal', icon: 'notes' },
  { id: 'chat', label: 'Chat', short: 'Chat', icon: 'chat' },
  { id: 'settings', label: 'Settings', short: 'Settings', icon: 'settings' },
];

const NAV_GROUPS = [
  { label: 'Your table', ids: ['home', 'characters', 'inventory', 'dice', 'combat'] },
  { label: 'The world', ids: ['world', 'spells', 'codex', 'library', 'notes', 'chat'] },
];

const navItem = (id) => NAV.find((n) => n.id === id) || NAV[0];

/** Which illustrated silhouette stands in for a hero who has no portrait yet. */
const SILHOUETTE = {
  fighter: 'plate', paladin: 'plate', barbarian: 'plate', monk: 'plate',
  cleric: 'robe', wizard: 'robe', sorcerer: 'robe', warlock: 'robe', bard: 'robe',
  druid: 'cloak', ranger: 'cloak', rogue: 'cloak',
};
const silOf = (cls) => SILHOUETTE[String(cls || '').trim().toLowerCase()] || 'cloak';

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

on('toggle-sound', () => {
  state.sound = !state.sound;
  localStorage.setItem('dndds-sound', state.sound ? '1' : '0');
  if (state.sound) sfx('chime');
  toast(state.sound ? 'Sound on' : 'Sound off');
  render();
});

const selected = () => state.characters.find((c) => c.id === state.selectedCharId)
  || myChars()[0] || state.characters[0] || null;

const val = (form, name) => form.querySelector(`[name="${name}"]`)?.value ?? '';
const num = (form, name) => Number(val(form, name)) || 0;

/** Small helpers shared by the page views. */
const pct = (a, b) => Math.max(0, Math.min(100, (a / Math.max(1, b)) * 100));
const titleCase = (s) => String(s || '').replace(/(^|\s)\S/g, (c) => c.toUpperCase());

// ================================================================= gate

export function gateView() {
  const login = state.authMode === 'login';
  return `
  <div class="gate">
    <div class="gate-card">
      <div class="brand">
        <div class="brand-mark"><img src="/assets/crystal.svg" alt="" /></div>
        <div>
          <div class="brand-name">D&amp;D DS</div>
          <div class="brand-sub">Dripper Studios</div>
        </div>
      </div>
      <h1>${login ? 'Return to your table' : 'Forge a new hero'}</h1>
      <p class="gate-note">${login
        ? 'Your party is already gathered. Sign in to take your seat.'
        : 'No email verification — just choose a name and a password.'}</p>
      <form data-act="${login ? 'login' : 'register'}">
        ${login ? '' : `<label class="field"><span>Display name</span>
          <input name="username" data-keep="u" placeholder="Lyra" autocomplete="nickname" required /></label>`}
        <label class="field"><span>Email</span>
          <input name="email" data-keep="e" type="email" placeholder="you@example.com" autocomplete="email" required /></label>
        <label class="field"><span>Password</span>
          <input name="password" data-keep="p" type="password" placeholder="At least 6 characters"
            autocomplete="${login ? 'current-password' : 'new-password'}" required /></label>
        <button class="btn primary" type="submit">
          ${icon(login ? 'arrowRight' : 'sparkles', { size: 15 })} ${login ? 'Enter the realm' : 'Begin your legend'}</button>
      </form>
      <p class="gate-foot">
        ${login ? 'New to the table?' : 'Already sworn in?'}
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
  toast(`Welcome back, ${state.user.username}`);
  render();
});

on('register', async (form) => {
  await api('POST', '/api/auth/register', {
    username: val(form, 'username'), email: val(form, 'email'), password: val(form, 'password'),
  });
  await loadMe();
  render();
  toast(`Welcome, ${state.user.username}!`, 'ok');
});

async function autoOpen() {
  const last = localStorage.getItem('dndds-campaign');
  const target = state.campaigns.find((c) => c.id === last) || state.campaigns[0];
  if (target) await openCampaign(target.id);
}

// ================================================================= lobby

export function lobbyView() {
  return `
  <div class="lobby">
    <div class="lobby-inner">
      <div class="lobby-head">
        <div class="eyebrow" style="justify-content:center">Dripper Studios</div>
        <h1>Choose your campaign</h1>
        <p>Welcome, ${esc(state.user.username)}. The table is set.</p>
      </div>

      ${state.invites.length ? `
        <div class="section-line" style="margin-top:0">Invitations</div>
        <div class="stack" style="margin-bottom:22px">
          ${state.invites.map((i) => `
            <div class="slot" style="cursor:default">
              <span class="slot-crest">${icon('scroll', { size: 22 })}</span>
              <div class="grow">
                <div class="slot-name">${esc(i.name)}</div>
                <div class="slot-role">Invited by ${esc(i.dmName)}</div>
              </div>
              <div class="row" style="flex-wrap:nowrap">
                <button class="btn sm" data-act="invite-decline" data-id="${i.id}">Decline</button>
                <button class="btn sm primary" data-act="invite-accept" data-id="${i.id}">Join</button>
              </div>
            </div>`).join('')}
        </div>` : ''}

      <div class="section-line" style="margin-top:0">Your campaigns</div>
      <div style="margin-bottom:22px">
        ${state.campaigns.length ? state.campaigns.map((c) => `
          <button class="slot" data-act="open-campaign" data-id="${c.id}">
            <span class="slot-crest">${icon('book', { size: 24 })}</span>
            <div class="grow">
              <div class="slot-name">${esc(c.name)}</div>
              <div class="slot-role">${c.role === 'dm' ? 'Dungeon Master' : 'Player'}</div>
            </div>
            <span class="enter">Enter ${icon('arrowRight', { size: 13 })}</span>
          </button>`).join('')
        : `<div class="card empty">
            <div class="big">${icon('book', { size: 26 })}</div>
            <p>No campaigns yet.</p>
            <p class="tiny">Ask your DM to invite this email, or start one below.</p>
          </div>`}
      </div>

      <div class="card">
        <div class="card-head">${icon('dragon', { size: 16 })}<h3>Start a new campaign</h3></div>
        <form data-act="create-campaign">
          <label class="field"><span>Campaign name</span>
            <input name="name" data-keep="cn" placeholder="The Lost Mines of Phandelver" required /></label>
          <button class="btn primary" type="submit">
            ${icon('plus', { size: 15 })} Create as Dungeon Master</button>
        </form>
      </div>

      ${state.user.isAdmin || state.user.actingAs ? `
        <p style="text-align:center;margin-top:16px">
          <button class="btn sm ghost" data-act="modal" data-name="accounts">
            ${icon('crown', { size: 13 })} Accounts</button>
        </p>` : ''}

      <p class="gate-foot"><a href="#" data-act="logout">Sign out</a></p>
    </div>
  </div>`;
}

on('open-campaign', (el) => openCampaign(el.dataset.id));

on('create-campaign', async (form) => {
  const { campaign } = await api('POST', '/api/campaigns', { name: val(form, 'name') });
  await loadMe();
  await openCampaign(campaign.id);
  toast('Campaign created — invite your party in Settings.', 'ok');
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

/** Deterministic embers — fixed seeds so a socket patch never reshuffles them. */
const EMBERS = [
  ['4%', '0s', '19s', '.5'], ['11%', '5s', '23s', '.35'], ['19%', '2.5s', '16s', '.55'],
  ['27%', '8s', '26s', '.3'], ['34%', '3.5s', '21s', '.45'], ['43%', '6s', '18s', '.35'],
  ['52%', '1.5s', '24s', '.5'], ['61%', '7s', '20s', '.3'], ['69%', '4.5s', '25s', '.45'],
  ['77%', '9s', '17s', '.35'], ['85%', '2s', '22s', '.5'], ['93%', '5.5s', '19s', '.3'],
];

const embers = () => `<div class="ambient" aria-hidden="true">${EMBERS.map(([left, delay, dur, op]) => (
  `<i style="left:${left};animation-delay:${delay};animation-duration:${dur};opacity:${op}"></i>`
)).join('')}</div>`;

export function shellView() {
  const slot = (n) => `
    <button class="hb-slot ${state.page === n.id ? 'on' : ''}" data-act="go" data-page="${n.id}" title="${n.label}">
      <span class="hb-ic">${icon(n.icon, { size: 19 })}</span>
      <span class="hb-lb">${n.short || n.label}</span>
    </button>`;

  return `
  <div class="app" data-scene="${state.page}">
    ${embers()}
    <div class="scene" aria-hidden="true"></div>

    <header class="gamebar">
      <button class="gb-brand" data-act="go" data-page="home" aria-label="Campaign home">
        <img src="/assets/crystal.svg" alt="" />
        <span class="gb-brand-txt"><b>D&amp;D DS</b><i>Dripper Studios</i></span>
      </button>
      <div class="gb-mid">
        <button class="gb-campaign" data-act="switch-campaign" title="Switch campaign">
          ${icon('book', { size: 14 })}<span>${esc(state.campaign.name)}</span>${icon('chevron', { size: 13 })}
        </button>
        <span class="gb-presence"><span class="online-dot"></span>${state.online.length} at the table</span>
      </div>
      <div class="gb-right">
        <button class="gb-ico" data-act="toggle-sound" title="${state.sound ? 'Mute sound' : 'Enable sound'}" aria-label="Toggle sound">
          ${icon(state.sound ? 'sound' : 'soundOff', { size: 15 })}</button>
        <button class="gb-ico" data-act="theme" title="${state.theme === 'dark' ? 'Parchment daylight' : 'Candlelit night'}" aria-label="Toggle theme">
          ${icon(state.theme === 'dark' ? 'sun' : 'moon', { size: 15 })}</button>
        ${accountChip()}
      </div>
    </header>

    <div class="main ${state.combat.active ? 'in-combat' : ''}">
      ${topbarView()}
      <div class="content">${pageView()}</div>
    </div>

    <nav class="hotbar" aria-label="Sections">
      ${NAV_GROUPS.map((g, gi) => `
        <div class="hb-group">${g.ids.map((id) => slot(navItem(id))).join('')}</div>
        ${gi < NAV_GROUPS.length - 1 ? '<span class="hb-sep"></span>' : ''}`).join('')}
      <span class="hb-sep"></span>
      ${slot(navItem('settings'))}
    </nav>

    <nav class="mobile-bar">
      ${NAV.map((n) => `
        <button class="${state.page === n.id ? 'active' : ''}" data-act="go" data-page="${n.id}">
          <span class="icon">${icon(n.icon, { size: 19 })}</span>${n.label.split(' ')[0]}
        </button>`).join('')}
    </nav>
  </div>
  ${state.rollRequests.length ? rollRequestView() : ''}
  ${state.turnAlert ? turnAlertView() : ''}
  ${state.modal ? modalView() : ''}`;
}

// ---------------------------------------------------------------- roll requests

/** The prompt a player sees when the DM asks them for a check, save or init. */
export function rollRequestView() {
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
      <div class="rr-flag">${icon('dice', { size: 12 })} The DM wants a roll</div>
      <h2>${esc(title)}${modeNote}</h2>
      ${req.note ? `<p class="rr-note">${esc(req.note)}</p>`
        : `<p class="rr-note">${state.simple ? 'Tap Roll — the app adds your bonus for you.' : term(glossTerm, 'What is this?')}</p>`}
      ${ch ? `<div class="rr-bonus">Your bonus: <b>${signed(bonus)}</b>${req.secret ? ' · <span class="tiny">secret — only the DM sees it</span>' : ''}</div>`
        : '<p class="rr-note">Make a character first so the app knows your bonus.</p>'}
      <div class="row" style="margin-top:14px;flex-wrap:nowrap">
        <button class="btn primary grow" data-act="answer-roll"
          data-id="${req.id}" data-bonus="${bonus}" data-label="${esc(label)}">
          ${icon('dice', { size: 15 })} Roll${modeNote}</button>
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
      ${icon(used ? 'check' : ic, { size: 13 })}
      <span>${name}</span>
    </div>`;
  return `<div class="eco-row">
    ${slot(e.action, 'sword', state.simple ? 'Main thing' : 'Action')}
    ${slot(e.bonus, 'zap', state.simple ? 'Quick thing' : 'Bonus')}
    <div class="eco"><span>${icon('arrowRight', { size: 13 })}</span><span>${speed} ft move</span></div>
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
      ${icon('dice', { size: 15 })} Roll death save</button>
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
export function turnAlertView() {
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
      <h1>${esc(playerName.toUpperCase())},<br />IT’S YOUR TURN</h1>

      <div class="row" style="justify-content:center;margin:16px 0 4px">
        ${avatar(c.name, 'xl', portraitOf(c))}
      </div>
      <h2>${esc(c.name)}</h2>
      <p class="tiny" style="margin-top:5px">${c.hp}/${c.maxHp} HP · AC ${c.ac}</p>
      ${conditionChips(c, false)}
      ${downed ? '' : economyStrip(c)}

      <div class="turn-body">${downed ? deathSaveView(c) : turnStepView(c, sheet, tab)}</div>

      <div class="row" style="margin-top:16px;flex-wrap:nowrap">
        ${tab === 'menu'
          ? '<button class="btn grow" data-act="dismiss-turn">Close</button>'
          : `<button class="btn grow" data-act="turn-tab" data-tab="menu">
              ${icon('chevron', { size: 14, cls: 'flip' })} Back</button>`}
        <button class="btn primary grow" data-act="end-my-turn">
          End my turn ${icon('arrowRight', { size: 14 })}</button>
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
      <span class="tc-ic">${icon('sword', { size: 20 })}</span>
      <span class="tc-text">
        <b>Attack someone</b>
        <i>${attacks.length ? `${attacks.length} weapon${attacks.length === 1 ? '' : 's'} · ${foes.length} enemy${foes.length === 1 ? '' : 'ies'} up` : 'No weapons yet'}</i>
      </span>
      ${icon('chevron', { size: 15, cls: 'flip-r' })}
    </button>

    ${knows ? `
      <button class="turn-choice" data-act="turn-tab" data-tab="spells">
        <span class="tc-ic">${icon('sparkles', { size: 20 })}</span>
        <span class="tc-text">
          <b>Cast a spell</b>
          <i>${knows} spell${knows === 1 ? '' : 's'} you know</i>
        </span>
        ${icon('chevron', { size: 15, cls: 'flip-r' })}
      </button>` : ''}

    <button class="turn-choice" data-act="quick-defend" data-actor="${c.id}">
      <span class="tc-ic">${icon('shield', { size: 20 })}</span>
      <span class="tc-text">
        <b>Defend yourself</b>
        <i>Damage against you is halved until your next turn</i>
      </span>
    </button>

    <button class="turn-choice" data-act="turn-tab" data-tab="other">
      <span class="tc-ic">${icon('backpack', { size: 20 })}</span>
      <span class="tc-text">
        <b>Something else</b>
        <i>Aim, help an ally, dodge, grab or shove something</i>
      </span>
      ${icon('chevron', { size: 15, cls: 'flip-r' })}
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
        <span class="action-ic">${icon(a.icon, { size: 18 })}</span>
        <span class="action-name">${esc(a.name)}</span>
        <span class="action-blurb">${esc(a.blurb)}</span>
      </button>`).join('')}
  </div>`;
}

/** How many weapon attacks this combatant has left this turn. */
function attacksLeft(c, sheet) {
  const per = Math.max(1, sheet?.attacksPerTurn || c.attacksPerTurn || 1);
  return per - (c.attacksUsed || 0);
}

/** Weapon attacks — pick the weapon, then the target. */
function attackCards(c, sheet) {
  const attacks = sheet?.attacks?.length ? sheet.attacks : (c.attacks || []);
  const foes = livingFoes(c);
  if (!attacks.length) return '<p class="muted">No attacks on your sheet yet — add one on your character page.</p>';
  if (!foes.length) return '<p class="muted">Nothing left standing to attack.</p>';

  const per = Math.max(1, sheet?.attacksPerTurn || c.attacksPerTurn || 1);
  const left = attacksLeft(c, sheet);
  if (left <= 0) {
    return `<p class="muted">You've used ${per > 1 ? `all ${per} of your attacks` : 'your attack'} this turn. Cast a spell, do something else, or end your turn.</p>`;
  }

  const leftNote = per > 1
    ? `<p class="turn-hint">You can attack <b>${left}</b> more time${left === 1 ? '' : 's'} this turn.</p>`
    : '';

  return `${leftNote}<div class="stack">
    ${attacks.slice(0, 5).map((a, ai) => `
      <div class="card" style="padding:11px">
        <div class="spread" style="margin-bottom:8px">
          <span style="font-weight:600;font-size:13px">${icon('sword', { size: 13 })} ${esc(a.name)}</span>
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
      <div class="card spell-card ${out ? 'spent' : ''}" style="padding:11px">
        <div class="spread">
          <div>
            <span style="font-weight:600;font-size:13px">${esc(spell.name)}</span>
            <span class="tag">${spell.level === 0 ? 'Cantrip' : `Lv ${spell.level}`}</span>
            ${fx?.bonusAction ? `<span class="tag term-tag" data-act="glossary" data-term="Bonus Action">Bonus</span>` : ''}
            ${fx?.concentration ? `<span class="tag grey term-tag" data-act="glossary" data-term="Concentration">Conc.</span>` : ''}
          </div>
          <span class="tiny">${spell.level === 0 ? 'at will' : `${Math.max(0, left)} slot${left === 1 ? '' : 's'}`}</span>
        </div>
        <div class="tiny" style="margin:5px 0 8px">
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

// Primary navigation is now four game screens; legacy page ids are routed into
// the screen where that activity actually lives.
on('go', (el) => {
  const page = el.dataset.page;
  state.filter = '';
  if (page === 'inventory') { state.page = 'party'; state.partyTab = 'inventory'; }
  else if (page === 'spells') { state.page = 'party'; state.partyTab = 'powers'; }
  else if (page === 'library') { state.page = 'party'; state.partyTab = 'inventory'; }
  else if (page === 'characters') { state.page = 'party'; state.partyTab = 'overview'; }
  else if (page === 'dice' || page === 'combat') state.page = 'game';
  else if (page === 'notes') { state.page = 'codex'; state.codexKind = 'journal'; }
  else if (page === 'chat') { state.chatOpen = true; }
  else if (page === 'home') state.page = 'world';
  else state.page = page || 'world';
  render();
});
on('continue-campaign', () => { state.page = 'world'; state.filter = ''; render(); });
on('open-char', (el) => {
  state.selectedCharId = el.dataset.id;
  state.page = 'characters';
  state.filter = '';
  render();
});
on('theme', () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('dndds-theme', state.theme);
  render();
});
on('switch-campaign', () => { state.campaign = null; render(); });

// ---------------------------------------------------------------- the HUD

function turnOrder() {
  if (state.combat.active && state.combat.combatants.length) {
    return state.combat.combatants.map((c) => ({
      name: c.name,
      sub: c.type === 'enemy' ? 'Enemy' : c.sub || 'Ally',
      image: portraitOf(c),
    }));
  }
  return state.characters.map((c) => ({
    name: c.name, sub: c.class || 'Adventurer', ownerId: c.ownerId, image: c.portrait || artPortrait(c),
  }));
}

function topbarView() {
  const list = turnOrder();
  const idx = state.combat.active ? state.combat.turnIndex % Math.max(1, list.length) : -1;
  const current = list[idx];

  return `
  <header class="hud">
    <div class="tt-label">${icon('swords', { size: 17 })} Turn Tracker</div>
    <div class="tt-row">
      ${list.slice(0, 8).map((c, i) => `
        <div class="tt-chip ${i === idx ? 'on' : ''}">
          ${avatar(c.name, c.ownerId && state.online.includes(c.ownerId) ? 'on' : '', c.image || '')}
          <div><div class="nm">${esc(c.name)}</div><div class="sub">${esc(c.sub)}</div></div>
        </div>`).join('')
      || '<span class="muted" style="font-size:12px">No characters at the table yet</span>'}
    </div>
    ${current ? `<div class="tt-turn">${esc(current.name)}’s turn</div>` : ''}
    ${state.combat.active && isDM()
      ? `<button class="btn primary sm" data-act="next-turn">Next ${icon('arrowRight', { size: 13 })}</button>`
      : ''}
  </header>`;
}

/**
 * Top-right identity chip. The site owner gets a list of every account and can
 * open one; while they are in someone else's account it stays visible so they
 * can hop back.
 */
function accountChip() {
  const u = state.user;
  const owner = u.isAdmin || u.actingAs;
  if (!owner) {
    return `<div class="acct-wrap">
      <div class="acct-chip">
        ${avatar(u.username)}
        <span class="acct-text"><span class="acct-name">${esc(u.username)}</span>
        <span class="acct-sub">at the table</span></span>
      </div>
    </div>`;
  }

  return `
  <div class="acct-wrap">
    <button class="acct-chip ${u.actingAs ? 'acting' : ''}" data-act="modal" data-name="accounts">
      ${avatar(u.username)}
      <span class="acct-text">
        <span class="acct-name">${esc(u.username)}</span>
        <span class="acct-sub">${u.actingAs ? 'signed in as' : 'owner'}</span>
      </span>
      ${icon('chevron', { size: 13 })}
    </button>
  </div>`;
}

/** Every account on the site, with a one-tap way into each. */
function accountsModal() {
  const list = state.adminUsers;
  if (!list) { loadAdminUsers(); return '<p class="muted">Loading accounts…</p>'; }

  return `
  <h2>Accounts</h2>
  <p class="muted" style="margin-bottom:14px">
    Everyone who has signed up. Open an account to fix their sheet while they are offline.
  </p>

  ${state.user.actingAs ? `
    <button class="btn primary wide" style="margin-bottom:14px" data-act="admin-return">
      ${icon('refresh', { size: 14 })} Back to my own account</button>` : ''}

  <div class="stack">
    ${list.map((a) => {
      const isMe = a.id === state.user.id;
      return `
      <div class="card spread" style="padding:11px">
        <div class="row" style="flex-wrap:nowrap">
          ${avatar(a.username)}
          <div>
            <div style="font-weight:600;font-size:13.5px">${esc(a.username)}
              ${a.isAdmin ? '<span class="tag gold" style="margin-left:4px">owner</span>' : ''}
              ${isMe ? '<span class="tag" style="margin-left:4px">you</span>' : ''}</div>
            <div class="tiny">${esc(a.email)} · ${a.campaigns} campaign${a.campaigns === 1 ? '' : 's'}</div>
          </div>
        </div>
        ${isMe ? '' : `<button class="btn sm primary" data-act="admin-switch" data-id="${a.id}">
          ${icon('arrowRight', { size: 12 })} Open</button>`}
      </div>`;
    }).join('')}
  </div>

  <button class="btn wide" style="margin-top:14px" data-act="close-modal">Done</button>`;
}

async function loadAdminUsers() {
  try {
    const { users } = await api('GET', '/api/admin/users');
    state.adminUsers = users;
    render();
  } catch (err) { fail(err); }
}

on('admin-switch', async (el) => {
  const { user } = await api('POST', `/api/admin/switch/${el.dataset.id}`);
  state.modal = null;
  state.adminUsers = null;
  toast(`Signed in as ${user.username}`);
  location.reload(); // reload cleanly as the other account
});

on('admin-return', async () => {
  await api('POST', '/api/admin/return');
  state.modal = null;
  state.adminUsers = null;
  location.reload();
});

// ================================================================= pages

function pageView() {
  switch (state.page) {
    case 'home': return homeView();
    case 'world': return worldView();
    case 'characters': return charactersView();
    case 'inventory': return inventoryView();
    case 'library': return libraryView();
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

/** Collect the campaign's story metrics for the hub. */
function campaignProgress() {
  const quests = state.entries.filter((e) => e.kind === 'quest');
  const done = quests.filter((q) => q.status === 'Completed').length;
  const active = quests.filter((q) => q.status === 'Active' || q.status === 'Rumour').length;
  return {
    quests: quests.length,
    done,
    active,
    npcs: state.entries.filter((e) => e.kind === 'npc').length,
    places: state.entries.filter((e) => e.kind === 'location').length,
    events: state.entries.filter((e) => e.kind === 'event').length,
    shops: state.entries.filter((e) => e.kind === 'shop').length,
  };
}

const latestEvent = () => [...state.entries.filter((e) => e.kind === 'event')]
  .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;

function homeView() {
  const p = campaignProgress();
  const recent = state.rolls.slice(0, 5);
  const event = latestEvent();
  const bar = (label, value, max) => `
    <div class="progress-row">
      <div class="progress-head"><b>${label}</b><span class="mono">${value} / ${max}</span></div>
      <div class="bar"><i style="width:${pct(value, max)}%"></i></div>
    </div>`;

  const quick = [
    ['world', 'compass', 'World map', 'The campaign in 3D'],
    ['dice', 'dice', 'Roll dice', 'Fate, decided'],
    ['combat', 'swords', 'Combat', activeCombatSub()],
    ['characters', 'shield', 'Characters', 'The whole party'],
    ['inventory', 'backpack', 'Inventory', 'Bags & coin'],
    ['spells', 'sparkles', 'Powers', 'Known abilities'],
    ['chat', 'chat', 'Party chat', 'Talk to the table'],
  ];

  return `
  <section class="campaign-hero">
    <div class="ch-bg"></div>
    <div class="ch-inner">
      <div class="ch-main">
        <div class="ch-kicker">Campaign Chronicle · ${esc(state.campaign.sessionTitle || 'Session 1')}</div>
        <h1 class="ch-title">${esc(state.campaign.name)}</h1>
        <div class="ch-session">Welcome back, ${esc(state.user.username)}.</div>
        <p class="ch-desc">${esc(state.campaign.description
          || 'Your epic adventure continues. Gather your party, roll initiative, and make your legend.')}</p>
        <div class="ch-meta">
          <span class="ch-meta-item">${icon('crown', { size: 13 })} DM <b>${esc(nameOf(state.campaign.dmId))}</b></span>
          <span class="ch-meta-item">${icon('users', { size: 13 })} <b>${state.characters.length}</b> heroes</span>
          <span class="ch-meta-item">${icon('star', { size: 13 })} <b>${p.active}</b> active quests</span>
          ${state.combat.active ? `<span class="ch-meta-item" style="color:var(--red-2)">${icon('swords', { size: 13 })} Round <b>${state.combat.round}</b> in progress</span>` : ''}
        </div>
        <div class="ch-actions">
          <button class="btn primary lg" data-act="continue-campaign">
            ${icon('compass', { size: 15 })} Continue the campaign</button>
          <button class="btn lg" data-act="go" data-page="dice">${icon('dice', { size: 15 })} Roll the dice</button>
          <button class="btn lg" data-act="go" data-page="characters">${icon('shield', { size: 15 })} The party</button>
        </div>
      </div>
      <div class="ch-side">
        <div class="ch-side-label">At the table</div>
        <div class="ch-party">
          ${state.characters.slice(0, 6).map((c) => `
            <button class="ch-portrait" data-act="open-char" data-id="${c.id}" title="${esc(c.name)}">
              ${avatar(c.name, state.online.includes(c.ownerId) ? 'on' : '', artPortrait(c))}
              <span class="cp-name">${esc(c.name)}</span>
            </button>`).join('')
          || '<span class="tiny">No heroes yet</span>'}
        </div>
      </div>
    </div>
  </section>

  <div class="home-grid">
    <div class="home-col">
      <section class="card">
        <div class="card-head">
          ${icon('users', { size: 16 })}<h3>The party</h3>
          <button class="btn sm" data-act="go" data-page="characters">View all</button>
        </div>
        ${state.characters.length ? `
          <div class="party-grid">
            ${state.characters.map((c) => `
              <button class="hero-card" data-act="open-char" data-id="${c.id}">
                <div class="hc-portrait" style="background-image:url('${esc(artPortrait(c))}')"></div>
                <div class="hc-body">
                  <div class="hc-name">${esc(c.name)}</div>
                  <div class="hc-sub">Lv ${c.level} · ${esc(c.race || '')} ${esc(c.class || '')}</div>
                  ${hpBar(c.hp, c.maxHp)}
                  <div class="hc-foot">
                    <span class="hp">${c.hp}/${c.maxHp} HP</span>
                    ${state.online.includes(c.ownerId)
                      ? '<span class="hc-online">online</span>'
                      : `<span class="tiny">${esc(nameOf(c.ownerId))}</span>`}
                  </div>
                </div>
              </button>`).join('')}
          </div>` : `
          <div class="empty">
            <div class="big">${icon('users', { size: 26 })}</div>
            <p>No heroes have joined the table.</p>
            <p class="tiny">Invite your party, then forge their characters.</p>
            <button class="btn primary" style="margin-top:12px" data-act="go" data-page="characters">
              ${icon('plus', { size: 14 })} Create a character</button>
          </div>`}
      </section>

      <section class="card">
        <div class="card-head">${icon('compass', { size: 16 })}<h3>The adventure so far</h3>
          <button class="btn sm" data-act="continue-campaign">Timeline</button></div>
        <div class="grid g2" style="gap:20px">
          <div>
            ${bar('Quests completed', p.done, Math.max(1, p.quests))}
            ${bar('NPCs recorded', p.npcs, Math.max(6, p.npcs))}
            ${bar('Places discovered', p.places, Math.max(6, p.places))}
            ${bar('Chronicle entries', p.events, Math.max(8, p.events))}
          </div>
          <div>
            <div class="eyebrow" style="margin-bottom:9px">Latest in the chronicle</div>
            ${event ? `
              <div class="entry-title" style="font-size:14px">${esc(event.title)}</div>
              <div class="tiny" style="margin-top:2px">${esc(event.subtitle || 'The story continues')}</div>
              <p class="entry-text" style="font-size:15px;margin-top:8px;max-height:7.4em;overflow:hidden">
                ${esc((event.body || '').slice(0, 240))}${(event.body || '').length > 240 ? '…' : ''}</p>`
            : `<p class="muted">Nothing written yet. The first entry is yours to make.</p>
               <button class="btn sm" style="margin-top:10px" data-act="modal" data-name="new-entry">
                 ${icon('plus', { size: 13 })} New entry</button>`}
            ${state.campaign.sessionTitle ? `
              <div class="section-line" style="margin:18px 0 10px">Tonight</div>
              <div class="row" style="flex-wrap:nowrap">
                ${icon('scroll', { size: 16 })}
                <div class="grow">
                  <div style="font-size:13px;font-weight:600">${esc(state.campaign.sessionTitle)}</div>
                  <div class="tiny">${state.notes.length} session note${state.notes.length === 1 ? '' : 's'} · ${p.shops} shop${p.shops === 1 ? '' : 's'} open</div>
                </div>
                <button class="btn sm" data-act="go" data-page="notes">Open</button>
              </div>` : ''}
          </div>
        </div>
      </section>
    </div>

    <aside class="home-col">
      <section class="card">
        <div class="card-head">${icon('zap', { size: 16 })}<h3>Quick actions</h3></div>
        <div class="quick-grid">
          ${quick.map(([page, ic, label, hint]) => `
            <button class="quick-tile" data-act="go" data-page="${page}">
              <span class="qt-ic">${icon(ic, { size: 16 })}</span>
              <span class="qt-label">${label}</span>
              <span class="qt-hint">${hint}</span>
            </button>`).join('')}
        </div>
      </section>

      <section class="card">
        <div class="card-head">${icon('dice', { size: 16 })}<h3>Fortunes</h3>
          <button class="btn sm" data-act="go" data-page="dice">Roll log</button></div>
        ${recent.length ? `<div class="ledger">
          ${recent.map((r) => `
            <div class="ledger-row">
              <div class="roll-total">${r.total}</div>
              <div class="grow" style="min-width:0">
                <div style="font-size:12.5px;font-weight:600">${esc(nameOf(r.userId))}</div>
                <div class="tiny mono" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  ${esc(r.formula)}${r.label ? ` · ${esc(r.label)}` : ''}</div>
              </div>
              <span class="tiny" style="white-space:nowrap">${ago(r.createdAt)}</span>
            </div>`).join('')}
        </div>` : `
          <div class="empty" style="padding:22px 10px">
            <div class="big" style="width:48px;height:48px">${icon('dice', { size: 20 })}</div>
            <p>The bones are still.</p>
            <p class="tiny">Roll something and it will appear here.</p>
          </div>`}
      </section>

      <section class="card">
        <div class="card-head">${icon('notes', { size: 16 })}<h3>Session notes</h3>
          <button class="btn sm" data-act="go" data-page="notes">All</button></div>
        ${state.notes.length ? `<div class="ledger">
          ${state.notes.slice(0, 4).map((n) => `
            <div class="ledger-row" style="align-items:flex-start">
              <span style="color:var(--gold-3);padding-top:2px">${icon('scroll', { size: 14 })}</span>
              <div class="grow" style="min-width:0">
                <div style="font-size:12.5px;font-weight:600;display:flex;gap:6px;align-items:center">
                  ${esc(n.title)} ${n.dmOnly ? '<span class="tag red">DM</span>' : ''}</div>
                <div class="tiny" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                  ${esc(n.body.slice(0, 80))}${n.body.length > 80 ? '…' : ''}</div>
              </div>
            </div>`).join('')}
        </div>` : `
          <div class="empty" style="padding:22px 10px">
            <div class="big" style="width:48px;height:48px">${icon('notes', { size: 20 })}</div>
            <p>No notes yet.</p>
            <button class="btn sm" style="margin-top:10px" data-act="modal" data-name="new-note">
              ${icon('plus', { size: 13 })} New note</button>
          </div>`}
      </section>
    </aside>
  </div>`;
}

function activeCombatSub() {
  if (!state.combat.active) return 'No encounter';
  return `Round ${state.combat.round}`;
}

const initialsOf = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2)
  .map((w) => w[0]).join('').toUpperCase();
// ---------------------------------------------------------------- characters

function charactersView() {
  const c = selected();
  return `
  <div class="page-head spread">
    <div>
      <div class="eyebrow">Choose your hero</div>
      <h1>The party</h1>
      <p>Select a hero to open their sheet. Every number here is live at the table.</p>
    </div>
    <button class="btn primary" data-act="modal" data-name="new-char">
      ${icon('plus', { size: 14 })} New character</button>
  </div>

  <div class="cast-grid">
    ${state.characters.map((ch) => `
      <button class="cast-card ${ch.id === c?.id ? 'active' : ''}" data-act="select-char" data-id="${ch.id}">
        <span class="cast-frame">
          <img class="cast-art" src="${esc(artPortrait(ch))}" alt="" />
          <span class="cast-level">${ch.level}</span>
          ${state.online.includes(ch.ownerId) ? '<span class="cast-on"></span>' : ''}
          <span class="cast-hpbar">${hpBar(ch.hp, ch.maxHp)}</span>
        </span>
        <span class="cast-body">
          <b>${esc(ch.name)}</b>
          <i>${esc(ch.race || '')} ${esc(ch.class || 'Adventurer')}</i>
          <span class="cast-hp">${ch.hp}/${ch.maxHp} HP · AC ${ch.ac}</span>
        </span>
      </button>`).join('')}
    <button class="cast-card cast-new" data-act="modal" data-name="new-char">
      <span class="cast-plus">${icon('plus', { size: 22 })}</span>
      <span class="cast-body"><b>New hero</b><i>Forge a character</i></span>
    </button>
  </div>

  ${c ? `<div class="char-layout char-layout-single">${sheetView(c)}</div>` : `
      <div class="card empty">
        <div class="big">${icon('scroll', { size: 26 })}</div>
        <p>The page is blank.</p>
        <p class="tiny">Create a character to begin your legend.</p>
        <button class="btn primary" style="margin-top:14px" data-act="modal" data-name="new-char">
          ${icon('plus', { size: 14 })} New character</button>
      </div>`}
  </div>`;
}

function sheetView(c) {
  const mine = c.ownerId === state.user.id || isDM();
  const skills = state.srd.skills || {};
  const totalWeight = c.items.reduce((sum, i) => sum + i.weight * i.qty, 0);
  const slotRows = Object.entries(c.slots || {}).map(([lvl, s]) => {
    const slot = typeof s === 'object' ? s : { max: s || 0, used: 0 };
    return { lvl, ...slot };
  }).filter((s) => s.max);

  return `
  <div class="char-sheet">
    <section class="card sheet-hero">
      <div class="sheet-portrait-wrap">
        ${avatar(c.name, '', artPortrait(c))}
        <span class="level-medal"><span>${c.level}</span></span>
        ${mine ? `<button class="portrait-edit" data-act="set-portrait" data-id="${c.id}"
          title="Change portrait">${icon('edit', { size: 12 })}</button>` : ''}
      </div>

      <div class="sheet-id">
        <h2>${esc(c.name)}</h2>
        <div class="sheet-sub">Level ${c.level} ${esc(c.race || '')} ${esc(c.class || 'Adventurer')}</div>
        ${isDM() ? `
          <label class="row" style="margin-top:9px;flex-wrap:nowrap">
            <span class="tiny" style="letter-spacing:.12em;text-transform:uppercase">Played by</span>
            <select data-change="assign-char" data-id="${c.id}" style="width:auto;padding:5px 28px 5px 9px;font-size:12px">
              ${state.members.map((m) => `
                <option value="${m.id}" ${m.id === c.ownerId ? 'selected' : ''}>
                  ${esc(m.username)} (${esc(m.email)})</option>`).join('')}
            </select>
          </label>`
        : `<div class="sheet-owner">Played by ${esc(nameOf(c.ownerId))}</div>`}
        ${mine ? `
          <div class="row" style="margin-top:12px">
            <button class="btn sm" data-act="modal" data-name="edit-char" data-id="${c.id}">
              ${icon('edit', { size: 12 })} Edit</button>
            <button class="btn sm" data-act="modal" data-name="adjust-hp" data-id="${c.id}">
              ${icon('heart', { size: 12 })} Damage / heal</button>
            <button class="btn sm danger" data-act="delete-char" data-id="${c.id}">
              ${icon('trash', { size: 12 })} Delete</button>
          </div>` : ''}
      </div>

      <div class="sheet-hp">
        <div class="hp-label">Hit points</div>
        <div class="hp-num">${c.hp}<small>/ ${c.maxHp}</small></div>
        ${c.tempHp ? `<div style="margin:4px 0 2px"><span class="tag gold">+${c.tempHp} temp</span></div>` : ''}
        ${hpBar(c.hp, c.maxHp)}
        ${mine ? `<div class="hp-quick">
          ${[-5, -1, 1, 5].map((d) => `
            <button class="btn sm ${d < 0 ? 'danger' : ''}" data-act="hp" data-id="${c.id}" data-d="${d}">
              ${signed(d)}</button>`).join('')}
        </div>` : ''}
      </div>
    </section>

    <section class="card">
      <div class="card-head">${icon('star', { size: 16 })}<h3>Ability scores</h3>
        <span class="tiny">Tap one to roll a check</span></div>
      <div class="ability-grid">
        ${ABILITIES.map(([k, label]) => `
          <button class="ability" data-act="roll-quick" data-formula="d20${signed(mod(c.stats[k]))}"
            data-label="${label} check" title="Roll ${ABILITY_NAME[k]}">
            <div class="ab-k">${label}</div>
            <div class="ab-v">${signed(mod(c.stats[k]))}</div>
            <div class="ab-m">${c.stats[k] ?? 10}</div>
          </button>`).join('')}
      </div>
      <div class="vital-row" style="margin-top:10px">
        <div class="vital">${icon('shield', { size: 16 })}
          <div><div class="vt-k">Armor class</div><div class="vt-v">${c.ac}</div></div></div>
        <div class="vital">${icon('zap', { size: 16 })}
          <div><div class="vt-k">Initiative</div><div class="vt-v">${signed(c.initBonus)}</div></div></div>
        <div class="vital">${icon('arrowRight', { size: 16 })}
          <div><div class="vt-k">Speed</div><div class="vt-v">${c.speed} <span class="tiny">ft</span></div></div></div>
        <div class="vital">${icon('star', { size: 16 })}
          <div><div class="vt-k">Proficiency</div><div class="vt-v">${signed(c.profBonus)}</div></div></div>
      </div>
    </section>

    <div class="grid g2">
      <section class="card">
        <div class="card-head">${icon('sword', { size: 16 })}<h3>Attacks</h3>
          ${mine ? `<button class="btn sm" data-act="modal" data-name="new-attack">
            ${icon('plus', { size: 12 })} Add</button>` : ''}</div>
        ${(c.attacks || []).length ? (c.attacks || []).map((a, i) => `
          <div class="attack-row">
            <span class="attack-ic">${icon('sword', { size: 15 })}</span>
            <div class="grow">
              <div class="attack-name">${esc(a.name)}</div>
              <div class="attack-stat">${signed(a.toHit)} to hit · ${esc(a.damage)} ${esc(a.type || '')}</div>
            </div>
            <div class="row" style="flex-wrap:nowrap;gap:5px">
              <button class="btn sm" data-act="roll-quick" data-formula="d20${signed(a.toHit)}"
                data-label="${esc(a.name)} attack">${icon('dice', { size: 12 })} Roll</button>
              ${mine ? `<button class="btn sm danger" data-act="attack-del" data-id="${c.id}" data-i="${i}"
                title="Remove">${icon('trash', { size: 12 })}</button>` : ''}
            </div>
          </div>`).join('')
        : '<p class="muted">No attacks yet. Add one so this character can fight.</p>'}
      </section>

      <section class="card">
        <div class="card-head">${icon('sparkles', { size: 16 })}<h3>Spell slots</h3></div>
        ${slotRows.length ? `
          <div class="stack" style="gap:12px">
            ${slotRows.map((s) => {
              const left = s.max - s.used;
              return `
              <div class="spread">
                <div>
                  <div style="font-family:var(--display);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-2)">
                    Level ${s.lvl}</div>
                  <div class="slot-pips">
                    ${Array.from({ length: s.max }, (_, i) => `<span class="slot-pip ${i < s.used ? 'spent' : ''}"></span>`).join('')}
                  </div>
                </div>
                <div class="row" style="flex-wrap:nowrap;gap:5px">
                  <span class="tiny mono">${left}/${s.max}</span>
                  ${mine ? `
                    <button class="btn sm" data-act="slot" data-id="${c.id}" data-lvl="${s.lvl}" data-d="1"
                      title="Spend a slot">${icon('minus', { size: 11 })}</button>
                    <button class="btn sm" data-act="slot" data-id="${c.id}" data-lvl="${s.lvl}" data-d="-1"
                      title="Restore a slot">${icon('plus', { size: 11 })}</button>` : ''}
                </div>
              </div>`;
            }).join('')}
          </div>`
        : '<p class="muted">No spell slots set. Use Edit to add them.</p>'}
        ${mine ? `<button class="btn sm wide" style="margin-top:14px" data-act="long-rest" data-id="${c.id}">
          ${icon('bed', { size: 13 })} Long rest — restore everything</button>` : ''}
      </section>
    </div>

    <div class="grid g2">
      <section class="card">
        <div class="card-head">${icon('skull', { size: 16 })}<h3>Conditions</h3>
          ${mine ? '<button class="btn sm" data-act="modal" data-name="conditions">Manage</button>' : ''}</div>
        <div class="row">
          ${c.conditions.length
            ? c.conditions.map((n) => `<span class="cond" style="--tint:#b04338">${icon('zap', { size: 11 })}<span>${esc(n)}</span></span>`).join('')
            : '<span class="muted">None — feeling dangerous.</span>'}
        </div>
      </section>

      <section class="card">
        <div class="card-head">${icon('coin', { size: 16 })}<h3>Purse &amp; load</h3>
          <span class="tiny">${totalWeight.toFixed(1)} lbs</span></div>
        <div class="coin-row">
          ${COINS.map(([k, label]) => `
            <div class="coin"><div class="c-k" title="${label}">${label.slice(0, 2)}</div>
            <div class="c-v">${c.coins?.[k] ?? 0}</div></div>`).join('')}
        </div>
        ${mine ? `<button class="btn sm wide" style="margin-top:11px" data-act="modal" data-name="coins">
          ${icon('edit', { size: 12 })} Edit coins</button>` : ''}
      </section>
    </div>

    <section class="card">
      <div class="card-head">${icon('target', { size: 16 })}<h3>Skills</h3></div>
      <div class="grid g2" style="gap:0 22px">
        ${Object.entries(skills).map(([name, ability]) => {
          const bonus = mod(c.stats[ability]);
          return `<button class="skill-row" data-act="roll-quick" data-formula="d20${signed(bonus)}"
            data-label="${esc(name)}">
            <span>${esc(name)} <span class="sk-ab">${ability.toUpperCase()}</span></span>
            <span class="mono">${signed(bonus)}</span>
          </button>`;
        }).join('')}
      </div>
    </section>
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
  toast('Portrait updated');
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
  toast(`${c.name} takes a long rest.`, 'ok');
});

on('delete-char', async (el) => {
  if (!confirm('Delete this character for good?')) return;
  await api('DELETE', `/api/characters/${el.dataset.id}`);
  state.selectedCharId = null;
});

// ---------------------------------------------------------------- inventory

/** Item art tint, by category and tag — the closest thing to a rarity colour. */
const ITEM_TINT = {
  Weapon: '#b86a5c', Armor: '#7b8fb8', Potion: '#63a877', Ammunition: '#b98b4e',
  'Quest Item': '#9a7bd8', Gear: '#9c8a70', Other: '#8b8274',
};

const iconForCategory = (category) => ({
  Weapon: 'sword', Armor: 'armor', Potion: 'potion', Ammunition: 'arrow',
  'Quest Item': 'gem', Gear: 'backpack', Other: 'scroll',
}[category] || 'scroll');

function rarityOf(item) {
  const tags = item.tags || [];
  if (tags.includes('Quest')) return '#9a7bd8';
  if (tags.includes('Magic')) return '#8b7ae0';
  if (tags.includes('Treasure')) return '#c9a35c';
  if (tags.includes('Consumable')) return '#63a877';
  return ITEM_TINT[item.category] || '#9c8a70';
}

const LOADOUT = [
  { key: 'main', label: 'Main hand', cats: ['Weapon'], icon: 'sword' },
  { key: 'off', label: 'Off hand', cats: ['Shield'], icon: 'shield' },
  { key: 'armor', label: 'Armour', cats: ['Armor'], icon: 'shield' },
  { key: 'ammo', label: 'Quiver', cats: ['Ammunition'], icon: 'arrowRight' },
  { key: 'trinket', label: 'Trinket', cats: ['Quest Item', 'Ring', 'Treasure'], icon: 'gem' },
  { key: 'pack', label: 'Pack', cats: ['Gear', 'Container', 'Other'], icon: 'backpack' },
];

/** The worn kit: real carried items flagged as equipped, grouped by slot. */
function loadoutDoll(c, mine) {
  const used = new Set();
  const slots = LOADOUT.map((s) => {
    const item = c.items.find((i) => i.equipped && s.cats.includes(i.category) && !used.has(i.id)) || null;
    if (item) used.add(item.id);
    return { ...s, item };
  });
  const worn = c.items.filter((i) => i.equipped).length;

  return `
  <section class="card loadout">
    <div class="card-head">${icon('shield', { size: 15 })}<h3>Loadout</h3>
      <span class="tiny">${worn} worn</span></div>
    <div class="lo-body">
      <div class="lo-figure">
        <img src="${esc(artPortrait(c))}" alt="" />
      </div>
      <div class="lo-slots">
        ${slots.map((s) => `
          <button class="lo-slot ${s.item ? 'filled' : ''}"
            ${s.item ? `data-act="inspect-item" data-id="${s.item.id}"` : (mine ? 'data-act="modal" data-name="new-item"' : 'disabled')}
            title="${s.item ? esc(s.item.name) : 'Empty ' + s.label.toLowerCase()}">
            ${s.item
              ? itemTile(s.item.category, 32, s.item.name)
              : `<span class="lo-empty">${icon(s.icon, { size: 16 })}</span>`}
            <span class="lo-slot-txt">
              <b>${esc(s.item ? s.item.name : s.label)}</b>
              <span>${esc(s.label)}</span>
            </span>
          </button>`).join('')}
      </div>
    </div>
    <p class="lo-hint">${mine ? 'Equip an item from your bag to fill its slot.' : 'Only the owner or the DM can change this kit.'}</p>
  </section>`;
}

function inventoryView() {
  const c = selected();
  if (!c) {
    return `<div class="card empty"><div class="big">${icon('backpack', { size: 26 })}</div>
      <p>No one to carry anything yet.</p>
      <p class="tiny">Make a character first.</p></div>`;
  }
  const mine = c.ownerId === state.user.id || isDM();
  const q = state.filter.toLowerCase();
  const items = c.items.filter((i) => !q
    || i.name.toLowerCase().includes(q)
    || i.category.toLowerCase().includes(q));
  const weight = c.items.reduce((s, i) => s + i.weight * i.qty, 0);
  const capacity = Math.max(20, (c.stats?.str || 10) * 15);
  const sel = c.items.find((i) => i.id === state.selectedItemId) || null;

  return `
  <div class="page-head spread">
    <div>
      <div class="eyebrow">The satchel</div>
      <h1>Inventory</h1>
      <p>${esc(c.name)} · ${c.items.length} item${c.items.length === 1 ? '' : 's'} · ${weight.toFixed(1)} lbs carried</p>
    </div>
    <div class="row" style="flex-wrap:nowrap">
      <select data-change="pick-char" style="width:auto">
        ${state.characters.map((ch) => `<option value="${ch.id}" ${ch.id === c.id ? 'selected' : ''}>${esc(ch.name)}</option>`).join('')}
      </select>
      ${mine ? `<button class="btn primary" data-act="modal" data-name="new-item">
        ${icon('plus', { size: 14 })} Add item</button>` : ''}
    </div>
  </div>

  <div class="inv-layout">
    ${loadoutDoll(c, mine)}

    <section class="card">
      <div class="inv-toolbar">
        <div class="search-wrap">
          ${icon('search', { size: 15 })}
          <input placeholder="Search your bag…" data-live="filter" data-keep="inv-q" value="${esc(state.filter)}" />
        </div>
        <div class="capacity" title="Carrying capacity">
          ${icon('backpack', { size: 13 })}
          <span class="mono">${weight.toFixed(1)} / ${capacity} lb</span>
          <div class="bar"><i class="${weight > capacity * 0.9 ? 'hurt' : ''}" style="width:${pct(weight, capacity)}%"></i></div>
        </div>
      </div>

      <div class="inv-grid">
        ${items.length ? items.map((i) => `
          <button class="inv-slot ${sel?.id === i.id ? 'selected' : ''}" data-act="inspect-item" data-id="${i.id}"
            style="--rarity:${rarityOf(i)}" title="${esc(i.name)}">
            ${i.qty > 1 ? `<span class="inv-qty">×${i.qty}</span>` : ''}
            ${i.effect && i.effect.kind ? '<span class="inv-use" title="Usable"></span>' : ''}
            ${itemTile(i.category, 58, i.name)}
            <span class="inv-name">${esc(i.name)}</span>
          </button>`).join('')
        : `<div class="inv-empty">
            <div class="big" style="width:52px;height:52px;margin:0 auto 10px">${icon('backpack', { size: 22 })}</div>
            <p style="color:var(--ink);font-weight:600">${state.filter ? 'Nothing matches that search.' : 'The bag is empty.'}</p>
            ${mine && !state.filter ? `<button class="btn sm primary" style="margin-top:12px" data-act="modal" data-name="new-item">
              ${icon('plus', { size: 12 })} Add your first item</button>` : ''}
          </div>`}
      </div>
    </section>

    ${itemInspector(sel, c, mine)}
  </div>`;
}

/** The right-hand inspection panel for a single item. */
function itemInspector(i, c, mine) {
  if (!i) {
    return `
    <aside class="card inv-detail">
      <div class="empty" style="padding:60px 20px">
        <div class="big">${icon('search', { size: 24 })}</div>
        <p>Nothing inspected</p>
        <p class="tiny">Choose an item from the bag to read its description and use it.</p>
      </div>
    </aside>`;
  }

  const usable = i.effect && i.effect.kind !== null;
  return `
  <aside class="card inv-detail" style="--rarity:${rarityOf(i)}">
    ${i.image
      ? `<div class="lib-art" style="height:150px;background-image:url('${esc(i.image)}')"></div>`          : `<span class="item-tile has-art" style="width:100%;height:132px;--tint:${rarityOf(i)}">
          <img class="item-art" src="${artItem(i.name, i.category)}" alt="" /></span>`}
    <div class="id-meta">${esc(i.category)}</div>
    <h3>${esc(i.name)}</h3>
    <p class="id-desc">${esc(i.details) || 'No description recorded for this item.'}</p>

    <div class="id-stats">
      <div class="id-stat"><div class="k">Weight</div><div class="v">${i.weight} lb</div></div>
      <div class="id-stat"><div class="k">Quantity</div><div class="v">${i.qty}</div></div>
      <div class="id-stat"><div class="k">Carried by</div><div class="v" style="font-size:12px">${esc(c.name)}</div></div>
      <div class="id-stat"><div class="k">Total load</div><div class="v">${(i.weight * i.qty).toFixed(1)} lb</div></div>
    </div>

    ${i.effect?.kind === 'heal' ? `<p class="tiny" style="margin-top:10px;color:var(--green-2)">
      ${icon('potion', { size: 12 })} Heals ${esc(i.effect.amount || '2d4+2')} when used.</p>` : ''}

    ${mine ? `
      <button class="btn ${i.equipped ? 'primary' : ''} wide" style="margin-top:16px" data-act="toggle-equip" data-id="${i.id}">
        ${icon('shield', { size: 13 })} ${i.equipped ? 'Unequip' : 'Equip'}</button>
      <div class="row" style="margin-top:10px;flex-wrap:nowrap">
        ${usable ? `<button class="btn primary grow" data-act="use-item" data-id="${i.id}">
          ${icon(i.effect.kind === 'heal' ? 'potion' : 'sparkles', { size: 13 })} Use</button>` : ''}
        <button class="btn sm" data-act="item-qty" data-id="${i.id}" data-d="-1" title="Remove one">−</button>
        <button class="btn sm" data-act="item-qty" data-id="${i.id}" data-d="1" title="Add one">+</button>
        <button class="btn sm danger" data-act="item-del" data-id="${i.id}" title="Discard">
          ${icon('trash', { size: 12 })}</button>
      </div>`
    : '<p class="tiny" style="margin-top:14px">Only the owner or the DM can change this bag.</p>'}
  </aside>`;
}

on('inspect-item', (el) => { state.selectedItemId = el.dataset.id; render(); });
on('filter', (el) => { state.filter = el.value; render(); });
on('pick-char', (el) => { state.selectedCharId = el.value; state.selectedItemId = null; render(); });

on('item-qty', async (el) => {
  const c = selected();
  const item = c.items.find((i) => i.id === el.dataset.id);
  if (!item) return;
  const qty = item.qty + Number(el.dataset.d);
  if (qty <= 0) {
    state.selectedItemId = null;
    return api('DELETE', `/api/items/${item.id}`);
  }
  await api('PATCH', `/api/items/${item.id}`, { qty });
});

on('item-del', async (el) => {
  state.selectedItemId = null;
  await api('DELETE', `/api/items/${el.dataset.id}`);
});

on('use-item', async (el) => {
  const c = selected();
  const item = c.items.find((i) => i.id === el.dataset.id);
  await api('POST', `/api/items/${el.dataset.id}/use`);
  toast(`Used ${item?.name || 'item'}`);
});

on('toggle-equip', async (el) => {
  const c = selected();
  const item = c.items.find((i) => i.id === el.dataset.id);
  if (!item) return;
  const worn = !item.equipped;
  await api('PATCH', `/api/items/${item.id}`, { equipped: worn });
  sfx('click');
  toast(worn ? `${item.name} equipped` : `${item.name} stowed`);
});

// ---------------------------------------------------------------- item library

const ITEM_TAGS = ['Consumable', 'Quest', 'Magic', 'Equipment', 'Treasure', 'Container'];
const TAG_TINT = {
  Consumable: '#63a877', Quest: '#9a7bd8', Magic: '#8b7ae0',
  Equipment: '#b98b4e', Treasure: '#c9a35c', Container: '#8b8274',
};

/** The campaign's master item library — define once, drop copies anywhere. */
function libraryView() {
  const dm = isDM();
  const q = state.filter.toLowerCase();
  const list = state.library.filter((i) => !q
    || i.name.toLowerCase().includes(q)
    || (i.tags || []).some((t) => t.toLowerCase().includes(q))
    || i.category.toLowerCase().includes(q));

  return `
  <div class="page-head spread">
    <div>
      <div class="eyebrow">The vault</div>
      <h1>Item Library</h1>
      <p>Forge an item once, then drop copies into any bag or shop.</p>
    </div>
    ${dm ? `<button class="btn primary" data-act="modal" data-name="lib-item">
      ${icon('plus', { size: 14 })} New item</button>` : ''}
  </div>

  <div class="search-wrap">
    ${icon('search', { size: 15 })}
    <input placeholder="Search the library by name, type or tag…" data-live="filter" data-keep="lib-q"
      value="${esc(state.filter)}" />
  </div>

  ${list.length ? `
    <div class="lib-grid">
      ${list.map((i) => `
        <article class="lib-card" style="--rarity:${rarityOf(i)}">
          <div class="lib-art" ${i.image ? `style="background-image:url('${esc(i.image)}')"` : ''}>
            ${i.image ? '' : `<span class="item-tile" style="--tint:${rarityOf(i)}">
              ${icon(iconForCategory(i.category), { size: 34 })}</span>`}
          </div>
          <div>
            <div class="lib-name">${esc(i.name)}</div>
            <div class="lib-meta">${esc(i.category)}${i.value ? ` · ${esc(i.value)}` : ''}${i.weight ? ` · ${i.weight} lb` : ''}</div>
          </div>
          ${(i.tags || []).length ? `<div class="row" style="gap:5px">
            ${i.tags.map((t) => `<span class="lib-tag" style="--tint:${TAG_TINT[t] || 'var(--gold)'}">${esc(t)}</span>`).join('')}
          </div>` : ''}
          ${i.description ? `<p class="lib-desc">${esc(i.description)}</p>` : ''}
          ${i.effect?.kind === 'heal' ? `<p class="tiny" style="color:var(--green-2)">
            ${icon('potion', { size: 12 })} Heals ${esc(i.effect.amount || '2d4+2')}</p>` : ''}
          <div class="row" style="margin-top:auto">
            <button class="btn sm primary grow" data-act="modal" data-name="lib-give" data-id="${i.id}">
              ${icon('arrowRight', { size: 12 })} Give / stock a shop</button>
            ${dm ? `
              <button class="btn sm" data-act="modal" data-name="lib-item" data-id="${i.id}" title="Edit">
                ${icon('edit', { size: 12 })}</button>
              <button class="btn sm danger" data-act="lib-del" data-id="${i.id}" title="Remove">
                ${icon('trash', { size: 12 })}</button>` : ''}
          </div>
        </article>`).join('')}
    </div>`
  : `<div class="card empty">
      <div class="big">${icon('gem', { size: 26 })}</div>
      <p>The vault is empty.</p>
      <p class="tiny">${dm ? 'Add the first item, or import a Chronica library in Settings.' : 'Your DM builds the item library.'}</p>
      ${dm ? `<button class="btn primary" style="margin-top:14px" data-act="modal" data-name="lib-item">
        ${icon('plus', { size: 14 })} New item</button>` : ''}
    </div>`}`;
}

on('lib-del', async (el) => {
  if (!confirm('Remove this item from the library?')) return;
  await api('DELETE', `/api/library/${el.dataset.id}`);
});

// ---------------------------------------------------------------- dice

const DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

/** A faceted d20, drawn inline so it needs no asset and can tumble. */
function d20Svg(tumbling) {
  return `
  <svg class="d20 ${tumbling ? 'tumbling' : ''}" viewBox="0 0 200 200" aria-hidden="true">
    <defs>
      <linearGradient id="d20face" x1=".15" y1="0" x2=".85" y2="1">
        <stop offset="0" stop-color="#f7e6bc"/>
        <stop offset=".42" stop-color="#dcbc7a"/>
        <stop offset="1" stop-color="#9a7632"/>
      </linearGradient>
      <linearGradient id="d20low" x1=".2" y1="0" x2=".8" y2="1">
        <stop offset="0" stop-color="#c9a35c"/>
        <stop offset="1" stop-color="#77571f"/>
      </linearGradient>
      <linearGradient id="d20side" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#bb9450"/>
        <stop offset="1" stop-color="#6f5120"/>
      </linearGradient>
    </defs>
    <g stroke="#4a3512" stroke-width="1.4" stroke-linejoin="round">
      <polygon points="100,6 178,51 178,141 100,194 22,141 22,51" fill="url(#d20face)"/>
      <polygon points="100,6 178,51 100,86 22,51" fill="#f2dfb2" opacity=".92"/>
      <polygon points="22,51 100,86 58,142" fill="url(#d20side)" opacity=".55"/>
      <polygon points="178,51 100,86 142,142" fill="url(#d20side)" opacity=".4"/>
      <polygon points="58,142 100,86 142,142 100,194" fill="url(#d20low)"/>
      <polygon points="100,6 100,86 178,51" fill="none" opacity=".45"/>
      <polygon points="100,6 100,86 22,51" fill="none" opacity=".45"/>
    </g>
    <path d="M100 52 126 132H74Z" fill="none" stroke="#5c4116" stroke-width="1.2" opacity=".35"/>
    <path d="M100 92 114 116 100 140 86 116Z" fill="none" stroke="#4a3512" stroke-width="2" opacity=".5"/>
    <path d="M100 104 107 116 100 128 93 116Z" fill="#4a3512" opacity=".42"/>
    <path d="M78 40 100 18 122 40" fill="none" stroke="#fff6dd" stroke-width="2" opacity=".55"/>
  </svg>`;
}

function diceView() {
  const last = state.rolls[0];
  const adv = state.rollMode || 'normal';
  const formula = state.formula || 'd20';

  return `
  <div class="page-head spread">
    <div>
      <div class="eyebrow">Divination</div>
      <h1>Dice Roller</h1>
      <p>Every roll is shared with the table the moment it lands.</p>
    </div>
    <div class="row" style="flex-wrap:nowrap">
      ${['advantage', 'normal', 'disadvantage'].map((m) => `
        <button class="pill ${adv === m ? 'on' : ''}" data-act="roll-mode" data-mode="${m}">
          ${m === 'advantage' ? icon('arrowRight', { size: 12, cls: 'flip' }) : ''}
          ${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}
    </div>
  </div>

  <div class="dice-layout">
    <section class="card dice-stage">
      <div class="dice-glow"></div>
      <div class="d20-wrap">${d20Svg(state.rolling)}</div>
      <div class="dice-result">
        <span class="res-num">${last ? Math.abs(last.total) : '—'}</span>
        ${last ? `
          <div class="res-sub">${esc(last.detail.replace(/~~/g, ''))}</div>
          <div class="res-label">${last.label ? esc(last.label) : 'The bones have spoken'} · ${esc(nameOf(last.userId))}</div>
        ` : '<div class="res-label">Ready when you are.</div>'}
      </div>
      <div class="dice-cta">
        <button class="btn primary" data-act="roll-quick" data-formula="${esc(formula)}"
          data-label="${esc(state.diceLabel || '')}">
          ${icon('dice', { size: 14 })} Roll ${esc(formula)}</button>
        <button class="btn" data-act="set-formula" data-f="4d6kh3">${icon('sparkles', { size: 13 })} 4d6 drop low</button>
      </div>
    </section>

    <section class="card dice-controls">
      <div>
        <div class="eyebrow" style="margin-bottom:10px">Choose a die</div>
        <div class="die-picker">
          ${DICE.map((d) => `
            <button class="die-chip" data-act="set-formula" data-f="${d}" data-die="${d}">
              <span class="dc-shape"></span>${d}</button>`).join('')}
        </div>
      </div>

      <div>
        <div class="eyebrow" style="margin-bottom:10px">The roll</div>
        <form data-act="do-roll">
          <label class="field"><span>Formula</span>
            <input name="formula" data-keep="df" class="mono" value="${esc(formula)}"
              data-live="formula-live" placeholder="2d6+3" /></label>
          <label class="field"><span>Label <span class="tiny" style="text-transform:none;letter-spacing:0">(optional)</span></span>
            <input name="label" data-keep="dl" placeholder="Attack roll, Stealth check…"
              value="${esc(state.diceLabel || '')}" /></label>
          <button class="btn primary wide" type="submit">
            ${icon('dice', { size: 14 })} Roll the bones</button>
        </form>
      </div>
      <p class="tiny">Supports full notation — <span class="mono">2d6+3</span>,
        <span class="mono">4d6kh3</span>, <span class="mono">1d20+5</span>.</p>
    </section>
  </div>

  <section class="card roll-ledger">
    <div class="card-head">${icon('scroll', { size: 16 })}<h3>The roll ledger</h3>
      <span class="tiny">${state.rolls.length} recorded</span></div>
    ${state.rolls.length ? state.rolls.map((r) => `
      <div class="roll-line">
        <div class="roll-total ${r.pass === false ? 'miss' : ''}">${r.total}</div>
        <div class="grow" style="min-width:0">
          <div class="roll-who">${esc(nameOf(r.userId))}${r.label ? ` <span class="tiny">— ${esc(r.label)}</span>` : ''}
            ${r.pass === true ? '<span class="tag ok-tag">Success</span>' : ''}
            ${r.pass === false ? '<span class="tag red">Failed</span>' : ''}
            ${r.secret ? '<span class="tag grey">secret</span>' : ''}</div>
          <div class="roll-formula">${esc(r.formula)} → ${esc(r.detail.replace(/~~/g, ''))}</div>
          <details class="why"><summary>Why ${r.total}?</summary>${rollWhy(r)}</details>
        </div>
        <span class="tiny" style="white-space:nowrap">${ago(r.createdAt)}</span>
      </div>`).join('')
    : `<div class="empty"><div class="big">${icon('dice', { size: 24 })}</div>
        <p>No rolls recorded yet.</p><p class="tiny">Pick up the dice above.</p></div>`}
  </section>`;
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
  sfx('dice');
  try {
    await api('POST', `/api/campaigns/${state.campaign.id}/rolls`, { formula: applyMode(formula), label });
  } finally {
    setTimeout(() => { state.rolling = false; render(); }, 1050);
  }
}

on('do-roll', (form) => {
  state.diceLabel = val(form, 'label');
  return sendRoll(val(form, 'formula'), val(form, 'label'));
});
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
      : `The die came up <b>${nums[0]}</b>`);
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
    <div class="page-head">
      <div class="eyebrow">The field of battle</div>
      <h1>Combat</h1>
      <p>Initiative, hit points and conditions — synced to every seat at the table.</p>
    </div>
    <div class="card empty" style="padding:64px 24px">
      <div class="big">${icon('swords', { size: 28 })}</div>
      <p>No encounter is running.</p>
      <p class="tiny">The table is quiet… for now.</p>
      ${dm
        ? `<button class="btn primary" style="margin-top:16px" data-act="start-combat">
            ${icon('swords', { size: 14 })} Begin an encounter</button>`
        : '<p class="tiny">Your DM begins the encounter.</p>'}
    </div>`;
  }

  const active_ = combatants[turnIndex % Math.max(1, combatants.length)];
  const waiting = combatants.filter((c) => c.init === null || c.init === undefined).length;
  const attacker = combatants.find((c) => c.id === state.attackFrom);

  return `
  <div class="page-head spread">
    <div>
      <div class="eyebrow">The field of battle</div>
      <h1>${esc(name || 'Encounter')}</h1>
      <p>${active_ ? `${esc(active_.name)} acts` : 'Awaiting initiative'}
        ${waiting ? ` · <span class="tag red">${waiting} still to roll</span>` : ''}</p>
    </div>
    ${attacker ? `<button class="btn sm" data-act="cancel-attack">Cancel attack</button>` : ''}
  </div>

  <div class="card combat-hud">
    <div class="round-badge"><div><div class="rb-k">Round</div><div class="rb-v">${round}</div></div></div>
    <div>
      <div class="combat-title">${esc(name || 'Encounter')}</div>
      <div class="combat-sub">${combatants.length} combatant${combatants.length === 1 ? '' : 's'} ·
        ${combatants.filter((c) => c.hp > 0).length} standing</div>
    </div>
    ${dm ? `<div class="combat-actions">
      <button class="btn sm" data-act="modal" data-name="add-enemy">${icon('skull', { size: 13 })} Enemy</button>
      <button class="btn sm" data-act="add-party">${icon('users', { size: 13 })} Party</button>
      <button class="btn sm" data-act="roll-initiative-all">${icon('dice', { size: 13 })} Roll for all</button>
      <button class="btn sm" data-act="modal" data-name="request-roll">${icon('target', { size: 13 })} Request roll</button>
      <button class="btn sm primary" data-act="next-turn">Next turn ${icon('arrowRight', { size: 12 })}</button>
      <button class="btn sm danger" data-act="end-combat">End</button>
    </div>` : ''}
  </div>

  ${whoseTurnBanner()}

  ${attacker ? `<div class="turn-banner mine">
    ${icon('target', { size: 16 })}
    <div class="grow">
      <strong>${esc(attacker.name)} attacks</strong>
      <div class="tiny">${esc(attackNameOf(attacker, state.attackIndex))} — choose a target from the order below.</div>
    </div>
    <button class="btn sm" data-act="cancel-attack">Cancel</button>
  </div>` : ''}

  <div class="combat-layout">
    <section class="card ladder">
      <div class="card-head">${icon('swords', { size: 16 })}<h3>Initiative order</h3>
        <span class="tiny">Round ${round}</span></div>
      ${combatants.length ? combatants.map((c, i) => initRow(c, i, turnIndex, dm)).join('')
        : '<p class="muted">Add combatants to begin.</p>'}
    </section>

    <section class="card battle-log">
      <div class="card-head">${icon('scroll', { size: 16 })}<h3>Battle log</h3></div>
      ${chatBody()}
    </section>
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
  const { active, combatants, turnIndex } = state.combat;
  if (!active || !combatants.length) return '';

  const current = combatants[turnIndex % combatants.length];
  if (!current) return '';

  const sheet = current.charId ? state.characters.find((c) => c.id === current.charId) : null;
  const player = sheet ? nameOf(sheet.ownerId) : null;
  const mine = sheet && sheet.ownerId === state.user.id;

  return `
  <div class="turn-banner ${mine ? 'mine' : ''}">
    ${avatar(current.name, '', portraitOf(current))}
    <div class="grow">
      <strong>${mine
        ? 'Your turn — make it count'
        : player ? `Waiting for ${esc(player)}…` : `${esc(current.name)}’s turn`}</strong>
      <div class="tiny">${esc(current.name)} · round ${state.combat.round}</div>
    </div>
    ${mine ? `<button class="btn sm primary" data-act="open-turn">Take my turn</button>` : ''}
    ${isDM() ? `
      <span class="turn-timer" title="Time on this turn">
        ${icon('hourglass', { size: 12 })}<b data-turn-timer>${turnClock()}</b></span>
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
      const l = look[c.name] || { icon: 'zap', tint: '#b04338' };
      return `<span class="cond" style="--tint:${l.tint}" title="${esc(c.name)}"
        ${dm ? `data-act="cond-remove" data-id="${combatant.id}" data-name="${esc(c.name)}"` : ''}>
        ${icon(l.icon, { size: 11 })}<span>${esc(c.name)}</span>
        ${c.turns ? `<b>${c.turns}</b>` : ''}
      </span>`;
    }).join('')}
    ${dm ? `<button class="cond cond-add" data-act="modal" data-name="add-cond" data-id="${combatant.id}">
      ${icon('plus', { size: 11 })}</button>` : ''}
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
  // Players are held to their attacks-per-turn allowance; the DM is not.
  const outOfAttacks = !dm && attacksLeft(c, sheet) <= 0;
  const per = Math.max(1, sheet?.attacksPerTurn || c.attacksPerTurn || 1);

  return `
  <div class="init-row ${i === turnIndex ? 'turn' : ''} ${c.hp <= 0 ? 'dead' : ''} ${targeting ? 'targetable' : ''}"
       ${targeting ? `data-act="pick-target" data-id="${c.id}"` : ''}>
    <span class="n">${i + 1}</span>
    <span class="mono">${needsInit ? '—' : c.init}</span>
    ${avatar(c.name, '', sheet ? artPortrait(sheet) : (c.type === 'enemy' ? CHARACTER_ART.dragon : CHARACTER_ART.fighter))}
    <div class="grow">
      <div class="spread">
        <span style="font-weight:600;font-size:13.5px" class="${c.type === 'enemy' ? 'init-enemy' : ''}">
          ${c.type === 'enemy' ? icon('skull', { size: 12 }) : icon('shield', { size: 12 })} ${esc(c.name)}
        </span>
        <span class="tiny mono">${c.hp}/${c.maxHp} HP · AC ${c.ac}</span>
      </div>
      ${hpBar(c.hp, c.maxHp)}
      ${conditionChips(c, dm)}
      ${deathRow(c, canAttack)}

      ${needsInit && canAct ? `
        <button class="btn sm" style="margin-top:7px" data-act="roll-init-one" data-id="${c.id}">
          ${icon('dice', { size: 12 })} Roll initiative</button>` : ''}

      ${!needsInit && canAttack && c.hp > 0 && attacks.length && !outOfAttacks ? `
        <div class="row" style="margin-top:7px">
          ${attacks.map((a, ai) => `
            <button class="btn sm" data-act="begin-attack" data-id="${c.id}" data-index="${ai}">
              ${icon('sword', { size: 12 })} ${esc(a.name)}
              <span class="tiny mono">${signed(a.toHit)} · ${esc(a.damage)}</span>
            </button>`).join('')}
        </div>
        ${per > 1 ? `<div class="tiny" style="margin-top:5px">${attacksLeft(c, sheet)} of ${per} attacks left this turn</div>` : ''}`
      : (!needsInit && mine && myTurn && c.hp > 0 && outOfAttacks)
        ? '<div class="tiny" style="margin-top:7px">You’ve used your attack this turn.</div>'
      : (!needsInit && mine && !myTurn && c.hp > 0)
        ? '<div class="tiny" style="margin-top:7px">Wait for your turn to act.</div>' : ''}

      ${dm && c.type === 'enemy' && c.hp <= 0 ? `
        <button class="btn sm ${c.looted ? '' : 'primary'}" style="margin-top:7px"
          data-act="modal" data-name="loot" data-i="${i}" ${c.looted ? 'disabled' : ''}>
          ${icon('coin', { size: 12 })} ${c.looted ? 'Looted' : 'Collect loot'}</button>` : ''}
    </div>

    ${dm ? `<div class="row init-actions" style="flex-wrap:nowrap;margin-left:auto">
      ${[-5, -1, 1, 5].map((d) => `<button class="btn sm" data-act="c-hp" data-i="${i}" data-d="${d}">${signed(d)}</button>`).join('')}
      <button class="btn sm" data-act="modal" data-name="c-cond" data-i="${i}" title="Conditions">${icon('heart', { size: 12 })}</button>
      <button class="btn sm danger" data-act="c-del" data-i="${i}" title="Remove">${icon('x', { size: 12 })}</button>
    </div>` : ''}
  </div>`;
}

/** Death-save pips (and a roll button on the downed hero's own turn). */
function deathRow(c, canAct) {
  if (c.dead) return '<div class="tiny" style="margin-top:6px;color:var(--red-2);font-weight:700">Dead</div>';
  if (c.stable) return '<div class="tiny" style="margin-top:6px;color:var(--gold-2);font-weight:700">Stable at 0 HP</div>';
  if (!c.downed) return '';
  const ds = c.deathSaves || { s: 0, f: 0 };
  const pip = (on, cls) => `<span class="pip ${cls} ${on ? 'on' : ''}"></span>`;
  const row = (n, cls) => Array.from({ length: 3 }, (_, i) => pip(i < n, cls)).join('');
  return `
    <div class="death-inline">
      <span class="pips">${row(ds.s, 'good')}</span>
      <span class="pips">${row(ds.f, 'bad')}</span>
      ${canAct ? `<button class="btn sm" data-act="death-save" data-id="${c.id}">
        ${icon('dice', { size: 11 })} Death save</button>` : ''}
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
        attacksPerTurn: c.attacksPerTurn || 1, attacksUsed: 0,
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

// Each school gets its own sigil and colour, so a spellbook reads at a glance.
const SCHOOLS = {
  Abjuration: { slug: 's-abjuration', icon: 'shield' },
  Conjuration: { slug: 's-conjuration', icon: 'sparkles' },
  Divination: { slug: 's-divination', icon: 'eye' },
  Enchantment: { slug: 's-enchantment', icon: 'brain' },
  Evocation: { slug: 's-evocation', icon: 'fire' },
  Illusion: { slug: 's-illusion', icon: 'moon' },
  Necromancy: { slug: 's-necromancy', icon: 'skull' },
  Transmutation: { slug: 's-transmutation', icon: 'refresh' },
};
const schoolOf = (name) => SCHOOLS[name] || { slug: 'school-tag', icon: 'sparkles' };

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
    <div>
      <div class="eyebrow">Crystal index</div>
      <h1>Powers</h1>
      <p>Crystal-granted abilities observed in the field. Star a power to add it to ${esc(c?.name || 'your character')}’s known kit.</p>
    </div>
    <button class="pill ${state.spellsMine ? 'on' : ''}" data-act="toggle-mine">
      ${icon('star', { size: 13, fill: state.spellsMine })} Known only</button>
  </div>

  <div class="search-wrap">
    ${icon('search', { size: 15 })}
    <input placeholder="Search powers or classes…" data-live="filter" data-keep="sp-q" value="${esc(state.filter)}" />
  </div>

  <div class="row" style="margin-bottom:16px">
    ${['all', 0, 1, 2, 3].map((l) => `
      <button class="pill ${String(lvl) === String(l) ? 'on' : ''}" data-act="spell-level" data-l="${l}">
        ${l === 'all' ? 'All levels' : l === 0 ? 'Cantrips' : `Level ${l}`}</button>`).join('')}
    <span class="tiny" style="margin-left:auto">${list.length} power${list.length === 1 ? '' : 's'}</span>
  </div>

  <div class="spell-grid">
    ${list.map((s) => {
      const known = (c?.spells || []).includes(s.name);
      const school = schoolOf(s.school);
      return `
      <article class="spell-tile ${school.slug} ${known ? 'known' : ''}" style="--spell-art:url('${artSpell(school.slug)}')">
        <div class="sp-head">
          <span class="school-sigil">${icon(school.icon, { size: 17 })}</span>
          <div class="grow">
            <div class="spell-name">${esc(s.name)}</div>
            <div class="spell-tags">
              <span class="tag">${s.level === 0 ? 'Cantrip' : `Level ${s.level}`}</span>
              <span class="tag grey">${esc(s.school)}</span>
            </div>
          </div>
          ${c ? `<button class="btn sm ${known ? 'primary' : ''}" data-act="know-spell" data-name="${esc(s.name)}"
            title="${known ? 'Remove from known list' : 'Add to known list'}">
            ${icon('star', { size: 13, fill: known })}</button>` : ''}
        </div>
        <div class="spell-meta">
          <span>${esc(s.time)}</span><span>${esc(s.range)}</span>
          <span>${esc(s.comp)}</span><span>${esc(s.duration)}</span>
        </div>
        <p class="spell-desc">${esc(s.desc)}</p>
        <div class="spell-foot">
          <span class="tiny">${esc(s.classes.join(', '))}</span>
          ${known ? '<span class="tiny" style="color:var(--gold-2)">prepared</span>' : ''}
        </div>
      </article>`;
    }).join('') || `<div class="card empty" style="grid-column:1/-1">
      <div class="big">${icon('sparkles', { size: 24 })}</div>
      <p>No spells match.</p><p class="tiny">Try another school, level or name.</p></div>`}
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
  { id: 'item', label: 'Items', one: 'Item', icon: 'gem', sub: 'Category', statuses: [] },
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
    <div>
      <div class="eyebrow">The world</div>
      <h1>Classified Archive</h1>
      <p>Everything your party has learned about the world — and what it has cost.</p>
    </div>
    <button class="btn primary" data-act="modal" data-name="new-entry">
      ${icon('plus', { size: 14 })} New ${kind.one}</button>
  </div>

  <div class="codex-tabs">
    ${KINDS.map((k) => `
      <button class="tab-btn ${tab === k.id ? 'on' : ''}" data-act="codex-tab" data-tab="${k.id}">
        ${icon(k.icon, { size: 13 })} ${k.label}
        <span class="tiny">${state.entries.filter((e) => e.kind === k.id).length}</span>
      </button>`).join('')}
  </div>

  <div class="search-wrap">
    ${icon('search', { size: 15 })}
    <input placeholder="Search the codex…" data-live="filter" data-keep="cx-q" value="${esc(state.filter)}" />
  </div>

  ${tab === 'event' ? timelineView(list) : `
    <div class="entry-grid">
      ${list.map((e) => entryCard(e)).join('')
        || `<div class="card empty" style="grid-column:1/-1">
            <div class="big">${icon(kind.icon, { size: 24 })}</div>
            <p>Nothing here yet.</p>
            <p class="tiny">Add your first ${kind.one.toLowerCase()} to the codex.</p></div>`}
    </div>`}`;
}

function entryCard(e) {
  const mine = e.authorId === state.user.id || isDM();
  const placed = (state.maps || []).find((m) => m.tiles.some((t) => t.entryId === e.id));
  return `
  <article class="card entry-card">
    ${e.image ? `<div class="entry-img" style="background-image:url('${esc(e.image)}')"></div>` : ''}
    <div class="entry-body grow">
      <div class="spread">
        <div class="row">
          <span class="entry-title">${esc(e.title)}</span>
          ${e.status ? `<span class="tag ${['Hostile', 'Failed', 'Dead'].includes(e.status) ? 'red' : 'gold'}">${esc(e.status)}</span>` : ''}
          ${e.dmOnly ? '<span class="tag red">DM</span>' : ''}
          ${placed ? `<button class="btn sm" data-act="open-entry-map" data-id="${e.id}"
            title="Show on the world map">${icon('compass', { size: 12 })} Map</button>` : ''}
        </div>
        ${mine ? `<div class="row" style="flex-wrap:nowrap;gap:4px">
          <button class="btn sm" data-act="modal" data-name="edit-entry" data-id="${e.id}" title="Edit">
            ${icon('edit', { size: 12 })}</button>
          <button class="btn sm danger" data-act="entry-del" data-id="${e.id}" title="Delete">
            ${icon('trash', { size: 12 })}</button>
        </div>` : ''}
      </div>
      ${e.subtitle ? `<div class="entry-sub">${esc(e.subtitle)}</div>` : ''}
      ${e.body ? `<p class="entry-text">${esc(e.body)}</p>` : ''}
      ${e.kind === 'shop' ? shopStock(e) : ''}
    </div>
  </article>`;
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
        <span class="tiny" style="text-transform:uppercase;letter-spacing:.12em">Buying as</span>
        <select data-change="shop-buyer" style="width:auto;padding:5px 28px 5px 9px;font-size:12px">
          ${buyers.map((c) => `<option value="${c.id}" ${c.id === buyer?.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </label>` : ''}

    ${buyer ? `<div class="tiny" style="margin-bottom:8px">
      ${icon('coin', { size: 12 })} ${esc(buyer.name)} carries ${purseText(buyer.coins)}</div>` : ''}

    <div class="stack" style="gap:6px">
      ${stock.map((s, i) => `
        <div class="shop-line">
          ${itemTile(s.category || guessCategory(s.name), 32, s.name)}
          <div class="grow">
            <div style="font-size:12.5px;font-weight:600">${esc(s.name)}</div>
            <div class="tiny mono">${esc(s.price || 'free')}</div>
          </div>
          ${buyer
            ? `<button class="btn sm primary" data-act="buy-item"
                data-entry="${entry.id}" data-index="${i}" data-char="${buyer.id}">
                ${icon('plus', { size: 12 })} Buy</button>`
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
  toast('Bought — check your inventory', 'ok');
});

function timelineView(list) {
  if (!list.length) {
    return `<div class="card empty"><div class="big">${icon('hourglass', { size: 24 })}</div>
      <p>The timeline is blank.</p><p class="tiny">Log what happened each session and the story writes itself.</p></div>`;
  }
  return `<div class="timeline">
    ${list.map((e) => `
      <div class="tl-item">
        <div class="tl-dot"></div>
        <div class="card grow">
          <div class="spread">
            <div>
              <span class="entry-title">${esc(e.title)}</span>
              ${e.subtitle ? `<div class="entry-sub" style="font-size:14px">${esc(e.subtitle)}</div>` : ''}
            </div>
            ${e.authorId === state.user.id || isDM() ? `<div class="row" style="flex-wrap:nowrap;gap:4px">
              <button class="btn sm" data-act="modal" data-name="edit-entry" data-id="${e.id}">
                ${icon('edit', { size: 12 })}</button>
              <button class="btn sm danger" data-act="entry-del" data-id="${e.id}">
                ${icon('trash', { size: 12 })}</button>
            </div>` : ''}
          </div>
          ${e.body ? `<p class="entry-text" style="margin-top:8px">${esc(e.body)}</p>` : ''}
        </div>
      </div>`).join('')}
  </div>`;
}

on('codex-tab', (el) => { state.codexTab = el.dataset.tab; state.filter = ''; render(); });

on('open-entry-map', (el) => focusEntryOnMap(el.dataset.id));

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
          title="Add a picture">${icon('edit', { size: 12 })}</button>
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
      <span class="muted">DM only — hidden from players</span></label>` : ''}

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
    <div>
      <div class="eyebrow">The journal</div>
      <h1>Session Notes</h1>
      <p>The party shares these pages. Anything the DM seals stays hidden from players.</p>
    </div>
    <button class="btn primary" data-act="modal" data-name="new-note">
      ${icon('plus', { size: 14 })} New note</button>
  </div>

  ${state.notes.length ? `
    <div class="journal">
      ${state.notes.map((n) => `
        <article class="journal-page">
          <div class="jp-head">
            <div>
              <div class="jp-title">${esc(n.title)}</div>
              <div class="jp-date">${esc(nameOf(n.authorId))} · ${ago(n.updatedAt)}</div>
            </div>
            ${n.dmOnly ? '<span class="dm-seal">DM only</span>' : ''}
          </div>
          <p class="jp-body">${esc(n.body)}</p>
          <div class="jp-foot">
            <span>Session notes</span>
            ${n.authorId === state.user.id || isDM() ? `<div class="jp-actions">
              <button class="btn sm" data-act="modal" data-name="edit-note" data-id="${n.id}">
                ${icon('edit', { size: 11 })} Edit</button>
              <button class="btn sm danger" data-act="note-del" data-id="${n.id}">
                ${icon('trash', { size: 11 })}</button>
            </div>` : ''}
          </div>
        </article>`).join('')}
    </div>`
  : `<div class="card empty" style="padding:60px 24px">
      <div class="big">${icon('notes', { size: 26 })}</div>
      <p>The journal is empty.</p>
      <p class="tiny">Write down what happened before the details fade.</p>
      <button class="btn primary" style="margin-top:14px" data-act="modal" data-name="new-note">
        ${icon('plus', { size: 14 })} Write the first note</button>
    </div>`}`;
}

on('note-del', async (el) => {
  if (!confirm('Delete this note?')) return;
  await api('DELETE', `/api/notes/${el.dataset.id}`);
});

// ---------------------------------------------------------------- chat

function chatBody() {
  return `
  <div class="chat-log" id="chatlog">
    ${state.messages.map((m) => {
      const mine = m.userId === state.user.id;
      const who = nameOf(m.userId);
      return `
      <div class="msg ${mine ? 'mine' : ''}">
        ${avatar(who)}
        <div class="msg-body">
          <div class="who">${esc(who)} <span class="tiny" style="letter-spacing:0;text-transform:none">${ago(m.createdAt)}</span></div>
          <div class="body">${esc(m.body)}</div>
        </div>
      </div>`;
    }).join('') || `<div class="empty" style="padding:30px 10px">
      <div class="big" style="width:48px;height:48px">${icon('chat', { size: 20 })}</div>
      <p>No messages yet.</p><p class="tiny">Speak, and the whole table hears it.</p></div>`}
  </div>
  <form data-act="send-msg" class="chat-form">
    <input name="body" data-keep="chat" placeholder="Say something to the party…" autocomplete="off" />
    <button class="btn primary" type="submit">${icon('send', { size: 14 })} Send</button>
  </form>`;
}

function chatView() {
  return `
  <div class="page-head">
    <div class="eyebrow">Speaking stone</div>
    <h1>Party Chat</h1>
    <p>Everyone in the campaign, in the room at once.</p>
  </div>
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
  <div class="page-head">
    <div class="eyebrow">The chronicle</div>
    <h1>Settings</h1>
    <p>Campaign, company and account — the paperwork behind the legend.</p>
  </div>

  <div class="settings-grid">
    <section class="card">
      <div class="card-head">${icon('book', { size: 16 })}<h3>The campaign</h3></div>
      ${dm ? `
        <form data-act="save-campaign">
          <label class="field"><span>Name</span>
            <input name="name" data-keep="c-n" value="${esc(state.campaign.name)}" /></label>
          <label class="field"><span>Current session</span>
            <input name="sessionTitle" data-keep="c-s" value="${esc(state.campaign.sessionTitle || '')}"
              placeholder="Session 4: Into the Depths" /></label>
          <label class="field"><span>Description</span>
            <textarea name="description" data-keep="c-d">${esc(state.campaign.description)}</textarea></label>
          <button class="btn primary" type="submit">Save campaign</button>
        </form>`
      : `<p class="muted" style="font-family:var(--serif);font-size:17px">${esc(state.campaign.name)}</p>
         <p class="tiny" style="margin-top:6px">Only the Dungeon Master can change campaign settings.</p>`}
    </section>

    <section class="card">
      <div class="card-head">${icon('users', { size: 16 })}<h3>The company (${state.members.length})</h3></div>
      ${state.members.map((m) => `
        <div class="member-row">
          ${avatar(m.username, state.online.includes(m.id) ? 'on' : '')}
          <div class="grow">
            <div class="member-name">${esc(m.username)}</div>
            <div class="member-mail">${esc(m.email)}</div>
          </div>
          <span class="tag ${m.role === 'dm' ? 'gold' : 'grey'}">${m.role === 'dm' ? 'DM' : 'Player'}</span>
          ${dm && m.id !== state.user.id
            ? `<button class="btn sm danger" data-act="kick" data-id="${m.id}">Remove</button>` : ''}
        </div>`).join('')}

      ${dm ? `
        <div class="section-line" style="margin:18px 0 12px">Invite by email</div>
        <form data-act="invite" class="row" style="flex-wrap:nowrap">
          <input name="email" data-keep="inv" type="email" class="grow" placeholder="friend@example.com" required />
          <button class="btn primary" type="submit">Invite</button>
        </form>
        <p class="tiny" style="margin-top:8px">They sign up with that email and the invitation is waiting.</p>
        ${state.campaignInvites.length ? `<div class="stack" style="margin-top:12px">
          ${state.campaignInvites.map((i) => `<div class="spread">
            <span class="muted">${esc(i.email)}</span>
            <span class="tag ${i.status === 'pending' ? '' : 'grey'}">${esc(i.status)}</span>
          </div>`).join('')}</div>` : ''}` : ''}
    </section>

    <section class="card">
      <div class="card-head">${icon('settings', { size: 16 })}<h3>At the table</h3></div>
      <div class="setting-row">
        <div>
          <div class="sr-title">${state.simple ? 'Simple mode' : 'Advanced mode'}</div>
          <p class="sr-note">${state.simple
            ? 'Plain language and explained outcomes — best for new players.'
            : 'Full D&D terms, formulas and modifiers on show.'}</p>
        </div>
        <button class="switch ${state.simple ? 'on' : ''}" data-act="toggle-simple"
          aria-label="Toggle simple mode" title="Toggle play style"></button>
      </div>
      <div class="setting-row">
        <div>
          <div class="sr-title">Sound</div>
          <p class="sr-note">A soft chime when it is your turn, and a rattle of dice when you roll.</p>
        </div>
        <button class="switch ${state.sound ? 'on' : ''}" data-act="toggle-sound"
          aria-label="Toggle sound" title="Toggle sound"></button>
      </div>
      <div class="setting-row">
        <div>
          <div class="sr-title">${state.theme === 'dark' ? 'Candlelit night' : 'Parchment daylight'}</div>
          <p class="sr-note">Switch the whole interface between the obsidian hall and the daylight scriptorium.</p>
        </div>
        <button class="btn sm" data-act="theme">${icon(state.theme === 'dark' ? 'sun' : 'moon', { size: 13 })}
          ${state.theme === 'dark' ? 'Daylight' : 'Night'}</button>
      </div>
    </section>

    <section class="card">
      <div class="card-head">${icon('crown', { size: 16 })}<h3>Your account</h3></div>
      <div class="row" style="flex-wrap:nowrap">
        ${avatar(state.user.username, 'on')}
        <div class="grow">
          <div style="font-weight:600">${esc(state.user.username)}</div>
          <div class="tiny">${esc(state.user.email)}</div>
        </div>
      </div>
      <div class="row" style="margin-top:16px">
        ${state.user.isAdmin || state.user.actingAs ? `
          <button class="btn sm" data-act="modal" data-name="accounts">
            ${icon('crown', { size: 12 })} Accounts</button>` : ''}
        <button class="btn sm" data-act="switch-campaign">${icon('book', { size: 12 })} Switch campaign</button>
        <button class="btn sm danger" data-act="logout">${icon('arrowRight', { size: 12 })} Sign out</button>
      </div>
    </section>
  </div>

  ${dm ? `<div style="margin-top:16px">${importExportCard()}</div>` : ''}`;
}

/** Import a Chronica (or any) campaign, and back this one up. DM only. */
function importExportCard() {
  const preview = state.importPreview;
  return `
  <section class="card">
    <div class="card-head">${icon('scroll', { size: 16 })}<h3>Import &amp; backup</h3></div>

    <p class="muted" style="margin-bottom:14px">Bring a campaign in from Chronica or any other tool.</p>

    <div class="row" style="margin-bottom:12px">
      <button class="btn primary" data-act="pick-import-file">
        ${icon('backpack', { size: 13 })} Choose files…</button>
      <button class="btn" data-act="paste-import">${icon('notes', { size: 13 })} Paste instead</button>
      <button class="btn" data-act="download-template">${icon('scroll', { size: 13 })} Template</button>
    </div>

    ${preview ? `
      <div class="card" style="background:rgba(0,0,0,.25);border-color:rgba(201,162,88,.4)">
        <div style="font-weight:600;margin-bottom:8px">Ready to import:</div>
        <div class="row" style="gap:14px;font-size:13px">
          ${[['characters', 'characters'], ['npc', 'NPCs'], ['quest', 'quests'],
            ['location', 'locations'], ['shop', 'shops'], ['event', 'timeline'],
            ['notes', 'notes'], ['items', 'items']]
            .filter(([k]) => preview.summary[k])
            .map(([k, label]) => `<span><b>${preview.summary[k]}</b> ${label}</span>`).join('')
            || '<span class="muted">Nothing recognised in that file.</span>'}
        </div>
        <div class="row" style="margin-top:14px">
          <button class="btn" data-act="cancel-import">Cancel</button>
          <button class="btn primary grow" data-act="commit-import">
            ${icon('check', { size: 13 })} Import into ${esc(state.campaign.name)}</button>
        </div>
        <p class="tiny" style="margin-top:8px">This adds to your campaign — it never deletes what is already here.</p>
      </div>` : ''}

    <hr style="border:0;border-top:1px solid var(--line);margin:16px 0" />
    <button class="btn" data-act="export-campaign">
      ${icon('book', { size: 13 })} Back up this campaign (JSON)</button>
  </section>`;
}

// ---- import / export

/**
 * Preview a payload and stash it for the confirm step. `data` may be one object
 * or an array of them — Chronica exports one file per section, and the server
 * merges an array into a single import.
 */
async function stageImport(data) {
  const { summary } = await api('POST', `/api/campaigns/${state.campaign.id}/import/preview`, { data });
  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  if (!total) return toast('Nothing recognisable in there. Did you pick your Chronica export files?', 'err');
  state.importPreview = { data, summary };
  render();
}

const readFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
  reader.onload = () => resolve(String(reader.result));
  reader.readAsText(file);
});

on('pick-import-file', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json,.txt';
  input.multiple = true; // Chronica splits a campaign across several files
  input.onchange = async () => {
    const files = [...(input.files || [])];
    if (!files.length) return;
    if (files.some((f) => f.size > 8 * 1024 * 1024)) return toast('One of those files is over 8 MB.', 'err');
    try {
      const texts = await Promise.all(files.map(readFile));
      const parsed = texts.map((t) => {
        try { return JSON.parse(t); } catch { return null; }
      });
      const good = parsed.filter(Boolean);
      if (!good.length) return toast('None of those were valid JSON files.', 'err');
      if (good.length < files.length) toast(`Skipped ${files.length - good.length} file(s) that were not valid JSON.`);
      // One file → send it as-is; several → send the array for the server to merge.
      await stageImport(good.length === 1 ? good[0] : good);
    } catch (err) { fail(err); }
  };
  input.click();
});

on('paste-import', () => {
  const text = prompt('Paste your campaign JSON here:');
  if (!text) return;
  try { stageImport(JSON.parse(text)).catch(fail); } catch { toast('That is not valid JSON.', 'err'); }
});

on('cancel-import', () => { state.importPreview = null; render(); });

on('commit-import', async () => {
  const { created } = await api('POST', `/api/campaigns/${state.campaign.id}/import`, state.importPreview.data);
  state.importPreview = null;
  await refresh();
  const bits = Object.entries(created).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`);
  toast(bits.length ? `Imported ${bits.join(', ')}` : 'Nothing new to import', 'ok');
});

/** Save a JSON file to the user's device. */
function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

on('download-template', () => {
  downloadJson('dndds-import-template.json', {
    campaign: {
      name: 'My Campaign',
      characters: [
        { name: 'Lyra', race: 'Elf', class: 'Ranger', level: 4, hp: 27, ac: 15,
          stats: { str: 10, dex: 16, con: 13, int: 11, wis: 15, cha: 9 } },
      ],
      npcs: [{ name: 'Meepo', race: 'Kobold', status: 'Friendly', description: 'A sad kobold.' }],
      quests: [{ title: 'Rescue the Merchants', giver: 'Kerowyn', status: 'Active', description: 'Find them.' }],
      locations: [{ name: 'The Sunless Citadel', region: 'Ashen Plain', description: 'A sunken fortress.' }],
      shops: [{ name: 'General Store', owner: 'Bartho', stock: [{ name: 'Rope', price: '1 gp' }] }],
      events: [{ title: 'Session 1', description: 'The adventure began.' }],
      notes: [{ title: 'A secret', body: 'Only the DM sees this.', dmOnly: true }],
    },
  });
  toast('Template downloaded — fill it in and load it back here.');
});

on('export-campaign', async () => {
  const data = await api('GET', `/api/campaigns/${state.campaign.id}/export`);
  const safe = state.campaign.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  downloadJson(`${safe || 'campaign'}-backup.json`, data);
  toast('Backup downloaded', 'ok');
});

on('save-campaign', async (form) => {
  await api('PATCH', `/api/campaigns/${state.campaign.id}`, {
    name: val(form, 'name'),
    sessionTitle: val(form, 'sessionTitle'),
    description: val(form, 'description'),
  });
  toast('Campaign saved', 'ok');
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
    case 'accounts': return accountsModal();
    case 'lib-item': return libItemModal(state.library.find((i) => i.id === state.modal.id));
    case 'lib-give': return libGiveModal(state.library.find((i) => i.id === state.modal.id));
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
    <p style="font-size:15px;line-height:1.6;color:var(--ink);margin-top:6px">${esc(def)}</p>
    <button class="btn primary wide" style="margin-top:18px" data-act="close-modal">Got it</button>`;
}

/** The DM's "ask the party for a roll" builder. */
function requestRollModal() {
  const players = state.members.filter((m) => m.role !== 'dm');
  const skills = Object.keys(state.srd.skills || {});
  return `
    <h2>Request a roll</h2>
    <form data-act="send-roll-request" class="stack">
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

      <label class="row" style="gap:8px"><input type="checkbox" name="proficient" style="width:auto" />
        <span class="muted">Add proficiency bonus</span></label>
      <label class="row" style="gap:8px"><input type="checkbox" name="secret" style="width:auto" />
        <span class="muted">Secret — only I see the result</span></label>

      <div class="row" style="margin-top:6px">
        <button class="btn" type="button" data-act="close-modal">Cancel</button>
        <button class="btn primary grow" type="submit">${icon('dice', { size: 14 })} Send request</button>
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

export function modalView() {
  // The backdrop closes on its own clicks only — see the 'modal-backdrop'
  // handler. It must NOT stopPropagation, or every button inside would die.
  return `<div class="modal-bg" data-act="modal-backdrop">
    <div class="modal">
      <button class="modal-x" data-act="close-modal" aria-label="Close">${icon('x', { size: 16 })}</button>
      ${modalBody(state.modal.name)}
    </div>
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
      <label class="field grow"><span>Species</span>
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
      <label class="field grow"><span>Attacks / turn</span>
        <input name="attacksPerTurn" type="number" min="1" max="4" value="${c?.attacksPerTurn ?? 1}" /></label>
    </div>
    <p class="tiny" style="margin:-4px 0 12px">
      Most characters attack once a turn. Set this to 2 for Extra Attack (Fighters, Barbarians… from level 5).
    </p>

    <p class="tiny" style="margin-bottom:6px">ABILITY SCORES</p>
    <div class="row">
      ${ABILITIES.map(([k, label]) => `
        <label class="field" style="flex:1;min-width:58px"><span>${label}</span>
          <input name="${k}" type="number" min="1" max="30" value="${s[k] ?? 10}" /></label>`).join('')}
    </div>

    <p class="tiny" style="margin-bottom:6px">SPELL SLOTS — max per level (0 if none)</p>
    <div class="row">
      ${[1, 2, 3, 4, 5].map((l) => `
        <label class="field" style="flex:1;min-width:54px"><span>Lv ${l}</span>
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
    attacksPerTurn: Math.max(1, Math.min(4, num(form, 'attacksPerTurn') || 1)),
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

/** Create or edit a library item — name, value, weight, tags, effect. */
function libItemModal(item) {
  const draftImage = state.draftImage ?? item?.image ?? '';
  const tags = item?.tags || [];
  const cats = ['Weapon', 'Armor', 'Potion', 'Gear', 'Quest Item', 'Ammunition', 'Other'];

  return `
  <h2>${item ? 'Edit' : 'New'} Library Item</h2>
  <form data-act="save-lib-item" data-id="${item?.id || ''}">
    <div class="row" style="align-items:flex-start;flex-wrap:nowrap;margin-bottom:12px">
      <div class="portrait-slot">
        ${draftImage
          ? `<div class="avatar lg" style="background-image:url('${esc(draftImage)}')"></div>`
          : itemTile(item?.category || 'Gear', 62, item?.name)}
        <button type="button" class="portrait-edit" data-act="pick-lib-image" title="Add a picture">
          ${icon('edit', { size: 12 })}</button>
      </div>
      <div class="grow">
        <label class="field"><span>Name</span>
          <input name="name" data-keep="li-n" value="${esc(item?.name || '')}" required /></label>
        <label class="field"><span>Type</span>
          <select name="category">${cats.map((k) => `<option ${k === item?.category ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      </div>
    </div>

    <div class="row">
      <label class="field grow"><span>Value</span>
        <input name="value" data-keep="li-v" value="${esc(item?.value || '')}" placeholder="50 gp" /></label>
      <label class="field grow"><span>Weight (lb)</span>
        <input name="weight" type="number" step="0.1" value="${item?.weight ?? 0}" /></label>
      <label class="field grow"><span>Quantity</span>
        <input name="qty" type="number" min="1" value="${item?.qty ?? 1}" /></label>
    </div>

    <label class="field"><span>Description / notes</span>
      <textarea name="description" data-keep="li-d" style="min-height:80px">${esc(item?.description || '')}</textarea></label>

    <p class="tiny" style="margin-bottom:6px">TAGS</p>
    <div class="row" style="margin-bottom:12px">
      ${ITEM_TAGS.map((t) => `
        <label class="pill lib-tag-pick">
          <input type="checkbox" name="tag" value="${t}" ${tags.includes(t) ? 'checked' : ''} hidden />
          <span style="--tint:${TAG_TINT[t]}">${esc(t)}</span>
        </label>`).join('')}
    </div>

    <label class="row" style="margin-bottom:12px">
      <input type="checkbox" name="healing" style="width:auto" ${item?.effect?.kind === 'heal' ? 'checked' : ''} />
      <span class="muted">This heals when used</span>
      <input name="healAmount" style="width:110px" placeholder="2d4+2"
        value="${esc(item?.effect?.kind === 'heal' ? item.effect.amount : '')}" />
    </label>

    <div class="row">
      <button class="btn" type="button" data-act="close-modal">Cancel</button>
      <button class="btn primary grow" type="submit">${item ? 'Save' : 'Add to library'}</button>
    </div>
  </form>`;
}

on('pick-lib-image', async () => {
  const image = await pickImage(420);
  if (!image) return;
  state.draftImage = image;
  render();
});

on('save-lib-item', async (form) => {
  const tags = [...form.querySelectorAll('[name="tag"]:checked')].map((c) => c.value);
  const heals = form.querySelector('[name="healing"]')?.checked;
  const amount = val(form, 'healAmount').trim();
  const payload = {
    name: val(form, 'name'), category: val(form, 'category'), value: val(form, 'value'),
    weight: num(form, 'weight'), qty: num(form, 'qty'), description: val(form, 'description'),
    tags: heals && !tags.includes('Consumable') ? [...tags, 'Consumable'] : tags,
    effect: heals ? { kind: 'heal', amount: amount || '2d4+2' } : null,
  };
  if (state.draftImage !== undefined) payload.image = state.draftImage;

  if (form.dataset.id) await api('PATCH', `/api/library/${form.dataset.id}`, payload);
  else await api('POST', `/api/campaigns/${state.campaign.id}/library`, payload);

  state.draftImage = undefined;
  state.modal = null;
  render();
});

/** Copy a library item into a character's bag, or (DM) a shop's stock. */
function libGiveModal(item) {
  if (!item) return '<p class="muted">Item not found.</p>';
  const targets = isDM() ? state.characters : myChars();
  const shops = isDM() ? state.entries.filter((e) => e.kind === 'shop') : [];

  return `
  <h2>Give ${esc(item.name)}</h2>
  <p class="muted" style="margin-bottom:14px">Drop a copy into a bag${shops.length ? ' or a shop' : ''}.</p>

  ${targets.length ? `
    <p class="tiny" style="margin-bottom:6px">TO A CHARACTER</p>
    <div class="stack" style="margin-bottom:16px">
      ${targets.map((c) => `
        <button class="card spread" style="cursor:pointer;text-align:left;padding:10px"
          data-act="lib-copy" data-id="${item.id}" data-char="${c.id}">
          <div class="row">${avatar(c.name, '', c.portrait)}
            <span style="font-weight:600;font-size:13.5px">${esc(c.name)}</span></div>
          ${icon('arrowRight', { size: 15 })}
        </button>`).join('')}
    </div>` : '<p class="muted">No characters to give it to.</p>'}

  ${shops.length ? `
    <p class="tiny" style="margin-bottom:6px">ADD TO A SHOP</p>
    <div class="stack" style="margin-bottom:16px">
      ${shops.map((s) => `
        <button class="card spread" style="cursor:pointer;text-align:left;padding:10px"
          data-act="lib-copy" data-id="${item.id}" data-shop="${s.id}">
          <div class="row">${itemTile('Gear', 30)}
            <span style="font-weight:600;font-size:13.5px">${esc(s.title)}</span></div>
          ${icon('arrowRight', { size: 15 })}
        </button>`).join('')}
    </div>` : ''}

  <button class="btn wide" data-act="close-modal">Done</button>`;
}

on('lib-copy', async (el) => {
  const body = el.dataset.char ? { toCharacter: el.dataset.char } : { toShop: el.dataset.shop };
  await api('POST', `/api/library/${el.dataset.id}/copy`, body);
  toast(el.dataset.char ? 'Added to their inventory' : 'Added to the shop', 'ok');
  state.modal = null;
  render();
});

function itemModal() {
  const tab = state.itemTab || 'catalog';
  const q = (state.itemFilter || '').toLowerCase();
  // The campaign's own library first, then the built-in 5e catalogue.
  const fromLibrary = state.library.map((i) => ({
    name: i.name, category: i.category, details: i.description, price: i.value, effect: i.effect, source: 'library',
  }));
  const catalog = [...fromLibrary, ...(state.srd.itemCatalog || [])]
    .filter((i) => !q || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));

  return `
  <h2>Add Item</h2>
  <div class="row" style="margin-bottom:12px">
    <button class="pill ${tab === 'catalog' ? 'on' : ''}" data-act="item-tab" data-tab="catalog">
      ${icon('backpack', { size: 13 })} From the list</button>
    <button class="pill ${tab === 'custom' ? 'on' : ''}" data-act="item-tab" data-tab="custom">
      ${icon('plus', { size: 13 })} Custom</button>
  </div>

  ${tab === 'catalog' ? `
    <div class="search-wrap" style="margin-bottom:10px">
      ${icon('search', { size: 14 })}
      <input placeholder="Search items…" data-live="item-filter" data-keep="itq" value="${esc(state.itemFilter || '')}" />
    </div>
    <div class="stack" style="max-height:52dvh;overflow-y:auto">
      ${catalog.map((i, idx) => `
        <div class="spread" style="padding:9px 0;border-top:1px solid var(--line)">
          <div class="row" style="flex-wrap:nowrap">
            ${itemTile(i.category, 32, i.name)}
            <div>
              <div style="font-size:13px;font-weight:600">${esc(i.name)}
                ${i.source === 'library' ? '<span class="tag" style="margin-left:4px">library</span>' : ''}
                ${i.effect && i.effect.kind !== 'food' && i.effect.kind !== null
                  ? '<span class="tag" style="margin-left:4px">usable</span>' : ''}</div>
              <div class="tiny">${esc(i.details)}${i.price ? ` · ${esc(i.price)}` : ''}</div>
            </div>
          </div>
          <button class="btn sm primary" data-act="add-catalog-item" data-idx="${idx}"
            data-name="${esc(i.name)}">${icon('plus', { size: 12 })}</button>
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
  const lib = state.library.find((i) => i.name === el.dataset.name);
  const item = lib
    ? { name: lib.name, category: lib.category, details: lib.description, weight: lib.weight, effect: lib.effect }
    : (state.srd.itemCatalog || []).find((i) => i.name === el.dataset.name);
  if (!item) return;
  await api('POST', `/api/characters/${c.id}/items`, {
    name: item.name, category: item.category, details: item.details,
    weight: item.weight, qty: 1, effect: item.effect,
  });
  toast(`Added ${item.name}`, 'ok');
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
      ${icon('book', { size: 13 })} Library</button>
    <button class="pill ${tab === 'custom' ? 'on' : ''}" data-act="enemy-tab" data-tab="custom">
      ${icon('plus', { size: 13 })} Custom</button>
  </div>

  ${tab === 'library' ? `
    <div class="search-wrap" style="margin-bottom:10px">
      ${icon('search', { size: 14 })}
      <input placeholder="Search monsters…" data-live="enemy-filter" data-keep="mq" value="${esc(state.enemyFilter || '')}" />
    </div>
    <label class="row" style="margin-bottom:10px">
      <span class="muted" style="font-size:12.5px">How many of each</span>
      <input id="mcount" type="number" min="1" max="12" value="1" style="width:70px" />
    </label>
    <div class="stack">
      ${library.map((m) => `
        <div class="card" style="padding:11px">
          <div class="spread">
            <div class="grow">
              <div class="row">
                <strong style="font-size:13.5px">${esc(m.name)}</strong>
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
                title="Remove from library">${icon('trash', { size: 12 })}</button>` : ''}
              <button class="btn sm primary" data-act="add-from-library" data-name="${esc(m.name)}"
                data-saved="${m.saved ? '1' : '0'}">${icon('plus', { size: 12 })} Add</button>
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

      <p class="tiny" style="margin-bottom:6px">ATTACK — so it can actually deal damage</p>
      <div class="row">
        <label class="field grow"><span>Attack name</span><input name="atkName" placeholder="Scimitar" /></label>
        <label class="field" style="width:88px"><span>To hit</span><input name="atkToHit" type="number" value="4" /></label>
        <label class="field" style="width:108px"><span>Damage</span><input name="atkDamage" placeholder="1d6+2" /></label>
      </div>

      <p class="tiny" style="margin-bottom:4px">DROPS — one per line</p>
      <p class="tiny" style="margin-bottom:6px">
        <code>Rusty Sword = 60%</code> · <code>Arrow x2d4 = 100%</code> · <code>gold = 2d6 gp</code><br />
        Leave the % off and it always drops.
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
  toast(`Added ${count > 1 ? `${count}× ` : ''}${monster.name}`, 'ok');
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
      return `<button class="card" style="text-align:left;cursor:pointer;border-color:${has ? 'rgba(176,67,56,.5)' : 'var(--line)'}"
        data-act="toggle-cond" data-name="${esc(cond.name)}">
        <div class="spread"><strong style="font-size:13.5px">${esc(cond.name)}</strong>
          ${has ? '<span class="tag red">Active</span>' : ''}</div>
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
          <span style="--tint:${look[name].tint}">${icon(look[name].icon, { size: 12 })} ${esc(name)}</span>
        </label>`).join('')}
    </div>

    <label class="field"><span>How many turns? (blank = until removed)</span>
      <input name="turns" type="number" min="1" max="99" placeholder="e.g. 3" /></label>
    <p class="tiny" style="margin-bottom:14px">It counts down at the end of their turn and clears itself.</p>

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
            <div><div style="font-weight:600;font-size:13.5px">${esc(t.name)}</div>
            <div class="tiny">${t.hp}/${t.maxHp} HP · AC ${t.ac}</div></div>
          </div>
          ${icon('arrowRight', { size: 15 })}
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
            <span style="font-size:13px">Coins</span></div>
           <span class="tiny mono">${esc(l.formula)} ${esc(l.coin || 'gp')}</span></div>`
        : `<div class="spread"><div class="row">${itemTile(l.category || 'Gear', 30, l.name)}
            <span style="font-size:13px">${esc(l.name)}${l.qty && l.qty !== '1' ? ` ×${esc(l.qty)}` : ''}</span></div>
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
      ${icon('dice', { size: 14 })} Roll the drops</button>
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
  toast(got.length ? `Got ${got.join(', ')}` : 'Nothing dropped', got.length ? 'ok' : '');
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
    Melee uses STR ${signed(strMod)}; finesse and ranged use DEX ${signed(dexMod)}.
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
        <label class="field" style="flex:1;min-width:68px"><span>${label}</span>
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
