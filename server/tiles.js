// Small same-origin raster tile proxy for the World Atlas.
//
// The browser never talks to a tile provider directly: a descriptive
// User-Agent is required by OpenStreetMap's public tile service, and the small
// in-memory cache prevents the same tile being fetched repeatedly while a user
// pans around. Set ATLAS_TILE_URL to a self-hosted/alternate provider if needed.
const TEMPLATE = process.env.ATLAS_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const USER_AGENT = process.env.ATLAS_USER_AGENT
  || 'DnD-DS/1.0 (TTRPG world atlas; local app; contact: local-operator)';
const MAX_TILES = 500;
const cache = new Map();
const inFlight = new Map();

export async function atlasTile(z, x, y) {
  z = Number(z); x = Number(x); y = Number(y);
  const max = 2 ** z;
  if (!Number.isInteger(z) || z < 0 || z > 19
    || !Number.isInteger(x) || x < 0 || x >= max
    || !Number.isInteger(y) || y < 0 || y >= max) {
    throw new Error('Invalid tile coordinates');
  }

  const key = `${z}/${x}/${y}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (inFlight.has(key)) return inFlight.get(key);

  const url = TEMPLATE
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));

  const task = (async () => {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'image/png,image/jpeg,image/webp,image/*',
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`Tile provider returned ${res.status}`);
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > 2_000_000) throw new Error('Tile response is too large');
    const type = res.headers.get('content-type') || 'image/png';
    if (!/^image\//i.test(type)) throw new Error('Tile provider did not return an image');
    const value = { body, type };
    cache.set(key, value);
    while (cache.size > MAX_TILES) cache.delete(cache.keys().next().value);
    return value;
  })();

  inFlight.set(key, task);
  try {
    return await task;
  } finally {
    inFlight.delete(key);
  }
}
