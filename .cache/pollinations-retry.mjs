import fs from 'node:fs';
const prompt = 'Professional fantasy RPG sourcebook character illustration, full-body heroic female elf ranger, autumn green cloak, leather armour, longbow, detailed painterly digital oil, cinematic rim light, dark atmospheric forest background, vertical composition, no text, no watermark, no border';
const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?width=832&height=1216&model=flux&nologo=true&seed=912';
for (let i = 1; i <= 8; i++) {
  const t = Date.now();
  try {
    console.log('attempt', i, new Date().toISOString());
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    const type = res.headers.get('content-type') || '';
    console.log('status', res.status, type, 'after', Date.now() - t, 'ms');
    if (res.ok && type.startsWith('image/')) {
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync('.cache/pollinations-retry.webp', buf);
      console.log('saved', buf.length, 'bytes'); process.exit(0);
    }
    console.log((await res.text()).slice(0, 300));
  } catch (err) { console.log('failed', err.name, err.message); }
  await new Promise((r) => setTimeout(r, 12000));
}
process.exit(1);
