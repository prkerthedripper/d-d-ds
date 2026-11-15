// ============================================================================
// D&D DS — the game layer.
//
// This is not a dashboard with a dark theme. Each activity gets the whole
// screen: the world map is the map, the party screen is a character stage, the
// creator is a creator, combat is a table, and the codex is an archive.
// Existing actions, endpoints, sockets and campaign data are reused underneath.
// ============================================================================

import {
  state, api, esc, mod, signed, avatar, hpBar, nameOf, ago,
  isDM, myChars, toast, fail, on, render,
} from './core.js';
import { icon, itemTile } from './icons.js';
import { artPortrait, artSpell, artItem, BACKGROUNDS, CHARACTER_ART } from './art.js';
import { worldView, focusEntryOnMap } from './world.js';
import { aiToolsView, loadAITools } from './ai-tools.js';
import { characterCreatorView } from './creator.js';
import { rollRequestView, turnAlertView, modalView } from './views.js';

// ---------------------------------------------------------------- constants

const LOADOUT = [
  { key: 'main', label: 'Main hand', cats: ['Weapon'], icon: 'sword' },
  { key: 'off', label: 'Off hand', cats: ['Shield'], icon: 'shield' },
  { key: 'armor', label: 'Armour', cats: ['Armor'], icon: 'shield' },
  { key: 'ammo', label: 'Ammo', cats: ['Ammunition'], icon: 'arrowRight' },
  { key: 'trinket', label: 'Trinket', cats: ['Quest Item', 'Ring', 'Treasure'], icon: 'gem' },
  { key: 'pack', label: 'Pack', cats: ['Gear', 'Container', 'Other'], icon: 'backpack' },
];

const CODEX_KINDS = [
  { id: 'npc', label: 'People', one: 'person', icon: 'users', sub: 'Role', art: BACKGROUNDS.chat,
    copy: 'The faces you have met, and the ones you should avoid.' },
  { id: 'location', label: 'Places', one: 'place', icon: 'pin', sub: 'Region', art: BACKGROUNDS.home,
    copy: 'Every street, building and nowhere-place you have charted.' },
  { id: 'quest', label: 'Quests', one: 'lead', icon: 'target', sub: 'Given by', art: BACKGROUNDS.lobby,
    copy: 'Open leads, hard promises and the things waiting on you.' },
  { id: 'shop', label: 'Shops', one: 'shop', icon: 'shop', sub: 'Owner', art: BACKGROUNDS.characters,
    copy: 'Where the party can spend what it has left.' },
  { id: 'item', label: 'Items', one: 'item', icon: 'gem', sub: 'Category', art: BACKGROUNDS.inventory,
    copy: 'Objects, relics and the things the crystal has touched.' },
  { id: 'event', label: 'Timeline', one: 'event', icon: 'hourglass', sub: 'In-world date', art: BACKGROUNDS.dice,
    copy: 'What happened, in the order it happened.' },
  { id: 'journal', label: 'Journal', one: 'note', icon: 'notes', sub: 'Session', art: BACKGROUNDS.notes,
    copy: 'The table’s own notes, sealed when they need to be.' },
];

const kindOf = (id) => CODEX_KINDS.find((k) => k.id === id) || CODEX_KINDS[0];

const ABILITIES = [
  ['str', 'STR'], ['dex', 'DEX'], ['con', 'CON'],
  ['int', 'INT'], ['wis', 'WIS'], ['cha', 'CHA'],
];

// ---------------------------------------------------------------- helpers

const selectedChar = () => state.characters.find((c) => c.id === state.selectedCharId)
  || state.characters[0] || null;

function ownerLine(c) {
  const owner = state.members.find((m) => m.id === c.ownerId);
  if (!owner) return '';
  return owner.id === state.user.id ? 'You' : owner.username;
}

function portraitOfC(c) {
  return artPortrait(c);
}

function spellByName(name) {
  return (state.srd.spells || []).find((s) => s.name === name);
}

function knownSpells(c) {
  return (c?.spells || []).map((name) => spellByName(name) || { name, level: 1, school: 'evocation', description: '' });
}

function availableSpells(c) {
  const known = new Set(c?.spells || []);
  return (state.srd.spells || [])
    .filter((s) => !known.has(s.name))
    .filter((s) => !s.level || (s.classes || []).includes(c?.class))
    .sort((a, b) => (a.level || 0) - (b.level || 0) || a.name.localeCompare(b.name));
}

function slotRows(c) {
  const slots = c?.slots || {};
  return [1, 2, 3, 4, 5].map((lvl) => {
    const raw = slots[lvl] ?? slots[String(lvl)];
    const max = typeof raw === 'object' ? raw.max : raw || 0;
    const used = typeof raw === 'object' ? raw.used : 0;
    return { lvl, max, used };
  }).filter((s) => s.max > 0);
}

const combatSheet = (c) => c?.charId ? state.characters.find((x) => x.id === c.charId) : null;

function combatPortrait(c) {
  const sheet = combatSheet(c);
  if (sheet) return artPortrait(sheet);
  if (c.image) return c.image;
  return c.type === 'enemy' ? CHARACTER_ART.entity : CHARACTER_ART.fighter;
}

function conditionList(c) {
  return (c?.conditions || [])
    .map((x) => (typeof x === 'string' ? { name: x } : x))
    .filter((x) => x?.name);
}

function itemRarity(i) {
  const tags = i.tags || [];
  if (tags.includes('Quest')) return '#b49aff';
  if (tags.includes('Magic')) return '#9f8bff';
  if (tags.includes('Treasure')) return '#d6b470';
  return '#9a93a8';
}

const purseText = (coins) => ['pp', 'gp', 'sp', 'cp']
  .filter((k) => coins?.[k])
  .map((k) => `${coins[k]} ${k}`)
  .join(' · ') || '0 gp';

// ---------------------------------------------------------------- shell

export function gameShell() {
  const page = state.page;
  const isCreation = page === 'creation';
  return `
  <div class="app gs" data-scene="${isCreation ? 'party' : esc(page)}">
    <div class="scene"></div>
    ${topNav()}
    <div class="content gs-content">${gamePage()}</div>
    ${mobileTabs()}
    ${state.chatOpen ? chatDrawer() : ''}
    ${state.modal ? modalView() : ''}
    ${state.turnAlert ? turnAlertView() : ''}
    ${(state.rollRequests || []).length ? rollRequestView() : ''}
  </div>`;
}

function navActive(id) {
  const page = state.page;
  if (id === 'party') return page === 'party' || page === 'creation';
  return page === id;
}

