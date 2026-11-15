import { mkdir, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const photos = [
  ['north-ponds-festival-west', 'https://upload.wikimedia.org/wikipedia/commons/1/10/WaterfrontArtFestival2018ExhibitorsFromAcrossThePond.jpg'],
  ['north-ponds-festival-east', 'https://upload.wikimedia.org/wikipedia/commons/d/d6/WaterfrontArtFestival2018ExhibitorsEastSide.jpg'],
  ['ny104-holt-road', 'https://upload.wikimedia.org/wikipedia/commons/f/f5/NY104_East_-_Hard_Road_Holt_Road_-_Button_Copy_%2842054148554%29.jpg'],
  ['ny104-five-mile-line', 'https://upload.wikimedia.org/wikipedia/commons/b/ba/NY104_East_-_Five_Mile_Line_Road_%2841870969035%29.jpg'],
  ['webster-bank-building', 'https://upload.wikimedia.org/wikipedia/commons/2/29/Webster_-_Bank_Building.jpg'],
  ['webster-village-hall', 'https://upload.wikimedia.org/wikipedia/commons/a/a7/Webster%2C_New_York_village_hall.jpg'],
  ['webster-town-hall', 'https://upload.wikimedia.org/wikipedia/commons/b/b7/Webster%2C_New_York_town_hall.jpg'],
  ['lake-road-sandbar', 'https://upload.wikimedia.org/wikipedia/commons/f/f7/Road_-_panoramio_%2855%29.jpg'],
  ['devils-cove', 'https://upload.wikimedia.org/wikipedia/commons/8/82/DevilsCoveViewedFromGlenEdith.JPG'],
  ['stony-point', 'https://upload.wikimedia.org/wikipedia/commons/3/30/StonyPointViewedFromLakeRoad.JPG'],
  ['submerged-trees', 'https://upload.wikimedia.org/wikipedia/commons/2/2e/SubmergedTreesIrondequoitBay.jpg'],
  ['spry-middle-school', 'https://upload.wikimedia.org/wikipedia/commons/b/b1/EdwardWSpryMiddleSchoolWebsterNewYork.jpg'],
  ['webster-baptist-church', 'https://upload.wikimedia.org/wikipedia/commons/e/e3/NYSRoute250WebsterWebsterBaptistChurch.jpg'],
  ['abraham-lincoln-park', 'https://upload.wikimedia.org/wikipedia/commons/7/7a/AbrahamLincolnParkViewedFromIrondequoitBayParkWest.JPG'],
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}
async function fetchWithRetry(url) {
  let last;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt) await wait(4000 * attempt);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'DnD-DS/1.0 (local campaign asset setup; contact: local project)',
        'Accept': 'image/jpeg,image/webp,image/*',
      },
    });
    if (response.ok) return response;
    last = response;
    if (response.status !== 429) break;
  }
  throw new Error(`${last?.status || 'fetch failed'} ${url}`);
}

await mkdir('.cache/webster-raw', { recursive: true });
await mkdir('public/assets/webster', { recursive: true });

for (const [slug, url] of photos) {
  const raw = join('.cache/webster-raw', `${slug}.jpg`);
  const output = join('public/assets/webster', `${slug}.webp`);
  if (await exists(output)) { console.log(slug, 'already present'); continue; }
  await wait(1600);
  try {
    const response = await fetchWithRetry(url);
    await writeFile(raw, Buffer.from(await response.arrayBuffer()));
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', raw,
      '-vf', 'scale=1400:1000:force_original_aspect_ratio=decrease',
      '-c:v', 'libwebp', '-quality', '82', '-compression_level', '6',
      output,
    ]);
    console.log(slug, 'ok');
  } catch (error) {
    console.error(slug, 'FAILED', error.message);
  }
}

const aerial = 'public/assets/webster/north-ponds-aerial.webp';
if (!(await exists(aerial))) {
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', '.cache/naip-test.jpg',
    '-vf', 'scale=1400:-2', '-c:v', 'libwebp', '-quality', '84', '-compression_level', '6',
    aerial,
  ]);
  console.log('north-ponds-aerial ok');
}
