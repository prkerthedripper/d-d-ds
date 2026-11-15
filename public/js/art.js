// Real artwork for the modern supernatural setting: CC0 / public-domain
// photography and CC-licensed portraits. See /assets/art/CREDITS.md.

export const ART = '/assets/art';

// The campaign is set in Webster, NY. These are local, licensed photographs
// from North Ponds Park, the Route 104 corridor and the village center.
// Source and licence details: /assets/webster/CREDITS.md.
export const BACKGROUNDS = {
  home: '/assets/webster/north-ponds-festival-west.webp',
  characters: '/assets/webster/ny104-five-mile-line.webp',
  inventory: '/assets/webster/webster-village-hall.webp',
  library: '/assets/webster/webster-bank-building.webp',
  codex: '/assets/webster/webster-bank-building.webp',
  spells: '/assets/webster/north-ponds-aerial.webp',
  notes: '/assets/webster/webster-village-hall.webp',
  chat: '/assets/webster/ny104-holt-road.webp',
  settings: '/assets/webster/webster-village-hall.webp',
  dice: '/assets/webster/north-ponds-aerial.webp',
  combat: '/assets/webster/ny104-holt-road.webp',
  gate: '/assets/webster/north-ponds-aerial.webp',
  lobby: '/assets/webster/ny104-five-mile-line.webp',
  campaign: '/assets/webster/north-ponds-aerial.webp',
};

// Fantasy character art is a separate visual language from the modern Webster
// photography used by the campaign world. These are the illustrated class,
// species and background plates used by the character creator.
const RPG_ART = `${ART}/rpg`;

export const CLASS_ART = {
  artificer: `${RPG_ART}/classes/artificer.webp`,
  barbarian: `${RPG_ART}/classes/barbarian.webp`,
  bard: `${RPG_ART}/classes/bard.webp`,
  cleric: `${RPG_ART}/classes/cleric.webp`,
  druid: `${RPG_ART}/classes/druid.webp`,
  fighter: `${RPG_ART}/classes/fighter.webp`,
  monk: `${RPG_ART}/classes/monk.webp`,
  paladin: `${RPG_ART}/classes/paladin.webp`,
  ranger: `${RPG_ART}/classes/ranger.webp`,
  rogue: `${RPG_ART}/classes/rogue.webp`,
  sorcerer: `${RPG_ART}/classes/sorcerer.webp`,
  warlock: `${RPG_ART}/classes/warlock.webp`,
  wizard: `${RPG_ART}/classes/wizard.webp`,
};

export const SPECIES_ART = {
  human: `${RPG_ART}/species/human.webp`,
  elf: `${RPG_ART}/species/elf.webp`,
  'half-elf': `${RPG_ART}/species/half-elf.webp`,
  dwarf: `${RPG_ART}/species/dwarf.webp`,
  halfling: `${RPG_ART}/species/halfling.webp`,
  dragonborn: `${RPG_ART}/species/dragonborn.webp`,
  gnome: `${RPG_ART}/species/gnome.webp`,
  'half-orc': `${RPG_ART}/species/half-orc.webp`,
  tiefling: `${RPG_ART}/species/tiefling.webp`,
  aasimar: `${RPG_ART}/species/aasimar.webp`,
  goliath: `${RPG_ART}/species/goliath.webp`,
  firbolg: `${RPG_ART}/species/firbolg.webp`,
  tabaxi: `${RPG_ART}/species/tabaxi.webp`,
  genasi: `${RPG_ART}/species/genasi.webp`,
};

export const BACKGROUND_ART = {
  soldier: `${RPG_ART}/backgrounds/soldier.webp`,
  criminal: `${RPG_ART}/backgrounds/criminal.webp`,
  noble: `${RPG_ART}/backgrounds/noble.webp`,
  sage: `${RPG_ART}/backgrounds/sage.webp`,
  entertainer: `${RPG_ART}/backgrounds/entertainer.webp`,
  outlander: `${RPG_ART}/backgrounds/outlander.webp`,
  acolyte: `${RPG_ART}/backgrounds/acolyte.webp`,
  artisan: `${RPG_ART}/backgrounds/artisan.webp`,
  'folk-hero': `${RPG_ART}/backgrounds/folk-hero.webp`,
  hermit: `${RPG_ART}/backgrounds/hermit.webp`,
};

export const CHARACTER_ART = { ...CLASS_ART };
CHARACTER_ART.entity = `${ART}/characters/entity.jpg`;

export const RPG_ART_CREDITS = `${RPG_ART}/CREDITS.md`;