function topNav() {
  return `
  <header class="gnav">
    <button class="gnav-brand" data-act="game-nav" data-page="world" title="D&D DS — Dripper Studios">
      <span class="gnav-mark">${icon('dragon', { size: 21, fill: true })}</span>
      <span class="gnav-name">D&amp;D <b>DS</b><em>DRIPPER STUDIOS</em></span>
    </button>

    <nav class="gnav-tabs" aria-label="Game sections">
      ${[
        ['world', 'compass', 'World'],
        ['party', 'users', 'Party'],
        ['game', 'swords', 'Game'],
        ['codex', 'book', 'Codex'],
        ...(isDM() ? [['ai', 'sparkles', 'AI Tools']] : []),
      ].map(([id, ic, label]) => `
        <button class="gnav-tab ${navActive(id) ? 'on' : ''}" data-act="game-nav" data-page="${id}">
          ${icon(ic, { size: 15 })}<span>${label}</span>
        </button>`).join('')}
    </nav>

    <div class="gnav-right">
      <button class="gnav-campaign" data-act="switch-campaign" title="Switch campaign">
        <span class="gc-dot"></span>
        <span class="gc-name">${esc(state.campaign?.name || 'Campaign')}</span>
        ${icon('chevron', { size: 13 })}
      </button>
      <span class="gnav-online" title="${state.online.length} at the table">
        ${icon('users', { size: 14 })} ${state.online.length || 1}
      </span>
      <button class="gnav-icon ${state.chatOpen ? 'on' : ''}" data-act="chat-toggle" title="Party chat">
        ${icon('chat', { size: 17 })}
        ${(state.messages || []).length ? '<i class="gnav-unread"></i>' : ''}
      </button>
      <button class="gnav-icon" data-act="game-nav" data-page="settings" title="Settings">
        ${icon('settings', { size: 17 })}
      </button>
      <button class="gnav-user" data-act="game-nav" data-page="settings" title="Your account">
        ${avatar(state.user?.username || '?', 'sm')}
      </button>
    </div>
  </header>`;
}

function mobileTabs() {
  return `
  <nav class="gmobile" aria-label="Game sections">
    ${[
      ['world', 'compass', 'World'],
      ['party', 'users', 'Party'],
      ['game', 'swords', 'Game'],
      ['codex', 'book', 'Codex'],
      ...(isDM() ? [['ai', 'sparkles', 'AI']] : []),
    ].map(([id, ic, label]) => `
      <button class="gm-tab ${navActive(id) ? 'on' : ''}" data-act="game-nav" data-page="${id}">
        ${icon(ic, { size: 19 })}<span>${label}</span>
      </button>`).join('')}
    <button class="gm-tab" data-act="game-nav" data-page="settings">
      ${icon('settings', { size: 19 })}<span>More</span>
    </button>
  </nav>`;
}

function gamePage() {
  const page = state.page;
  if (page === 'creation') return characterCreatorView();
  if (page === 'party') return partyView();
  if (page === 'game') return gameView();
  if (page === 'codex') return codexView();
  if (page === 'ai') return aiToolsView();
  if (page === 'settings') return settingsView();
  return worldView();
}

// ============================================================================
// CHARACTER CREATION
// ============================================================================

// ============================================================================
// PARTY
// ============================================================================

function partyView() {
  const c = selectedChar();
  if (!c) {
    return `
    <div class="party-empty">
      <div class="pe-bg" style="background-image:url('${BACKGROUNDS.characters}')"></div>
      <div class="pe-shade"></div>
      <div class="pe-inner">
        <div class="eyebrow">NO HERO YET</div>
        <h1>The table is waiting for you.</h1>
        <p>A character is a class, a species and a background — then a name.
          It takes about a minute, and you can change everything later.</p>
        <button class="btn create-hero" data-act="creation-open">${icon('plus', { size: 15 })} Create your character</button>
        ${myChars().length ? '<p class="tiny">You already have a hero in another campaign. This one is blank.</p>' : ''}
      </div>
    </div>`;
  }

  return `
  <div class="party-screen">
    ${partyRoster(c)}
    ${partyStage(c)}
    <aside class="party-panel">
      <div class="pp-tabs">
        ${[
          ['overview', 'shield', 'Overview'],
          ['inventory', 'backpack', 'Inventory'],
          ['powers', 'sparkles', 'Powers'],
        ].map(([id, ic, label]) => `
          <button class="pp-tab ${state.partyTab === id ? 'on' : ''}" data-act="party-tab" data-tab="${id}">
            ${icon(ic, { size: 14 })}<span>${label}</span>
          </button>`).join('')}
      </div>
      <div class="pp-body">
        ${state.partyTab === 'inventory' ? partyInventory(c)
          : state.partyTab === 'powers' ? partyPowers(c)
          : partyOverview(c)}
      </div>
    </aside>
  </div>`;
}

function partyRoster(active) {
  return `
  <aside class="party-roster">
    <div class="pr-title">
      <span>PARTY</span>
      <b>${String(state.characters.length).padStart(2, '0')}</b>
    </div>
    <div class="pr-list">
      ${state.characters.map((c) => {
        const mine = c.ownerId === state.user.id;
        return `
        <button class="pr-card ${c.id === active.id ? 'on' : ''}" data-act="select-char" data-id="${c.id}"
          title="${esc(c.name)} — level ${c.level} ${esc(c.class)}">
          <span class="pr-art" style="background-image:url('${esc(portraitOfC(c))}')"></span>
          <span class="pr-veil"></span>
          ${mine ? '<span class="pr-you">YOURS</span>' : ''}
          <span class="pr-lvl">${c.level}</span>
          <span class="pr-name">${esc(c.name)}</span>
          <span class="pr-hp">${hpBar(c.hp, c.maxHp)}</span>
        </button>`;
      }).join('')}
    </div>
    <button class="pr-new" data-act="creation-open" title="Create a character">
      ${icon('plus', { size: 20 })}<span>New hero</span>
    </button>
  </aside>`;
}

