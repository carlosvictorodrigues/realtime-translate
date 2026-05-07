// Wrapper to run the setSinkId spike.
// The project's package.json has "type": "module", so .js files are treated as ESM
// (and Electron's default_app loader picks up the root package.json). tsc compiles
// our spike as CommonJS, so we rename the output to .cjs to force CommonJS loading
// regardless of the parent package.json.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const tsc = path.resolve(__dirname, '..', 'node_modules', '.bin', 'tsc');
const electron = path.resolve(__dirname, '..', 'node_modules', '.bin', 'electron');
const spikeSrc = path.resolve(__dirname, 'spike-setSinkId.ts');
const outDir = path.resolve(__dirname, '..', 'out', 'spike');
const outJs = path.resolve(outDir, 'spike-setSinkId.js');
const outCjs = path.resolve(outDir, 'spike-setSinkId.cjs');

execSync(
  `"${tsc}" --module CommonJS --target ES2020 --outDir "${outDir}" --esModuleInterop --skipLibCheck "${spikeSrc}"`,
  { stdio: 'inherit', shell: true },
);

fs.mkdirSync(outDir, { recursive: true });
if (fs.existsSync(outJs)) {
  if (fs.existsSync(outCjs)) fs.unlinkSync(outCjs);
  fs.renameSync(outJs, outCjs);
}

execSync(`"${electron}" "${outCjs}"`, { stdio: 'inherit', shell: true });
