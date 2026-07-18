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