function partyStage(c) {
  const mine = c.ownerId === state.user.id;
  const owner = ownerLine(c);
  const conditions = conditionList(c);
  const activeTurn = state.combat.active
    && state.combat.combatants[state.combat.turnIndex % Math.max(1, state.combat.combatants.length)]?.charId === c.id;

  return `
  <section class="party-stage">
    <div class="ps-art" style="background-image:url('${esc(portraitOfC(c))}')"></div>
    <div class="ps-veil"></div>
    <div class="ps-grain"></div>

    <header class="ps-top">
      <span class="ps-kicker">${activeTurn ? 'IN THE FIGHT' : 'ACTIVE HERO'}</span>
      <span class="ps-owner">${owner ? `Played by ${esc(owner)}` : 'Unassigned'}</span>
    </header>

    <div class="ps-identity">
      <div class="eyebrow">LEVEL ${c.level} · ${esc(c.class || 'UNKNOWN')}</div>
      <h1>${esc(c.name)}</h1>
      <p>${esc(c.background || c.race || 'Origin unknown')}${c.race && c.background ? ` · ${esc(c.race)}` : ''}</p>
      ${conditions.length ? `<div class="ps-cond">${conditions.map((x) => `<span>${esc(x.name)}</span>`).join('')}</div>` : ''}
    </div>

    <div class="ps-vitals">
      <div class="ps-hp">
        <div class="ps-hp-top">
          <span>${icon('heart', { size: 14 })} HIT POINTS</span>
          <b>${c.hp}<em>/ ${c.maxHp}</em></b>
        </div>
        ${hpBar(c.hp, c.maxHp)}
        ${mine ? `<div class="ps-hp-btns">
          <button data-act="hp" data-id="${c.id}" data-d="-5" title="Take 5 damage">−5</button>
          <button data-act="hp" data-id="${c.id}" data-d="-1" title="Take 1 damage">−1</button>
          <button data-act="hp" data-id="${c.id}" data-d="1" title="Heal 1">+1</button>
          <button data-act="hp" data-id="${c.id}" data-d="5" title="Heal 5">+5</button>
        </div>` : ''}
      </div>
      <div class="ps-stat"><span>${icon('shield', { size: 13 })} AC</span><b>${c.ac}</b></div>
      <div class="ps-stat"><span>${icon('dice', { size: 13 })} INIT</span><b>${signed(c.initBonus || 0)}</b></div>
      <div class="ps-stat"><span>${icon('compass', { size: 13 })} SPEED</span><b>${c.speed || 30}<em>ft</em></b></div>
    </div>

    <div class="ps-actions">
      ${mine || isDM() ? `
        <button class="ps-btn" data-act="modal" data-name="edit-char" data-id="${c.id}">
          ${icon('edit', { size: 14 })} Edit sheet</button>
        <button class="ps-btn" data-act="modal" data-name="adjust-hp" data-id="${c.id}">
          ${icon('heart', { size: 14 })} Adjust HP</button>
        <button class="ps-btn" data-act="long-rest" data-id="${c.id}">
          ${icon('bed', { size: 14 })} Long rest</button>
      ` : '<span class="ps-readonly">Only the owner or the DM can change this hero.</span>'}
      ${mine || isDM() ? `
        <button class="ps-btn danger" data-act="delete-char" data-id="${c.id}">
          ${icon('trash', { size: 13 })}</button>` : ''}
    </div>

    <div class="ps-corner">
      <span>${esc(state.campaign?.name || '')}</span>
      <span>${state.campaign?.sessionTitle ? esc(state.campaign.sessionTitle) : 'The story continues'}</span>
    </div>
  </section>`;
}

function partyOverview(c) {
  const mine = c.ownerId === state.user.id || isDM();
  const attacks = c.attacks || [];
  const conditions = conditionList(c);
  const weight = (c.items || []).reduce((s, i) => s + (i.weight || 0) * (i.qty || 1), 0);

  return `
  <div class="pp-section">
    <div class="pp-section-head">
      <span>ABILITY SCORES</span>
      <button class="pp-mini" data-act="modal" data-name="edit-char" data-id="${c.id}" title="Edit scores">
        ${icon('edit', { size: 12 })}</button>
    </div>
    <div class="ability-grid">
      ${ABILITIES.map(([k, label]) => `
        <button class="ability" data-act="roll-quick" data-formula="d20${signed(mod(c.stats?.[k]))}"
          data-label="${label} check">
          <span>${label}</span>
          <b>${c.stats?.[k] ?? 10}</b>
          <em>${signed(mod(c.stats?.[k]))}</em>
        </button>`).join('')}
    </div>

    <div class="pp-section-head" style="margin-top:22px">
      <span>ATTACKS</span>
      ${mine ? `<button class="pp-mini" data-act="modal" data-name="new-attack" title="Add an attack">
        ${icon('plus', { size: 12 })}</button>` : ''}
    </div>
    <div class="attack-list">
      ${attacks.length ? attacks.map((a) => `
        <button class="attack-row" data-act="roll-quick" data-formula="d20${signed(a.toHit)}"
          data-label="${esc(a.name)}">
          <span class="at-ic">${icon('sword', { size: 15 })}</span>
          <span class="at-name"><b>${esc(a.name)}</b><em>${esc(a.damage || '')}</em></span>
          <span class="at-hit">${signed(a.toHit)}</span>
        </button>`).join('')
      : `<div class="pp-empty-row">No attacks recorded yet.</div>`}
    </div>

    <div class="pp-section-head" style="margin-top:22px">
      <span>CONDITIONS &amp; KIT</span>
      ${mine ? `<button class="pp-mini" data-act="modal" data-name="add-cond" data-id="${c.id}" title="Add condition">
        ${icon('plus', { size: 12 })}</button>` : ''}
    </div>
    <div class="condition-wrap">
      ${conditions.length ? conditions.map((x) => `<span class="cond-chip">${esc(x.name)}</span>`).join('')
      : '<span class="pp-empty">Steady.</span>'}
    </div>

    <div class="purse-row">
      <div><span>${icon('coin', { size: 14 })} PURSE</span><b>${esc(purseText(c.coins))}</b></div>
      <div><span>${icon('backpack', { size: 14 })} LOAD</span><b>${weight.toFixed(1)} lb</b></div>
    </div>

    ${c.notes ? `<div class="pp-notes"><span>NOTES</span><p>${esc(c.notes)}</p></div>` : ''}
  </div>`;
}

function partyInventory(c) {
  const mine = c.ownerId === state.user.id || isDM();
  const items = c.items || [];
  const sel = items.find((i) => i.id === state.selectedItemId) || null;
  const equipped = new Set(items.filter((i) => i.equipped).map((i) => i.id));

  return `
  <div class="pp-section inv-panel">
    <div class="inv-doll">
      <div class="inv-figure" style="background-image:url('${esc(portraitOfC(c))}')"></div>
      <div class="inv-slots">
        ${LOADOUT.map((slot) => {
          const item = items.find((i) => i.equipped && slot.cats.includes(i.category));
          return `
          <button class="eq-slot ${item ? 'filled' : ''}" data-act="${item ? 'inspect-item' : (mine ? 'modal' : 'none')}"
            ${item ? `data-id="${item.id}"` : (mine ? 'data-name="new-item"' : 'disabled')}
            title="${item ? esc(item.name) : slot.label}">
            ${item ? itemTile(item.category, 30, item.name) : icon(slot.icon, { size: 17 })}
            <span>${esc(item ? item.name : slot.label)}</span>
          </button>`;
        }).join('')}
      </div>
    </div>

    <div class="inv-bar">
      <span>${items.length} CARRIED · ${items.reduce((s, i) => s + (i.weight || 0) * (i.qty || 1), 0).toFixed(1)} LB</span>
      ${mine ? `<button class="pp-mini" data-act="modal" data-name="new-item">${icon('plus', { size: 12 })} Add</button>` : ''}
    </div>

    <div class="inv-grid">
      ${items.length ? items.map((i) => `
        <button class="bag-item ${sel?.id === i.id ? 'on' : ''} ${equipped.has(i.id) ? 'worn' : ''}"
          data-act="inspect-item" data-id="${i.id}" style="--rarity:${itemRarity(i)}" title="${esc(i.name)}">
          ${i.qty > 1 ? `<span class="bag-qty">×${i.qty}</span>` : ''}
          ${itemTile(i.category, 38, i.name)}
          <span>${esc(i.name)}</span>
        </button>`).join('')
      : `<div class="pp-empty-row" style="grid-column:1/-1">
          Nothing carried yet.${mine ? ' Add something from the world.' : ''}</div>`}
    </div>

    ${sel ? inventoryInspector(sel, c, mine) : `<div class="inv-hint">Select an item to inspect it.</div>`}
  </div>`;
}

