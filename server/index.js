import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as cookie from 'cookie';
import { Server as SocketServer } from 'socket.io';

import { all, get, run, uid, now, migrate } from './db.js';
import { roll, describe, attackRoll, damageRoll } from './dice.js';
import { SPELLS, CONDITIONS, CLASSES, RACES, SKILLS, DEFAULT_SLOTS, MONSTERS } from './srd.js';

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
    notes: row.notes,
    portrait: row.portrait,
    items: items.map((i) => ({
      id: i.id, characterId: i.character_id, name: i.name, category: i.category,
      details: i.details, weight: i.weight, qty: i.qty, equipped: !!i.equipped,
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
      initBonus: r.init_bonus, speed: r.speed, attacks: P(r.attacks, []), note: r.note,
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
  notes: 'notes', portrait: 'portrait',
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

app.delete('/api/characters/:id', auth, wrap(characterAccess), wrap(async (req, res) => {
  await run('DELETE FROM items WHERE character_id = ?', [req.params.id]);
  await run('DELETE FROM characters WHERE id = ?', [req.params.id]);
  emit(req.campaignId, 'characters', await loadCharacters(req.campaignId));
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- inventory

app.post('/api/characters/:id/items', auth, wrap(characterAccess), wrap(async (req, res) => {
  const b = req.body || {};
  await run(
    `INSERT INTO items (id, character_id, name, category, details, weight, qty, equipped, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uid(), req.params.id, String(b.name || 'Item').slice(0, 60), String(b.category || 'Gear'),
      String(b.details || ''), Number(b.weight) || 0, Number(b.qty) || 1, b.equipped ? 1 : 0, now()],
  );
  emit(req.campaignId, 'characters', await loadCharacters(req.campaignId));
  res.json({ ok: true });
}));

async function itemAccess(req, res, next) {
  const item = await get('SELECT * FROM items WHERE id = ?', [req.params.id]);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  req.params.id = item.character_id;
  req.itemId = item.id;
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
  const combatants = Array.isArray(b.combatants) ? b.combatants.slice(0, 40) : [];
  const payload = {
    active: b.active ? 1 : 0,
    round: Math.max(1, Number(b.round) || 1),
    turnIndex: Math.max(0, Number(b.turnIndex) || 0),
    name: String(b.name || 'Encounter').slice(0, 60),
  };

  const exists = await get('SELECT campaign_id FROM combat WHERE campaign_id = ?', [req.campaignId]);
  if (exists) {
    await run('UPDATE combat SET active = ?, round = ?, turn_index = ?, name = ?, combatants = ?, updated_at = ? WHERE campaign_id = ?',
      [payload.active, payload.round, payload.turnIndex, payload.name, J(combatants), now(), req.campaignId]);
  } else {
    await run('INSERT INTO combat (campaign_id, active, round, turn_index, name, combatants, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.campaignId, payload.active, payload.round, payload.turnIndex, payload.name, J(combatants), now()]);
  }

  emit(req.campaignId, 'combat', await loadCombat(req.campaignId));
  res.json({ ok: true });
}));

/** Write the combat state straight back, without going through the DM-only route. */
async function persistCombat(campaignId, combat) {
  await run(
    'UPDATE combat SET active = ?, round = ?, turn_index = ?, name = ?, combatants = ?, updated_at = ? WHERE campaign_id = ?',
    [combat.active ? 1 : 0, combat.round, combat.turnIndex, combat.name, J(combat.combatants), now(), campaignId],
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

  // A player character's attacks come from their live sheet, so an attack added
  // mid-fight works without rebuilding the encounter.
  const sheet = attacker.charId ? characters.find((c) => c.id === attacker.charId) : null;
  const available = sheet?.attacks?.length ? sheet.attacks : (attacker.attacks || []);

  const attack = available[Number(req.body.index) || 0];
  if (!attack) throw bad('That attack does not exist');

  const mode = ['advantage', 'disadvantage'].includes(req.body.mode) ? req.body.mode : 'normal';
  const hitRoll = attackRoll(Number(attack.toHit) || 0, mode);

  let line;
  let damage = null;
  const hit = hitRoll.crit || (!hitRoll.fumble && hitRoll.total >= (target.ac || 10));

  if (hit) {
    damage = damageRoll(String(attack.damage || '1d4'), hitRoll.crit);
    target.hp = Math.max(0, target.hp - damage.total);

    line = `${attacker.name} ${hitRoll.crit ? 'CRITS' : 'hits'} ${target.name} with ${attack.name} `
      + `(${hitRoll.total} vs AC ${target.ac}) for ${damage.total} ${attack.type || ''} damage`.trimEnd()
      + `. ${target.name}: ${target.hp}/${target.maxHp} HP`
      + (target.hp === 0 ? ' — down!' : '');
  } else {
    line = `${attacker.name} misses ${target.name} with ${attack.name} `
      + `(${hitRoll.fumble ? 'natural 1' : `${hitRoll.total} vs AC ${target.ac}`}).`;
  }

  // Keep a player character's own sheet in step with its combat HP.
  if (target.charId) {
    await run('UPDATE characters SET hp = ? WHERE id = ?', [target.hp, target.charId]);
    emit(req.campaignId, 'characters', await loadCharacters(req.campaignId));
  }

  await persistCombat(req.campaignId, combat);
  await logCombat(req.campaignId, req.user.id, line);

  res.json({ hit, crit: hitRoll.crit, attackRoll: hitRoll.total, damage: damage?.total ?? 0, line });
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

  const next = combat.turnIndex + 1;
  combat.turnIndex = next % n;
  if (next >= n) combat.round += 1;

  await persistCombat(req.campaignId, combat);
  const up = combat.combatants[combat.turnIndex];
  if (next >= n) await logCombat(req.campaignId, req.user.id, `— Round ${combat.round} —`);
  await logCombat(req.campaignId, req.user.id, `${up.name} is up.`);
  res.json({ turnIndex: combat.turnIndex, round: combat.round });
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

// ---------------------------------------------------------------- enemy presets

app.get('/api/campaigns/:id/presets', auth, requireMember, wrap(async (req, res) => {
  const rows = await all('SELECT * FROM enemy_presets WHERE campaign_id = ? ORDER BY name', [req.campaignId]);
  res.json({
    presets: rows.map((r) => ({
      id: r.id, name: r.name, cr: r.cr, hp: r.hp, ac: r.ac,
      initBonus: r.init_bonus, speed: r.speed, attacks: P(r.attacks, []), note: r.note,
    })),
  });
}));

app.post('/api/campaigns/:id/presets', auth, requireMember, requireDM, wrap(async (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim();
  if (!name) throw bad('Give the enemy a name');

  const id = uid();
  await run(
    `INSERT INTO enemy_presets (id, campaign_id, name, cr, hp, ac, init_bonus, speed, attacks, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.campaignId, name.slice(0, 50), String(b.cr || ''), Number(b.hp) || 10, Number(b.ac) || 12,
      Number(b.initBonus) || 0, Number(b.speed) || 30,
      J(Array.isArray(b.attacks) ? b.attacks.slice(0, 8) : []), String(b.note || '').slice(0, 300), now()],
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
