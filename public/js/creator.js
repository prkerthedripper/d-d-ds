// ============================================================================
// D&D DS — the character creator.
//
// This screen deliberately uses illustrated fantasy plates for class, species
// and background. The modern Webster, NY campaign art remains separate: it is
// used by the world, party and codex screens, not by the fantasy creator.
// ============================================================================

import {
  state, api, esc, mod, signed, toast, fail, on, render,
} from './core.js';
import { icon } from './icons.js';
import { pickImage } from './images.js';
import {
  CLASS_ART, SPECIES_ART, BACKGROUND_ART, RPG_ART_CREDITS,
} from './art.js';

const HIT_DIE = {
  barbarian: 12, fighter: 10, paladin: 10, ranger: 10, bard: 8, cleric: 8,
  druid: 8, monk: 8, rogue: 8, warlock: 8, artificer: 8, sorcerer: 6, wizard: 6,
};

const STAT_PRESETS = {
  artificer: { str: 8, dex: 13, con: 14, int: 16, wis: 12, cha: 10 },
  barbarian: { str: 16, dex: 14, con: 16, int: 8, wis: 12, cha: 10 },
  bard: { str: 8, dex: 14, con: 12, int: 12, wis: 10, cha: 16 },
  cleric: { str: 12, dex: 10, con: 14, int: 10, wis: 16, cha: 12 },
  druid: { str: 10, dex: 12, con: 14, int: 12, wis: 16, cha: 10 },
  fighter: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 10 },
  monk: { str: 10, dex: 16, con: 14, int: 10, wis: 14, cha: 10 },
  paladin: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 14 },
  ranger: { str: 12, dex: 16, con: 14, int: 10, wis: 14, cha: 10 },
  rogue: { str: 10, dex: 16, con: 14, int: 12, wis: 12, cha: 10 },
  sorcerer: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 16 },
  warlock: { str: 8, dex: 14, con: 14, int: 12, wis: 12, cha: 15 },
  wizard: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 },
};

const CLASS_OPTIONS = [
  { id: 'Barbarian', key: 'barbarian', role: 'd12 · primal rage · STR / CON', blurb: 'A storm of muscle, scars and refusal. When the world pushes, you push back harder.', art: CLASS_ART.barbarian },
  { id: 'Bard', key: 'bard', role: 'd8 · inspiration · CHA', blurb: 'A voice that changes the room, and a blade hidden behind the smile.', art: CLASS_ART.bard },
  { id: 'Cleric', key: 'cleric', role: 'd8 · divine domain · WIS', blurb: 'A healer with a god at their shoulder and a mace within reach.', art: CLASS_ART.cleric },
  { id: 'Druid', key: 'druid', role: 'd8 · wild shape · WIS', blurb: 'The old places still speak. You learned how to answer.', art: CLASS_ART.druid },
  { id: 'Fighter', key: 'fighter', role: 'd10 · martial arsenal · STR / DEX', blurb: 'Discipline, steel and the will to be the one who holds the line.', art: CLASS_ART.fighter },
  { id: 'Monk', key: 'monk', role: 'd8 · ki · DEX / WIS', blurb: 'The body is the weapon. The mind is the edge.', art: CLASS_ART.monk },
  { id: 'Paladin', key: 'paladin', role: 'd10 · oath · STR / CHA', blurb: 'You made a promise. The power takes it seriously.', art: CLASS_ART.paladin },
  { id: 'Ranger', key: 'ranger', role: 'd10 · hunter’s mark · DEX / WIS', blurb: 'You track what should not exist, and you find it before it finds the party.', art: CLASS_ART.ranger },
  { id: 'Rogue', key: 'rogue', role: 'd8 · sneak attack · DEX', blurb: 'Precision, timing and a blade exactly where it should not be.', art: CLASS_ART.rogue },
  { id: 'Sorcerer', key: 'sorcerer', role: 'd6 · innate magic · CHA', blurb: 'The power was always in your blood. It is awake now, and it wants out.', art: CLASS_ART.sorcerer },
  { id: 'Warlock', key: 'warlock', role: 'd8 · pact magic · CHA', blurb: 'You struck a bargain. Something on the other side is waiting to collect.', art: CLASS_ART.warlock },
  { id: 'Wizard', key: 'wizard', role: 'd6 · spellbook · INT', blurb: 'Every secret has a notation. Every pattern can be learned, written down and used.', art: CLASS_ART.wizard },
  { id: 'Artificer', key: 'artificer', role: 'd8 · arcane invention · INT', blurb: 'You build devices that should not work, and then they do.', art: CLASS_ART.artificer },
];