function inventoryInspector(i, c, mine) {
  const usable = i.effect && i.effect.kind !== null && i.effect !== undefined;
  return `
  <div class="inv-inspect">
    <div class="ii-head">
      <div class="ii-art" style="background-image:url('${esc(i.image || artItem(i.name, i.category))}')"></div>
      <div class="ii-title">
        <span>${esc(i.category)}</span>
        <b>${esc(i.name)}</b>
        <em>${esc(i.value || '—')}${i.weight ? ` · ${i.weight} lb` : ''}</em>
      </div>
      <button class="ii-x" data-act="inspect-item" data-id="${i.id}" title="Close">${icon('x', { size: 14 })}</button>
    </div>
    <p>${esc(i.details || i.description || 'No description recorded.')}</p>
    <div class="ii-actions">
      <button class="btn sm ${i.equipped ? 'primary' : ''}" data-act="toggle-equip" data-id="${i.id}">
        ${icon('shield', { size: 12 })} ${i.equipped ? 'Unequip' : 'Equip'}</button>
      ${usable ? `<button class="btn sm primary" data-act="use-item" data-id="${i.id}">
        ${icon('potion', { size: 12 })} Use</button>` : ''}
      ${mine ? `
        <button class="btn sm" data-act="item-qty" data-id="${i.id}" data-d="-1">−</button>
        <button class="btn sm" data-act="item-qty" data-id="${i.id}" data-d="1">+</button>
        <button class="btn sm danger" data-act="item-del" data-id="${i.id}">${icon('trash', { size: 12 })}</button>` : ''}
    </div>
  </div>`;
}

function partyPowers(c) {
  const known = knownSpells(c);
  const slots = slotRows(c);
  const options = availableSpells(c);

  return `
  <div class="pp-section">
    <div class="pp-section-head">
      <span>POWERS</span>
      <span class="pp-count">${known.length}</span>
    </div>

    ${slots.length ? `
      <div class="slot-strip">
        ${slots.map((s) => `
          <div class="slot-box">
            <span>LV ${s.lvl}</span>
            <div class="slot-pips">
              ${Array.from({ length: s.max }, (_, i) => `<i class="${i < s.used ? 'spent' : ''}"></i>`).join('')}
            </div>
            <div class="slot-btns">
              <button data-act="slot" data-id="${c.id}" data-lvl="${s.lvl}" data-d="-1">−</button>
              <button data-act="slot" data-id="${c.id}" data-lvl="${s.lvl}" data-d="1">+</button>
            </div>
          </div>`).join('')}
      </div>` : '<div class="pp-empty-row">No spell slots — this hero runs on nerve and steel.</div>'}

    <div class="power-list">
      ${known.length ? known.map((s) => `
        <div class="power-row">
          <div class="pw-art" style="background-image:url('${esc(artSpell(s.school))}')"></div>
          <div class="pw-text">
            <div class="pw-top">
              <b>${esc(s.name)}</b>
              <span>${s.level ? `LV ${s.level}` : 'CANTRIP'} · ${esc(s.school || '')}</span>
            </div>
            ${s.description ? `<p>${esc(String(s.description).slice(0, 150))}${String(s.description).length > 150 ? '…' : ''}</p>` : ''}
          </div>
          <button class="pw-x" data-act="spell-remove" data-id="${c.id}" data-name="${esc(s.name)}"
            title="Forget power">${icon('x', { size: 12 })}</button>
        </div>`).join('')
      : `<div class="pp-empty-row">No powers learned yet. Add one below, or discover them in play.</div>`}
    </div>

    ${(c.ownerId === state.user.id || isDM()) && options.length ? `
      <form class="power-add" data-act="spell-add" data-id="${c.id}">
        <label><span>LEARN A POWER</span>
          <select name="spell">
            ${options.slice(0, 120).map((s) => `<option value="${esc(s.name)}">${esc(s.name)} · ${s.level ? `Lv ${s.level}` : 'cantrip'}</option>`).join('')}
          </select>
        </label>
        <button class="btn primary" type="submit">${icon('plus', { size: 13 })} Learn</button>
      </form>` : ''}
    <p class="pp-note">Powers are shared with the DM and usable from your turn in combat.</p>
  </div>`;
}

// ============================================================================
// GAME / COMBAT
// ============================================================================

function gameView() {
  const { active, round, combatants, turnIndex, name } = state.combat;
  const running = active && combatants.length > 0;
  const activeC = running ? combatants[turnIndex % combatants.length] : null;

  return `
  <div class="game-screen">
    <section class="game-stage">
      <div class="game-bg" style="background-image:url('${running ? BACKGROUNDS.combat : BACKGROUNDS.home}')"></div>
      <div class="game-shade"></div>
      <div class="game-grain"></div>

      <header class="game-head">
        <div class="game-head-title">
          <div class="eyebrow">${running ? 'THE FIELD' : 'THE TABLE'}</div>
          <h1>${esc(running ? (name || 'Encounter') : (state.campaign?.name || 'The story continues'))}</h1>
          <p>${running
            ? `Round ${round} · ${combatants.filter((c) => c.hp > 0).length} of ${combatants.length} standing`
            : (state.campaign?.sessionTitle || 'No encounter running. The city is quiet, for now.')}</p>
        </div>
        <div class="game-head-actions">
          ${isDM() ? `
            <button class="ghost-btn" data-act="modal" data-name="request-roll">${icon('target', { size: 13 })} Request roll</button>
            ${running ? `
              <button class="ghost-btn" data-act="modal" data-name="add-enemy">${icon('skull', { size: 13 })} Enemy</button>
              <button class="ghost-btn" data-act="add-party">${icon('users', { size: 13 })} Party</button>
              <button class="ghost-btn" data-act="end-combat">End</button>
            ` : `<button class="btn primary sm" data-act="start-combat">${icon('swords', { size: 13 })} Begin encounter</button>`}
          ` : ''}
        </div>
      </header>

      ${running ? combatStage(activeC) : gameLobby()}

      <footer class="game-party">
        <span class="gp-label">PARTY</span>
        ${state.characters.map((c) => {
          const inFight = combatants.find((x) => x.charId === c.id);
          return `<button class="gp-card ${inFight?.id === activeC?.id ? 'turn' : ''}" data-act="select-char" data-id="${c.id}">
            <span class="gp-art" style="background-image:url('${esc(portraitOfC(c))}')"></span>
            <span class="gp-meta"><b>${esc(c.name)}</b><em>${c.hp}/${c.maxHp}</em></span>
            ${hpBar(c.hp, c.maxHp)}
          </button>`;
        }).join('')}
        <button class="gp-new" data-act="creation-open" title="New hero">${icon('plus', { size: 18 })}</button>
      </footer>
    </section>

    <aside class="game-side">
      ${diceTray()}
      ${battleLedger()}
      <button class="game-comms" data-act="chat-toggle">
        ${icon('chat', { size: 15 })}
        <span>Party comms</span>
        <b>${(state.messages || []).length}</b>
      </button>
    </aside>
  </div>`;
}

