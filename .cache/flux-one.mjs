import fs from 'node:fs';

process.loadEnvFile('.env');
const prompt = 'Professional fantasy RPG sourcebook character illustration, full-body heroic portrait of a human fighter, disciplined veteran in detailed steel half-plate armour with a longsword and kite shield, confident three-quarter stance, weathered face, cinematic rim light, painterly digital oil illustration, muted earth tones with warm gold highlights, dark atmospheric neutral background, highly detailed armour and equipment, strong silhouette, consistent Dungeons and Dragons concept-art direction, vertical composition, no text, no watermark, no border, no UI';

console.log('request start', new Date().toISOString());
const started = Date.now();
try {
  const res = await fetch('https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
    },
    body: JSON.stringify({
      prompt, mode: 'base', width: 768, height: 1024,
      cfg_scale: 3.5, steps: 8, seed: 417,
    }),
  });
  console.log('status', res.status, 'after', Date.now() - started, 'ms');
  const text = await res.text();
  console.log('response bytes', text.length);
  fs.writeFileSync('.cache/flux-one-response.json', text);
  let data = null;
  try { data = JSON.parse(text); } catch { /* raw error */ }
  if (!data) {
    console.log(text.slice(0, 1000));
    process.exit(1);
  }
  const b64 = data.artifacts?.[0]?.base64 || data.data?.[0]?.b64_json;
  if (b64) {
    fs.writeFileSync('.cache/flux-one.png', Buffer.from(b64, 'base64'));
    console.log('saved .cache/flux-one.png', fs.statSync('.cache/flux-one.png').size, 'bytes');
  } else {
    console.log(JSON.stringify(data).slice(0, 1500));
  }
} catch (err) {
  console.error('request failed', err?.name, err?.message);
  process.exit(1);
}
