#!/usr/bin/env node
// One-time art generation utility for the D&D DS character creator.
//
// The app bundles the resulting WebP files locally; it never calls the image
// service at runtime. The generated set is recorded in
// public/assets/art/rpg/generation.json and credited in CREDITS.md.
//
// Usage:
//   node tools/generate-rpg-art.mjs --test
//   node tools/generate-rpg-art.mjs
//   node tools/generate-rpg-art.mjs --force
//   node tools/generate-rpg-art.mjs --only=classes/rogue --force --reseed
//
// Requires ffmpeg on PATH for the watermark crop and WebP conversion.

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public/assets/art/rpg');
const RAW = path.join(ROOT, '.cache/rpg-art-raw');
const force = process.argv.includes('--force');
const test = process.argv.includes('--test');
const reseed = process.argv.includes('--reseed') ? 10000 : 0;
const onlyArg = process.argv.find((x) => x.startsWith('--only='));
const only = new Set((onlyArg?.slice(7) || '').split(',').filter(Boolean));
const concurrency = 1;

const STYLE = 'premium fantasy RPG sourcebook illustration, painterly digital oil painting, cinematic volumetric lighting, rich material detail, strong readable silhouette, muted earthy palette with antique gold and subtle arcane violet accents, dark atmospheric background, professional concept art, no text, no watermark, no logo, no border, no UI, no collage';

const CLASSES = [
  ['artificer', 'arcane engineer with visible face, brass goggles pushed up on forehead, large mechanical prosthetic arm with exposed gears, glowing wrench, leather apron, tool belt, workshop, no staff, full figure from head to boots'],
  ['barbarian', 'powerful warrior, rugged fur and leather armour, greataxe, war paint, fierce expression, muscular build'],
  ['bard', 'charismatic travelling bard, stylish embroidered doublet, lute, rapier, expressive confident pose'],
  ['cleric', 'armoured healer-priest, ceremonial mail, mace, shield with a holy symbol, divine golden light'],
  ['druid', 'nature guardian, layered earth-toned robes, antler circlet, living wooden staff, leaves and animal motifs'],
  ['fighter', 'disciplined veteran with visible head and face, detailed steel half-plate, longsword and kite shield, grounded heroic stance, entire figure from head to boots, no helmet'],
  ['monk', 'martial artist with visible face, practical wrapped robes, wrapped fists, quarterstaff, dynamic balanced fighting stance, full figure from head to boots'],
  ['paladin', 'commanding holy knight, ornate plate armour, greatsword and shield, radiant gold trim, oathbound presence'],
  ['ranger', 'wilderness hunter with visible face and no hood, green cloak, leather armour, longbow held ready, quiver of arrows, forest ambush stance, full figure from head to boots'],
  ['rogue', 'roguish dagger duelist, young man with short auburn hair and a fully visible face, no head covering, open-necked deep burgundy leather jerkin, two drawn daggers, standing in a sunlit stone market, warm golden daylight, full colour, detailed expressive face, full figure from head to boots'],
  ['sorcerer', 'innate spellcaster with visible face, elegant travel clothes, hands wreathed in wild lightning and fire, no staff, no spellbook, full figure from head to boots, dramatic raw magic'],
  ['warlock', 'mysterious pact-bound spellcaster, dark layered robes, strange amulet, eldritch shadow and violet flame'],
  ['wizard', 'learned spellcaster, deep blue robes, spellbook, staff, floating arcane sigils, scholarly bearing'],
];