function gameLobby() {
  return `
  <div class="game-lobby">
    <div class="gl-mark">${icon('swords', { size: 34 })}</div>
    <div class="eyebrow">NO ACTIVE ENCOUNTER</div>
    <h2>The table is ready.</h2>
    <p>Start a fight when the story turns. The world stays open while you talk,
      plan, and argue about who is going through the door first.</p>
    <div class="gl-actions">
      ${isDM() ? `
        <button class="btn primary" data-act="start-combat">${icon('swords', { size: 14 })} Begin an encounter</button>
        <button class="btn" data-act="add-party">${icon('users', { size: 14 })} Seat the party</button>
      ` : '<span class="gl-wait">Your DM will call the table when it is time.</span>'}
      <button class="btn" data-act="game-nav" data-page="world">${icon('compass', { size: 14 })} Back to the world</button>
    </div>
  </div>`;
}

function combatStage(activeC) {
  const { combatants, turnIndex, round } = state.combat;
  const sheet = combatSheet(activeC);
  const mine = sheet && sheet.ownerId === state.user.id;
  const dm = isDM();
  const canAct = dm || mine;
  const attacks = sheet?.attacks?.length ? sheet.attacks : (activeC?.attacks || []);
  const targeting = !!state.attackFrom;

  return `
  <div class="combat-stage">
    <div class="initiative-rail">
      <div class="ir-head"><span>INITIATIVE</span><b>R${round}</b></div>
      ${combatants.map((c, i) => {
        const cSheet = combatSheet(c);
        const current = i === turnIndex % Math.max(1, combatants.length);
        const cMine = cSheet && cSheet.ownerId === state.user.id;
        return `
        <div class="init-card ${current ? 'on' : ''} ${c.hp <= 0 ? 'down' : ''} ${targeting && state.attackFrom !== c.id ? 'target' : ''}"
          ${targeting && state.attackFrom !== c.id ? `data-act="pick-target" data-id="${c.id}"` : ''}>
          <span class="ic-init">${c.init ?? '—'}</span>
          <span class="ic-art" style="background-image:url('${esc(combatPortrait(c))}')"></span>
          <span class="ic-body">
            <b>${esc(c.name)} ${c.type === 'enemy' ? icon('skull', { size: 10 }) : ''}</b>
            <span class="ic-hp">${c.hp}/${c.maxHp} HP · AC ${c.ac}</span>
            ${hpBar(c.hp, c.maxHp)}
          </span>
          ${current ? `<span class="ic-now">${cMine ? 'YOUR TURN' : 'TURN'}</span>` : ''}
          ${dm ? `<span class="ic-dm">
            <button data-act="c-hp" data-i="${i}" data-d="-1" title="Damage">−</button>
            <button data-act="c-hp" data-i="${i}" data-d="1" title="Heal">+</button>
          </span>` : ''}
        </div>`;
      }).join('')}
      ${dm ? `<div class="ir-tools">
        <button data-act="modal" data-name="add-enemy">${icon('plus', { size: 12 })} Enemy</button>
        <button data-act="roll-initiative-all">${icon('dice', { size: 12 })} Initiative</button>
      </div>` : ''}
    </div>

    <div class="combat-focus">
      <div class="cf-art-wrap">
        <div class="cf-art" style="background-image:url('${esc(combatPortrait(activeC))}')"></div>
        <div class="cf-art-veil"></div>
        <div class="cf-turn-tag">ROUND ${round} · CURRENT TURN</div>
        ${activeC?.type === 'enemy' ? `<div class="cf-enemy">${icon('skull', { size: 12 })} HOSTILE</div>` : ''}
      </div>
      <div class="cf-info">
        <div class="eyebrow">${activeC?.type === 'enemy' ? 'ENEMY' : 'ACTIVE COMBATANT'}</div>
        <h2>${esc(activeC?.name || '—')}</h2>
        <div class="cf-sub">${activeC?.sub ? esc(activeC.sub) : activeC?.type === 'enemy' ? 'Hostile' : 'Adventurer'}</div>

        <div class="cf-hp">
          <div><span>${icon('heart', { size: 13 })} HP</span><b>${activeC?.hp ?? 0}<em>/${activeC?.maxHp ?? 0}</em></b></div>
          ${hpBar(activeC?.hp || 0, activeC?.maxHp || 1)}
        </div>

        ${conditionList(activeC).length ? `<div class="cf-cond">
          ${conditionList(activeC).map((x) => `<span>${esc(x.name)}</span>`).join('')}
        </div>` : ''}

        <div class="cf-actions">
          ${!activeC?.init && canAct ? `<button class="cf-btn primary" data-act="roll-init-one" data-id="${activeC.id}">
            ${icon('dice', { size: 13 })} Roll initiative</button>` : ''}
          ${mine ? `<button class="cf-btn primary" data-act="open-turn">${icon('swords', { size: 13 })} Take my turn</button>` : ''}
          ${dm ? `
            <button class="cf-btn" data-act="open-turn">${icon('target', { size: 13 })} Open turn menu</button>
            <button class="cf-btn" data-act="next-turn">Next turn ${icon('arrowRight', { size: 12 })}</button>
            <button class="cf-btn" data-act="skip-turn">Skip</button>` : ''}
          ${canAct && attacks.length && activeC?.hp > 0 && activeC?.init !== null && activeC?.init !== undefined ? `
            <div class="cf-attacks">
              ${attacks.map((a, ai) => `
                <button class="cf-atk" data-act="begin-attack" data-id="${activeC.id}" data-index="${ai}">
                  ${icon('sword', { size: 12 })} <b>${esc(a.name)}</b>
                  <span>${signed(a.toHit)} · ${esc(a.damage)}</span>
                </button>`).join('')}
            </div>` : ''}
        </div>

        <p class="cf-hint">${targeting
          ? 'Choose a target from the initiative order.'
          : mine
            ? 'This is your turn. Open the turn menu for actions, or strike directly above.'
            : dm
              ? 'You can act for any combatant. The turn menu has the full action list.'
              : `Waiting for ${esc(combatSheet(activeC) ? nameOf(combatSheet(activeC).ownerId) : activeC?.name || 'the table')}…`}</p>
      </div>
    </div>
  </div>`;
}

function diceTray() {
  const last = state.rolls[0];
  const mode = state.rollMode || 'normal';
  const formula = state.formula || 'd20';
  return `
  <div class="dice-tray">
    <div class="dt-head"><span>DICE</span><em>${mode.toUpperCase()}</em></div>
    ${last ? `
      <div class="dt-last">
        <b>${last.total}</b>
        <span>${esc(last.label || last.formula)}<em>${esc(nameOf(last.userId))} · ${ago(last.createdAt)}</em></span>
      </div>` : `
      <div class="dt-last empty"><b>—</b><span>The bones are quiet.<em>Roll something.</em></span></div>`}

    <div class="dt-dice">
      ${['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'].map((d) => `
        <button class="dt-die ${formula === d ? 'on' : ''}" data-act="game-die" data-f="${d}">${d.slice(1)}</button>`).join('')}
    </div>

    <div class="dt-mode">
      ${['advantage', 'normal', 'disadvantage'].map((m) => `
        <button class="${mode === m ? 'on' : ''}" data-act="roll-mode" data-mode="${m}">${m === 'advantage' ? 'ADV' : m === 'disadvantage' ? 'DIS' : 'FLAT'}</button>`).join('')}
    </div>

    <form class="dt-form" data-act="do-roll">
      <input name="formula" data-live="formula-live" class="mono" value="${esc(formula)}" aria-label="Dice formula" />
      <button type="submit" title="Roll">${icon('dice', { size: 16 })}</button>
    </form>
    <p class="dt-hint">Every roll is shared with the table.</p>
  </div>`;
}

