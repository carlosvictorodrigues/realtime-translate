// One-shot icon generator. Run: node scripts/generate-icon.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const outDir = join(repoRoot, 'build');
mkdirSync(outDir, { recursive: true });

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error('GEMINI_API_KEY missing'); process.exit(1); }

const MODEL = 'imagen-4.0-generate-001';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predict?key=${apiKey}`;

const PROMPTS = [
  {
    name: 'icon-v4-loop',
    text: 'A simple flat icon on a black background. Two curved arrows form a circle in the center, like a refresh or sync symbol. The top half of the circle is purple, the bottom half is cream white. The arrows are smooth, thick, and have small triangular arrowhead tips. Centered in the middle of the image with empty black space around it. No text. No letters. Clean and minimal.',
  },
  {
    name: 'icon-v5-bubbles',
    text: 'A flat icon on a black background. Two rounded speech bubbles, one purple and one cream white, overlap slightly in the center facing each other. Each bubble has a small triangular tail at the bottom corner. Centered in the middle with black empty space around. No text inside the bubbles. No letters anywhere. Simple and clean.',
  },
  {
    name: 'icon-v6-waveform',
    text: 'A flat icon on a black background. Eight short vertical bars of different heights in the center, like a sound equalizer. The four bars on the left are purple, the four bars on the right are cream white. Bars are rounded rectangles. Centered with empty black space around. No text. No labels.',
  },
];

async function gen(prompt) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: '1:1', personGeneration: 'dont_allow' },
    }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  const json = await res.json();
  const b64 = json.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('no image: ' + JSON.stringify(json).slice(0, 300));
  return Buffer.from(b64, 'base64');
}

for (const p of PROMPTS) {
  const out = join(outDir, `${p.name}.png`);
  process.stdout.write(`${p.name}... `);
  try {
    const png = await gen(p.text);
    writeFileSync(out, png);
    console.log(`OK ${(png.length / 1024).toFixed(0)}KB`);
  } catch (e) {
    console.log(`FAIL: ${e.message}`);
  }
}