const SPECIES = [
  ['human', 'adaptable human traveller with ordinary rounded ears, determined expression, practical weathered clothing, unmistakably human'],
  ['elf', 'unmistakably elven traveller with very long pointed ears, sharp cheekbones, tall slender build, elegant embroidered cloak'],
  ['half-elf', 'unmistakably half-elven traveller with subtly pointed ears, blended human and elven features, practical cloak'],
  ['dwarf', 'unmistakably dwarven traveller, short broad powerful build, very thick braided auburn beard with iron rings, large nose, heavy brow, pointed ears, runed leather and iron, clearly non-human'],
  ['halfling', 'unmistakably halfling traveller, mature adult with small stature, round friendly face, very large pointed ears, curly sideburns, waistcoat and traveller cloak, clearly not a human child'],
  ['dragonborn', 'unmistakably dragonborn traveller, reptilian scaled skin, dragon snout, horned draconic head, no hair, elemental-coloured eyes, proud bearing'],
  ['gnome', 'unmistakably gnome traveller, tiny stature, oversized head, large ears, large curious eyes, wild hair, inventor goggles, colourful layered clothes'],
  ['half-orc', 'unmistakably half-orc traveller, broad powerful build, green-grey skin, pronounced lower tusks, broad jaw, pointed ears, practical armour'],
  ['tiefling', 'unmistakably tiefling traveller, deep red skin, large curved black horns, golden infernal eyes, long tail, dark hair, elegant infernal heritage'],
  ['aasimar', 'unmistakably aasimar traveller, celestial features, softly glowing golden eyes, faint luminous halo, silver hair, serene expression'],
  ['goliath', 'unmistakably goliath traveller, seven-foot towering muscular build, grey-blue skin, dark geometric mountain markings across face and arms, completely hairless head, no beard, pointed ears, tribal leathers'],
  ['firbolg', 'unmistakably firbolg traveller, eight-foot tall broad build, blue-grey skin, broad bovine nose, pointed ears, mossy earth-toned robes, forest guardian'],
  ['tabaxi', 'unmistakably tabaxi traveller, anthropomorphic feline humanoid with upright human shoulders and body, feline face, spotted fur, cat ears, slit pupils, whiskers, leather armour, agile posture'],
  ['genasi', 'unmistakably genasi traveller, elemental lineage, blue skin, glowing elemental markings, wind-touched hair, elemental jewellery'],
];

const BACKGROUNDS = [
  ['soldier', 'fortress barracks and training yard, racked spears, worn banners, disciplined military life'],
  ['criminal', 'rain-soaked thieves quarter at night, narrow alleys, shuttered windows, secret doors, lantern light'],
  ['noble', 'grand manor hall, carved stone, velvet banners, tall windows, gilded furniture, old family portraits'],
  ['sage', 'ancient candlelit library, towering bookshelves, star charts, open tomes, brass instruments'],
  ['entertainer', 'travelling theatre camp at dusk, painted wagon, stage lanterns, instruments, velvet curtains'],
  ['outlander', 'wild mountain pass at dawn, pine forest, distant campfire, weathered map and survival gear'],
  ['acolyte', 'quiet stone temple, stained glass, rows of candles, incense smoke, sacred symbols'],
  ['artisan', 'medieval craft workshop, toolbench, half-finished armour, wood shavings, warm forge light'],
  ['folk-hero', 'humble village square, market stalls, hand-painted banners, well-worn cobblestones, hopeful morning light'],
  ['hermit', 'remote hillside cave shrine, wind-bent trees, simple cot, old journals, shafts of pale light'],
];

function promptFor(kind, subject) {
  if (kind === 'classes') {
    return `Full-body vertical character illustration of a ${subject}. ${STYLE}.`;
  }
  if (kind === 'species') {
    return `Head-and-shoulders character portrait of a ${subject}. Neutral traveller clothing, no class-specific weapons, face and species features clearly visible. ${STYLE}.`;
  }
  return `Wide cinematic environment concept art of a ${subject}. No characters, no people. ${STYLE}.`;
}

const ASSETS = [
  ...CLASSES.map(([key, subject], i) => ({ kind: 'classes', key, subject, width: 832, height: 1216, seed: 4100 + i })),
  ...SPECIES.map(([key, subject], i) => ({ kind: 'species', key, subject, width: 832, height: 1216, seed: 5200 + i })),
  ...BACKGROUNDS.map(([key, subject], i) => ({ kind: 'backgrounds', key, subject, width: 1216, height: 832, seed: 7300 + i })),
];