function battleLedger() {
  const lines = (state.messages || []).slice(-6).reverse();
  return `
  <div class="battle-ledger">
    <div class="bl-head"><span>THE TABLE</span><button data-act="chat-toggle">${icon('chat', { size: 12 })} Open</button></div>
    ${lines.length ? lines.map((m) => `
      <div class="bl-line">
        <b>${esc(nameOf(m.userId))}</b>
        <span>${esc(m.body)}</span>
        <em>${ago(m.createdAt)}</em>
      </div>`).join('')
    : `<div class="bl-empty">Nothing said yet. The silence before the first roll.</div>`}
  </div>`;
}

// ============================================================================
// CODEX
// ============================================================================

function codexView() {
  const kind = kindOf(state.codexKind || 'npc');
  const q = (state.filter || '').toLowerCase().trim();
  const isJournal = kind.id === 'journal';

  let entries = isJournal ? [] : (state.entries || []).filter((e) => e.kind === kind.id);
  if (q) entries = entries.filter((e) => `${e.title} ${e.subtitle || ''} ${e.body || ''}`.toLowerCase().includes(q));
  if (kind.id === 'event') entries = [...entries].reverse();

  let notes = isJournal ? (state.notes || []) : [];
  if (q) notes = notes.filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(q));

  const selected = !isJournal
    ? (state.entries || []).find((e) => e.id === state.codexSelected)
    : null;

  return `
  <div class="codex-screen">
    <aside class="codex-rail">
      <div class="cr-title">CODEX</div>
      <div class="cr-sub">THE KNOWN WORLD</div>
      <div class="cr-list">
        ${CODEX_KINDS.map((k) => {
          const count = k.id === 'journal' ? (state.notes || []).length
            : (state.entries || []).filter((e) => e.kind === k.id).length;
          return `<button class="cr-item ${kind.id === k.id ? 'on' : ''}" data-act="codex-kind" data-kind="${k.id}">
            ${icon(k.icon, { size: 15 })}
            <span>${k.label}</span>
            <b>${count}</b>
          </button>`;
        }).join('')}
      </div>
      <div class="cr-foot">
        <button data-act="codex-new">${icon('plus', { size: 13 })} New ${kind.one}</button>
        <button data-act="game-nav" data-page="world">${icon('compass', { size: 13 })} World map</button>
      </div>
    </aside>

    <main class="codex-main">
      <header class="codex-head">
        <div>
          <div class="eyebrow">ARCHIVE / ${kind.label.toUpperCase()}</div>
          <h1>${kind.label}</h1>
          <p>${kind.copy}</p>
        </div>
        <button class="btn primary" data-act="codex-new">${icon('plus', { size: 14 })} New ${kind.one}</button>
      </header>

      <div class="codex-search">
        ${icon('search', { size: 15 })}
        <input placeholder="Search ${kind.label.toLowerCase()}…" data-live="codex-search" data-keep="codex-q"
          value="${esc(state.filter || '')}" />
        <span>${isJournal ? notes.length : entries.length} recorded</span>
      </div>

      ${isJournal ? journalGrid(notes) : `
        <div class="codex-grid">
          ${entries.length ? entries.map((e) => codexCard(e, kind, selected?.id === e.id)).join('')
          : `<div class="codex-empty">
              ${icon(kind.icon, { size: 26 })}
              <p>${q ? 'Nothing matches that search.' : `No ${kind.label.toLowerCase()} recorded yet.`}</p>
              ${!q ? `<button class="btn sm primary" data-act="codex-new">${icon('plus', { size: 12 })} Add the first one</button>` : ''}
            </div>`}
        </div>`}
    </main>

    <aside class="codex-detail ${selected ? 'open' : ''}">
      ${selected ? codexDetail(selected, kind) : codexIntro(kind)}
    </aside>
  </div>`;
}

function codexCard(e, kind, on) {
  const art = e.image || kind.art;
  return `
  <button class="codex-card ${on ? 'on' : ''}" data-act="codex-select" data-id="${e.id}">
    <span class="cc-art" style="background-image:url('${esc(art)}')"></span>
    <span class="cc-shade"></span>
    <span class="cc-top">
      <span class="cc-kind">${icon(kind.icon, { size: 11 })} ${esc(kind.label.replace(/s$/, ''))}</span>
      ${e.dmOnly ? '<span class="cc-dm">DM</span>' : ''}
    </span>
    <span class="cc-body">
      <b>${esc(e.title)}</b>
      ${e.subtitle ? `<em>${esc(e.subtitle)}</em>` : ''}
      ${e.body ? `<span>${esc(String(e.body).slice(0, 96))}${String(e.body).length > 96 ? '…' : ''}</span>` : ''}
    </span>
    ${e.status ? `<span class="cc-status">${esc(e.status)}</span>` : ''}
  </button>`;
}

function journalGrid(notes) {
  if (!notes.length) {
    return `<div class="codex-empty">
      ${icon('notes', { size: 26 })}
      <p>The journal is empty.</p>
      <button class="btn sm primary" data-act="codex-new">${icon('plus', { size: 12 })} Write the first note</button>
    </div>`;
  }
  return `
  <div class="journal-grid">
    ${notes.map((n) => `
      <article class="journal-note">
        <header>
          <div>
            <b>${esc(n.title)}</b>
            <span>${esc(nameOf(n.authorId))} · ${ago(n.updatedAt)}</span>
          </div>
          ${n.dmOnly ? '<em>DM ONLY</em>' : ''}
        </header>
        <p>${esc(n.body)}</p>
        ${n.authorId === state.user.id || isDM() ? `<footer>
          <button data-act="modal" data-name="edit-note" data-id="${n.id}">${icon('edit', { size: 11 })} Edit</button>
          <button data-act="note-del" data-id="${n.id}">${icon('trash', { size: 11 })}</button>
        </footer>` : ''}
      </article>`).join('')}
  </div>`;
}

function codexIntro(kind) {
  const count = (state.entries || []).filter((e) => e.kind === kind.id).length;
  return `
  <div class="cd-intro">
    <div class="cd-art" style="background-image:url('${esc(kind.art)}')"></div>
    <div class="cd-veil"></div>
    <div class="cd-intro-text">
      <div class="eyebrow">${kind.label.toUpperCase()}</div>
      <h2>${kind.copy}</h2>
      <p>Select an entry to read the full record.</p>
      <div class="cd-count"><b>${count}</b><span>recorded</span></div>
    </div>
  </div>`;
}