export const artSpecies = (species) => SPECIES_ART[String(species || '').trim().toLowerCase().replace(/[’']/g, '').replace(/\s+/g, '-')] || SPECIES_ART.human;
export const artBackground = (background) => BACKGROUND_ART[String(background || '').trim().toLowerCase().replace(/[’']/g, '').replace(/\s+/g, '-')] || BACKGROUND_ART.outlander;

export const ITEM_ART = {
  knife: `${ART}/items/knife.jpg`, pistol: `${ART}/items/pistol.jpg`,
  vest: `${ART}/items/vest.jpg`, jacket: `${ART}/items/jacket.jpg`,
  helmet: `${ART}/items/helmet.jpg`, ring: `${ART}/items/ring.jpg`,
  pendant: `${ART}/items/pendant.jpg`, notebook: `${ART}/items/notebook.jpg`,
  map: `${ART}/items/map.jpg`, medkit: `${ART}/items/medkit.jpg`,
  crystal: `${ART}/items/crystal.jpg`, gloves: `${ART}/items/gloves.jpg`,
  flashlight: `${ART}/items/flashlight.jpg`, phone: `${ART}/items/phone.jpg`,
  laptop: `${ART}/items/laptop.jpg`, backpack: `${ART}/items/backpack.jpg`,
  keys: `${ART}/items/keys.jpg`, camera: `${ART}/items/camera.jpg`,
  tools: `${ART}/items/tools.jpg`, radio: `${ART}/items/radio.jpg`,
};

export const POWER_ART = {
  barrier: `${ART}/powers/barrier.jpg`, summoning: `${ART}/powers/summoning.jpg`,
  perception: `${ART}/powers/perception.jpg`, influence: `${ART}/powers/influence.jpg`,
  energy: `${ART}/powers/energy.jpg`, combustion: `${ART}/powers/combustion.jpg`,
  entropy: `${ART}/powers/entropy.jpg`, matter: `${ART}/powers/matter.jpg`,
  restoration: `${ART}/powers/restoration.jpg`,
};

const BY_NAME = [
  [/\bsword|blade|longsword|scimitar|rapier|machete\b/i, 'knife'],
  [/\bdagger|knife|dirk|shiv\b/i, 'knife'],
  [/\bgun|pistol|revolver|handgun|rifle\b/i, 'pistol'],
  [/\bammo|arrow|bolt|magazine|clip\b/i, 'pistol'],
  [/\bvest|body armor|kevlar|shield\b/i, 'vest'],
  [/\bjacket|hoodie|coat|clothes|uniform\b/i, 'jacket'],
  [/\bhelmet|mask|beanie\b/i, 'helmet'],
  [/\bglove|gauntlet\b/i, 'gloves'],
  [/\bring\b/i, 'ring'],
  [/\bnecklace|pendant|amulet|talisman|locket\b/i, 'pendant'],
  [/\bnotebook|book|journal|tome|grimoire|manual\b/i, 'notebook'],
  [/\bmap|scroll|document|file|folder|photo\b/i, 'map'],
  [/\bpotion|medkit|first aid|bandage|vial|elixir|medicine\b/i, 'medkit'],
  [/\bcrystal|shard|gem|stone|artifact|fragment\b/i, 'crystal'],
  [/\bphone|mobile|cell|smartphone\b/i, 'phone'],
  [/\blaptop|computer|tablet\b/i, 'laptop'],
  [/\bbackpack|bag|pack\b/i, 'backpack'],
  [/\bkey|keys\b/i, 'keys'],
  [/\bcamera\b/i, 'camera'],
  [/\bflashlight|torch|lamp\b/i, 'flashlight'],
  [/\bradio|walkie|transmitter\b/i, 'radio'],
  [/\btool|wrench|screwdriver|hammer|multitool\b/i, 'tools'],
];

const BY_CATEGORY = {
  Weapon: 'knife', Armor: 'vest', Potion: 'medkit', Ammunition: 'pistol',
  'Quest Item': 'crystal', Gear: 'notebook', Other: 'map', Shield: 'vest',
};

export const artPortrait = (ch) => ch?.portrait
  || CHARACTER_ART[String(ch?.class || '').trim().toLowerCase()]
  || CHARACTER_ART.fighter;

export const artItem = (name, category) => {
  const hit = BY_NAME.find(([re]) => re.test(String(name || '')));
  const key = hit ? hit[1] : (BY_CATEGORY[category] || 'map');
  return ITEM_ART[key];
};

// Powers reuse the old spell-school slugs so existing character data keeps working.
export const POWER_BY_SCHOOL = {
  abjuration: 'barrier', conjuration: 'summoning', divination: 'perception',
  enchantment: 'influence', evocation: 'energy', illusion: 'influence',
  necromancy: 'entropy', transmutation: 'matter',
};

export const artSpell = (school) => POWER_ART[POWER_BY_SCHOOL[String(school || '').toLowerCase()]] || POWER_ART.energy;
