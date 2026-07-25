import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as cookie from 'cookie';
import { Server as SocketServer } from 'socket.io';

import { all, get, run, uid, now, migrate } from './db.js';
import { roll, describe } from './dice.js';
import {
  resolveAttack, resolveSpell, tickConditions, normaliseConditions,
  addCondition, removeCondition, hasCondition, findAction, spellStats,
} from './combat.js';
import {
  SPELLS, CONDITIONS, CLASSES, RACES, SKILLS, DEFAULT_SLOTS, MONSTERS,
  SPELL_EFFECTS, COMBAT_ACTIONS, CONDITION_LOOK, ITEM_CATALOG,
} from './srd.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const PROD = process.env.NODE_ENV === 'production';
const COOKIE = 'dndds_token';

if (PROD && SECRET === 'dev-secret-change-me') {
  console.warn('[warn] JWT_SECRET is not set — sessions will reset on every deploy.');
}

await migrate();

const app = express();
app.use(express.json({ limit: '2mb' })); // portraits arrive as base64 data URIs
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = new SocketServer(server);

// ---------------------------------------------------------------- helpers

const J = (v) => JSON.stringify(v);
const P = (v, fallback) => {
  try { return JSON.parse(v); } catch { return fallback; }
};

const emit = (campaignId, scope, data) => io.to(`c:${campaignId}`).emit('patch', { scope, data });

/** Wraps async handlers and async middleware so a rejection becomes a JSON error. */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch((err) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'Something went wrong' });
});

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status, expose: true });

function sign(user) {
  return jwt.sign({ uid: user.id }, SECRET, { expiresIn: '90d' });
}

function setAuthCookie(res, token) {
  res.setHeader('Set-Cookie', cookie.serialize(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: PROD,
    maxAge: 60 * 60 * 24 * 90,
    path: '/',
  }));
}

function readToken(req) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  return cookie.parse(raw)[COOKIE] || null;
}

async function userFromToken(token) {
  if (!token) return null;
  try {
    const { uid: id } = jwt.verify(token, SECRET);
    return await get('SELECT id, email, username FROM users WHERE id = ?', [id]);
  } catch {
    return null;
  }
}

const auth = wrap(async (req, res, next) => {
  const user = await userFromToken(readToken(req));
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  req.user = user;
  next();
});

/** Returns the caller's membership row, or null if they are not in the campaign. */
async function membership(campaignId, userId) {
  return get('SELECT * FROM memberships WHERE campaign_id = ? AND user_id = ?', [campaignId, userId]);
}

const requireMember = wrap(async (req, res, next) => {
  const id = req.params.campaignId || req.params.id;
  const m = await membership(id, req.user.id);
  if (!m) return res.status(403).json({ error: 'You are not in this campaign' });
  req.membership = m;
  req.campaignId = id;
  next();
});

function requireDM(req, res, next) {
  if (req.membership.role !== 'dm') return res.status(403).json({ error: 'DM only' });
  next();
}

// ---------------------------------------------------------------- shaping

function shapeCharacter(row, items = []) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    ownerId: row.owner_id,
    name: row.name,
    race: row.race,
    class: row.class,
    level: row.level,
    hp: row.hp,
    maxHp: row.max_hp,
    tempHp: row.temp_hp,
    ac: row.ac,
    speed: row.speed,
    initBonus: row.init_bonus,
    profBonus: row.prof_bonus,
    stats: P(row.stats, {}),
    slots: P(row.slots, {}),
    spells: P(row.spells, []),
    coins: P(row.coins, {}),
    conditions: P(row.conditions, []),
    attacks: P(row.attacks, []),
    spellAbility: row.spell_ability || 'wis',
    attacksPerTurn: Math.max(1, Math.min(4, row.attacks_per_turn || 1)),
    notes: row.notes,
    portrait: row.portrait,
    items: items.map((i) => ({
      id: i.id, characterId: i.character_id, name: i.name, category: i.category,
      details: i.details, weight: i.weight, qty: i.qty, equipped: !!i.equipped,
      effect: P(i.effect, null),
    })),
  };
}

async function loadCharacters(campaignId) {
  const rows = await all('SELECT * FROM characters WHERE campaign_id = ? ORDER BY created_at', [campaignId]);
  if (!rows.length) return [];
  const items = await all(
    `SELECT * FROM items WHERE character_id IN (${rows.map(() => '?').join(',')}) ORDER BY created_at`,
    rows.map((r) => r.id),
  );
  return rows.map((r) => shapeCharacter(r, items.filter((i) => i.character_id === r.id)));
}

async function loadCombat(campaignId) {
  const row = await get('SELECT * FROM combat WHERE campaign_id = ?', [campaignId]);
  if (!row) return { active: false, round: 1, turnIndex: 0, name: 'Encounter', combatants: [] };
  return {
    active: !!row.active,
    round: row.round,
    turnIndex: row.turn_index,
    name: row.name,
    combatants: P(row.combatants, []),
    turnStartedAt: Number(row.turn_started_at) || 0,
  };
}

async function loadMembers(campaignId) {
  return all(
    `SELECT m.user_id AS id, m.role, u.username, u.email
     FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.campaign_id = ? ORDER BY m.created_at`,
    [campaignId],
  );
}

async function loadNotes(campaignId, isDM) {
  const rows = await all('SELECT * FROM notes WHERE campaign_id = ? ORDER BY updated_at DESC', [campaignId]);
  return rows
    .filter((n) => isDM || !n.dm_only)
    .map((n) => ({ id: n.id, title: n.title, body: n.body, dmOnly: !!n.dm_only, authorId: n.author_id, updatedAt: Number(n.updated_at) }));
}

async function loadRolls(campaignId) {
  const rows = await all('SELECT * FROM rolls WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 40', [campaignId]);
  return rows.map((r) => ({
    id: r.id, userId: r.user_id, label: r.label, formula: r.formula,
    detail: r.detail, total: r.total, createdAt: Number(r.created_at),
  }));
}

async function loadMessages(campaignId) {
  const rows = await all('SELECT * FROM messages WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 80', [campaignId]);
  return rows.reverse().map((m) => ({
    id: m.id, userId: m.user_id, body: m.body, kind: m.kind, createdAt: Number(m.created_at),
  }));
}

// ---------------------------------------------------------------- auth API

app.post('/api/auth/register', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('That email does not look right');
  if (username.length < 2 || username.length > 24) throw bad('Username must be 2-24 characters');
  if (password.length < 6) throw bad('Password must be at least 6 characters');

  if (await get('SELECT id FROM users WHERE email = ?', [email])) {
    throw bad('An account already uses that email');
  }

  const user = { id: uid(), email, username };
  await run('INSERT INTO users (id, email, username, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
    [user.id, email, username, bcrypt.hashSync(password, 10), now()]);

  setAuthCookie(res, sign(user));
  res.json({ user });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const row = await get('SELECT * FROM users WHERE email = ?', [email]);
  if (!row || !bcrypt.compareSync(String(req.body.password || ''), row.password_hash)) {
    throw bad('Wrong email or password', 401);
  }
  const user = { id: row.id, email: row.email, username: row.username };
  setAuthCookie(res, sign(user));
  res.json({ user });
}));

app.post('/api/auth/logout', (req, res) => {
  setAuthCookie(res, '');
  res.json({ ok: true });
});

app.get('/api/me', wrap(async (req, res) => {
  const user = await userFromToken(readToken(req));
  if (!user) return res.json({ user: null });

  const campaigns = await all(
    `SELECT c.id, c.name, c.description, c.dm_id AS "dmId", c.session_title AS "sessionTitle", m.role
     FROM campaigns c JOIN memberships m ON m.campaign_id = c.id
     WHERE m.user_id = ? ORDER BY c.created_at DESC`,
    [user.id],
  );

  const invites = await all(
    `SELECT i.id, i.campaign_id AS "campaignId", c.name, u.username AS "dmName"
     FROM invites i JOIN campaigns c ON c.id = i.campaign_id JOIN users u ON u.id = c.dm_id
     WHERE i.email = ? AND i.status = 'pending'`,
    [user.email],
  );

  res.json({ user, campaigns, invites });
}));

// ---------------------------------------------------------------- campaigns

app.post('/api/campaigns', auth, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) throw bad('Give the campaign a name');

  const id = uid();
  await run('INSERT INTO campaigns (id, name, description, dm_id, session_title, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, name, String(req.body.description || ''), req.user.id, 'Session 1', now()]);
  await run('INSERT INTO memberships (id, campaign_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)',
    [uid(), id, req.user.id, 'dm', now()]);
  await run('INSERT INTO combat (campaign_id, active, round, turn_index, name, combatants, updated_at) VALUES (?, 0, 1, 0, ?, ?, ?)',
    [id, 'Encounter', '[]', now()]);

  res.json({ campaign: { id, name, role: 'dm' } });
}));