function codexDetail(e, kind) {
  const mine = e.authorId === state.user.id || isDM();
  const placed = (state.maps || []).some((m) => (m.tiles || []).some((t) => t.entryId === e.id));
  const stock = e.kind === 'shop' ? (e.data?.stock || []) : [];
  const buyers = isDM() ? state.characters : myChars();
  const buyer = buyers.find((c) => c.id === state.shopBuyerId) || buyers[0];

  return `
  <div class="cd-scroll">
    <div class="cd-hero">
      <div class="cd-art" style="background-image:url('${esc(e.image || kind.art)}')"></div>
      <div class="cd-veil"></div>
      <button class="cd-x" data-act="codex-close" title="Close">${icon('x', { size: 15 })}</button>
      <div class="cd-tags">
        <span>${icon(kind.icon, { size: 11 })} ${esc(kind.label.replace(/s$/, ''))}</span>
        ${e.status ? `<span class="status">${esc(e.status)}</span>` : ''}
        ${e.dmOnly ? '<span class="dm">DM ONLY</span>' : ''}
      </div>
      <h2>${esc(e.title)}</h2>
      ${e.subtitle ? `<p>${esc(e.subtitle)}</p>` : ''}
    </div>

    <div class="cd-body">
      ${e.body ? `<div class="cd-copy">${esc(e.body).replace(/\n/g, '<br />')}</div>` : '<p class="muted">No details recorded.</p>'}

      ${stock.length ? `
        <div class="cd-stock">
          <div class="cd-stock-head"><span>STOCK</span>${buyer ? `<em>${esc(buyer.name)} · ${esc(purseText(buyer.coins))}</em>` : ''}</div>
          ${stock.map((s, i) => `
            <div class="stock-line">
              ${itemTile(s.category || 'Gear', 30, s.name)}
              <div><b>${esc(s.name)}</b><span>${esc(s.price || 'free')}</span></div>
              ${buyer ? `<button data-act="buy-item" data-entry="${e.id}" data-index="${i}" data-char="${buyer.id}">Buy</button>` : ''}
            </div>`).join('')}
        </div>` : ''}
    </div>

    <footer class="cd-actions">
      ${placed ? `<button data-act="open-entry-map" data-id="${e.id}">${icon('pin', { size: 13 })} Show on map</button>` : ''}
      ${mine ? `
        <button data-act="modal" data-name="edit-entry" data-id="${e.id}">${icon('edit', { size: 13 })} Edit</button>
        <button class="danger" data-act="entry-del" data-id="${e.id}">${icon('trash', { size: 13 })} Delete</button>` : ''}
    </footer>
  </div>`;
}

// ============================================================================
// SETTINGS
// ============================================================================

function settingsView() {
  const tab = state.settingsTab || 'campaign';
  const dm = isDM();
  const tabs = [
    ['campaign', 'book', 'Campaign'],
    ['company', 'users', 'Company'],
    ['table', 'swords', 'At the table'],
    ['account', 'crown', 'Account'],
  ];

  return `
  <div class="settings-screen">
    <aside class="settings-menu">
      <div class="sm-title">SETTINGS</div>
      <div class="sm-sub">${esc(state.campaign?.name || '')}</div>
      <div class="sm-list">
        ${tabs.map(([id, ic, label]) => `
          <button class="sm-item ${tab === id ? 'on' : ''}" data-act="settings-tab" data-tab="${id}">
            ${icon(ic, { size: 15 })}<span>${label}</span>
          </button>`).join('')}
      </div>
      <div class="sm-foot">
        <button data-act="switch-campaign">${icon('arrowRight', { size: 13, cls: 'flip' })} Leave campaign</button>
      </div>
    </aside>

    <main class="settings-body">
      ${tab === 'campaign' ? settingsCampaign(dm)
        : tab === 'company' ? settingsCompany(dm)
        : tab === 'table' ? settingsTable()
        : settingsAccount()}
    </main>
  </div>`;
}

function settingsCampaign(dm) {
  return `
  <header class="set-head">
    <div class="eyebrow">THE CHRONICLE</div>
    <h1>Campaign</h1>
    <p>What this story is, and where the next session begins.</p>
  </header>

  <section class="set-card">
    ${dm ? `
      <form data-act="save-campaign" class="set-form">
        <label><span>NAME</span><input name="name" data-keep="c-n" value="${esc(state.campaign.name)}" /></label>
        <label><span>CURRENT SESSION</span>
          <input name="sessionTitle" data-keep="c-s" value="${esc(state.campaign.sessionTitle || '')}"
            placeholder="Session 4: Into the Depths" /></label>
        <label><span>DESCRIPTION</span>
          <textarea name="description" data-keep="c-d" rows="5">${esc(state.campaign.description || '')}</textarea></label>
        <div class="set-actions"><button class="btn primary" type="submit">Save campaign</button></div>
      </form>`
    : `<div class="set-readonly">
        <h2>${esc(state.campaign.name)}</h2>
        <p>${esc(state.campaign.description || 'No description yet.')}</p>
        <span>Only the DM can change campaign settings.</span>
      </div>`}
  </section>

  <section class="set-card">
    <div class="set-card-head">${icon('compass', { size: 15 })}<h3>The world</h3></div>
    <div class="set-links">
      <button data-act="game-nav" data-page="world">${icon('map', { size: 14 })} Open the world map ${icon('arrowRight', { size: 12 })}</button>
      <button data-act="game-nav" data-page="codex">${icon('book', { size: 14 })} Open the codex ${icon('arrowRight', { size: 12 })}</button>
      <button data-act="game-nav" data-page="party">${icon('users', { size: 14 })} Open the party ${icon('arrowRight', { size: 12 })}</button>
    </div>
  </section>`;
}

function settingsCompany(dm) {
  return `
  <header class="set-head">
    <div class="eyebrow">THE COMPANY</div>
    <h1>Who is at the table</h1>
    <p>${state.members.length} member${state.members.length === 1 ? '' : 's'} · ${state.online.length} online now</p>
  </header>

  <section class="set-card">
    <div class="member-list">
      ${state.members.map((m) => `
        <div class="member-row">
          ${avatar(m.username, state.online.includes(m.id) ? 'on' : '')}
          <div class="mr-who">
            <b>${esc(m.username)}</b>
            <span>${esc(m.email)}</span>
          </div>
          <span class="mr-role ${m.role === 'dm' ? 'dm' : ''}">${m.role === 'dm' ? 'DM' : 'PLAYER'}</span>
          ${dm && m.id !== state.user.id ? `<button class="mr-kick" data-act="kick" data-id="${m.id}" title="Remove">${icon('x', { size: 13 })}</button>` : ''}
        </div>`).join('')}
    </div>

    ${dm ? `<div class="set-divider">INVITE BY EMAIL</div>
      <form data-act="invite" class="set-invite">
        <input name="email" data-keep="inv" type="email" placeholder="friend@example.com" required />
        <button class="btn primary" type="submit">${icon('plus', { size: 13 })} Invite</button>
      </form>
      <p class="set-note">They sign up with that email and the invitation is waiting for them.</p>
      ${(state.campaignInvites || []).length ? `<div class="invite-list">
        ${state.campaignInvites.map((i) => `<div><span>${esc(i.email)}</span><em>${esc(i.status)}</em></div>`).join('')}
      </div>` : ''}` : ''}
  </section>`;
}

