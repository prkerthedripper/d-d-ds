// Trimmed 5e SRD reference data (spells + conditions) served to the client.
// Descriptions are summarised for table use, not verbatim rules text.

export const CLASSES = [
  'Artificer', 'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk',
  'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard',
];

export const RACES = [
  'Human', 'Elf', 'Half-Elf', 'Dwarf', 'Halfling', 'Dragonborn', 'Gnome',
  'Half-Orc', 'Tiefling', 'Aasimar', 'Goliath', 'Firbolg', 'Tabaxi', 'Genasi',
];

export const SKILLS = {
  Acrobatics: 'dex', 'Animal Handling': 'wis', Arcana: 'int', Athletics: 'str',
  Deception: 'cha', History: 'int', Insight: 'wis', Intimidation: 'cha',
  Investigation: 'int', Medicine: 'wis', Nature: 'int', Perception: 'wis',
  Performance: 'cha', Persuasion: 'cha', Religion: 'int', 'Sleight of Hand': 'dex',
  Stealth: 'dex', Survival: 'wis',
};

export const CONDITIONS = [
  { name: 'Blinded', desc: "Can't see, auto-fails sight checks. Attacks against have advantage; its attacks have disadvantage." },
  { name: 'Charmed', desc: "Can't attack the charmer. The charmer has advantage on social checks against it." },
  { name: 'Deafened', desc: "Can't hear and auto-fails checks that require hearing." },
  { name: 'Frightened', desc: 'Disadvantage on checks and attacks while the source is in sight; cannot willingly move closer.' },
  { name: 'Grappled', desc: 'Speed becomes 0. Ends if the grappler is incapacitated.' },
  { name: 'Incapacitated', desc: "Can't take actions or reactions." },
  { name: 'Invisible', desc: 'Attacks against have disadvantage; its attacks have advantage.' },
  { name: 'Paralyzed', desc: 'Incapacitated, cannot move or speak, auto-fails STR/DEX saves. Hits within 5 ft are crits.' },
  { name: 'Petrified', desc: 'Turned to stone. Incapacitated, resistant to all damage, immune to poison and disease.' },
  { name: 'Poisoned', desc: 'Disadvantage on attack rolls and ability checks.' },
  { name: 'Prone', desc: 'Disadvantage on attacks. Melee attacks against have advantage, ranged have disadvantage.' },
  { name: 'Restrained', desc: 'Speed 0, disadvantage on attacks and DEX saves. Attacks against have advantage.' },
  { name: 'Stunned', desc: 'Incapacitated, auto-fails STR/DEX saves. Attacks against have advantage.' },
  { name: 'Unconscious', desc: 'Incapacitated, drops everything, prone. Hits within 5 ft are crits.' },
  { name: 'Exhaustion', desc: 'Six escalating levels, from disadvantage on checks up to death at level 6.' },
  { name: 'Concentrating', desc: 'Maintaining a spell. Taking damage forces a DC 10 (or half damage) CON save.' },
  { name: 'Inspired', desc: 'Holding Bardic Inspiration or heroic inspiration to reroll or add a die.' },
];

const s = (name, level, school, time, range, comp, duration, classes, desc) =>
  ({ name, level, school, time, range, comp, duration, classes, desc });

