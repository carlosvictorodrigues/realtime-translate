// Resize build/icon.png to standard Windows ICO sizes and combine into build/icon.ico
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Jimp } from 'jimp';
import pngToIco from 'png-to-ico';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const srcPath = join(repoRoot, 'build', 'icon.png');
const dstPath = join(repoRoot, 'build', 'icon.ico');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const src = await Jimp.read(srcPath);

const buffers = [];
for (const size of SIZES) {
  const buf = await src.clone().resize({ w: size, h: size }).getBuffer('image/png');
  buffers.push(buf);
}

const ico = await pngToIco(buffers);
writeFileSync(dstPath, ico);
console.log(`Wrote ${dstPath} (${(ico.length / 1024).toFixed(1)} KB, ${SIZES.length} sizes)`);