function settingsTable() {
  return `
  <header class="set-head">
    <div class="eyebrow">AT THE TABLE</div>
    <h1>How the game feels</h1>
    <p>Beginner-friendly by default. Turn the numbers up when you want them.</p>
  </header>

  <section class="set-card">
    <div class="set-toggle">
      <div><b>${state.simple ? 'Simple mode' : 'Advanced mode'}</b>
        <p>${state.simple
          ? 'Plain language and explained outcomes — best for new players.'
          : 'Full D&D terms, formulas and modifiers on show.'}</p></div>
      <button class="switch ${state.simple ? 'on' : ''}" data-act="toggle-simple" aria-label="Toggle simple mode"></button>
    </div>
    <div class="set-toggle">
      <div><b>Sound</b>
        <p>A soft chime when it is your turn, and a rattle of dice when you roll.</p></div>
      <button class="switch ${state.sound ? 'on' : ''}" data-act="toggle-sound" aria-label="Toggle sound"></button>
    </div>
    <div class="set-toggle">
      <div><b>${state.theme === 'dark' ? 'Night' : 'Daylight'}</b>
        <p>Switch the interface between the obsidian hall and the daylight scriptorium.</p></div>
      <button class="btn sm" data-act="theme">${icon(state.theme === 'dark' ? 'sun' : 'moon', { size: 13 })}
        ${state.theme === 'dark' ? 'Daylight' : 'Night'}</button>
    </div>
  </section>

  <section class="set-card">
    <div class="set-card-head">${icon('dice', { size: 15 })}<h3>Dice and rolls</h3></div>
    <p class="set-note">Every roll is shared with the table. Advantage and disadvantage can be set from the dice tray in Game.</p>
    <button class="btn" data-act="game-nav" data-page="game">${icon('swords', { size: 13 })} Go to the table</button>
  </section>`;
}

function settingsAccount() {
  return `
  <header class="set-head">
    <div class="eyebrow">YOUR ACCOUNT</div>
    <h1>${esc(state.user?.username || 'Account')}</h1>
    <p>${esc(state.user?.email || '')}</p>
  </header>

  <section class="set-card">
    <div class="account-row">
      ${avatar(state.user.username, 'lg on')}
      <div>
        <b>${esc(state.user.username)}</b>
        <span>${state.campaign?.role === 'dm' ? 'Dungeon Master' : 'Player'} · ${esc(state.campaign?.name || '')}</span>
      </div>
    </div>
    <div class="set-actions">
      ${state.user.isAdmin || state.user.actingAs ? `
        <button class="btn" data-act="modal" data-name="accounts">${icon('crown', { size: 13 })} Accounts</button>` : ''}
      <button class="btn" data-act="switch-campaign">${icon('book', { size: 13 })} Switch campaign</button>
      <button class="btn danger" data-act="logout">${icon('arrowRight', { size: 13 })} Sign out</button>
    </div>
  </section>

  <section class="set-card">
    <div class="set-card-head">${icon('shield', { size: 15 })}<h3>Your seat</h3></div>
    <p class="set-note">Your characters, inventory, notes and campaign access are tied to this account. Leaving the campaign does not delete your hero.</p>
  </section>`;
}

// ---------------------------------------------------------------- chat drawer

function chatDrawer() {
  return `
  <div class="chat-scrim" data-act="chat-backdrop"></div>
  <aside class="chat-drawer">
    <header class="chat-head">
      <div>
        <div class="eyebrow">SPEAKING STONE</div>
        <h2>Party comms</h2>
      </div>
      <button data-act="chat-toggle" aria-label="Close chat">${icon('x', { size: 17 })}</button>
    </header>
    <div class="chat-people">
      ${state.members.slice(0, 8).map((m) => `
        <span title="${esc(m.username)}">${avatar(m.username, state.online.includes(m.id) ? 'on' : '')}</span>`).join('')}
      <em>${state.online.length} online</em>
    </div>
    <div class="chat-log">
      ${(state.messages || []).length ? state.messages.map((m) => {
        const mine = m.userId === state.user.id;
        const who = nameOf(m.userId);
        return `<div class="chat-msg ${mine ? 'mine' : ''}">
          ${avatar(who)}
          <div>
            <span>${esc(who)} · ${ago(m.createdAt)}</span>
            <p>${esc(m.body)}</p>
          </div>
        </div>`;
      }).join('') : `<div class="chat-empty">${icon('chat', { size: 22 })}<p>No messages yet.</p><span>Speak, and the whole table hears it.</span></div>`}
    </div>
    <form class="chat-form" data-act="send-msg">
      <input name="body" data-keep="chat" placeholder="Say something to the party…" autocomplete="off" />
      <button class="btn primary" type="submit" aria-label="Send">${icon('send', { size: 15 })}</button>
    </form>
  </aside>`;
}

// ============================================================================
// ACTIONS
// ============================================================================

on('game-nav', (el) => {
  const page = el.dataset.page || 'world';
  state.page = page;
  state.chatOpen = false;
  state.filter = '';
  if (page === 'party') state.partyTab = 'overview';
  if (page === 'settings') state.settingsTab = state.settingsTab || 'campaign';
  if (page === 'ai') loadAITools();
  render();
});

on('party-tab', (el) => {
  state.partyTab = el.dataset.tab || 'overview';
  state.selectedItemId = null;
  render();
});

on('settings-tab', (el) => {
  state.settingsTab = el.dataset.tab || 'campaign';
  render();
});

on('chat-toggle', () => { state.chatOpen = !state.chatOpen; render(); });
on('game-die', (el) => { state.formula = el.dataset.f; render(); });
on('chat-backdrop', (el, data, e) => {
  if (e?.target === el) { state.chatOpen = false; render(); }
});

// ---- character creation lives in creator.js

// ---- powers

on('spell-add', async (form, data) => {
  const c = state.characters.find((x) => x.id === data.id);
  const name = form.querySelector('[name="spell"]')?.value;
  if (!c || !name) return;
  if ((c.spells || []).includes(name)) return;
  const spells = [...(c.spells || []), name];
  c.spells = spells;
  render();
  await api('PATCH', `/api/characters/${c.id}`, { spells });
  toast(`${name} learned`, 'ok');
});

on('spell-remove', async (el) => {
  const c = state.characters.find((x) => x.id === el.dataset.id);
  if (!c) return;
  const spells = (c.spells || []).filter((s) => s !== el.dataset.name);
  c.spells = spells;
  render();
  await api('PATCH', `/api/characters/${c.id}`, { spells });
});

// ---- codex

on('codex-kind', (el) => {
  const id = el.dataset.kind || 'npc';
  state.codexKind = id;
  state.codexSelected = null;
  state.filter = '';
  if (id !== 'journal') state.codexTab = id;
  render();
});

on('codex-select', (el) => {
  state.codexSelected = el.dataset.id;
  render();
});

on('codex-close', () => {
  state.codexSelected = null;
  render();
});

on('codex-search', (el) => {
  state.filter = el.value;
  render();
});

on('codex-new', () => {
  if (state.codexKind === 'journal') {
    state.modal = { name: 'new-note' };
  } else {
    state.codexTab = state.codexKind;
    state.modal = { name: 'new-entry' };
  }
  render();
});

on('codex-map', (el) => focusEntryOnMap(el.dataset.id));