export const SPELLS = [
  // Cantrips
  s('Guidance', 0, 'Divination', '1 action', 'Touch', 'V, S', 'Conc. 1 min', ['Cleric', 'Druid', 'Artificer'], 'Target adds 1d4 to one ability check of its choice before the spell ends.'),
  s('Sacred Flame', 0, 'Evocation', '1 action', '60 ft', 'V, S', 'Instant', ['Cleric'], 'Target makes a DEX save or takes 1d8 radiant damage. Cover gives no benefit.'),
  s('Fire Bolt', 0, 'Evocation', '1 action', '120 ft', 'V, S', 'Instant', ['Sorcerer', 'Wizard', 'Artificer'], 'Ranged spell attack for 1d10 fire damage. Unattended objects ignite.'),
  s('Eldritch Blast', 0, 'Evocation', '1 action', '120 ft', 'V, S', 'Instant', ['Warlock'], 'Ranged spell attack for 1d10 force damage. Extra beam at levels 5, 11, and 17.'),
  s('Toll the Dead', 0, 'Necromancy', '1 action', '60 ft', 'V, S', 'Instant', ['Cleric', 'Warlock', 'Wizard'], 'WIS save or 1d8 necrotic damage — 1d12 instead if the target is already wounded.'),
  s('Mage Hand', 0, 'Conjuration', '1 action', '30 ft', 'V, S', '1 minute', ['Bard', 'Sorcerer', 'Warlock', 'Wizard'], 'Spectral hand can manipulate objects, open doors, or carry up to 10 lbs.'),
  s('Prestidigitation', 0, 'Transmutation', '1 action', '10 ft', 'V, S', 'Up to 1 hour', ['Bard', 'Sorcerer', 'Warlock', 'Wizard'], 'Minor magical trick: clean, flavor, chill, light a candle, make a sound.'),
  s('Light', 0, 'Evocation', '1 action', 'Touch', 'V, M', '1 hour', ['Bard', 'Cleric', 'Sorcerer', 'Wizard'], 'Object sheds bright light in a 20-ft radius and dim light 20 ft beyond.'),
  s('Vicious Mockery', 0, 'Enchantment', '1 action', '60 ft', 'V', 'Instant', ['Bard'], 'WIS save or 1d4 psychic damage and disadvantage on its next attack roll.'),
  s('Produce Flame', 0, 'Conjuration', '1 action', 'Self', 'V, S', '10 minutes', ['Druid'], 'Flame in your hand sheds light; can be hurled for 1d8 fire damage.'),
  s('Thorn Whip', 0, 'Transmutation', '1 action', '30 ft', 'V, S', 'Instant', ['Druid', 'Artificer'], 'Spell attack for 1d6 piercing and pulls the target 10 ft closer.'),
  s('Ray of Frost', 0, 'Evocation', '1 action', '60 ft', 'V, S', 'Instant', ['Sorcerer', 'Wizard'], 'Spell attack for 1d8 cold damage and reduces the target speed by 10 ft.'),

  // 1st level
  s('Cure Wounds', 1, 'Evocation', '1 action', 'Touch', 'V, S', 'Instant', ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Artificer'], 'Creature you touch regains 1d8 + spellcasting modifier HP. +1d8 per slot level above 1st. No effect on undead or constructs.'),
  s('Guiding Bolt', 1, 'Evocation', '1 action', '120 ft', 'V, S', '1 round', ['Cleric'], 'Ranged spell attack for 4d6 radiant damage. The next attack roll against the target has advantage. +1d6 per slot above 1st.'),
  s('Healing Word', 1, 'Evocation', '1 bonus action', '60 ft', 'V', 'Instant', ['Bard', 'Cleric', 'Druid'], 'A creature you can see regains 1d4 + spellcasting modifier HP. +1d4 per slot above 1st.'),
  s('Bless', 1, 'Enchantment', '1 action', '30 ft', 'V, S, M', 'Conc. 1 min', ['Cleric', 'Paladin'], 'Up to three creatures add 1d4 to attack rolls and saving throws.'),
  s('Shield of Faith', 1, 'Abjuration', '1 bonus action', '60 ft', 'V, S, M', 'Conc. 10 min', ['Cleric', 'Paladin'], 'Target gains +2 AC.'),
  s('Shield', 1, 'Abjuration', '1 reaction', 'Self', 'V, S', '1 round', ['Sorcerer', 'Wizard'], '+5 AC until your next turn, including against the triggering attack. Blocks magic missile.'),
  s('Magic Missile', 1, 'Evocation', '1 action', '120 ft', 'V, S', 'Instant', ['Sorcerer', 'Wizard'], 'Three darts each deal 1d4+1 force damage and always hit. +1 dart per slot above 1st.'),
  s('Burning Hands', 1, 'Evocation', '1 action', 'Self (15-ft cone)', 'V, S', 'Instant', ['Sorcerer', 'Wizard'], 'DEX save or 3d6 fire damage, half on a success. +1d6 per slot above 1st.'),
  s('Hunter’s Mark', 1, 'Divination', '1 bonus action', '90 ft', 'V', 'Conc. 1 hour', ['Ranger'], 'Deal an extra 1d6 damage to the marked target and gain advantage to track it.'),
  s('Faerie Fire', 1, 'Evocation', '1 action', '60 ft', 'V', 'Conc. 1 min', ['Bard', 'Druid', 'Artificer'], 'Objects and creatures in a 20-ft cube are outlined; attacks against them have advantage.'),
  s('Detect Magic', 1, 'Divination', '1 action', 'Self', 'V, S', 'Conc. 10 min', ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Wizard', 'Artificer'], 'Sense magic within 30 ft and learn each aura’s school.'),
  s('Sleep', 1, 'Enchantment', '1 action', '90 ft', 'V, S, M', '1 minute', ['Bard', 'Sorcerer', 'Wizard'], '5d8 HP of creatures in a 20-ft radius fall unconscious, lowest HP first.'),
  s('Thunderwave', 1, 'Evocation', '1 action', 'Self (15-ft cube)', 'V, S', 'Instant', ['Bard', 'Druid', 'Sorcerer', 'Wizard'], 'CON save or 2d8 thunder damage and pushed 10 ft; half damage on a success.'),
  s('Command', 1, 'Enchantment', '1 action', '60 ft', 'V', '1 round', ['Bard', 'Cleric', 'Paladin'], 'One-word command; WIS save or the target obeys on its next turn.'),
  s('Inflict Wounds', 1, 'Necromancy', '1 action', 'Touch', 'V, S', 'Instant', ['Cleric'], 'Melee spell attack for 3d10 necrotic damage. +1d10 per slot above 1st.'),
  s('Protection from Evil and Good', 1, 'Abjuration', '1 action', 'Touch', 'V, S, M', 'Conc. 10 min', ['Cleric', 'Paladin', 'Warlock', 'Wizard'], 'Aberrations, celestials, elementals, fey, fiends and undead have disadvantage to attack the target.'),
  s('Goodberry', 1, 'Transmutation', '1 action', 'Touch', 'V, S, M', 'Instant', ['Druid', 'Ranger'], 'Ten berries; eating one restores 1 HP and feeds a creature for a day.'),
  s('Find Familiar', 1, 'Conjuration', '1 hour', '10 ft', 'V, S, M', 'Instant', ['Wizard'], 'Summon a spirit that serves as a familiar in animal form and shares its senses with you.'),

  // 2nd level
  s('Summon Beast', 2, 'Conjuration', '1 action', '90 ft', 'V, S, M', 'Conc. 1 hour', ['Druid', 'Ranger'], 'Summon a bestial spirit — Land (a hound/wolf), Sea, or Sky form — that obeys your commands and acts on your turn. Stronger with higher slots.'),
  s('Find Steed', 2, 'Conjuration', '10 minutes', '30 ft', 'V, S', 'Instant', ['Paladin'], 'Summon a loyal intelligent mount that is bonded to you.'),
  s('Spiritual Weapon', 2, 'Evocation', '1 bonus action', '60 ft', 'V, S', '1 minute', ['Cleric'], 'A floating weapon attacks for 1d8 + spellcasting modifier force damage; move and attack as a bonus action.'),
  s('Aid', 2, 'Abjuration', '1 action', '30 ft', 'V, S, M', '8 hours', ['Cleric', 'Paladin', 'Artificer'], 'Three creatures gain +5 max HP and +5 current HP. +5 more per slot above 2nd.'),
  s('Lesser Restoration', 2, 'Abjuration', '1 action', 'Touch', 'V, S', 'Instant', ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Artificer'], 'End one disease or the blinded, deafened, paralyzed, or poisoned condition.'),
  s('Hold Person', 2, 'Enchantment', '1 action', '60 ft', 'V, S, M', 'Conc. 1 min', ['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Warlock', 'Wizard'], 'A humanoid must make a WIS save or be paralyzed, repeating the save each turn.'),
  s('Misty Step', 2, 'Conjuration', '1 bonus action', 'Self', 'V', 'Instant', ['Sorcerer', 'Warlock', 'Wizard'], 'Teleport up to 30 ft to an unoccupied space you can see.'),
  s('Scorching Ray', 2, 'Evocation', '1 action', '120 ft', 'V, S', 'Instant', ['Sorcerer', 'Wizard'], 'Three rays, each a spell attack for 2d6 fire damage. +1 ray per slot above 2nd.'),
  s('Invisibility', 2, 'Illusion', '1 action', 'Touch', 'V, S, M', 'Conc. 1 hour', ['Bard', 'Sorcerer', 'Warlock', 'Wizard'], 'Target turns invisible until it attacks or casts a spell.'),
  s('Web', 2, 'Conjuration', '1 action', '60 ft', 'V, S, M', 'Conc. 1 hour', ['Sorcerer', 'Wizard', 'Artificer'], 'A 20-ft cube of webs; DEX save or restrained. Difficult terrain and flammable.'),
  s('Silence', 2, 'Illusion', '1 action', '120 ft', 'V, S', 'Conc. 10 min', ['Bard', 'Cleric', 'Ranger'], 'No sound in a 20-ft radius; verbal spells cannot be cast inside.'),
  s('Pass Without Trace', 2, 'Abjuration', '1 action', 'Self', 'V, S, M', 'Conc. 1 hour', ['Druid', 'Ranger'], 'You and allies within 30 ft gain +10 to Stealth and leave no tracks.'),

  // 3rd level
  s('Revivify', 3, 'Necromancy', '1 action', 'Touch', 'V, S, M', 'Instant', ['Cleric', 'Paladin', 'Artificer'], 'Return a creature that died within the last minute to life with 1 HP. Costs 300 gp of diamonds.'),
  s('Fireball', 3, 'Evocation', '1 action', '150 ft', 'V, S, M', 'Instant', ['Sorcerer', 'Wizard'], 'DEX save or 8d6 fire damage in a 20-ft radius, half on a success. +1d6 per slot above 3rd.'),
  s('Counterspell', 3, 'Abjuration', '1 reaction', '60 ft', 'S', 'Instant', ['Sorcerer', 'Warlock', 'Wizard'], 'Interrupt a spell of 3rd level or lower; higher levels require an ability check.'),
  s('Spirit Guardians', 3, 'Conjuration', '1 action', 'Self (15-ft radius)', 'V, S, M', 'Conc. 10 min', ['Cleric'], 'Spirits deal 3d8 radiant or necrotic damage and halve speed in the aura; WIS save for half.'),
  s('Mass Healing Word', 3, 'Evocation', '1 bonus action', '60 ft', 'V', 'Instant', ['Cleric'], 'Up to six creatures regain 1d4 + spellcasting modifier HP.'),
  s('Dispel Magic', 3, 'Abjuration', '1 action', '120 ft', 'V, S', 'Instant', ['Bard', 'Cleric', 'Druid', 'Paladin', 'Sorcerer', 'Warlock', 'Wizard', 'Artificer'], 'End a spell of 3rd level or lower on a target; check for higher.'),
  s('Fly', 3, 'Transmutation', '1 action', 'Touch', 'V, S, M', 'Conc. 10 min', ['Sorcerer', 'Warlock', 'Wizard', 'Artificer'], 'Target gains a flying speed of 60 ft.'),
  s('Summon Fey', 3, 'Conjuration', '1 action', '90 ft', 'V, S, M', 'Conc. 1 hour', ['Druid', 'Ranger', 'Warlock', 'Wizard'], 'Summon a fey spirit — Fuming, Mirthful, or Tricksy — that fights alongside you.'),
];

/**
 * Mechanical effects for the spells that do something in a fight. Kept in its
 * own map so the descriptive list above stays readable.
 *
 *   kind    attack | save | heal | auto | mark | buff | utility
 *   scale   extra dice per slot level above the spell's own level
 *   rider   an extra consequence the server applies on a hit
 *   fx      which animation to play
 */
export const SPELL_EFFECTS = {
  // cantrips
  'Sacred Flame': { kind: 'save', save: 'dex', damage: '1d8', type: 'radiant', fx: 'radiant' },
  'Fire Bolt': { kind: 'attack', damage: '1d10', type: 'fire', fx: 'fire' },
  'Eldritch Blast': { kind: 'attack', damage: '1d10', type: 'force', fx: 'arcane' },
  'Toll the Dead': { kind: 'save', save: 'wis', damage: '1d8', type: 'necrotic', fx: 'necrotic' },
  'Vicious Mockery': { kind: 'save', save: 'wis', damage: '1d4', type: 'psychic', fx: 'arcane' },
  'Produce Flame': { kind: 'attack', damage: '1d8', type: 'fire', fx: 'fire' },
  'Thorn Whip': { kind: 'attack', damage: '1d6', type: 'piercing', fx: 'slash' },
  'Ray of Frost': { kind: 'attack', damage: '1d8', type: 'cold', fx: 'cold' },

  // 1st level
  'Cure Wounds': { kind: 'heal', heal: '1d8', addMod: true, scale: '1d8', fx: 'heal' },
  'Healing Word': { kind: 'heal', heal: '1d4', addMod: true, scale: '1d4', bonusAction: true, fx: 'heal' },
  'Guiding Bolt': {
    kind: 'attack', damage: '4d6', type: 'radiant', scale: '1d6',
    rider: { condition: 'Guiding Light', turns: 1, note: 'next attack against it has advantage' },
    fx: 'radiant',
  },
  'Inflict Wounds': { kind: 'attack', damage: '3d10', type: 'necrotic', scale: '1d10', fx: 'necrotic' },
  'Magic Missile': { kind: 'auto', damage: '3d4+3', type: 'force', scale: '1d4+1', fx: 'arcane' },
  'Burning Hands': { kind: 'save', save: 'dex', damage: '3d6', type: 'fire', scale: '1d6', half: true, fx: 'fire' },
  'Thunderwave': { kind: 'save', save: 'con', damage: '2d8', type: 'thunder', scale: '1d8', half: true, fx: 'arcane' },
  'Bless': { kind: 'buff', condition: 'Blessed', turns: 10, concentration: true, fx: 'holy' },
  'Shield of Faith': { kind: 'buff', condition: 'Shielded', turns: 10, ac: 2, concentration: true, bonusAction: true, fx: 'holy' },
  'Hunter’s Mark': {
    kind: 'mark', condition: 'Hunter’s Mark', bonus: '1d6', turns: 10,
    concentration: true, bonusAction: true, fx: 'mark',
  },
  'Faerie Fire': { kind: 'buff', target: 'enemy', condition: 'Faerie Fire', turns: 10, concentration: true, fx: 'arcane' },
  'Sleep': { kind: 'buff', target: 'enemy', condition: 'Unconscious', turns: 10, fx: 'arcane' },
  'Command': { kind: 'save', save: 'wis', condition: 'Commanded', turns: 1, fx: 'arcane' },

  // 2nd level
  'Spiritual Weapon': { kind: 'attack', damage: '1d8', addMod: true, type: 'force', bonusAction: true, fx: 'holy' },
  'Scorching Ray': { kind: 'attack', damage: '2d6', type: 'fire', rays: 3, fx: 'fire' },
  'Hold Person': { kind: 'save', save: 'wis', condition: 'Paralyzed', turns: 10, concentration: true, fx: 'arcane' },
  'Aid': { kind: 'heal', heal: '5', flat: true, fx: 'heal' },
  'Lesser Restoration': { kind: 'utility', clears: true, fx: 'heal' },
  'Misty Step': { kind: 'utility', bonusAction: true, fx: 'arcane' },
  'Summon Beast': { kind: 'utility', concentration: true, fx: 'arcane' },

  // 3rd level
  'Fireball': { kind: 'save', save: 'dex', damage: '8d6', type: 'fire', scale: '1d6', half: true, fx: 'fire' },
  'Spirit Guardians': { kind: 'save', save: 'wis', damage: '3d8', type: 'radiant', scale: '1d8', half: true, concentration: true, fx: 'holy' },
  'Mass Healing Word': { kind: 'heal', heal: '1d4', addMod: true, scale: '1d4', bonusAction: true, fx: 'heal' },
  'Revivify': { kind: 'heal', heal: '1', flat: true, fx: 'holy' },
};

/**
 * Tactical actions everyone gets, regardless of class. Modifiers are applied by
 * the server when the attack is resolved.
 */
export const COMBAT_ACTIONS = [
  {
    id: 'quick', name: 'Quick Attack', icon: 'sword', slot: 'action', needsTarget: true,
    blurb: 'Fast and accurate. +2 to hit, normal damage.',
    toHit: 2, fx: 'slash',
  },
  {
    id: 'power', name: 'Power Attack', icon: 'swords', slot: 'action', needsTarget: true,
    blurb: 'Big swing. −3 to hit, but +1d8 damage.',
    toHit: -3, bonusDamage: '1d8', fx: 'slash',
  },
  {
    id: 'defend', name: 'Defensive Stance', icon: 'shield', slot: 'action',
    blurb: 'Damage against you is halved until your next turn.',
    self: { condition: 'Defending', turns: 1 }, fx: 'shieldUp',
  },
  {
    id: 'aim', name: 'Aim', icon: 'target', slot: 'action',
    blurb: 'Steady yourself. +3 on your next attack.',
    self: { condition: 'Aiming', turns: 1 }, fx: 'aim',
  },
  {
    id: 'help', name: 'Help Ally', icon: 'users', slot: 'action', needsTarget: true, targetAlly: true,
    blurb: 'Their next attack has advantage.',
    applies: { condition: 'Helped', turns: 1 }, fx: 'holy',
  },
  {
    id: 'interact', name: 'Interact', icon: 'backpack', slot: 'action', freeText: true,
    blurb: 'Push, pull, open, close, pull a lever, spring a trap.', fx: 'none',
  },
  {
    id: 'environment', name: 'Use Environment', icon: 'sparkles', slot: 'action', freeText: true,
    blurb: 'Throw a torch, drop the chandelier, kick the barrel over.', fx: 'fire',
  },
  {
    id: 'dodge', name: 'Dodge', icon: 'refresh', slot: 'action',
    blurb: 'Attacks against you have disadvantage until your next turn.',
    self: { condition: 'Dodging', turns: 1 }, fx: 'shieldUp',
  },
];

/** Conditions the DM can hang on someone, with the icon shown by their portrait. */
export const CONDITION_LOOK = {
  Poisoned: { icon: 'potion', tint: '#4a9e3f' },
  Burning: { icon: 'fire', tint: '#e2603a' },
  Stunned: { icon: 'zap', tint: '#e0b23a' },
  Blessed: { icon: 'sparkles', tint: '#e8c86a' },
  Hidden: { icon: 'eyeOff', tint: '#7a7686' },
  Concentrating: { icon: 'brain', tint: '#8a6bff' },
  Paralyzed: { icon: 'zap', tint: '#c0392b' },
  Prone: { icon: 'arrowDown', tint: '#7a7686' },
  Restrained: { icon: 'link', tint: '#a06a2c' },
  Frightened: { icon: 'skull', tint: '#6b5b95' },
  Defending: { icon: 'shield', tint: '#3a7bd5' },
  Dodging: { icon: 'refresh', tint: '#3a7bd5' },
  Aiming: { icon: 'target', tint: '#d9a441' },
  Helped: { icon: 'users', tint: '#2e9e5b' },
  Shielded: { icon: 'shield', tint: '#e8c86a' },
  'Hunter’s Mark': { icon: 'target', tint: '#c0392b' },
  'Guiding Light': { icon: 'sparkles', tint: '#e8c86a' },
  'Faerie Fire': { icon: 'sparkles', tint: '#8a6bff' },
  Unconscious: { icon: 'skull', tint: '#7a7686' },
  Commanded: { icon: 'zap', tint: '#8a6bff' },
};

// Ready-made items the DM or a player can add to a bag. Consumables carry an
// `effect` the server applies when you press Use.
//   heal   — restore HP (dice or flat)
//   temphp — grant temporary HP
//   cure   — remove conditions
//   food   — flavour, no mechanical effect
const it = (name, category, weight, details, effect = null, price = '') =>
  ({ name, category, weight, details, effect, price });

export const ITEM_CATALOG = [
  // potions
  it('Potion of Healing', 'Potion', 0.5, 'Regain 2d4 + 2 HP.', { kind: 'heal', amount: '2d4+2' }, '50 gp'),
  it('Potion of Greater Healing', 'Potion', 0.5, 'Regain 4d4 + 4 HP.', { kind: 'heal', amount: '4d4+4' }, '150 gp'),
  it('Potion of Superior Healing', 'Potion', 0.5, 'Regain 8d4 + 8 HP.', { kind: 'heal', amount: '8d4+8' }, '450 gp'),
  it('Potion of Climbing', 'Potion', 0.5, 'Climbing speed for 1 hour.', { kind: 'buff', condition: 'Climbing', turns: 10 }, '75 gp'),
  it('Potion of Heroism', 'Potion', 0.5, '10 temp HP and Bless for 1 hour.', { kind: 'temphp', amount: '10', also: 'Blessed' }, '180 gp'),
  it('Antitoxin', 'Potion', 0, 'Advantage on poison saves for 1 hour.', { kind: 'cure', clears: ['Poisoned'] }, '50 gp'),
  it('Potion of Fire Breath', 'Potion', 0.5, 'Breathe fire, 3 times.', { kind: 'buff', condition: 'Fire Breath', turns: 10 }, '150 gp'),

  // food & rations
  it('Rations (1 day)', 'Gear', 2, 'A day of trail food.', { kind: 'food' }, '5 sp'),
  it('Bread Loaf', 'Gear', 0.5, 'A hearty loaf.', { kind: 'food' }, '2 cp'),
  it('Ale (mug)', 'Gear', 1, 'A frothy mug.', { kind: 'food' }, '4 cp'),
  it('Waterskin', 'Gear', 5, 'Holds 4 pints.', null, '2 sp'),
  it('Healer’s Kit', 'Gear', 3, 'Stabilise a dying creature (10 uses).', { kind: 'cure', clears: [] }, '5 gp'),

  // scrolls
  it('Spell Scroll (Cure Wounds)', 'Other', 0, 'Cast Cure Wounds once.', { kind: 'heal', amount: '1d8+3' }, '60 gp'),
  it('Scroll of Revivify', 'Other', 0, 'Return the newly dead to life.', null, '300 gp'),

  // weapons
  it('Longsword', 'Weapon', 3, '1d8 slashing (1d10 two-handed).', null, '15 gp'),
  it('Shortsword', 'Weapon', 2, '1d6 piercing, finesse.', null, '10 gp'),
  it('Greataxe', 'Weapon', 7, '1d12 slashing, heavy.', null, '30 gp'),
  it('Longbow', 'Weapon', 2, '1d8 piercing, range 150/600.', null, '50 gp'),
  it('Dagger', 'Weapon', 1, '1d4 piercing, finesse, thrown.', null, '2 gp'),
  it('Mace', 'Weapon', 4, '1d6 bludgeoning.', null, '5 gp'),
  it('Quarterstaff', 'Weapon', 4, '1d6 bludgeoning (1d8 two-handed).', null, '2 sp'),

  // armour
  it('Leather Armor', 'Armor', 10, 'AC 11 + Dex.', null, '10 gp'),
  it('Chain Shirt', 'Armor', 20, 'AC 13 + Dex (max 2).', null, '50 gp'),
  it('Chain Mail', 'Armor', 55, 'AC 16, needs Str 13.', null, '75 gp'),
  it('Shield', 'Armor', 6, '+2 AC.', null, '10 gp'),

  // gear
  it('Torch', 'Gear', 1, 'Bright light 20 ft for 1 hour.', null, '1 cp'),
  it('Rope, Hempen (50 ft)', 'Gear', 10, 'Strong rope.', null, '1 gp'),
  it('Thieves’ Tools', 'Gear', 1, 'Pick locks, disarm traps.', null, '25 gp'),
  it('Grappling Hook', 'Gear', 4, 'Catches on a ledge.', null, '2 gp'),
  it('Bedroll', 'Gear', 7, 'For a comfortable rest.', null, '1 gp'),
  it('Lantern, Hooded', 'Gear', 2, 'Bright light 30 ft.', null, '5 gp'),
];

export const DEFAULT_SLOTS = Object.fromEntries(
  Array.from({ length: 9 }, (_, i) => [i + 1, { max: 0, used: 0 }]),
);

// Ready-made monsters the DM can drop straight into an encounter.
// `attacks` are resolved by the server: d20 + toHit vs AC, then the damage dice.
const m = (name, cr, hp, ac, initBonus, speed, attacks, note = '', loot = []) =>
  ({ name, cr, hp, ac, initBonus, speed, attacks, note, loot });

// Loot lines. `chance` is a percentage, so 100 always drops and 25 rarely does.
const drop = (name, chance = 100, category = 'Gear', qty = '1') => ({ name, chance, category, qty });
const purse = (formula, coin = 'gp') => ({ kind: 'coins', formula, coin });

const atk = (name, toHit, damage, type) => ({ name, toHit, damage, type });

export const MONSTERS = [
  m('Kobold', '1/8', 5, 12, 2, 30, [
    atk('Dagger', 4, '1d4+2', 'piercing'),
    atk('Sling', 4, '1d4+2', 'bludgeoning'),
  ], 'Pack Tactics: advantage when an ally is next to the target.', [drop('Dagger', 60, 'Weapon'), purse('2d6', 'sp')]),

  m('Giant Rat', '1/8', 7, 12, 2, 30, [
    atk('Bite', 4, '1d4+2', 'piercing'),
  ], 'Pack Tactics.', []),

  m('Bandit', '1/8', 11, 12, 1, 30, [
    atk('Scimitar', 3, '1d6+1', 'slashing'),
    atk('Light Crossbow', 3, '1d8+1', 'piercing'),
  ], '', [drop('Scimitar', 70, 'Weapon'), drop('Light Crossbow', 30, 'Weapon'), purse('3d6', 'gp')]),

  m('Cultist', '1/8', 9, 12, 1, 30, [
    atk('Scimitar', 3, '1d6+1', 'slashing'),
  ], '', [drop('Cultist Robes', 80, 'Gear'), drop('Ritual Dagger', 40, 'Weapon'), purse('2d6', 'gp')]),

  m('Goblin', '1/4', 7, 15, 2, 30, [
    atk('Scimitar', 4, '1d6+2', 'slashing'),
    atk('Shortbow', 4, '1d6+2', 'piercing'),
  ], 'Nimble Escape: Disengage or Hide as a bonus action.', [drop('Scimitar', 70, 'Weapon'), drop('Shortbow', 40, 'Weapon'), purse('2d6', 'gp')]),

  m('Skeleton', '1/4', 13, 13, 2, 30, [
    atk('Shortsword', 4, '1d6+2', 'piercing'),
    atk('Shortbow', 4, '1d6+2', 'piercing'),
  ], 'Vulnerable to bludgeoning. Immune to poison.', [drop('Rusted Shortsword', 60, 'Weapon'), drop('Bone Fragments', 100, 'Other')]),

  m('Zombie', '1/4', 22, 8, -2, 20, [
    atk('Slam', 3, '1d6+1', 'bludgeoning'),
  ], 'Undead Fortitude: a CON save can leave it at 1 HP instead of dropping.', [drop('Tattered Rags', 100, 'Other'), purse('1d6', 'sp')]),

  m('Wolf', '1/4', 11, 13, 2, 40, [
    atk('Bite', 4, '2d4+2', 'piercing'),
  ], 'Pack Tactics. A hit can knock the target prone (DC 11 STR).', [drop('Wolf Pelt', 80, 'Other')]),

  m('Giant Spider', '1', 26, 14, 3, 30, [
    atk('Bite', 5, '1d8+3', 'piercing'),
  ], 'Web. Bite also deals 2d8 poison on a failed DC 11 CON save.', [drop('Spider Silk', 90, 'Other', '1d4'), drop('Venom Gland', 35, 'Other')]),

  m('Orc', '1/2', 15, 13, 1, 30, [
    atk('Greataxe', 5, '1d12+3', 'slashing'),
    atk('Javelin', 5, '1d6+3', 'piercing'),
  ], 'Aggressive: bonus action dash toward an enemy.', [drop('Greataxe', 70, 'Weapon'), drop('Javelin', 50, 'Weapon', '1d4'), purse('4d6', 'gp')]),

  m('Hobgoblin', '1/2', 11, 18, 1, 30, [
    atk('Longsword', 3, '1d8+1', 'slashing'),
    atk('Longbow', 3, '1d8+1', 'piercing'),
  ], '', [drop('Longsword', 70, 'Weapon'), drop('Chain Mail', 40, 'Armor'), purse('4d6', 'gp')]),

  m('Dire Wolf', '1', 37, 14, 2, 50, [
    atk('Bite', 5, '2d6+3', 'piercing'),
  ], 'Pack Tactics. A hit can knock the target prone (DC 13 STR).', [drop('Dire Wolf Pelt', 90, 'Other'), drop('Fang', 60, 'Other', '1d4')]),

  m('Bugbear', '1', 27, 16, 2, 30, [
    atk('Morningstar', 4, '2d8+2', 'piercing'),
    atk('Javelin', 4, '2d6+2', 'piercing'),
  ], 'Surprise Attack: +2d6 damage if it surprises the target.', [drop('Morningstar', 70, 'Weapon'), purse('5d6', 'gp')]),

  m('Ghoul', '1', 22, 12, 2, 30, [
    atk('Claws', 4, '2d4+2', 'slashing'),
    atk('Bite', 2, '2d6+2', 'piercing'),
  ], 'Claws can paralyze on a failed DC 10 CON save.', [drop('Grave Dirt', 100, 'Other'), purse('3d6', 'gp')]),

  m('Ogre', '2', 59, 11, -1, 40, [
    atk('Greatclub', 6, '2d8+4', 'bludgeoning'),
    atk('Javelin', 6, '2d6+4', 'piercing'),
  ], '', [drop('Greatclub', 80, 'Weapon'), purse('2d6', 'pp')]),

  m('Owlbear', '3', 59, 13, 1, 40, [
    atk('Beak', 7, '1d10+5', 'piercing'),
    atk('Claws', 7, '2d8+5', 'slashing'),
  ], 'Makes two attacks each turn: one beak, one claws.', [drop('Owlbear Feather', 100, 'Other', '1d6'), drop('Owlbear Egg', 15, 'Quest Item')]),

  m('Wight', '3', 45, 14, 2, 30, [
    atk('Longsword', 4, '1d8+2', 'slashing'),
    atk('Life Drain', 4, '1d6+2', 'necrotic'),
  ], 'Life Drain reduces the target’s maximum HP.', [drop('Longsword', 70, 'Weapon'), drop('Grave Token', 45, 'Quest Item'), purse('3d6', 'gp')]),

  m('Troll', '5', 84, 15, 1, 30, [
    atk('Bite', 7, '1d6+4', 'piercing'),
    atk('Claw', 7, '2d6+4', 'slashing'),
  ], 'Regenerates 10 HP per turn unless burned by fire or acid.', [drop('Troll Hide', 85, 'Other'), drop('Regenerating Flesh', 30, 'Other'), purse('4d6', 'pp')]),
];

