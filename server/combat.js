// Combat rules: conditions with durations, action modifiers, and spell effects.
// Everything here is pure so it can be unit-tested without a database.

import { roll, describe, attackRoll, damageRoll } from './dice.js';
import { SPELL_EFFECTS, COMBAT_ACTIONS } from './srd.js';

export const findAction = (id) => COMBAT_ACTIONS.find((a) => a.id === id);

/** Conditions used to be plain strings; accept both and always return objects. */
export function normaliseConditions(list) {
  return (list || []).map((c) => (typeof c === 'string' ? { name: c, turns: null } : c))
    .filter((c) => c && c.name);
}

export const hasCondition = (combatant, name) =>
  normaliseConditions(combatant.conditions).some((c) => c.name === name);

export function addCondition(combatant, name, turns = null, extra = {}) {
  const list = normaliseConditions(combatant.conditions).filter((c) => c.name !== name);
  list.push({ name, turns, ...extra });
  combatant.conditions = list;
}

export function removeCondition(combatant, name) {
  combatant.conditions = normaliseConditions(combatant.conditions).filter((c) => c.name !== name);
}

/**
 * Tick a combatant's conditions down by one turn. Returns the names that ran out.
 * Conditions with turns === null are indefinite and never expire on their own.
 */
export function tickConditions(combatant) {
  const expired = [];
  combatant.conditions = normaliseConditions(combatant.conditions).filter((c) => {
    if (c.turns === null || c.turns === undefined) return true;
    const left = c.turns - 1;
    if (left <= 0) {
      expired.push(c.name);
      return false;
    }
    c.turns = left;
    return true;
  });
  return expired;
}

const abilityMod = (score) => Math.floor((Number(score || 10) - 10) / 2);

/** Spell attack bonus and save DC from the caster's sheet. */
export function spellStats(sheet) {
  const ability = sheet?.spellAbility || 'wis';
  const mod = abilityMod(sheet?.stats?.[ability]);
  const prof = Number(sheet?.profBonus) || 2;
  return { ability, mod, attack: mod + prof, dc: 8 + mod + prof };
}

/**
 * Work out how an attack lands, taking the chosen action and both sides'
 * conditions into account.
 */
export function resolveAttack({ attacker, target, attack, action, mode = 'normal' }) {
  const notes = [];
  let toHit = Number(attack.toHit) || 0;
  let advantage = mode;

  if (action?.toHit) {
    toHit += action.toHit;
    notes.push(`${action.name} ${action.toHit > 0 ? '+' : ''}${action.toHit}`);
  }

  if (hasCondition(attacker, 'Aiming')) {
    toHit += 3;
    notes.push('Aiming +3');
    removeCondition(attacker, 'Aiming');
  }

  if (hasCondition(attacker, 'Helped')) {
    advantage = 'advantage';
    notes.push('helped — advantage');
    removeCondition(attacker, 'Helped');
  }

  // Being marked, outlined or held makes a target much easier to hit.
  if (hasCondition(target, 'Guiding Light')) {
    advantage = 'advantage';
    notes.push('guiding light — advantage');
    removeCondition(target, 'Guiding Light');
  } else if (hasCondition(target, 'Faerie Fire') || hasCondition(target, 'Paralyzed')) {
    advantage = 'advantage';
    notes.push('target outlined — advantage');
  }

  if (hasCondition(target, 'Dodging') && advantage !== 'advantage') {
    advantage = 'disadvantage';
    notes.push('target dodging');
  }

  const hitRoll = attackRoll(toHit, advantage);
  const hit = hitRoll.crit || (!hitRoll.fumble && hitRoll.total >= (target.ac || 10));
  if (!hit) return { hit: false, hitRoll, notes, damage: 0, fx: hitRoll.fumble ? 'fumble' : 'miss' };

  // Damage: the weapon, plus anything the action or a mark adds.
  const main = damageRoll(String(attack.damage || '1d4'), hitRoll.crit);
  let total = main.total;
  const parts = [main.detail];

  if (action?.bonusDamage) {
    const extra = damageRoll(action.bonusDamage, hitRoll.crit);
    total += extra.total;
    parts.push(`${action.name} ${extra.detail}`);
  }

  const mark = normaliseConditions(target.conditions).find((c) => c.name === 'Hunter’s Mark');
  if (mark && mark.by === attacker.id) {
    const extra = damageRoll(mark.bonus || '1d6', hitRoll.crit);
    total += extra.total;
    parts.push(`Hunter’s Mark ${extra.detail}`);
  }

  if (hasCondition(target, 'Defending')) {
    total = Math.ceil(total / 2);
    notes.push('target defending — damage halved');
  }

  return {
    hit: true,
    hitRoll,
    notes,
    damage: total,
    detail: parts.join(' + '),
    fx: hitRoll.crit ? 'crit' : (action?.fx || 'slash'),
  };
}

