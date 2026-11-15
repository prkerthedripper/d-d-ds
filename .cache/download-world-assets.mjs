import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const models = [
  'island_tree_01',
  'island_tree_02',
  'fir_sapling_medium',
  'grass_medium_01',
  'fern_02',
  'boulder_01',
];

const textures = {
  grass: 'grass_medium_01',
  forest: 'brown_mud_leaves_01',
  sand: 'coast_sand_01',
  asphalt: 'asphalt_02',
  concrete: 'brushed_concrete_04',
  dirt: 'brown_mud_rocks_01',
  rock: 'rock_ground_02',
};

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'DnD-DS/1.0 (local project asset setup)' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function download(url, path) {
  await mkdir(dirname(path), { recursive: true });
  if (await exists(path)) return;
  const r = await fetch(url, { headers: { 'User-Agent': 'DnD-DS/1.0 (local project asset setup)' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  await writeFile(path, buf);
  console.log('  wrote', path, `${Math.round(buf.length / 1024)}KB`);
}

for (const id of models) {
  const meta = JSON.parse(await readFile(`.cache/${id}.json`, 'utf8'));
  const tier = meta.gltf?.['1k']?.gltf;
  if (!tier) { console.log('no gltf', id); continue; }
  const root = `.cache/raw/${id}`;
  console.log('model', id);
  await download(tier.url, join(root, `${id}.gltf`));
  for (const [rel, file] of Object.entries(tier.include || {})) {
    await download(file.url, join(root, rel));
  }
}

for (const [name, id] of Object.entries(textures)) {
  let meta;
  try {
    meta = JSON.parse(await readFile(`.cache/tex-${id}.json`, 'utf8'));
  } catch {
    meta = await fetchJson(`https://api.polyhaven.com/files/${id}`);
    await writeFile(`.cache/tex-${id}.json`, JSON.stringify(meta));
  }
  console.log('texture', name, id);
  for (const [mapName, key] of [['diffuse', 'Diffuse'], ['normal', 'nor_gl'], ['arm', 'arm'], ['rough', 'Rough']]) {
    const entry = meta[key]?.['1k']?.jpg;
    if (!entry) continue;
    await download(entry.url, `.cache/raw/textures/${name}-${mapName}.jpg`);
  }
}

console.log('done');
