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

// Where each codex kind can live in the incoming file. Chronica uses
// `campaign_<thing>` keys (campaign_shops, master_item_library, …), so those
// are listed alongside the plainer names other tools use.
const SECTION_ALIASES = {
  npc: ['npcs', 'npc', 'characters_npc', 'nonplayercharacters', 'people', 'contacts'],
  quest: ['quests', 'quest', 'campaign_quests', 'questchains', 'objectives', 'missions', 'jobs'],
  location: ['locations', 'location', 'campaign_places', 'campaign_locations', 'places', 'place', 'regions', 'areas', 'sites'],
  shop: ['shops', 'shop', 'campaign_shops', 'stores', 'vendors', 'merchants'],
  event: ['events', 'timeline', 'developments', 'campaign_developments', 'sessionrecaps', 'sessions', 'history'],
};

/**
 * Merge several export files into one payload. Chronica downloads one file per
 * section (characters here, shops there, items elsewhere), so selecting them all
 * at once should behave as a single import. Arrays with the same key concatenate.
 */
export function mergeSources(list) {
  const out = {};
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const root = item.campaign && typeof item.campaign === 'object' ? { ...item, ...item.campaign } : item;
    for (const [k, v] of Object.entries(root)) {
      if (k === 'campaign') continue;
      if (Array.isArray(v)) out[k] = [...(Array.isArray(out[k]) ? out[k] : []), ...v];
      else if (v && typeof v === 'object') out[k] = { ...(out[k] || {}), ...v };
      else if (v != null && v !== '' && out[k] == null) out[k] = v;
    }
  }
  return out;
}

/**
 * Is this character a player character? Chronica marks PCs with
 * special === "Main Character" and a player_id; NPCs have neither.
 */
function isPlayerCharacter(raw) {
  const type = str(firstOf(raw, ['type', 'kind'])).toLowerCase();
  if (firstOf(raw, ['isnpc'], false) === true || type.includes('npc')) return false;
  if (type === 'pc' || type === 'player') return true;

  const special = str(firstOf(raw, ['special'])).toLowerCase();
  if (special.includes('main character') || special.includes('player')) return true;
  if (firstOf(raw, ['player_id', 'playerid'], null)) return true;

  // A Chronica entry with a disposition/faction but no player is an NPC.
  if (firstOf(raw, ['disposition', 'faction'], null)) return false;
  return true; // when genuinely unsure, keep it as a character
}

function normalizeEntry(kind, raw) {
  let subtitle = str(firstOf(raw, kind === 'shop' ? ['owner', 'proprietor', 'keeper']
    : kind === 'location' ? ['region', 'parent', 'area']
      : kind === 'quest' ? ['giver', 'questgiver', 'source']
        : ['role', 'occupation', 'title', 'race', 'faction', 'type'])); // NPC
  // A bare category word ("npc", "character") is noise, not a subtitle.
  if (/^(npc|character|pc|player|location|quest|shop|event)$/i.test(subtitle)) subtitle = '';

  const entry = {
    kind,
    // Prefer a real name over a job-title field, so "dad" wins over an empty title.
    title: str(firstOf(raw, ['name', 'title', 'label', 'heading'])) || 'Untitled',
    subtitle,
    body: bodyOf(raw),
    image: imageOf(raw),
    status: str(firstOf(raw, ['status', 'state', 'disposition', 'attitude'])),
    data: {},
  };

  if (kind === 'shop') {
    const stock = asArray(firstOf(raw, ['stock', 'shop_items', 'items', 'inventory', 'wares', 'goods', 'campaign_shop_items'], []));
    entry.data.stock = stock.map((s) => ({
      name: str(firstOf(s, ['name', 'item', 'title'])) || 'Item',
      price: str(firstOf(s, ['price', 'cost', 'value'])),
      category: str(firstOf(s, ['category', 'type'])) || guessCategory(str(firstOf(s, ['name', 'item', 'title']))),
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
    class: str(firstOf(raw, ['class', 'classes', 'archetype', 'npc_class', 'npcclass'])),
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

/** Best-guess item category from its name, so imports get sensible tinted art. */
function guessCategory(name) {
  const n = String(name).toLowerCase();
  if (/potion|elixir|draught|flask|philter/.test(n)) return 'Potion';
  if (/sword|axe|bow|dagger|mace|spear|club|hammer|blade|staff|crossbow|flail|glaive|halberd|rapier|scimitar|whip/.test(n)) return 'Weapon';
  if (/armor|armour|shield|mail|plate|leather|helm|breastplate|gauntlet/.test(n)) return 'Armor';
  if (/arrow|bolt|bullet|ammunition|needle/.test(n)) return 'Ammunition';
  if (/scroll|tome|book|map|letter|deed/.test(n)) return 'Other';
  if (/gem|jewel|ring|amulet|relic|crown|idol/.test(n)) return 'Quest Item';
  return 'Gear';
}

function normalizeItem(raw) {
  const name = str(firstOf(raw, ['name', 'title', 'item'])) || 'Item';
  return {
    name,
    category: str(firstOf(raw, ['category', 'type'])) || guessCategory(name),
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
  const merged = Array.isArray(payload) ? mergeSources(payload) : payload;
  const root = (merged && typeof merged === 'object' && merged.campaign && typeof merged.campaign === 'object')
    ? { ...merged, ...merged.campaign }
    : (merged || {});

  const plan = { campaignName: str(firstOf(root, ['campaignname', 'name', 'title'])), characters: [], entries: [], notes: [], items: [] };

  // Characters — Chronica keeps PCs and NPCs together in one array and marks the
  // difference, so we split them here.
  for (const kind of ['characters', 'players', 'partymembers', 'pcs']) {
    const arr = asArray(firstOf(root, [kind], []));
    for (const raw of arr) {
      if (isPlayerCharacter(raw)) plan.characters.push(normalizeCharacter(raw));
      else plan.entries.push(normalizeEntry('npc', raw));
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

  // Loose items — Chronica's is `master_item_library`.
  for (const alias of ['items', 'master_item_library', 'inventory', 'loot', 'treasure', 'item_library']) {
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