const SPECIES_OPTIONS = [
  { id: 'Human', key: 'human', traits: 'Adaptable · ambitious · versatile', blurb: 'A short life is measured by what you build with it.', art: SPECIES_ART.human },
  { id: 'Elf', key: 'elf', traits: 'Fey ancestry · trance · keen senses', blurb: 'You have seen enough centuries to know when a thing is truly old.', art: SPECIES_ART.elf },
  { id: 'Half-Elf', key: 'half-elf', traits: 'Fey ancestry · versatile · two worlds', blurb: 'You belong to two peoples, and can walk among both.', art: SPECIES_ART['half-elf'] },
  { id: 'Dwarf', key: 'dwarf', traits: 'Darkvision · resilience · stonecunning', blurb: 'Stone remembers. So do you.', art: SPECIES_ART.dwarf },
  { id: 'Halfling', key: 'halfling', traits: 'Lucky · brave · nimble', blurb: 'Small enough to slip past notice. Brave enough to make it a problem.', art: SPECIES_ART.halfling },
  { id: 'Dragonborn', key: 'dragonborn', traits: 'Draconic ancestry · breath weapon · scales', blurb: 'An old fire moves under your scales.', art: SPECIES_ART.dragonborn },
  { id: 'Gnome', key: 'gnome', traits: 'Curious · clever · illusion', blurb: 'The world is a puzzle, and you have already taken it apart.', art: SPECIES_ART.gnome },
  { id: 'Half-Orc', key: 'half-orc', traits: 'Relentless endurance · fierce · broad', blurb: 'You have been underestimated. It has never gone well for the person who did it.', art: SPECIES_ART['half-orc'] },
  { id: 'Tiefling', key: 'tiefling', traits: 'Infernal heritage · fire resistance · presence', blurb: 'The bloodline came with horns, a tail and a reputation you did not choose.', art: SPECIES_ART.tiefling },
  { id: 'Aasimar', key: 'aasimar', traits: 'Celestial guide · radiant soul · light', blurb: 'Something above is watching. It is not always gentle.', art: SPECIES_ART.aasimar },
  { id: 'Goliath', key: 'goliath', traits: 'Powerful build · mountain born · endurance', blurb: 'The mountain tested you before you could walk. You passed.', art: SPECIES_ART.goliath },
  { id: 'Firbolg', key: 'firbolg', traits: 'Forest guardian · hidden step · gentle', blurb: 'The forest trusts you with its quiet places.', art: SPECIES_ART.firbolg },
  { id: 'Tabaxi', key: 'tabaxi', traits: 'Feline agility · climbing · curiosity', blurb: 'Every locked room is an invitation. Every rumour is a map.', art: SPECIES_ART.tabaxi },
  { id: 'Genasi', key: 'genasi', traits: 'Elemental lineage · manifestations · elemental', blurb: 'One element answers to you, and it is never entirely quiet.', art: SPECIES_ART.genasi },
];

const BACKGROUND_OPTIONS = [
  { id: 'Soldier', key: 'soldier', skills: 'Athletics · Intimidation · rank', blurb: 'You learned to hold a line, take an order and carry the cost afterwards.', art: BACKGROUND_ART.soldier },
  { id: 'Criminal', key: 'criminal', skills: 'Deception · Stealth · contacts', blurb: 'You know the city from the wrong side of the locks.', art: BACKGROUND_ART.criminal },
  { id: 'Noble', key: 'noble', skills: 'History · Persuasion · position', blurb: 'A title opens doors. It also tells everyone where to find you.', art: BACKGROUND_ART.noble },
  { id: 'Sage', key: 'sage', skills: 'Arcana · History · research', blurb: 'The archive had a missing page. You found it, and kept reading.', art: BACKGROUND_ART.sage },
  { id: 'Entertainer', key: 'entertainer', skills: 'Acrobatics · Performance · showmanship', blurb: 'You know how to make a room look at you, and what to do while they do.', art: BACKGROUND_ART.entertainer },
  { id: 'Outlander', key: 'outlander', skills: 'Survival · Nature · wanderer', blurb: 'You keep moving. Something keeps finding you anyway.', art: BACKGROUND_ART.outlander },
  { id: 'Acolyte', key: 'acolyte', skills: 'Insight · Religion · temple life', blurb: 'You served something larger than yourself and learned its rituals by heart.', art: BACKGROUND_ART.acolyte },
  { id: 'Artisan', key: 'artisan', skills: 'History · Insight · craftsman', blurb: 'Give you a workbench and time, and you can make the impossible functional.', art: BACKGROUND_ART.artisan },
  { id: 'Folk Hero', key: 'folk-hero', skills: 'Animal Handling · Survival · reputation', blurb: 'The village told stories about you. Some of them are even true.', art: BACKGROUND_ART['folk-hero'] },
  { id: 'Hermit', key: 'hermit', skills: 'Medicine · Religion · discovery', blurb: 'You went looking for silence, and found something in it.', art: BACKGROUND_ART.hermit },
];

