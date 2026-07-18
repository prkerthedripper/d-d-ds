// Dice notation parser: "2d6+3", "d20", "4d6kh3", "2d20kl1" (advantage/disadvantage).
import { randomInt } from 'node:crypto';

const TOKEN = /([+-]?)\s*(\d*)d(\d+)((?:kh|kl)\d*)?|([+-]?)\s*(\d+)/gi;

function rollDie(sides) {
  return randomInt(1, sides + 1);
}

export function roll(formula) {
  const clean = String(formula || '').replace(/\s+/g, '').toLowerCase();
  if (!clean) throw new Error('Empty roll');
  if (clean.length > 60) throw new Error('Formula too long');

  let total = 0;
  const parts = [];
  let matched = false;

  for (const m of clean.matchAll(TOKEN)) {
    matched = true;
    if (m[3] !== undefined) {
      const sign = m[1] === '-' ? -1 : 1;
      const count = Math.min(parseInt(m[2] || '1', 10), 50);
      const sides = Math.min(parseInt(m[3], 10), 1000);
      if (count < 1 || sides < 2) throw new Error(`Bad dice: ${m[0]}`);

      let rolls = Array.from({ length: count }, () => rollDie(sides));
      let kept = rolls;
      let dropped = [];

      if (m[4]) {
        const mode = m[4].slice(0, 2);
        const keep = Math.max(1, Math.min(parseInt(m[4].slice(2) || '1', 10), count));
        const sorted = [...rolls].sort((a, b) => (mode === 'kh' ? b - a : a - b));
        kept = sorted.slice(0, keep);
        dropped = sorted.slice(keep);
      }

      const sum = kept.reduce((a, b) => a + b, 0);
      total += sign * sum;
      parts.push({ kind: 'dice', sign, sides, rolls, kept, dropped, sum });
    } else if (m[6] !== undefined) {
      const sign = m[5] === '-' ? -1 : 1;
      const value = parseInt(m[6], 10);
      total += sign * value;
      parts.push({ kind: 'mod', sign, value });
    }
  }

  if (!matched) throw new Error(`Could not read "${formula}"`);
  return { formula: clean, total, parts };
}

/** Sum of only the dice in a result, ignoring flat modifiers. */
export function diceOnly(result) {
  return result.parts.reduce((sum, p) => (p.kind === 'dice' ? sum + p.sign * p.sum : sum), 0);
}

/**
 * A 5e attack roll. Returns the natural d20 (after advantage) so the caller can
 * spot a critical hit or an automatic miss.
 */
export function attackRoll(toHit, mode = 'normal') {
  const formula = mode === 'advantage' ? '2d20kh1'
    : mode === 'disadvantage' ? '2d20kl1'
      : '1d20';
  const r = roll(`${formula}${toHit >= 0 ? '+' : ''}${toHit}`);
  const natural = r.parts[0].kept ? r.parts[0].kept[0] : r.parts[0].rolls[0];
  return {
    natural,
    total: r.total,
    crit: natural === 20,
    fumble: natural === 1,
    detail: describe(r),
  };
}

/**
 * Damage for an attack. On a critical hit 5e doubles the dice but not the
 * flat modifier, so the dice are rolled a second time and only those added.
 */
export function damageRoll(formula, crit = false) {
  const first = roll(formula);
  if (!crit) return { total: Math.max(0, first.total), detail: describe(first), crit: false };

  const extra = roll(formula);
  const bonus = diceOnly(extra);
  return {
    total: Math.max(0, first.total + bonus),
    detail: `${describe(first)} + ${bonus} (crit dice)`,
    crit: true,
  };
}

/** Human-readable breakdown, e.g. "[7, 3] + 5" */
export function describe(result) {
  return result.parts
    .map((p, i) => {
      const op = p.sign < 0 ? '- ' : i === 0 ? '' : '+ ';
      if (p.kind === 'mod') return `${op}${p.value}`;
      const shown = p.dropped.length
        ? `[${p.kept.join(', ')} ~~${p.dropped.join(', ')}~~]`
        : `[${p.rolls.join(', ')}]`;
      return `${op}${shown}`;
    })
    .join(' ');
}