const TEST_KEYS = new Set(['classes/wizard', 'species/dwarf', 'backgrounds/sage']);
const filtered = only.size ? ASSETS.filter((a) => only.has(`${a.kind}/${a.key}`)) : ASSETS;
const selected = test ? ASSETS.filter((a) => TEST_KEYS.has(`${a.kind}/${a.key}`)) : filtered;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The unauthenticated image endpoint allows one image every 45 seconds per IP.
// Pace requests so a full set can finish without hammering the service.
const RATE_GAP = 46_000;
let lastRequestAt = 0;
async function waitForSlot() {
  const wait = lastRequestAt + RATE_GAP - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function download(asset) {
  const prompt = promptFor(asset.kind, asset.subject);
  const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt)
    + `?width=${asset.width}&height=${asset.height}&model=flux&nologo=true&enhance=false&seed=${asset.seed + reseed}`;

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await waitForSlot();
    try {
      const res = await fetch(url, {
        headers: { Accept: 'image/avif,image/webp,image/jpeg,image/*' },
        signal: AbortSignal.timeout(120_000),
      });
      const type = res.headers.get('content-type') || '';
      if (res.ok && type.startsWith('image/')) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 12_000) return buf;
        throw new Error(`tiny image (${buf.length} bytes)`);
      }
      let detail = type.includes('json') ? await res.json().catch(() => null) : null;
      detail = detail?.error?.message || detail?.message || `HTTP ${res.status}`;
      throw new Error(String(detail).slice(0, 160));
    } catch (err) {
      console.log(`  ${asset.kind}/${asset.key}: attempt ${attempt} failed — ${err.message}`);
      if (attempt === 4) throw err;
      await sleep(8_000);
    }
  }
  throw new Error('unreachable');
}

async function processAsset(asset, rawPath) {
  const dir = path.join(OUT, asset.kind);
  await fs.mkdir(dir, { recursive: true });
  const outPath = path.join(dir, `${asset.key}.webp`);
  // The service's small bottom-right mark is outside the artwork. Crop the
  // bottom edge, then encode a locally-served WebP.
  await execFileAsync('ffmpeg', [
    '-y', '-i', rawPath,
    '-vf', 'crop=iw:ih-44:0:0',
    '-c:v', 'libwebp', '-quality', '88', '-compression_level', '6',
    outPath,
  ], { windowsHide: true });
  const stat = await fs.stat(outPath);
  return { outPath, bytes: stat.size };
}

async function runOne(asset) {
  const rawPath = path.join(RAW, `${asset.kind}-${asset.key}.jpg`);
  const outPath = path.join(OUT, asset.kind, `${asset.key}.webp`);
  if (!force) {
    try {
      const stat = await fs.stat(outPath);
      if (stat.size > 10_000) {
        console.log(`skip ${asset.kind}/${asset.key} (${Math.round(stat.size / 1024)} KB)`);
        return;
      }
    } catch { /* not generated yet */ }
  }

  console.log(`generate ${asset.kind}/${asset.key}`);
  const buf = await download(asset);
  await fs.writeFile(rawPath, buf);
  const { bytes } = await processAsset(asset, rawPath);
  console.log(`  saved ${asset.kind}/${asset.key}.webp (${Math.round(bytes / 1024)} KB)`);
}

await fs.mkdir(RAW, { recursive: true });

const results = [];
let cursor = 0;
async function worker() {
  while (cursor < selected.length) {
    const asset = selected[cursor++];
    await runOne(asset);
    results.push(asset);
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, worker));

if (!test) {
  const manifest = {
    collection: 'D&D DS — fantasy RPG character plates',
    generatedAt: new Date().toISOString(),
    service: 'Pollinations image API',
    model: 'FLUX',
    parameters: { nologo: true, enhance: false, style: STYLE },
    note: 'Generated fantasy illustrations, locally bundled. The service mark is cropped from the bottom edge. No third-party character artwork was copied.',
    assets: ASSETS.map((a) => ({
      kind: a.kind,
      key: a.key,
      file: `${a.kind}/${a.key}.webp`,
      seed: a.seed,
      prompt: promptFor(a.kind, a.subject),
    })),
  };
  await fs.writeFile(path.join(OUT, 'generation.json'), JSON.stringify(manifest, null, 2) + '\n');
}

console.log(`done — ${results.length} asset(s)`);