const SUGGESTED_NAMES = [
  'Aelric', 'Bryn', 'Caelum', 'Dara', 'Elira', 'Fen', 'Isolde', 'Kael',
  'Lyra', 'Orin', 'Sable', 'Tamsin',
];

const keyOf = (value) => String(value || '').trim().toLowerCase();

export const newCreatorDraft = () => ({
  class: '', species: '', background: '', name: '',
  portrait: '', picker: null, busy: false,
});

const draftNow = () => {
  if (!state.creation) state.creation = newCreatorDraft();
  return state.creation;
};

const classFor = (id) => CLASS_OPTIONS.find((x) => x.id === id) || null;
const speciesFor = (id) => SPECIES_OPTIONS.find((x) => x.id === id) || null;
const backgroundFor = (id) => BACKGROUND_OPTIONS.find((x) => x.id === id) || null;

const creationReady = (d) => !!(d.class && d.species && d.background && d.name.trim());

function stepNow(d) {
  if (!d.class) return 'class';
  if (!d.species) return 'species';
  if (!d.background) return 'background';
  return 'name';
}

function choiceTile({ kind, label, value, placeholder, copy, meta, art, feature = false }) {
  return `
  <button class="choice-tile ${feature ? 'feature' : 'half'} ${value ? 'picked' : ''}"
    data-act="creation-pick" data-kind="${kind}">
    <span class="ct-art"${art ? ` style="background-image:url('${esc(art)}')"` : ''}></span>
    <span class="ct-shade"></span>
    <span class="ct-copy">
      <span class="ct-eyebrow">${label}</span>
      <span class="ct-title">${esc(value || placeholder)}</span>
      ${meta ? `<span class="ct-meta">${esc(meta)}</span>` : ''}
      <span class="ct-blurb">${esc(copy)}</span>
    </span>
    <span class="ct-action">
      <span class="ct-more">${icon('search', { size: 14 })}</span>
      ${value ? 'Change' : 'Choose'}
      <span class="ct-arrow">${icon('arrowRight', { size: 14 })}</span>
    </span>
  </button>`;
}

