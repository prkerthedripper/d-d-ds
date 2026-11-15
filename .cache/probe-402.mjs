import fs from 'node:fs';
const prompt = 'Professional fantasy RPG sourcebook character illustration, full-body heroic dwarven cleric, ornate mail, mace, holy light, painterly digital oil, cinematic, dark background, no text, no watermark';
const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?width=832&height=1216&model=flux&nologo=true&enhance=false&seed=991';
const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
const type = res.headers.get('content-type') || '';
const buf = Buffer.from(await res.arrayBuffer());
console.log('status', res.status, 'type', type, 'bytes', buf.length);
if (type.startsWith('image/')) { fs.writeFileSync('.cache/probe-402.jpg', buf); console.log('saved'); }
else console.log(buf.toString('utf8').slice(0,300));
