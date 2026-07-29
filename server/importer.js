// Campaign importer. Turns a loosely-structured export (from Chronica, a
// spreadsheet, or hand-written JSON) into the shapes D&D DS stores.
//
// It is deliberately forgiving: Chronica has no official export, so people will
// arrive with all sorts of field names. Every getter below accepts a list of
// aliases and takes the first that has a value.

const firstOf = (obj, keys, fallback = '') => {
  for (const k of keys) {
    if (obj == null) break;
    // case-insensitive key match
    const hit = Object.keys(obj).find((kk) => kk.toLowerCase() === k.toLowerCase());
    if (hit != null && obj[hit] != null && obj[hit] !== '') return obj[hit];
  }
  return fallback;
};

const str = (v) => (v == null ? '' : String(v)).trim();
const int = (v, d = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

/** Long text out of an object, joining paragraph-ish fields if several exist. */
function bodyOf(o) {
  const direct = firstOf(o, ['description', 'body', 'text', 'summary', 'notes', 'note', 'content', 'details', 'bio', 'backstory']);
  if (direct) return str(direct);
  // Some tools split long text across numbered fields.
  const parts = Object.entries(o)
    .filter(([k]) => /desc|body|text|para|section/i.test(k))
    .map(([, v]) => str(v))
    .filter(Boolean);
  return parts.join('\n\n');
}

const imageOf = (o) => {
  const v = str(firstOf(o, ['image', 'img', 'portrait', 'avatar', 'picture', 'thumbnail', 'icon']));
  // Only inline images survive — remote URLs would break under the CSP and may vanish.
  return /^data:image\//.test(v) ? v : '';
};

/** Coerce whatever came in for one section into an array of objects. */
function asArray(value) {
  if (Array.isArray(value)) return value.filter((x) => x && typeof x === 'object');
  if (value && typeof value === 'object') {
    // A map of id -> entry, as some exports produce.
    return Object.values(value).filter((x) => x && typeof x === 'object');
  }
  return [];
}

// Where each codex kind can live in the incoming file.
const SECTION_ALIASES = {
  npc: ['npcs', 'npc', 'characters_npc', 'nonplayercharacters', 'people', 'contacts'],
  quest: ['quests', 'quest', 'questchains', 'objectives', 'missions', 'jobs'],
  location: ['locations', 'location', 'places', 'place', 'regions', 'areas', 'sites'],
  shop: ['shops', 'shop', 'stores', 'vendors', 'merchants'],
  event: ['events', 'timeline', 'developments', 'sessionrecaps', 'sessions', 'history'],
};

function normalizeEntry(kind, raw) {
  let subtitle = str(firstOf(raw, kind === 'shop' ? ['owner', 'proprietor', 'keeper']
    : kind === 'location' ? ['region', 'parent', 'area']
      : kind === 'quest' ? ['giver', 'questgiver', 'source']
        : ['role', 'race', 'occupation', 'type']));
  // A bare category word ("npc", "character") is noise, not a subtitle.
  if (/^(npc|character|pc|player|location|quest|shop|event)$/i.test(subtitle)) subtitle = '';

  const entry = {
    kind,
    title: str(firstOf(raw, ['title', 'name', 'label', 'heading'])) || 'Untitled',
    subtitle,
    body: bodyOf(raw),
    image: imageOf(raw),
    status: str(firstOf(raw, ['status', 'state', 'disposition', 'attitude'])),
    data: {},
  };

  if (kind === 'shop') {
    const stock = asArray(firstOf(raw, ['stock', 'items', 'inventory', 'wares', 'goods'], []));
    entry.data.stock = stock.map((s) => ({
      name: str(firstOf(s, ['name', 'item', 'title'])) || 'Item',
      price: str(firstOf(s, ['price', 'cost', 'value'])),
      category: str(firstOf(s, ['category', 'type'])),
    })).filter((s) => s.name);
  }
  return entry;
}

function normalizeCharacter(raw) {
  const stats = firstOf(raw, ['stats', 'abilities', 'abilityscores'], {}) || {};
  const pick = (keys, d = 10) => int(firstOf({ ...raw, ...stats }, keys), d);

  return {
    name: str(firstOf(raw, ['name', 'title', 'charactername'])) || 'Imported Character',
    race: str(firstOf(raw, ['race', 'ancestry', 'species'])),
    class: str(firstOf(raw, ['class', 'classes', 'archetype'])),
    level: int(firstOf(raw, ['level', 'lvl'], 1), 1),
    maxHp: int(firstOf(raw, ['maxhp', 'hp', 'hitpoints', 'health'], 10), 10),
    ac: int(firstOf(raw, ['ac', 'armorclass', 'armourclass', 'armor'], 10), 10),
    speed: int(firstOf(raw, ['speed', 'movement'], 30), 30),
    initBonus: int(firstOf(raw, ['initbonus', 'initiative', 'init'], 0), 0),
    profBonus: int(firstOf(raw, ['profbonus', 'proficiency', 'prof'], 2), 2),
    portrait: imageOf(raw),
    stats: {
      str: pick(['str', 'strength']),
      dex: pick(['dex', 'dexterity']),
      con: pick(['con', 'constitution']),
      int: pick(['int', 'intelligence']),
      wis: pick(['wis', 'wisdom']),
      cha: pick(['cha', 'charisma']),
    },
    notes: bodyOf(raw),
  };
}

function normalizeNote(raw) {
  return {
    title: str(firstOf(raw, ['title', 'name', 'heading'])) || 'Imported Note',
    body: bodyOf(raw),
    dmOnly: !!firstOf(raw, ['dmonly', 'secret', 'private', 'gmonly'], false),
  };
}

function normalizeItem(raw) {
  return {
    name: str(firstOf(raw, ['name', 'title', 'item'])) || 'Item',
    category: str(firstOf(raw, ['category', 'type'])) || 'Gear',
    details: str(firstOf(raw, ['details', 'description', 'notes'])),
    weight: Number(firstOf(raw, ['weight', 'wt'], 0)) || 0,
    qty: int(firstOf(raw, ['qty', 'quantity', 'count', 'amount'], 1), 1),
  };
}

/**
 * Turn an arbitrary parsed payload into a clean plan of what to create.
 * Accepts either a flat object with named sections, or a Chronica-ish
 * `{ campaign: {...} }` wrapper.
 */
export function planImport(payload) {
  const root = (payload && typeof payload === 'object' && payload.campaign && typeof payload.campaign === 'object')
    ? { ...payload, ...payload.campaign }
    : (payload || {});

  const plan = { campaignName: str(firstOf(root, ['campaignname', 'name', 'title'])), characters: [], entries: [], notes: [], items: [] };

  // Player characters.
  for (const kind of ['characters', 'players', 'partymembers', 'pcs']) {
    const arr = asArray(firstOf(root, [kind], []));
    // "characters" in some exports mixes PCs and NPCs; treat a truthy npc flag as an NPC.
    for (const raw of arr) {
      const isNpc = !!firstOf(raw, ['isnpc', 'npc'], false) || /npc/i.test(str(firstOf(raw, ['type', 'kind'])));
      if (isNpc) plan.entries.push(normalizeEntry('npc', raw));
      else plan.characters.push(normalizeCharacter(raw));
    }
    if (arr.length) break; // first matching alias wins, don't double-count
  }

  // A native D&D DS export (or anything else) may carry a flat `entries` array
  // where each item already declares its own kind.
  for (const raw of asArray(firstOf(root, ['entries'], []))) {
    const kind = str(firstOf(raw, ['kind', 'type'])).toLowerCase();
    if (['npc', 'quest', 'location', 'shop', 'event'].includes(kind)) {
      const entry = normalizeEntry(kind, raw);
      // Preserve an already-shaped shop stock and dmOnly flag from a native export.
      if (kind === 'shop' && raw.data?.stock) entry.data.stock = raw.data.stock;
      if (firstOf(raw, ['dmonly'], false)) entry.dmOnly = true;
      plan.entries.push(entry);
    }
  }

  // Codex sections (Chronica-style separate arrays).
  for (const [kind, aliases] of Object.entries(SECTION_ALIASES)) {
    for (const alias of aliases) {
      const arr = asArray(firstOf(root, [alias], []));
      if (arr.length) {
        for (const raw of arr) plan.entries.push(normalizeEntry(kind, raw));
        break;
      }
    }
  }

  // Notes.
  for (const alias of ['notes', 'adventurenotes', 'journal', 'recaps']) {
    const arr = asArray(firstOf(root, [alias], []));
    if (arr.length) { for (const raw of arr) plan.notes.push(normalizeNote(raw)); break; }
  }

  // Loose items not attached to a character or shop.
  for (const alias of ['items', 'inventory', 'loot', 'treasure']) {
    const arr = asArray(firstOf(root, [alias], []));
    if (arr.length) { for (const raw of arr) plan.items.push(normalizeItem(raw)); break; }
  }

  return plan;
}

/** A quick, human-readable tally for the confirmation screen. */
export function summarize(plan) {
  const byKind = {};
  for (const e of plan.entries) byKind[e.kind] = (byKind[e.kind] || 0) + 1;
  return {
    characters: plan.characters.length,
    npc: byKind.npc || 0,
    quest: byKind.quest || 0,
    location: byKind.location || 0,
    shop: byKind.shop || 0,
    event: byKind.event || 0,
    notes: plan.notes.length,
    items: plan.items.length,
  };
}