export function characterCreatorView() {
  const d = draftNow();
  const cls = classFor(d.class);
  const species = speciesFor(d.species);
  const bg = backgroundFor(d.background);
  const ready = creationReady(d);
  const now = stepNow(d);
  const stats = STAT_PRESETS[keyOf(cls?.key)] || STAT_PRESETS.fighter;
  const dex = mod(stats.dex);
  const hp = Math.max(1, (HIT_DIE[keyOf(cls?.key)] || 8) + mod(stats.con));
  const art = d.portrait || cls?.art || '';
  const atmosphere = bg?.art || BACKGROUND_ART.outlander;
  const step = (key) => now === key ? 'now' : (!d[key] && key !== 'name' ? '' : 'done');

  return `
  <div class="creation rpg-creation">
    <div class="creation-bg" style="background-image:url('${esc(atmosphere)}')"></div>
    <div class="creation-shade"></div>
    <div class="creation-grain"></div>

    <div class="creation-inner">
      <header class="creation-head">
        <div class="creation-title">
          <div class="creation-eyebrow">THE CHARACTER FORGE</div>
          <h1>Choose your <span>legend.</span></h1>
          <p>Every hero begins as a class, a people and a past. Pick the shape of yours;
            the rest is discovered at the table.</p>
        </div>
        <div class="creation-submit">
          <button class="btn create-hero" data-act="creation-create" ${ready && !d.busy ? '' : 'disabled'}>
            ${d.busy ? 'Forging…' : 'Create character'}
          </button>
          <div class="creation-steps">
            <span class="${step('class')}"><i>01</i>Class</span>
            <span class="${step('species')}"><i>02</i>Species</span>
            <span class="${step('background')}"><i>03</i>Background</span>
            <span class="${ready ? 'done' : ''} ${now === 'name' ? 'now' : ''}"><i>04</i>Name</span>
          </div>
          <button class="creation-back" data-act="creation-cancel">${icon('arrowRight', { size: 12, cls: 'flip' })} Back to the party</button>
        </div>
      </header>

      <div class="creation-body">
        <section class="creation-board">
          <div class="creation-board-head">
            <span class="eyebrow">THE HERO'S SHAPE</span>
            <span>${cls ? esc(cls.role) : 'CLASS · SPECIES · BACKGROUND'}</span>
          </div>
          <div class="creation-choices">
            ${choiceTile({
              kind: 'class', label: 'CLASS', value: cls?.id || '',
              placeholder: 'Choose a class', copy: cls?.blurb || 'What you do when the fight starts.',
              meta: cls?.role || '13 archetypes', art: cls?.art || '', feature: true,
            })}
            ${choiceTile({
              kind: 'species', label: 'SPECIES', value: species?.id || '',
              placeholder: 'Choose a species', copy: species?.blurb || 'The people and heritage you carry.',
              meta: species?.traits || '14 lineages', art: species?.art || '',
            })}
            ${choiceTile({
              kind: 'background', label: 'BACKGROUND', value: bg?.id || '',
              placeholder: 'Choose a background', copy: bg?.blurb || 'The life you had before the adventure.',
              meta: bg?.skills || '10 pasts', art: bg?.art || '',
            })}
          </div>
          <div class="creation-board-foot">
            <span>${icon('sparkles', { size: 13 })} ILLUSTRATED ARCHETYPES — NOT PHOTOGRAPHS</span>
            <a href="${RPG_ART_CREDITS}" target="_blank" rel="noopener">Art credits &amp; sources</a>
          </div>
        </section>

        <aside class="creation-preview">
          <div class="creation-arch ${d.portrait ? 'custom' : ''}">
            <div class="arch-frame"></div>
            ${art
              ? `<div class="arch-image" style="background-image:url('${esc(art)}')"></div>`
              : `<div class="arch-empty"><span class="arch-ornament">✦</span><span>Choose a class to reveal the archetype</span></div>`}
            <div class="arch-glow"></div>
            <button class="arch-pick" data-act="creation-pick" data-kind="portrait">
              ${icon('eye', { size: 14 })} Choose portrait
            </button>
            <div class="arch-badge">${cls ? esc(cls.id.toUpperCase()) : 'UNCHARTED'}</div>
            <div class="arch-species">${species ? esc(species.id.toUpperCase()) : 'SPECIES UNCHOSEN'}</div>
            ${species ? `<div class="arch-species-art" style="background-image:url('${esc(species.art)}')" title="${esc(species.id)} lineage portrait"></div>` : ''}
          </div>

          <div class="creation-identity">
            <span class="creation-identity-label">HERO DOSSIER</span>
            <div class="creation-traitline">
              <span>${species ? esc(species.id) : 'Species'}</span>
              <i>·</i>
              <span>${bg ? esc(bg.id) : 'Background'}</span>
            </div>
          </div>

          <div class="creation-namewrap">
            <input class="creation-name" name="characterName" data-live="creation-name" data-keep="cr-name"
              value="${esc(d.name)}" maxlength="40" placeholder="Name your hero" autocomplete="off" />
            <span class="creation-name-glow"></span>
          </div>

          <div class="creation-suggest">
            <span>Suggested names</span>
            <div class="creation-chips">
              <button class="name-die" data-act="creation-suggest" title="Pick a name">${icon('dice', { size: 14 })}</button>
              ${SUGGESTED_NAMES.slice(0, 4).map((n) => `
                <button class="name-chip" data-act="creation-pick-name" data-name="${esc(n)}">${esc(n)}</button>`).join('')}
            </div>
          </div>

          <div class="creation-summary">
            <div><span>HP</span><b>${hp}</b></div>
            <div><span>AC</span><b>${10 + dex}</b></div>
            <div><span>INIT</span><b>${signed(dex)}</b></div>
            <div><span>SPECIES</span><b class="summary-word">${species ? esc(species.id) : '—'}</b></div>
          </div>
          <p class="creation-footnote">You can change every number later. The illustrated plates are class and species references, not photographs.</p>
          <button class="btn create-hero creation-mobile-submit" data-act="creation-create" ${ready && !d.busy ? '' : 'disabled'}>
            ${d.busy ? 'Forging…' : 'Create character'}
          </button>
        </aside>
      </div>
    </div>

    ${d.picker ? creationPicker(d) : ''}
  </div>`;
}

