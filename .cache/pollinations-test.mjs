import fs from 'node:fs';
const prompt = 'Professional fantasy RPG sourcebook character illustration, full-body heroic female elf ranger, autumn green cloak, leather armour, longbow, detailed painterly digital oil, cinematic rim light, dark atmospheric forest background, vertical composition, no text, no watermark, no border';
const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?width=832&height=1216&model=flux&nologo=true&seed=912';
console.log('start', new Date().toISOString());
const t = Date.now();
try {
  const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
  console.log('status', res.status, 'after', Date.now() - t, 'ms', res.headers.get('content-type'));
  if (!res.ok) { console.log((await res.text()).slice(0, 500)); process.exit(1); }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync('.cache/pollinations-test.webp', buf);
  console.log('saved', buf.length, 'bytes');
} catch (err) { console.log('failed', err.name, err.message); process.exit(1); }
