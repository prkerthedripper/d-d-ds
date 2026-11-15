import fs from 'node:fs';
process.loadEnvFile('.env');
const prompt = 'Professional fantasy RPG sourcebook illustration, full-body human fighter, detailed steel half-plate armour, longsword and shield, three-quarter heroic stance, painterly digital oil, cinematic rim light, muted earth tones, dark atmospheric background, highly detailed, vertical composition, no text, no watermark, no border';
const started = Date.now();
console.log('request start', new Date().toISOString());
try {
  const res = await fetch('https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-xl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` },
    body: JSON.stringify({ text_prompts: [{ text: prompt }], cfg_scale: 7.5, width: 1024, height: 1024, steps: 25, seed: 417, samples: 1 }),
  });
  console.log('status', res.status, 'after', Date.now() - started, 'ms');
  const text = await res.text();
  fs.writeFileSync('.cache/sdxl-one-response.json', text);
  console.log('response bytes', text.length);
  let data = null; try { data = JSON.parse(text); } catch {}
  const b64 = data?.artifacts?.[0]?.base64 || data?.data?.[0]?.b64_json;
  if (b64) { fs.writeFileSync('.cache/sdxl-one.png', Buffer.from(b64, 'base64')); console.log('saved', fs.statSync('.cache/sdxl-one.png').size, 'bytes'); }
  else console.log((text || JSON.stringify(data)).slice(0, 1000));
} catch (err) { console.error('request failed', err?.name, err?.message); }