/** The whole campaign state in one payload — what the client boots from. */
app.get('/api/campaigns/:id', auth, requireMember, wrap(async (req, res) => {
  const id = req.campaignId;
  const isDM = req.membership.role === 'dm';
  const campaign = await get('SELECT id, name, description, dm_id AS "dmId", session_title AS "sessionTitle" FROM campaigns WHERE id = ?', [id]);

  res.json({
    campaign: { ...campaign, role: req.membership.role },
    members: await loadMembers(id),
    characters: await loadCharacters(id),
    combat: await loadCombat(id),
    notes: await loadNotes(id, isDM),
    rolls: await loadRolls(id),
    messages: await loadMessages(id),
    invites: isDM ? await all('SELECT id, email, status FROM invites WHERE campaign_id = ?', [id]) : [],
    entries: await loadEntries(id, isDM),
    presets: (await all('SELECT * FROM enemy_presets WHERE campaign_id = ? ORDER BY name', [id])).map((r) => ({
      id: r.id, name: r.name, cr: r.cr, hp: r.hp, ac: r.ac,
      initBonus: r.init_bonus, speed: r.speed, attacks: P(r.attacks, []),
      loot: P(r.loot, []), note: r.note,
    })),
  });
}));

app.patch('/api/campaigns/:id', auth, requireMember, requireDM, wrap(async (req, res) => {
  const fields = { name: 'name', description: 'description', sessionTitle: 'session_title' };
  for (const [key, col] of Object.entries(fields)) {
    if (req.body[key] !== undefined) {
      await run(`UPDATE campaigns SET ${col} = ? WHERE id = ?`, [String(req.body[key]), req.campaignId]);
    }
  }
  const campaign = await get('SELECT id, name, description, dm_id AS "dmId", session_title AS "sessionTitle" FROM campaigns WHERE id = ?', [req.campaignId]);
  emit(req.campaignId, 'campaign', campaign);
  res.json({ campaign });
}));

app.post('/api/campaigns/:id/invites', auth, requireMember, requireDM, wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('That email does not look right');

  const invitee = await get('SELECT id FROM users WHERE email = ?', [email]);
  if (invitee && await membership(req.campaignId, invitee.id)) throw bad('They are already in this campaign');

  const existing = await get(`SELECT id FROM invites WHERE campaign_id = ? AND email = ? AND status = 'pending'`, [req.campaignId, email]);
  if (existing) throw bad('They already have a pending invite');

  await run(`INSERT INTO invites (id, campaign_id, email, status, created_at) VALUES (?, ?, ?, 'pending', ?)`,
    [uid(), req.campaignId, email, now()]);

  emit(req.campaignId, 'invites', await all('SELECT id, email, status FROM invites WHERE campaign_id = ?', [req.campaignId]));
  res.json({ ok: true });
}));

app.post('/api/invites/:id/:action', auth, wrap(async (req, res) => {
  const invite = await get('SELECT * FROM invites WHERE id = ?', [req.params.id]);
  if (!invite || invite.email !== req.user.email) throw bad('Invite not found', 404);
  if (invite.status !== 'pending') throw bad('That invite was already used');

  if (req.params.action === 'accept') {
    if (!await membership(invite.campaign_id, req.user.id)) {
      await run('INSERT INTO memberships (id, campaign_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)',
        [uid(), invite.campaign_id, req.user.id, 'player', now()]);
    }
    await run(`UPDATE invites SET status = 'accepted' WHERE id = ?`, [invite.id]);
    emit(invite.campaign_id, 'members', await loadMembers(invite.campaign_id));
  } else {
    await run(`UPDATE invites SET status = 'declined' WHERE id = ?`, [invite.id]);
  }
  res.json({ ok: true, campaignId: invite.campaign_id });
}));

