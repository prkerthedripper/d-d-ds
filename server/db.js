// Database layer. Uses Postgres when DATABASE_URL is set (production / Neon),
// otherwise falls back to a local SQLite file so the app runs with zero setup.
import { randomUUID } from 'node:crypto';

const usePg = !!process.env.DATABASE_URL;
let pool = null;
let sqlite = null;

if (usePg) {
  const { default: pg } = await import('pg');
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    // Neon's free tier suspends after a few minutes idle and drops connections,
    // so keep the pool small and let idle clients go before Neon kills them.
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });

  // Without this listener a dropped idle connection is an unhandled 'error'
  // event, which takes the whole process down.
  pool.on('error', (err) => console.error('[db] idle client error (recovering):', err.message));
} else {
  const { DatabaseSync } = await import('node:sqlite');
  const file = process.env.SQLITE_FILE || 'dndds.db';
  sqlite = new DatabaseSync(file);
  sqlite.exec('PRAGMA journal_mode = WAL');
}

// SQL is written once with `?` placeholders; Postgres wants $1, $2, ...
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Errors that mean "the connection died", not "the query was wrong".
const TRANSIENT = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND',
  '57P01', // admin_shutdown — Neon suspending the database
  '57P03', // cannot_connect_now — Neon still waking up
  '08006', '08003', '08001', // connection failure / does not exist
  'XX000', // Neon returns this while resuming
]);

const isTransient = (err) => TRANSIENT.has(err.code)
  || /terminat|connection|timeout|socket/i.test(err.message || '');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a query and return all rows. On Postgres a dropped or waking connection
 * is retried a few times so a sleeping Neon database doesn't surface as a
 * failed button press.
 */
export async function all(sql, params = []) {
  if (!usePg) return sqlite.prepare(sql).all(...params);

  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return (await pool.query(toPg(sql), params)).rows;
    } catch (err) {
      lastErr = err;
      if (!isTransient(err)) throw err;
      console.warn(`[db] transient error (attempt ${attempt + 1}/4): ${err.message}`);
      await sleep(250 * 2 ** attempt); // 250ms, 500ms, 1s
    }
  }
  throw lastErr;
}

/** Run a query and return the first row (or undefined). */
export async function get(sql, params = []) {
  return (await all(sql, params))[0];
}

/** Run a statement that returns nothing. Retries via all() on Postgres. */
export async function run(sql, params = []) {
  if (usePg) {
    await all(sql, params);
    return;
  }
  sqlite.prepare(sql).run(...params);
}

export const uid = () => randomUUID();
export const now = () => Date.now();

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    dm_id TEXT NOT NULL,
    session_title TEXT DEFAULT '',
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS memberships (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS invites (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    race TEXT DEFAULT '',
    class TEXT DEFAULT '',
    level INTEGER DEFAULT 1,
    hp INTEGER DEFAULT 10,
    max_hp INTEGER DEFAULT 10,
    temp_hp INTEGER DEFAULT 0,
    ac INTEGER DEFAULT 10,
    speed INTEGER DEFAULT 30,
    init_bonus INTEGER DEFAULT 0,
    prof_bonus INTEGER DEFAULT 2,
    stats TEXT NOT NULL,
    slots TEXT NOT NULL,
    spells TEXT NOT NULL,
    coins TEXT NOT NULL,
    conditions TEXT NOT NULL,
    notes TEXT DEFAULT '',
    portrait TEXT DEFAULT '',
    created_at BIGINT NOT NULL
  )`,
  // One table behind the whole campaign codex: quests, NPCs, locations, shops
  // and timeline events differ only by `kind` and what lives in `data`.
  `CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT DEFAULT '',
    body TEXT DEFAULT '',
    image TEXT DEFAULT '',
    status TEXT DEFAULT '',
    data TEXT NOT NULL,
    dm_only INTEGER DEFAULT 0,
    author_id TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS enemy_presets (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    name TEXT NOT NULL,
    cr TEXT DEFAULT '',
    hp INTEGER DEFAULT 10,
    ac INTEGER DEFAULT 12,
    init_bonus INTEGER DEFAULT 0,
    speed INTEGER DEFAULT 30,
    attacks TEXT NOT NULL,
    note TEXT DEFAULT '',
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    character_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'Gear',
    details TEXT DEFAULT '',
    weight REAL DEFAULT 0,
    qty INTEGER DEFAULT 1,
    equipped INTEGER DEFAULT 0,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    dm_only INTEGER DEFAULT 0,
    updated_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS rolls (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    label TEXT DEFAULT '',
    formula TEXT NOT NULL,
    detail TEXT NOT NULL,
    total INTEGER NOT NULL,
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    body TEXT NOT NULL,
    kind TEXT DEFAULT 'chat',
    created_at BIGINT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS combat (
    campaign_id TEXT PRIMARY KEY,
    active INTEGER DEFAULT 0,
    round INTEGER DEFAULT 1,
    turn_index INTEGER DEFAULT 0,
    name TEXT DEFAULT 'Encounter',
    combatants TEXT NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
];

/**
 * Add a column to an existing table, ignoring the "already there" error.
 * SQLite has no ADD COLUMN IF NOT EXISTS, so both engines go through this.
 */
async function addColumn(table, column, definition) {
  try {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[db] added ${table}.${column}`);
  } catch (err) {
    if (!/duplicate column|already exists/i.test(err.message)) throw err;
  }
}

export async function migrate() {
  for (const stmt of SCHEMA) await run(stmt);

  // Added after the first release — existing campaigns need it backfilled.
  await addColumn('characters', 'attacks', `TEXT DEFAULT '[]'`);
  await run(`UPDATE characters SET attacks = '[]' WHERE attacks IS NULL`);
  await addColumn('enemy_presets', 'loot', `TEXT DEFAULT '[]'`);
  await run(`UPDATE enemy_presets SET loot = '[]' WHERE loot IS NULL`);

  await run(`CREATE INDEX IF NOT EXISTS idx_mem_campaign ON memberships(campaign_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_mem_user ON memberships(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_char_campaign ON characters(campaign_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_items_char ON items(character_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_rolls_campaign ON rolls(campaign_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_msg_campaign ON messages(campaign_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_presets_campaign ON enemy_presets(campaign_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_entries_campaign ON entries(campaign_id, kind)`);
  console.log(`[db] ready (${usePg ? 'postgres' : 'sqlite'})`);
}