function creationPicker(d) {
  const cls = classFor(d.class);
  const species = speciesFor(d.species);
  let options;
  let title;
  let step;

  if (d.picker === 'class') {
    title = 'Choose a class';
    step = '01';
    options = CLASS_OPTIONS.map((o) => ({
      id: o.id, label: o.id, meta: o.role, blurb: o.blurb, art: o.art, value: o.id,
    }));
  } else if (d.picker === 'species') {
    title = 'Choose a species';
    step = '02';
    options = SPECIES_OPTIONS.map((o) => ({
      id: o.id, label: o.id, meta: o.traits, blurb: o.blurb, art: o.art, value: o.id,
    }));
  } else if (d.picker === 'background') {
    title = 'Choose a background';
    step = '03';
    options = BACKGROUND_OPTIONS.map((o) => ({
      id: o.id, label: o.id, meta: o.skills, blurb: o.blurb, art: o.art, value: o.id,
    }));
  } else {
    title = 'Choose a portrait';
    step = 'PORTRAIT';
    options = [
      {
        id: 'class', label: cls ? `${cls.id} plate` : 'Class plate',
        meta: 'Full illustrated archetype',
        blurb: 'The class illustration, with its weapon, armour and pose intact.',
        art: cls?.art || '', value: '',
      },
      {
        id: 'species', label: species ? `${species.id} study` : 'Species study',
        meta: 'Face and heritage',
        blurb: 'A species portrait for a closer, head-and-shoulders look.',
        art: species?.art || '', value: species?.art || '',
      },
      ...(d.portrait ? [{
        id: 'custom', label: 'Your upload', meta: 'Custom portrait',
        blurb: 'The image you supplied for this hero.', art: d.portrait, value: d.portrait,
      }] : []),
    ];
  }

  const picked = d.picker === 'portrait'
    ? (!d.portrait ? 'class' : (species && d.portrait === species.art ? 'species' : 'custom'))
    : d[d.picker];
  const gridClass = d.picker === 'class' ? 'classes'
    : d.picker === 'background' ? 'backgrounds' : d.picker;

  return `
  <div class="choice-picker ${d.picker}" role="dialog" aria-label="${esc(title)}">
    <div class="picker-panel">
      <header class="picker-head">
        <div>
          <div class="eyebrow">STEP ${step}</div>
          <h2>${esc(title)}</h2>
          <p>${d.picker === 'portrait'
            ? 'Choose the face that will appear in your party, or upload your own illustration.'
            : 'Select one. The artwork and the dossier update together.'}</p>
        </div>
        <button class="picker-x" data-act="creation-close-picker" aria-label="Close">${icon('x', { size: 18 })}</button>
      </header>
      <div class="picker-grid ${gridClass}">
        ${options.map((o) => `
          <button class="picker-option ${picked === o.id ? 'on' : ''}" data-act="creation-option"
            data-kind="${d.picker === 'portrait' ? 'portrait' : d.picker}" data-value="${esc(o.value)}"
            aria-pressed="${picked === o.id}">
            <span class="po-art"${o.art ? ` style="background-image:url('${esc(o.art)}')"` : ''}></span>
            <span class="po-shade"></span>
            <span class="po-text">
              <b>${esc(o.label)}</b>
              ${o.meta ? `<em>${esc(o.meta)}</em>` : ''}
              ${o.blurb ? `<span>${esc(o.blurb)}</span>` : ''}
            </span>
            ${picked === o.id ? `<span class="po-check">${icon('check', { size: 13 })}</span>` : ''}
          </button>`).join('')}
        ${d.picker === 'portrait' ? `
          <button class="picker-option portrait-upload" data-act="creation-portrait-upload">
            <span class="po-upload">${icon('plus', { size: 28 })}</span>
            <span class="po-text">
              <b>Upload a portrait</b>
              <em>Your own illustration</em>
              <span>JPG, PNG or WEBP. It is resized on this device before it is saved.</span>
            </span>
          </button>` : ''}
      </div>
      <footer class="picker-foot">
        <span>${d.picker === 'portrait' ? 'CLASS AND SPECIES PLATES FROM THE ILLUSTRATED SET' : 'FANTASY RPG PLATES · ONE CONSISTENT ART DIRECTION'}</span>
        <a href="${RPG_ART_CREDITS}" target="_blank" rel="noopener">Art credits &amp; sources</a>
      </footer>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- actions

on('creation-open', () => {
  state.creation = newCreatorDraft();
  state.page = 'creation';
  state.chatOpen = false;
  render();
});

on('creation-cancel', () => {
  state.creation = null;
  state.page = 'party';
  state.partyTab = 'overview';
  render();
});

on('creation-pick', (el) => {
  const d = draftNow();
  d.picker = el.dataset.kind;
  render();
});

on('creation-close-picker', () => {
  draftNow().picker = null;
  render();
});

on('creation-option', (el) => {
  const d = draftNow();
  if (d.picker === 'portrait') {
    d.portrait = el.dataset.value || '';
    d.picker = null;
    render();
    return;
  }
  if (d.picker === 'species') {
    const old = speciesFor(d.species);
    if (old && d.portrait === old.art) d.portrait = '';
  }
  d[d.picker] = el.dataset.value;
  d.picker = null;
  render();
});

on('creation-portrait-upload', async () => {
  const image = await pickImage(900);
  if (!image) return;
  const d = draftNow();
  d.portrait = image;
  d.picker = null;
  render();
});

on('creation-pick-name', (el) => {
  draftNow().name = el.dataset.name;
  render();
});

on('creation-suggest', () => {
  const d = draftNow();
  d.name = SUGGESTED_NAMES[Math.floor(Math.random() * SUGGESTED_NAMES.length)];
  render();
});

on('creation-name', (el) => {
  const d = draftNow();
  d.name = el.value;
  document.querySelectorAll('[data-act="creation-create"]').forEach((btn) => {
    btn.disabled = !creationReady({ ...d, name: el.value }) || d.busy;
  });
});

on('creation-create', async () => {
  const d = draftNow();
  if (!creationReady(d) || d.busy) return;
  d.busy = true;
  render();

  const key = keyOf(classFor(d.class)?.key);
  const stats = { ...(STAT_PRESETS[key] || STAT_PRESETS.fighter) };
  const dex = mod(stats.dex);
  const con = mod(stats.con);
  const prof = 2;
  const maxHp = Math.max(1, (HIT_DIE[key] || 8) + con);
  const strM = mod(stats.str);
  const intM = Math.max(mod(stats.int), mod(stats.wis), mod(stats.cha));

  const payload = {
    name: d.name.trim().slice(0, 40),
    race: d.species,
    class: d.class,
    background: d.background,
    level: 1,
    maxHp,
    hp: maxHp,
    ac: 10 + dex,
    speed: 30,
    initBonus: dex,
    profBonus: prof,
    stats,
    portrait: d.portrait || '',
    conditions: [],
    slots: {},
    spells: [],
    attacks: [
      { name: 'Strike', toHit: prof + Math.max(strM, dex), damage: `1d6${signed(Math.max(strM, dex))}` },
      { name: 'Power surge', toHit: prof + intM, damage: `1d8${signed(intM)}` },
    ],
  };

  try {
    const { id } = await api('POST', `/api/campaigns/${state.campaign.id}/characters`, payload);
    if (!state.characters.some((c) => c.id === id)) {
      state.characters = [...state.characters, {
        ...payload, id, ownerId: state.user.id, campaignId: state.campaign.id,
        items: [], coins: { pp: 0, gp: 0, sp: 0, cp: 0 }, notes: '',
      }];
    }
    state.selectedCharId = id;
    state.creation = null;
    state.page = 'party';
    state.partyTab = 'overview';
    render();
    toast(`${payload.name} enters the story.`, 'ok');
  } catch (err) {
    d.busy = false;
    render();
    fail(err);
  }
});
