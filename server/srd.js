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

export const DEFAULT_SLOTS = Object.fromEntries(
  Array.from({ length: 9 }, (_, i) => [i + 1, { max: 0, used: 0 }]),
);
