// Small, polite geocoder adapter for the Earth Explorer.
//
// The public Nominatim service is intentionally called only when a user submits
// a search. We never use it for keystroke autocomplete, we wait at least one
// second between requests, and every result is cached. A self-hosted Nominatim
// can be supplied through GEOCODER_URL.
const GEOCODER_URL = (process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
const GEOCODER_USER_AGENT = process.env.GEOCODER_USER_AGENT
  || 'DnD-DS/1.0 (campaign map; local app; https://github.com/dripper-studios/dnd-ds)';
const CACHE_MS = 24 * 60 * 60 * 1000;
const cache = new Map();
let lastRequest = 0;
let queue = Promise.resolve();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (q) => String(q || '').replace(/\s+/g, ' ').trim().slice(0, 160);

/**
 * @returns {Promise<{results: Array, attribution: string, source: string}>}
 */
export function searchGeo(query) {
  const q = clean(query);
  if (q.length < 2) return Promise.resolve({ results: [], attribution: attribution(), source: 'local' });

  const cached = cache.get(q.toLowerCase());
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return Promise.resolve({ results: cached.results, attribution: attribution(), source: 'cache' });
  }

  // Serialise lookups so a page with several users cannot exceed the public
  // service's one-request-per-second allowance.
  queue = queue.then(async () => {
    const gap = 1150 - (Date.now() - lastRequest);
    if (gap > 0) await wait(gap);
    lastRequest = Date.now();

    const url = new URL(`${GEOCODER_URL}/search`);
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '6');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('dedupe', '1');
    url.searchParams.set('accept-language', 'en');

    const res = await fetch(url, {
      headers: {
        'User-Agent': GEOCODER_USER_AGENT,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`Geocoder returned ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('Geocoder returned an unexpected response');
    const results = rows.map((r) => ({
      id: String(r.place_id || `${r.lat},${r.lon}`),
      name: String(r.name || r.display_name?.split(',')[0] || q).slice(0, 120),
      label: String(r.display_name || '').slice(0, 240),
      lat: Number(r.lat),
      lon: Number(r.lon),
      type: String(r.type || r.category || 'place'),
    })).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon));
    cache.set(q.toLowerCase(), { at: Date.now(), results });
    return results;
  });

  return queue.then((results) => ({ results, attribution: attribution(), source: 'live' })).catch((err) => {
    // Keep the API usable when the geocoder is down; the local campaign search
    // still works and the UI explains that global search is unavailable.
    throw new Error(`Global place search is unavailable: ${err.message}`);
  });
}

function attribution() {
  return 'Search results © OpenStreetMap contributors, ODbL 1.0 · https://www.openstreetmap.org/copyright';
}
