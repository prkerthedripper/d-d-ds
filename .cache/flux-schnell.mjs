import fs from 'node:fs';
process.loadEnvFile('.env');
const prompt = 'Professional fantasy RPG sourcebook character illustration, full-body heroic portrait of a human fighter, disciplined veteran in detailed steel half-plate armour with a longsword and kite shield, confident three-quarter stance, weathered face, cinematic rim light, painterly digital oil illustration, muted earth tones with warm gold highlights, dark atmospheric neutral background, highly detailed armour and equipment, strong silhouette, consistent Dungeons and Dragons concept-art direction, vertical composition, no text, no watermark, no border, no UI';
const started = Date.now();
console.log('request start', new Date().toISOString());
try {
  const res = await fetch('https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` },
    body: JSON.stringify({ prompt, width: 832, height: 1216, steps: 4, seed: 417 }),
  });
  console.log('status', res.status, 'after', Date.now() - started, 'ms');
  const text = await res.text();
  fs.writeFileSync('.cache/flux-schnell-response.json', text);
  console.log('response bytes', text.length);
  let data = null; try { data = JSON.parse(text); } catch {}
  if (!data) { console.log(text.slice(0, 1000)); process.exit(1); }
  const b64 = data.artifacts?.[0]?.base64 || data.data?.[0]?.b64_json;
  if (b64) { fs.writeFileSync('.cache/flux-schnell.png', Buffer.from(b64, 'base64')); console.log('saved', fs.statSync('.cache/flux-schnell.png').size, 'bytes'); }
  else { console.log(JSON.stringify(data).slice(0, 1200)); process.exit(1); }
} catch (err) { console.error('request failed', err?.name, err?.message); process.exit(1); }