app.delete('/api/campaigns/:id/members/:userId', auth, requireMember, requireDM, wrap(async (req, res) => {
  if (req.params.userId === req.user.id) throw bad('The DM cannot leave their own campaign');
  await run('DELETE FROM memberships WHERE campaign_id = ? AND user_id = ?', [req.campaignId, req.params.userId]);
  emit(req.campaignId, 'members', await loadMembers(req.campaignId));
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- characters

const CHAR_FIELDS = {
  name: 'name', race: 'race', class: 'class', level: 'level', hp: 'hp', maxHp: 'max_hp',
  tempHp: 'temp_hp', ac: 'ac', speed: 'speed', initBonus: 'init_bonus', profBonus: 'prof_bonus',
  notes: 'notes', portrait: 'portrait', spellAbility: 'spell_ability', attacksPerTurn: 'attacks_per_turn',
};
const CHAR_JSON = {
  stats: 'stats', slots: 'slots', spells: 'spells', coins: 'coins',
  conditions: 'conditions', attacks: 'attacks',
};

app.post('/api/campaigns/:id/characters', auth, requireMember, wrap(async (req, res) => {
  const id = uid();
  const b = req.body || {};
  await run(
    `INSERT INTO characters (id, campaign_id, owner_id, name, race, class, level, hp, max_hp, temp_hp,
      ac, speed, init_bonus, prof_bonus, stats, slots, spells, coins, conditions, notes, portrait, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`,
    [
      id, req.campaignId, req.user.id, String(b.name || 'New Character').slice(0, 40),
      String(b.race || ''), String(b.class || ''), Number(b.level) || 1,
      Number(b.maxHp) || 10, Number(b.maxHp) || 10,
      Number(b.ac) || 10, Number(b.speed) || 30, Number(b.initBonus) || 0, Number(b.profBonus) || 2,
      J(b.stats || { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }),
      J(b.slots || DEFAULT_SLOTS), J(b.spells || []),
      J({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }), J([]),
      String(b.portrait || ''), now(),
    ],
  );
  emit(req.campaignId, 'characters', await loadCharacters(req.campaignId));
  res.json({ id });
}));

/** Owner can edit their own sheet; the DM can edit anyone's (HP, conditions, etc). */
async function characterAccess(req, res, next) {
  const row = await get('SELECT * FROM characters WHERE id = ?', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Character not found' });
  const m = await membership(row.campaign_id, req.user.id);
  if (!m) return res.status(403).json({ error: 'Not your campaign' });
  if (row.owner_id !== req.user.id && m.role !== 'dm') {
    return res.status(403).json({ error: 'That is not your character' });
  }
  req.character = row;
  req.campaignId = row.campaign_id;
  next();
}

app.patch('/api/characters/:id', auth, wrap(characterAccess), wrap(async (req, res) => {
  for (const [key, col] of Object.entries(CHAR_FIELDS)) {
    if (req.body[key] === undefined) continue;
    const raw = req.body[key];
    // Portraits are data URIs, so they get validated and size-capped.
    const value = key === 'portrait' ? checkImage(raw)
      : typeof raw === 'number' ? Math.round(raw)
        : String(raw);
    await run(`UPDATE characters SET ${col} = ? WHERE id = ?`, [value, req.params.id]);
  }
  for (const [key, col] of Object.entries(CHAR_JSON)) {
    if (req.body[key] === undefined) continue;
    await run(`UPDATE characters SET ${col} = ? WHERE id = ?`, [J(req.body[key]), req.params.id]);
  }
  emit(req.campaignId, 'characters', await loadCharacters(req.campaignId));
  res.json({ ok: true });
}));

/** DM hands a character to a player, who then owns and edits that sheet. */
app.patch('/api/characters/:id/owner', auth, wrap(characterAccess), wrap(async (req, res) => {
  if (req.membership?.role !== 'dm') {
    const m = await membership(req.campaignId, req.user.id);
    if (m?.role !== 'dm') throw bad('Only the DM can assign characters', 403);
  }

  const target = await membership(req.campaignId, String(req.body.userId || ''));
  if (!target) throw bad('That player is not in this campaign');

  await run('UPDATE characters SET owner_id = ? WHERE id = ?', [target.user_id, req.params.id]);
  emit(req.campaignId, 'characters', await loadCharacters(req.campaignId));

  const who = await get('SELECT username FROM users WHERE id = ?', [target.user_id]);
  await logCombat(req.campaignId, req.user.id,
    `${req.character.name} is now played by ${who?.username || 'a player'}.`);
  res.json({ ok: true });
}));

/**
 * Adjust a character's HP with a note — the DM patching damage or healing that
 * happens outside combat (a trap, a fall, a good rest), so the whole party sees
 * why. Owner or DM.
 */
app.post('/api/characters/:id/hp', auth, wrap(characterAccess), wrap(async (req, res) => {
  const c = req.character;
  const delta = Math.round(Number(req.body.delta) || 0);
  if (!delta) throw bad('Enter an amount');

  const hp = Math.max(0, Math.min(c.max_hp, c.hp + delta));
  await run('UPDATE characters SET hp = ? WHERE id = ?', [hp, c.id]);
  emit(c.campaign_id, 'characters', await loadCharacters(c.campaign_id));

  const reason = String(req.body.reason || '').slice(0, 120).trim();
  const verb = delta > 0 ? `heals ${delta}` : `takes ${-delta} damage`;
  await logCombat(c.campaign_id, req.user.id,
    `${c.name} ${verb}${reason ? ` — ${reason}` : ''}. (${hp}/${c.max_hp} HP)`);
  sendFx(c.campaign_id, delta > 0 ? { type: 'heal', heal: delta } : { type: 'slash', damage: -delta });

  res.json({ ok: true, hp });
}));

app.delete('/api/characters/:id', auth, wrap(characterAccess), wrap(async (req, res) => {
  await run('DELETE FROM items WHERE character_id = ?', [req.params.id]);
  await run('DELETE FROM characters WHERE id = ?', [req.params.id]);
  emit(req.campaignId, 'characters', await loadCharacters(req.campaignId));
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- inventory

app.post('/api/characters/:id/items', auth, wrap(characterAccess), wrap(async (req, res) => {
  const b = req.body || {};
  const characterId = req.params.id;
  const name = String(b.name || 'Item').slice(0, 60);

  // Stack with an identical item already carried.
  const existing = await get('SELECT * FROM items WHERE character_id = ? AND name = ?', [characterId, name]);
  if (existing) {
    await run('UPDATE items SET qty = ? WHERE id = ?', [existing.qty + (Number(b.qty) || 1), existing.id]);
  } else {
    await run(
      `INSERT INTO items (id, character_id, name, category, details, weight, qty, equipped, effect, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uid(), characterId, name, String(b.category || 'Gear'),
        String(b.details || ''), Number(b.weight) || 0, Number(b.qty) || 1, b.equipped ? 1 : 0,
        b.effect ? J(b.effect) : '', now()],
    );
  }
  emit(req.campaignId, 'characters', await loadCharacters(req.campaignId));
  res.json({ ok: true });
}));

/** Use a consumable: apply its effect, then drop one from the stack. */
app.post('/api/items/:id/use', auth, wrap(itemAccessRaw), wrap(async (req, res) => {
  const item = req.item;
  const effect = P(item.effect, null);
  if (!effect || effect.kind === 'food') {
    // Still let food be "eaten" — just no mechanics.
    if (effect?.kind !== 'food') throw bad('That item cannot be used');
  }

  const character = await get('SELECT * FROM characters WHERE id = ?', [item.character_id]);
  const parts = [];
  let fx = null;

  if (effect?.kind === 'heal') {
    let healed = 0;
    try { healed = roll(String(effect.amount || '1d4')).total; } catch { healed = 0; }
    const hp = Math.min(character.max_hp, character.hp + healed);
    await run('UPDATE characters SET hp = ? WHERE id = ?', [hp, character.id]);
    parts.push(`heals ${healed} (${hp}/${character.max_hp} HP)`);
    fx = { type: 'heal', heal: healed, label: item.name };
  } else if (effect?.kind === 'temphp') {
    const amount = Number(String(effect.amount).replace(/[^\d]/g, '')) || 0;
    await run('UPDATE characters SET temp_hp = ? WHERE id = ?', [Math.max(character.temp_hp, amount), character.id]);
    parts.push(`grants ${amount} temporary HP`);
    fx = { type: 'holy', label: item.name };
  } else if (effect?.kind === 'cure') {
    const conditions = P(character.conditions, []).filter((c) => {
      const name = typeof c === 'string' ? c : c.name;
      return !(effect.clears || []).includes(name);
    });
    await run('UPDATE characters SET conditions = ? WHERE id = ?', [J(conditions), character.id]);
    parts.push((effect.clears || []).length ? `cures ${effect.clears.join(', ')}` : 'used');
    fx = { type: 'heal', label: item.name };
  } else if (effect?.kind === 'food') {
    parts.push('eaten');
  }

  // Consume one.
  if (item.qty > 1) await run('UPDATE items SET qty = ? WHERE id = ?', [item.qty - 1, item.id]);
  else await run('DELETE FROM items WHERE id = ?', [item.id]);

  emit(item.character_id && req.campaignId, 'characters', await loadCharacters(req.campaignId));
  if (fx) sendFx(req.campaignId, fx);
  await logCombat(req.campaignId, req.user.id, `${character.name} uses ${item.name} — ${parts.join(', ')}.`);
  res.json({ ok: true });
}));

async function itemAccess(req, res, next) {
  const item = await get('SELECT * FROM items WHERE id = ?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  req.params.id = item.character_id;
  req.itemId = item.id;
  return characterAccess(req, res, next);
}

/** Like itemAccess but keeps the item row on req and leaves req.params alone. */
async function itemAccessRaw(req, res, next) {
  const item = await get('SELECT * FROM items WHERE id = ?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  req.item = item;
  req.params.id = item.character_id;
  return characterAccess(req, res, next);
}

app.patch('/api/items/:id', auth, wrap(itemAccess), wrap(async (req, res) => {
  const cols = { name: 'name', category: 'category', details: 'details', weight: 'weight', qty: 'qty' };
  for (const [key, col] of Object.entries(cols)) {
    if (req.body[key] === undefined) continue;
    await run(`UPDATE items SET ${col} = ? WHERE id = ?`, [req.body[key], req.itemId]);
  }
  if (req.body.equipped !== undefined) {
    await run('UPDATE items SET equipped = ? WHERE id = ?', [req.body.equipped ? 1 : 0, req.itemId]);
  }
  emit(req.campaignId, 'characters', await loadCharacters(req.campaignId));
  res.json({ ok: true });
}));

app.delete('/api/items/:id', auth, wrap(itemAccess), wrap(async (req, res) => {
  await run('DELETE FROM items WHERE id = ?', [req.itemId]);
  emit(req.campaignId, 'characters', await loadCharacters(req.campaignId));
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- dice

app.post('/api/campaigns/:id/rolls', auth, requireMember, wrap(async (req, res) => {
  let result;
  try {
    result = roll(req.body.formula);
  } catch (err) {
    throw bad(err.message);
  }

  const entry = {
    id: uid(), userId: req.user.id, label: String(req.body.label || '').slice(0, 40),
    formula: result.formula, detail: describe(result), total: result.total, createdAt: now(),
  };
  await run('INSERT INTO rolls (id, campaign_id, user_id, label, formula, detail, total, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [entry.id, req.campaignId, entry.userId, entry.label, entry.formula, entry.detail, entry.total, entry.createdAt]);

  emit(req.campaignId, 'roll', entry);
  res.json({ roll: entry });
}));

// ---------------------------------------------------------------- chat

app.post('/api/campaigns/:id/messages', auth, requireMember, wrap(async (req, res) => {
  const body = String(req.body.body || '').trim().slice(0, 800);
  if (!body) throw bad('Message is empty');

  const msg = { id: uid(), userId: req.user.id, body, kind: 'chat', createdAt: now() };
  await run('INSERT INTO messages (id, campaign_id, user_id, body, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [msg.id, req.campaignId, msg.userId, msg.body, msg.kind, msg.createdAt]);

  emit(req.campaignId, 'message', msg);
  res.json({ message: msg });
}));

// ---------------------------------------------------------------- notes

app.post('/api/campaigns/:id/notes', auth, requireMember, wrap(async (req, res) => {
  const dmOnly = req.membership.role === 'dm' && !!req.body.dmOnly;
  await run('INSERT INTO notes (id, campaign_id, author_id, title, body, dm_only, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [uid(), req.campaignId, req.user.id, String(req.body.title || 'Untitled').slice(0, 80), String(req.body.body || ''), dmOnly ? 1 : 0, now()]);
  await pushNotes(req.campaignId);
  res.json({ ok: true });
}));

async function noteAccess(req, res, next) {
  const note = await get('SELECT * FROM notes WHERE id = ?', [req.params.id]);
  if (!note) return res.status(404).json({ error: 'Note not found' });
  const m = await membership(note.campaign_id, req.user.id);
  if (!m) return res.status(403).json({ error: 'Not your campaign' });
  if (note.author_id !== req.user.id && m.role !== 'dm') {
    return res.status(403).json({ error: 'Only the author or the DM can change this note' });
  }
  req.note = note;
  req.campaignId = note.campaign_id;
  next();
}

app.patch('/api/notes/:id', auth, wrap(noteAccess), wrap(async (req, res) => {
  if (req.body.title !== undefined) await run('UPDATE notes SET title = ? WHERE id = ?', [String(req.body.title), req.params.id]);
  if (req.body.body !== undefined) await run('UPDATE notes SET body = ? WHERE id = ?', [String(req.body.body), req.params.id]);
  if (req.body.dmOnly !== undefined) await run('UPDATE notes SET dm_only = ? WHERE id = ?', [req.body.dmOnly ? 1 : 0, req.params.id]);
  await run('UPDATE notes SET updated_at = ? WHERE id = ?', [now(), req.params.id]);
  await pushNotes(req.campaignId);
  res.json({ ok: true });
}));

app.delete('/api/notes/:id', auth, wrap(noteAccess), wrap(async (req, res) => {
  await run('DELETE FROM notes WHERE id = ?', [req.params.id]);
  await pushNotes(req.campaignId);
  res.json({ ok: true });
}));

/** Notes are visibility-filtered, so the DM and players get different payloads. */
async function pushNotes(campaignId) {
  const members = await loadMembers(campaignId);
  const forPlayers = await loadNotes(campaignId, false);
  const forDM = await loadNotes(campaignId, true);
  for (const m of members) {
    io.to(`u:${m.id}:${campaignId}`).emit('patch', { scope: 'notes', data: m.role === 'dm' ? forDM : forPlayers });
  }
}

// ---------------------------------------------------------------- combat

app.put('/api/campaigns/:id/combat', auth, requireMember, requireDM, wrap(async (req, res) => {
  const b = req.body || {};
  const raw = Array.isArray(b.combatants) ? b.combatants.slice(0, 40) : [];
  // Keep the downed / death-save flags honest no matter how HP was changed:
  // a player character at 0 HP is down; any healing above 0 puts them back up.
  const combatants = raw.map((c) => {
    if (!c.charId) return c;
    if (c.hp > 0) return { ...c, downed: false, dead: false, stable: false, deathSaves: { s: 0, f: 0 } };
    if (!c.dead && !c.stable) return { ...c, downed: true, deathSaves: c.deathSaves || { s: 0, f: 0 } };
    return c;
  });
  const payload = {
    active: b.active ? 1 : 0,
    round: Math.max(1, Number(b.round) || 1),
    turnIndex: Math.max(0, Number(b.turnIndex) || 0),
    name: String(b.name || 'Encounter').slice(0, 60),
  };

  const exists = await get('SELECT campaign_id FROM combat WHERE campaign_id = ?', [req.campaignId]);
  // A fight going from idle to live gets a screen-wide "Roll Initiative" flourish.
  const prev = await loadCombat(req.campaignId);
  const justStarted = payload.active && !prev.active;
  if (exists) {
    await run(
      `UPDATE combat SET active = ?, round = ?, turn_index = ?, name = ?, combatants = ?,
       turn_started_at = ?, updated_at = ? WHERE campaign_id = ?`,
      [payload.active, payload.round, payload.turnIndex, payload.name, J(combatants),
        now(), now(), req.campaignId]);
  } else {
    await run('INSERT INTO combat (campaign_id, active, round, turn_index, name, combatants, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.campaignId, payload.active, payload.round, payload.turnIndex, payload.name, J(combatants), now()]);
  }

  emit(req.campaignId, 'combat', await loadCombat(req.campaignId));
  if (justStarted) sendFx(req.campaignId, { type: 'initiative', name: payload.name });
  res.json({ ok: true });
}));

/** Write the combat state straight back, without going through the DM-only route. */
async function persistCombat(campaignId, combat) {
  await run(
    'UPDATE combat SET active = ?, round = ?, turn_index = ?, name = ?, combatants = ?, turn_started_at = ?, updated_at = ? WHERE campaign_id = ?',
    [combat.active ? 1 : 0, combat.round, combat.turnIndex, combat.name, J(combat.combatants),
      combat.turnStartedAt || now(), now(), campaignId],
  );
  emit(campaignId, 'combat', await loadCombat(campaignId));
}

/** Post a line to the combat log (shown in chat and the combat panel). */
async function logCombat(campaignId, userId, body) {
  const msg = { id: uid(), userId, body, kind: 'system', createdAt: now() };
  await run('INSERT INTO messages (id, campaign_id, user_id, body, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [msg.id, campaignId, msg.userId, msg.body, msg.kind, msg.createdAt]);
  emit(campaignId, 'message', msg);
  return msg;
}

/** You may act for your own character; the DM may act for anyone. */
function canControl(combatant, membership, userId, characters) {
  if (membership.role === 'dm') return true;
  if (!combatant.charId) return false;
  return characters.some((c) => c.id === combatant.charId && c.ownerId === userId);
}

/** Is this combatant the one whose turn it currently is? */
function isActiveTurn(combat, combatantId) {
  if (!combat.combatants.length) return false;
  return combat.combatants[combat.turnIndex % combat.combatants.length]?.id === combatantId;
}

/**
 * Index of the next living combatant after `from`, wrapping once. Returns the
 * step count so the caller can tell how many rounds ticked over. If everyone
 * left standing is down, it just advances by one.
 */
function nextLivingTurn(combat, from) {
  const n = combat.combatants.length;
  for (let step = 1; step <= n; step++) {
    const idx = (from + step) % n;
    if (needsTurn(combat.combatants[idx])) return { index: idx, steps: step };
  }
  return { index: (from + 1) % n, steps: 1 };
}

// Up and fighting, or a downed hero who still needs a death-save turn.
const needsTurn = (c) => c.hp > 0 || (!!c.charId && c.downed && !c.dead && !c.stable);

/** Roll initiative for one combatant, then re-sort the order. */
app.post('/api/campaigns/:id/combat/initiative', auth, requireMember, wrap(async (req, res) => {
  const combat = await loadCombat(req.campaignId);
  const characters = await loadCharacters(req.campaignId);
  const target = combat.combatants.find((c) => c.id === req.body.combatantId);
  if (!target) throw bad('That combatant is not in the fight', 404);
  if (!canControl(target, req.membership, req.user.id, characters)) {
    throw bad('You can only roll for your own character', 403);
  }

  const r = roll(`1d20${target.initBonus >= 0 ? '+' : ''}${target.initBonus || 0}`);
  target.init = r.total;

  // Highest first; a tie goes to the better initiative bonus, then by name.
  combat.combatants.sort((a, b) => {
    if (a.init === null) return 1;
    if (b.init === null) return -1;
    return b.init - a.init || (b.initBonus || 0) - (a.initBonus || 0) || a.name.localeCompare(b.name);
  });

  await persistCombat(req.campaignId, combat);
  await logCombat(req.campaignId, req.user.id, `${target.name} rolled initiative: ${r.total} (${describe(r)})`);
  res.json({ init: r.total });
}));

/** DM shortcut: roll for everyone who has not rolled yet. */
app.post('/api/campaigns/:id/combat/initiative-all', auth, requireMember, requireDM, wrap(async (req, res) => {
  const combat = await loadCombat(req.campaignId);
  const rolled = [];

  for (const c of combat.combatants) {
    if (c.init !== null && c.init !== undefined) continue;
    c.init = roll(`1d20${(c.initBonus || 0) >= 0 ? '+' : ''}${c.initBonus || 0}`).total;
    rolled.push(`${c.name} ${c.init}`);
  }

  combat.combatants.sort((a, b) => (b.init ?? -99) - (a.init ?? -99)
    || (b.initBonus || 0) - (a.initBonus || 0) || a.name.localeCompare(b.name));
  combat.turnIndex = 0;

  await persistCombat(req.campaignId, combat);
  if (rolled.length) await logCombat(req.campaignId, req.user.id, `Initiative rolled — ${rolled.join(', ')}`);
  res.json({ ok: true });
}));

/**
 * Resolve one attack: d20 + to-hit against the target's AC, then damage.
 * Rolled on the server so nobody can fudge it and everyone sees the same result.
 */
app.post('/api/campaigns/:id/combat/attack', auth, requireMember, wrap(async (req, res) => {
  const combat = await loadCombat(req.campaignId);
  const characters = await loadCharacters(req.campaignId);

  const attacker = combat.combatants.find((c) => c.id === req.body.attackerId);
  const target = combat.combatants.find((c) => c.id === req.body.targetId);
  if (!attacker || !target) throw bad('Attacker or target is not in the fight', 404);
  if (attacker.id === target.id) throw bad('Pick a different target');
  if (!canControl(attacker, req.membership, req.user.id, characters)) {
    throw bad('You can only attack with your own character', 403);
  }
  if (req.membership.role !== 'dm' && !isActiveTurn(combat, attacker.id)) {
    throw bad('Wait for your turn to attack', 403);
  }

  // A player character's attacks come from their live sheet, so an attack added
  // mid-fight works without rebuilding the encounter.
  const sheet = attacker.charId ? characters.find((c) => c.id === attacker.charId) : null;
  const available = sheet?.attacks?.length ? sheet.attacks : (attacker.attacks || []);

  const attack = available[Number(req.body.index) || 0];
  if (!attack) throw bad('That attack does not exist');

  // One attack a turn, unless the character has Extra Attack (attacks per turn > 1).
  // The DM acts freely; the rule is there to keep players honest.
  const perTurn = Math.max(1, sheet?.attacksPerTurn || attacker.attacksPerTurn || 1);
  const used = Number(attacker.attacksUsed) || 0;
  if (req.membership.role !== 'dm' && used >= perTurn) {
    throw bad(perTurn > 1
      ? `You've already made all ${perTurn} of your attacks this turn.`
      : 'You already attacked this turn — end your turn or do something else.', 403);
  }

  const mode = ['advantage', 'disadvantage'].includes(req.body.mode) ? req.body.mode : 'normal';

  // Same engine as the action cards, so conditions apply here too.
  const result = resolveAttack({ attacker, target, attack, action: null, mode });
  attacker.attacksUsed = used + 1;

  let line;
  if (result.hit) {
    await applyHp(req.campaignId, target, -result.damage);
    line = `${attacker.name} ${result.hitRoll.crit ? 'CRITS' : 'hits'} ${target.name} with ${attack.name} `
      + `(${result.hitRoll.total} vs AC ${target.ac}) for ${result.damage} ${attack.type || ''} damage`.trimEnd()
      + `. ${target.name}: ${target.hp}/${target.maxHp} HP`
      + (target.hp === 0 ? ' — down!' : '');
  } else {
    line = `${attacker.name} misses ${target.name} with ${attack.name} `
      + `(${result.hitRoll.fumble ? 'natural 1' : `${result.hitRoll.total} vs AC ${target.ac}`}).`;
  }
  if (result.notes.length) line += ` [${result.notes.join(', ')}]`;

  await persistCombat(req.campaignId, combat);
  emit(req.campaignId, 'characters', await loadCharacters(req.campaignId));
  sendFx(req.campaignId, {
    type: result.fx, dmgType: attack.type, actorId: attacker.id, targetId: target.id,
    damage: result.damage, crit: result.hitRoll.crit, hit: result.hit, label: attack.name,
  });
  if (result.hit && target.hp === 0) sendFx(req.campaignId, { type: 'down', name: target.name });
  await logCombat(req.campaignId, req.user.id, line);

  res.json({
    hit: result.hit, crit: result.hitRoll.crit,
    attackRoll: result.hitRoll.total, damage: result.damage, line,
  });
}));

/**
 * Advance the turn. The DM may always do it; a player may end their own turn.
 * Wrapping past the last combatant starts the next round.
 */
app.post('/api/campaigns/:id/combat/next-turn', auth, requireMember, wrap(async (req, res) => {
  const combat = await loadCombat(req.campaignId);
  const characters = await loadCharacters(req.campaignId);
  const n = combat.combatants.length;
  if (!n) throw bad('Nobody is in the fight');

  const current = combat.combatants[combat.turnIndex % n];
  if (!canControl(current, req.membership, req.user.id, characters)) {
    throw bad('Only the DM or whoever’s turn it is can end this turn', 403);
  }

  // The finished turn is when this creature's conditions tick down.
  const expired = tickConditions(current);

  // Skip over anyone who is down — a dead enemy doesn't get a turn.
  const { index, steps } = nextLivingTurn(combat, combat.turnIndex);
  const wrapped = combat.turnIndex + steps >= n;
  combat.turnIndex = index;
  if (wrapped) combat.round += 1;
  combat.turnStartedAt = now();

  // The finished combatant's attack allowance refreshes for their next turn.
  current.attacksUsed = 0;

  await persistCombat(req.campaignId, combat);

  const up = combat.combatants[combat.turnIndex];
  if (wrapped) await logCombat(req.campaignId, req.user.id, `— Round ${combat.round} —`);
  if (expired.length) {
    await logCombat(req.campaignId, req.user.id,
      `${current.name} is no longer ${expired.join(', ')}.`);
  }
  await logCombat(req.campaignId, req.user.id,
    `${up.name} is up.${req.body.skipped ? ' (skipped)' : ''}`);

  res.json({ turnIndex: combat.turnIndex, round: combat.round, expired });
}));

/** Fold curly quotes and case so spell names compare reliably. */
const spellKey = (name) => String(name || '').toLowerCase().replace(/[’‘`´]/g, "'").trim();

/** Push an animation to everyone watching. */
const sendFx = (campaignId, fx) => io.to(`c:${campaignId}`).emit('fx', fx);

/** Send a "the DM wants a roll" prompt — to one player, or the whole party. */
const broadcastRollRequest = (campaignId, reqObj) => {
  if (reqObj.to && reqObj.to !== 'all') io.to(`u:${reqObj.to}:${campaignId}`).emit('rollreq', reqObj);
  else io.to(`c:${campaignId}`).emit('rollreq', reqObj);
};

/** Nudge a death-save tally, clamped to 3, and never below the current count. */
function bumpDeath(ds, key, by = 1) {
  const d = { s: 0, f: 0, ...(ds || {}) };
  d[key] = Math.min(3, (d[key] || 0) + by);
  return d;
}

/** Three successes = stable; three failures = dead. */
function resolveDeath(combatant) {
  const d = combatant.deathSaves || { s: 0, f: 0 };
  if (d.f >= 3) { combatant.downed = false; combatant.dead = true; }
  else if (d.s >= 3) { combatant.downed = false; combatant.stable = true; }
}

/**
 * Apply damage or healing, keep the character sheet in step, and run the 5e
 * downed / death-save rules for player characters. Taking damage at 0 HP is a
 * death-save failure (two on a crit); any healing brings a downed hero back up.
 */
async function applyHp(campaignId, combatant, delta, opts = {}) {
  const isPC = !!combatant.charId;
  const next = Math.max(0, Math.min(combatant.maxHp, combatant.hp + delta));

  if (isPC && delta < 0) {
    if (combatant.downed) {
      combatant.deathSaves = bumpDeath(combatant.deathSaves, 'f', opts.crit ? 2 : 1);
      resolveDeath(combatant);
    } else if (next === 0) {
      combatant.downed = true;
      combatant.deathSaves = { s: 0, f: 0 };
    }
  } else if (isPC && delta > 0 && combatant.downed && next > 0) {
    combatant.downed = false;
    combatant.dead = false;
    combatant.stable = false;
    combatant.deathSaves = { s: 0, f: 0 };
  }

  combatant.hp = next;
  if (isPC) await run('UPDATE characters SET hp = ? WHERE id = ?', [combatant.hp, combatant.charId]);

  // A concentrating caster who is hit must hold their spell — send them the check.
  if (delta < 0 && isPC && combatant.hp > 0 && hasCondition(combatant, 'Concentrating')) {
    const owner = await get('SELECT user_id AS "userId" FROM characters WHERE id = ?', [combatant.charId]);
    if (owner) {
      broadcastRollRequest(campaignId, {
        id: uid(), to: owner.userId, kind: 'save', ability: 'con',
        label: 'Concentration', dc: Math.max(10, Math.floor((-delta) / 2)), mode: 'normal',
        proficient: false, secret: false,
        note: `Hold concentration on ${combatant.concentratingOn?.spell || 'your spell'}`,
        at: now(),
      });
    }
  }
  return combatant.hp;
}

/**
 * Take a tactical action: the attack styles, the defensive stances, and the
 * free-form ones the DM adjudicates.
 */
app.post('/api/campaigns/:id/combat/action', auth, requireMember, wrap(async (req, res) => {
  const combat = await loadCombat(req.campaignId);
  const characters = await loadCharacters(req.campaignId);

  const actor = combat.combatants.find((c) => c.id === req.body.actorId);
  if (!actor) throw bad('You are not in this fight', 404);
  if (!canControl(actor, req.membership, req.user.id, characters)) throw bad('Not your character', 403);
  if (req.membership.role !== 'dm' && !isActiveTurn(combat, actor.id)) {
    throw bad('Wait for your turn', 403);
  }

  const action = findAction(String(req.body.actionId || ''));
  if (!action) throw bad('Unknown action');

  const target = req.body.targetId
    ? combat.combatants.find((c) => c.id === req.body.targetId)
    : null;
  if (action.needsTarget && !target) throw bad('Pick a target first');

  let line;
  let fx = { type: action.fx || 'none', actorId: actor.id, targetId: target?.id, label: action.name };

  if (action.id === 'quick' || action.id === 'power') {
    const sheet = actor.charId ? characters.find((c) => c.id === actor.charId) : null;
    const available = sheet?.attacks?.length ? sheet.attacks : (actor.attacks || []);
    const attack = available[Number(req.body.index) || 0];
    if (!attack) throw bad('That character has no attacks yet');

    // Enforce the one-attack-a-turn limit here too (Extra Attack raises it).
    const perTurn = Math.max(1, sheet?.attacksPerTurn || actor.attacksPerTurn || 1);
    const used = Number(actor.attacksUsed) || 0;
    if (req.membership.role !== 'dm' && used >= perTurn) {
      throw bad(perTurn > 1
        ? `You've already made all ${perTurn} of your attacks this turn.`
        : 'You already attacked this turn — end your turn or do something else.', 403);
    }

    const result = resolveAttack({ attacker: actor, target, attack, action, mode: req.body.mode });
    actor.attacksUsed = used + 1;

    if (result.hit) {
      await applyHp(req.campaignId, target, -result.damage);
      line = `${actor.name} — ${action.name} — ${result.hitRoll.crit ? 'CRITS' : 'hits'} ${target.name} `
        + `(${result.hitRoll.total} vs AC ${target.ac}) for ${result.damage} damage. `
        + `${target.name}: ${target.hp}/${target.maxHp} HP${target.hp === 0 ? ' — down!' : ''}`;
    } else {
      line = `${actor.name} — ${action.name} — misses ${target.name} `
        + `(${result.hitRoll.fumble ? 'natural 1' : `${result.hitRoll.total} vs AC ${target.ac}`}).`;
    }
    if (result.notes.length) line += ` [${result.notes.join(', ')}]`;
    fx = { ...fx, type: result.fx, dmgType: attack.type, damage: result.damage, crit: result.hitRoll.crit, hit: result.hit };
  } else if (action.self) {
    addCondition(actor, action.self.condition, action.self.turns);
    line = `${actor.name} takes the ${action.name} — ${action.blurb}`;
  } else if (action.applies && target) {
    addCondition(target, action.applies.condition, action.applies.turns);
    line = `${actor.name} helps ${target.name} — their next attack has advantage.`;
  } else if (action.freeText) {
    const what = String(req.body.text || '').slice(0, 200).trim();
    line = `${actor.name} — ${action.name}${what ? `: ${what}` : ''}`;
  } else {
    line = `${actor.name} takes the ${action.name}.`;
  }

  await persistCombat(req.campaignId, combat);
  emit(req.campaignId, 'characters', await loadCharacters(req.campaignId));
  sendFx(req.campaignId, fx);
  if (fx.hit && fx.damage && target && target.hp === 0) {
    sendFx(req.campaignId, { type: 'down', name: target.name });
  }
  await logCombat(req.campaignId, req.user.id, line);

  res.json({ ok: true, line, fx });
}));

/** Cast a known spell, spending the slot and applying whatever it does. */
app.post('/api/campaigns/:id/combat/cast', auth, requireMember, wrap(async (req, res) => {
  const combat = await loadCombat(req.campaignId);
  const characters = await loadCharacters(req.campaignId);

  const caster = combat.combatants.find((c) => c.id === req.body.casterId);
  if (!caster) throw bad('You are not in this fight', 404);
  if (!canControl(caster, req.membership, req.user.id, characters)) throw bad('Not your character', 403);
  if (req.membership.role !== 'dm' && !isActiveTurn(combat, caster.id)) {
    throw bad('Wait for your turn to cast', 403);
  }

  const sheet = caster.charId ? characters.find((c) => c.id === caster.charId) : null;
  if (!sheet) throw bad('Only player characters cast from a spell list');

  // Several spell names carry a typographic apostrophe (Hunter’s Mark), so match
  // on a normalised key rather than exact bytes.
  const wanted = spellKey(req.body.spellName);
  const spell = SPELLS.find((s) => spellKey(s.name) === wanted);
  if (!spell) throw bad('Unknown spell');
  if (!sheet.spells.some((n) => spellKey(n) === wanted)) {
    throw bad(`${sheet.name} does not know ${spell.name}`);
  }

  const effectKey = Object.keys(SPELL_EFFECTS).find((k) => spellKey(k) === wanted);
  const effect = SPELL_EFFECTS[effectKey] || { kind: 'utility', fx: 'arcane' };
  const slotLevel = Math.max(spell.level, Number(req.body.slotLevel) || spell.level);

  // Cantrips are free; levelled spells burn a slot of at least their own level.
  if (spell.level > 0) {
    const slots = { ...sheet.slots };
    const raw = slots[slotLevel];
    const slot = typeof raw === 'object' ? { ...raw } : { max: raw || 0, used: 0 };
    if (slot.max - slot.used <= 0) throw bad(`No level ${slotLevel} slots left`);
    slot.used += 1;
    slots[slotLevel] = slot;
    await run('UPDATE characters SET slots = ? WHERE id = ?', [J(slots), sheet.id]);
  }

  const target = req.body.targetId
    ? combat.combatants.find((c) => c.id === req.body.targetId)
    : caster;

  const result = resolveSpell({ spell, effect, caster, casterSheet: sheet, target, slotLevel });

  // Starting a new concentration spell drops whatever the caster was holding.
  if (effect.concentration) {
    const prev = caster.concentratingOn;
    if (prev && prev.condition) {
      const prevTarget = combat.combatants.find((x) => x.id === prev.targetId);
      if (prevTarget) removeCondition(prevTarget, prev.condition);
    }
    caster.concentratingOn = { spell: spell.name, targetId: target?.id || null, condition: effect.condition || null };
  }

  if (result.damage && target) await applyHp(req.campaignId, target, -result.damage);
  if (result.heal && target) await applyHp(req.campaignId, target, result.heal);

  for (const c of result.conditions) {
    const on = c.on === 'caster' ? caster : target;
    if (on) addCondition(on, c.name, c.turns, { bonus: c.bonus, by: c.by, ac: c.ac });
  }
  if (effect.clears && target) {
    for (const name of ['Poisoned', 'Paralyzed', 'Blinded', 'Deafened']) removeCondition(target, name);
  }

  const bits = [`${sheet.name} casts ${spell.name}${slotLevel > spell.level ? ` at level ${slotLevel}` : ''}`];
  if (target && target.id !== caster.id) bits.push(`on ${target.name}`);
  if (result.lines.length) bits.push(`— ${result.lines.join('; ')}`);
  if (result.damage) bits.push(`(${target?.name}: ${target?.hp}/${target?.maxHp} HP${target?.hp === 0 ? ' — down!' : ''})`);
  if (result.heal) bits.push(`(${target?.name}: ${target?.hp}/${target?.maxHp} HP)`);

  await persistCombat(req.campaignId, combat);
  emit(req.campaignId, 'characters', await loadCharacters(req.campaignId));
  sendFx(req.campaignId, {
    type: result.fx, dmgType: effect.type, spell: spell.name, actorId: caster.id, targetId: target?.id,
    damage: result.damage, heal: result.heal, label: spell.name,
  });
  if (result.damage && target && target.hp === 0) {
    sendFx(req.campaignId, { type: 'down', name: target.name });
  }
  await logCombat(req.campaignId, req.user.id, bits.join(' '));

  res.json({ ok: true, ...result });
}));

/** The DM hangs a condition on someone for a set number of turns. */
app.post('/api/campaigns/:id/combat/condition', auth, requireMember, requireDM, wrap(async (req, res) => {
  const combat = await loadCombat(req.campaignId);
  const target = combat.combatants.find((c) => c.id === req.body.combatantId);
  if (!target) throw bad('Not in this fight', 404);

  const name = String(req.body.name || '').slice(0, 30);
  if (!name) throw bad('Pick a condition');

  if (req.body.remove) {
    removeCondition(target, name);
    await logCombat(req.campaignId, req.user.id, `${target.name} is no longer ${name}.`);
  } else {
    const turns = req.body.turns === null || req.body.turns === undefined || req.body.turns === ''
      ? null
      : Math.max(1, Math.min(99, Number(req.body.turns)));
    addCondition(target, name, turns);
    await logCombat(req.campaignId, req.user.id,
      `${target.name} is ${name}${turns ? ` for ${turns} turn${turns === 1 ? '' : 's'}` : ''}.`);
  }

  await persistCombat(req.campaignId, combat);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- roll requests

/** The DM asks the party — or one player — to make a check, save or initiative. */
app.post('/api/campaigns/:id/roll-requests', auth, requireMember, requireDM, wrap(async (req, res) => {
  const b = req.body || {};
  const reqObj = {
    id: uid(),
    to: !b.to || b.to === 'all' ? 'all' : String(b.to),
    kind: b.kind === 'save' ? 'save' : b.kind === 'init' ? 'init' : 'check',
    ability: String(b.ability || 'wis').toLowerCase().slice(0, 3),
    skill: b.skill ? String(b.skill).slice(0, 30) : null,
    label: String(b.label || '').slice(0, 40),
    dc: b.dc === '' || b.dc == null ? null : Math.max(1, Math.min(40, Number(b.dc) || 0)),
    mode: ['advantage', 'disadvantage'].includes(b.mode) ? b.mode : 'normal',
    proficient: !!b.proficient,
    secret: !!b.secret,
    note: String(b.note || '').slice(0, 120),
    at: now(),
  };
  broadcastRollRequest(req.campaignId, reqObj);
  res.json({ ok: true, request: reqObj });
}));

/** A player answers a roll request; the dice are rolled on the server. */
app.post('/api/campaigns/:id/roll-requests/respond', auth, requireMember, wrap(async (req, res) => {
  const b = req.body || {};
  let result;
  try { result = roll(String(b.formula || 'd20')); } catch (err) { throw bad(err.message); }

  const dc = b.dc === '' || b.dc == null ? null : Number(b.dc);
  const entry = {
    id: uid(), userId: req.user.id, label: String(b.label || 'Requested check').slice(0, 40),
    formula: result.formula, detail: describe(result), total: result.total, createdAt: now(),
  };
  await run('INSERT INTO rolls (id, campaign_id, user_id, label, formula, detail, total, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [entry.id, req.campaignId, entry.userId, entry.label, entry.formula, entry.detail, entry.total, entry.createdAt]);

  const payload = {
    ...entry, requested: true, dc,
    pass: dc == null ? null : result.total >= dc, secret: !!b.secret,
  };

  if (b.secret) {
    // Only the roller and the DM see a secret result.
    const dmRow = await get('SELECT dm_id AS "dmId" FROM campaigns WHERE id = ?', [req.campaignId]);
    io.to(`u:${req.user.id}:${req.campaignId}`).emit('patch', { scope: 'roll', data: payload });
    if (dmRow?.dmId && dmRow.dmId !== req.user.id) {
      io.to(`u:${dmRow.dmId}:${req.campaignId}`).emit('patch', { scope: 'roll', data: payload });
    }
  } else {
    emit(req.campaignId, 'roll', payload);
  }
  res.json({ roll: payload });
}));

/** A downed player character rolls a death save on their turn. */
app.post('/api/campaigns/:id/combat/death-save', auth, requireMember, wrap(async (req, res) => {
  const combat = await loadCombat(req.campaignId);
  const characters = await loadCharacters(req.campaignId);
  const c = combat.combatants.find((x) => x.id === req.body.combatantId);
  if (!c) throw bad('Not in this fight', 404);
  if (!canControl(c, req.membership, req.user.id, characters)) throw bad('Not your character', 403);
  if (!c.downed) throw bad('That character is not making death saves');

  const r = roll('1d20');
  const nat = r.total;
  let line;
  let fx = null;

  if (nat === 20) {
    c.deathSaves = { s: 0, f: 0 };
    await applyHp(req.campaignId, c, 1);
    line = `${c.name} rolls a natural 20 on the death save — back on their feet with 1 HP!`;
    fx = { type: 'heal', heal: 1, name: c.name };
  } else if (nat === 1) {
    c.deathSaves = bumpDeath(c.deathSaves, 'f', 2);
    resolveDeath(c);
    line = `${c.name} rolls a natural 1 — two death-save failures.`;
  } else if (nat >= 10) {
    c.deathSaves = bumpDeath(c.deathSaves, 's', 1);
    resolveDeath(c);
    line = `${c.name} succeeds on a death save (rolled ${nat}).`;
  } else {
    c.deathSaves = bumpDeath(c.deathSaves, 'f', 1);
    resolveDeath(c);
    line = `${c.name} fails a death save (rolled ${nat}).`;
  }
  if (c.dead) { line += ` ${c.name} has died.`; fx = { type: 'down', name: c.name }; }
  else if (c.stable) line += ` ${c.name} is stable at 0 HP.`;

  await persistCombat(req.campaignId, combat);
  emit(req.campaignId, 'characters', await loadCharacters(req.campaignId));
  if (fx) sendFx(req.campaignId, fx);
  await logCombat(req.campaignId, req.user.id, line);

  res.json({ ok: true, roll: nat, deathSaves: c.deathSaves, dead: !!c.dead, stable: !!c.stable, revived: nat === 20 });
}));

// ---------------------------------------------------------------- codex

const KINDS = ['quest', 'npc', 'location', 'shop', 'event'];
const MAX_IMAGE = 700_000; // ~700 KB of base64, plenty for a resized photo

function shapeEntry(r) {
  return {
    id: r.id, kind: r.kind, title: r.title, subtitle: r.subtitle, body: r.body,
    image: r.image, status: r.status, data: P(r.data, {}), dmOnly: !!r.dm_only,
    authorId: r.author_id, updatedAt: Number(r.updated_at),
  };
}

async function loadEntries(campaignId, viewerIsDM) {
  const rows = await all('SELECT * FROM entries WHERE campaign_id = ? ORDER BY updated_at DESC', [campaignId]);
  return rows.filter((r) => viewerIsDM || !r.dm_only).map(shapeEntry);
}

/** Entries are visibility-filtered, so DM and players get different payloads. */
async function pushEntries(campaignId) {
  const members = await loadMembers(campaignId);
  const forPlayers = await loadEntries(campaignId, false);
  const forDM = await loadEntries(campaignId, true);
  for (const m of members) {
    io.to(`u:${m.id}:${campaignId}`).emit('patch', {
      scope: 'entries', data: m.role === 'dm' ? forDM : forPlayers,
    });
  }
}

function checkImage(image) {
  const value = String(image || '');
  if (!value) return '';
  if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(value)) throw bad('That is not a valid image');
  if (value.length > MAX_IMAGE) throw bad('That image is too big — try a smaller one');
  return value;
}

app.post('/api/campaigns/:id/entries', auth, requireMember, wrap(async (req, res) => {
  const b = req.body || {};
  const kind = KINDS.includes(b.kind) ? b.kind : 'npc';
  const id = uid();

  await run(
    `INSERT INTO entries (id, campaign_id, kind, title, subtitle, body, image, status, data, dm_only, author_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.campaignId, kind, String(b.title || 'Untitled').slice(0, 90),
      String(b.subtitle || '').slice(0, 120), String(b.body || '').slice(0, 8000),
      checkImage(b.image), String(b.status || '').slice(0, 30),
      J(b.data || {}), req.membership.role === 'dm' && b.dmOnly ? 1 : 0,
      req.user.id, now(), now()],
  );

  await pushEntries(req.campaignId);
  res.json({ id });
}));

const entryAccess = wrap(async (req, res, next) => {
  const entry = await get('SELECT * FROM entries WHERE id = ?', [req.params.id]);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  const m = await membership(entry.campaign_id, req.user.id);
  if (!m) return res.status(403).json({ error: 'Not your campaign' });
  if (entry.author_id !== req.user.id && m.role !== 'dm') {
    return res.status(403).json({ error: 'Only the author or the DM can change this' });
  }
  req.entry = entry;
  req.membership = m;
  req.campaignId = entry.campaign_id;
  next();
});

app.patch('/api/entries/:id', auth, entryAccess, wrap(async (req, res) => {
  const cols = { title: 'title', subtitle: 'subtitle', body: 'body', status: 'status' };
  for (const [key, col] of Object.entries(cols)) {
    if (req.body[key] !== undefined) {
      await run(`UPDATE entries SET ${col} = ? WHERE id = ?`, [String(req.body[key]), req.params.id]);
    }
  }
  if (req.body.image !== undefined) {
    await run('UPDATE entries SET image = ? WHERE id = ?', [checkImage(req.body.image), req.params.id]);
  }
  if (req.body.data !== undefined) {
    await run('UPDATE entries SET data = ? WHERE id = ?', [J(req.body.data), req.params.id]);
  }
  if (req.body.dmOnly !== undefined && req.membership.role === 'dm') {
    await run('UPDATE entries SET dm_only = ? WHERE id = ?', [req.body.dmOnly ? 1 : 0, req.params.id]);
  }
  await run('UPDATE entries SET updated_at = ? WHERE id = ?', [now(), req.params.id]);

  await pushEntries(req.campaignId);
  res.json({ ok: true });
}));

app.delete('/api/entries/:id', auth, entryAccess, wrap(async (req, res) => {
  await run('DELETE FROM entries WHERE id = ?', [req.params.id]);
  await pushEntries(req.campaignId);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- shopping

// 5e coin values, all in copper.
const COIN_VALUE = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };

/** "50 gp" / "2sp" / "free" -> value in copper. Unparseable means free. */
function priceInCopper(text) {
  const m = String(text || '').trim().toLowerCase().match(/^([\d.]+)\s*(cp|sp|ep|gp|pp)?/);
  if (!m) return 0;
  const amount = parseFloat(m[1]);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * (COIN_VALUE[m[2]] || COIN_VALUE.gp));
}

const purseInCopper = (coins) => Object.entries(COIN_VALUE)
  .reduce((sum, [k, v]) => sum + (Number(coins?.[k]) || 0) * v, 0);

/**
 * Turn a copper total back into coins. Deliberately stops at gold rather than
 * rolling up into platinum — "49 gp" is what a player expects to see after
 * spending, not "4 pp 9 gp".
 */
function copperToCoins(total) {
  let left = Math.max(0, Math.round(total));
  const out = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
  for (const k of ['gp', 'sp', 'cp']) {
    out[k] = Math.floor(left / COIN_VALUE[k]);
    left -= out[k] * COIN_VALUE[k];
  }
  return out;
}

/** Buy one item from a shop entry: checks funds, deducts, adds to inventory. */
app.post('/api/entries/:id/buy', auth, wrap(async (req, res) => {
  const entry = await get('SELECT * FROM entries WHERE id = ?', [req.params.id]);
  if (!entry || entry.kind !== 'shop') throw bad('That shop does not exist', 404);

  const m = await membership(entry.campaign_id, req.user.id);
  if (!m) throw bad('Not your campaign', 403);
  if (entry.dm_only && m.role !== 'dm') throw bad('That shop is not open to you', 403);

  const stock = P(entry.data, {}).stock || [];
  const item = stock[Number(req.body.index)];
  if (!item) throw bad('That item is not for sale');

  const character = await get('SELECT * FROM characters WHERE id = ?', [String(req.body.characterId || '')]);
  if (!character || character.campaign_id !== entry.campaign_id) throw bad('Character not found', 404);
  if (character.owner_id !== req.user.id && m.role !== 'dm') throw bad('That is not your character', 403);

  const qty = Math.max(1, Math.min(20, Number(req.body.qty) || 1));
  const cost = priceInCopper(item.price) * qty;
  const coins = P(character.coins, {});
  const purse = purseInCopper(coins);

  if (cost > purse) {
    throw bad(`${character.name} cannot afford that — it costs ${item.price}`);
  }

  await run('UPDATE characters SET coins = ? WHERE id = ?',
    [J(copperToCoins(purse - cost)), character.id]);

  // Stack with an identical item already carried, rather than duplicating rows.
  const existing = await get('SELECT * FROM items WHERE character_id = ? AND name = ?', [character.id, item.name]);
  if (existing) {
    await run('UPDATE items SET qty = ? WHERE id = ?', [existing.qty + qty, existing.id]);
  } else {
    await run(
      `INSERT INTO items (id, character_id, name, category, details, weight, qty, equipped, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [uid(), character.id, String(item.name).slice(0, 60), String(item.category || 'Gear'),
        `Bought from ${entry.title} for ${item.price}`, Number(item.weight) || 0, qty, now()],
    );
  }

  emit(entry.campaign_id, 'characters', await loadCharacters(entry.campaign_id));
  await logCombat(entry.campaign_id, req.user.id,
    `${character.name} bought ${qty > 1 ? `${qty}× ` : ''}${item.name} from ${entry.title} for ${item.price}${qty > 1 ? ' each' : ''}.`);

  res.json({ ok: true, coins: copperToCoins(purse - cost) });
}));

// ---------------------------------------------------------------- loot

/**
 * Roll an enemy's drops. Each line has a chance, so the same enemy can be set
 * up to always drop its weapon and only sometimes drop something good.
 */
function rollLoot(loot) {
  const items = [];
  let copper = 0;

  for (const entry of loot || []) {
    if (entry.kind === 'coins') {
      try {
        copper += priceInCopper(`${roll(entry.formula || '1d6').total} ${entry.coin || 'gp'}`);
      } catch { /* a bad formula just drops no coins */ }
      continue;
    }
    const chance = entry.chance === undefined ? 100 : Number(entry.chance);
    if (roll('1d100').total > chance) continue;

    let qty = 1;
    if (entry.qty) {
      try { qty = Math.max(1, roll(String(entry.qty)).total); } catch { qty = 1; }
    }
    items.push({ name: entry.name, category: entry.category || 'Gear', qty });
  }
  return { items, copper };
}

/** DM loots a downed enemy into a character's inventory. */
app.post('/api/campaigns/:id/combat/loot', auth, requireMember, requireDM, wrap(async (req, res) => {
  const combat = await loadCombat(req.campaignId);
  const target = combat.combatants.find((c) => c.id === req.body.combatantId);
  if (!target) throw bad('That combatant is gone', 404);
  if (target.hp > 0) throw bad('They are still standing');
  if (target.looted) throw bad('Already looted');

  const character = await get('SELECT * FROM characters WHERE id = ?', [String(req.body.characterId || '')]);
  if (!character || character.campaign_id !== req.campaignId) throw bad('Pick who is carrying it', 404);

  const { items, copper } = rollLoot(target.loot);

  for (const item of items) {
    const existing = await get('SELECT * FROM items WHERE character_id = ? AND name = ?', [character.id, item.name]);
    if (existing) {
      await run('UPDATE items SET qty = ? WHERE id = ?', [existing.qty + item.qty, existing.id]);
    } else {
      await run(
        `INSERT INTO items (id, character_id, name, category, details, weight, qty, equipped, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, 0, ?)`,
        [uid(), character.id, item.name, item.category, `Looted from ${target.name}`, item.qty, now()],
      );
    }
  }

  if (copper) {
    const coins = P(character.coins, {});
    await run('UPDATE characters SET coins = ? WHERE id = ?',
      [J(copperToCoins(purseInCopper(coins) + copper)), character.id]);
  }

  target.looted = true;
  await persistCombat(req.campaignId, combat);
  emit(req.campaignId, 'characters', await loadCharacters(req.campaignId));

  const summary = [
    ...items.map((i) => `${i.qty > 1 ? `${i.qty}× ` : ''}${i.name}`),
    ...(copper ? [`${Math.floor(copper / 100)} gp`] : []),
  ];
  await logCombat(req.campaignId, req.user.id,
    summary.length
      ? `${character.name} loots ${target.name}: ${summary.join(', ')}.`
      : `${target.name} had nothing worth taking.`);

  res.json({ items, copper });
}));

// ---------------------------------------------------------------- enemy presets

app.get('/api/campaigns/:id/presets', auth, requireMember, wrap(async (req, res) => {
  const rows = await all('SELECT * FROM enemy_presets WHERE campaign_id = ? ORDER BY name', [req.campaignId]);
  res.json({
    presets: rows.map((r) => ({
      id: r.id, name: r.name, cr: r.cr, hp: r.hp, ac: r.ac,
      initBonus: r.init_bonus, speed: r.speed, attacks: P(r.attacks, []),
      loot: P(r.loot, []), note: r.note,
    })),
  });
}));

app.post('/api/campaigns/:id/presets', auth, requireMember, requireDM, wrap(async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  if (!name) throw bad('Give the enemy a name');

  const id = uid();
  await run(
    `INSERT INTO enemy_presets (id, campaign_id, name, cr, hp, ac, init_bonus, speed, attacks, loot, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.campaignId, name.slice(0, 50), String(b.cr || ''), Number(b.hp) || 10, Number(b.ac) || 12,
      Number(b.initBonus) || 0, Number(b.speed) || 30,
      J(Array.isArray(b.attacks) ? b.attacks.slice(0, 8) : []),
      J(Array.isArray(b.loot) ? b.loot.slice(0, 12) : []),
      String(b.note || '').slice(0, 300), now()],
  );
  emit(req.campaignId, 'presets', null); // tells clients to refetch the library
  res.json({ id });
}));

app.delete('/api/campaigns/:id/presets/:presetId', auth, requireMember, requireDM, wrap(async (req, res) => {
  await run('DELETE FROM enemy_presets WHERE id = ? AND campaign_id = ?', [req.params.presetId, req.campaignId]);
  emit(req.campaignId, 'presets', null);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- reference

app.get('/api/srd', (req, res) => {
  res.json({
    spells: SPELLS, conditions: CONDITIONS, classes: CLASSES,
    races: RACES, skills: SKILLS, monsters: MONSTERS,
    spellEffects: SPELL_EFFECTS, actions: COMBAT_ACTIONS, conditionLook: CONDITION_LOOK,
    itemCatalog: ITEM_CATALOG,
  });
});

// ---------------------------------------------------------------- sockets

io.use(async (socket, next) => {
  try {
    const raw = socket.handshake.headers.cookie;
    const token = raw ? cookie.parse(raw)[COOKIE] : null;
    const user = await userFromToken(token);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  } catch (err) {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  // A throw in a socket handler is an unhandled rejection, which would take the
  // whole server down — so every handler swallows and logs instead.
  socket.on('join', async (campaignId) => {
    try {
      const m = await membership(campaignId, socket.data.user.id);
      if (!m) return;
      // Leave any previously joined campaign rooms.
      for (const room of socket.rooms) {
        if (room.startsWith('c:') || room.startsWith('u:')) socket.leave(room);
      }
      socket.join(`c:${campaignId}`);
      socket.join(`u:${socket.data.user.id}:${campaignId}`); // for visibility-filtered pushes
      socket.data.campaignId = campaignId;

      io.to(`c:${campaignId}`).emit('presence', await presenceFor(campaignId));
    } catch (err) {
      console.error('[socket] join failed:', err.message);
    }
  });

  socket.on('disconnect', async () => {
    try {
      const id = socket.data.campaignId;
      if (id) io.to(`c:${id}`).emit('presence', await presenceFor(id));
    } catch (err) {
      console.error('[socket] disconnect cleanup failed:', err.message);
    }
  });
});

async function presenceFor(campaignId) {
  const sockets = await io.in(`c:${campaignId}`).fetchSockets();
  return [...new Set(sockets.map((s) => s.data.user.id))];
}

// ---------------------------------------------------------------- static

// There is no build step and no hashed filenames, so caching by age would leave
// phones running old JavaScript after a deploy. 'no-cache' still caches, but
// forces a revalidation first — unchanged files come back as an empty 304.
const staticOptions = {
  etag: true,
  lastModified: true,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
};

app.use(express.static(path.join(__dirname, '..', 'public'), staticOptions));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Last line of defence: log and keep serving rather than dropping the party
// mid-session because one background promise misbehaved.
process.on('unhandledRejection', (err) => console.error('[fatal-guard] unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('[fatal-guard] uncaught exception:', err));

server.listen(PORT, () => console.log(`D&D DS running on http://localhost:${PORT}`));