/**
 * Resolve a spell against a target. Returns everything the caller needs to
 * apply HP changes, conditions and animations.
 */
export function resolveSpell({ spell, effect, caster, casterSheet, target, slotLevel }) {
  const stats = spellStats(casterSheet);
  const up = Math.max(0, (slotLevel || spell.level) - spell.level);
  const out = { spell: spell.name, fx: effect.fx || 'arcane', lines: [], damage: 0, heal: 0, conditions: [] };

  const scaled = (base) => {
    if (!effect.scale || !up) return base;
    // "4d6" + 1d6 per level -> "4d6+2d6" is easier read as a merged count
    const m = String(base).match(/^(\d+)d(\d+)(.*)$/);
    const s = String(effect.scale).match(/^(\d+)d(\d+)/);
    if (!m || !s || m[2] !== s[2]) return base;
    return `${Number(m[1]) + Number(s[1]) * up}d${m[2]}${m[3] || ''}`;
  };

  switch (effect.kind) {
    case 'attack': {
      const rays = effect.rays || 1;
      let landed = 0;
      for (let i = 0; i < rays; i++) {
        const hitRoll = attackRoll(stats.attack, 'normal');
        const isHit = hitRoll.crit || (!hitRoll.fumble && hitRoll.total >= (target?.ac || 10));
        if (!isHit) {
          out.lines.push(`${rays > 1 ? `ray ${i + 1}: ` : ''}miss `
            + (hitRoll.fumble ? '(natural 1)' : `(${hitRoll.total} vs AC ${target?.ac})`));
          if (hitRoll.fumble) out.fx = 'fumble';
          continue;
        }
        landed++;
        let dmg = scaled(effect.damage);
        if (effect.addMod) dmg += `${stats.mod >= 0 ? '+' : ''}${stats.mod}`;
        const d = damageRoll(dmg, hitRoll.crit);
        out.damage += d.total;
        out.lines.push(`${rays > 1 ? `ray ${i + 1}: ` : ''}hit for ${d.total}${hitRoll.crit ? ' (CRIT)' : ''}`);
        if (hitRoll.crit) out.fx = 'crit';
      }
      out.hit = landed > 0;
      if (landed && effect.rider) {
        out.conditions.push({ on: 'target', name: effect.rider.condition, turns: effect.rider.turns });
      }
      break;
    }

    case 'save': {
      const saveRoll = roll('1d20'); // the DM rolls the monster's save
      const saved = saveRoll.total >= stats.dc;
      if (effect.damage) {
        const d = damageRoll(scaled(effect.damage), false);
        out.damage = saved && effect.half ? Math.floor(d.total / 2) : (saved ? 0 : d.total);
        out.lines.push(`${effect.save.toUpperCase()} save ${saveRoll.total} vs DC ${stats.dc} — ${saved ? 'saved' : 'failed'}`);
      } else {
        out.lines.push(`${effect.save.toUpperCase()} save ${saveRoll.total} vs DC ${stats.dc} — ${saved ? 'saved' : 'failed'}`);
      }
      if (!saved && effect.condition) {
        out.conditions.push({ on: 'target', name: effect.condition, turns: effect.turns });
      }
      out.hit = !saved;
      break;
    }

    case 'auto': {
      const d = damageRoll(scaled(effect.damage), false);
      out.damage = d.total;
      out.hit = true;
      out.lines.push(`automatically hits for ${d.total}`);
      break;
    }

    case 'heal': {
      if (effect.flat) {
        out.heal = Number(effect.heal) * (1 + up);
      } else {
        let f = scaled(effect.heal);
        if (effect.addMod) f += `${stats.mod >= 0 ? '+' : ''}${stats.mod}`;
        const d = damageRoll(f, false);
        out.heal = d.total;
        out.lines.push(`heals ${d.total} (${d.detail})`);
      }
      break;
    }

    case 'mark':
      out.conditions.push({
        on: 'target', name: effect.condition, turns: effect.turns,
        bonus: effect.bonus, by: caster.id,
      });
      out.lines.push(`marked — +${effect.bonus} damage on hits`);
      break;

    case 'buff':
      out.conditions.push({
        on: 'target', name: effect.condition, turns: effect.turns, ac: effect.ac,
      });
      break;

    default:
      out.lines.push('cast');
      break;
  }

  if (effect.concentration) out.conditions.push({ on: 'caster', name: 'Concentrating', turns: null });
  return out;
}

export { describe };
