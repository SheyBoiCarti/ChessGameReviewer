import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDirectory = process.env.STOCKFISH_SOURCE_DIR;
const expectedCommit = '93c994592dcf3b4b21052ab925e9b534df9c0918';

if (!sourceDirectory) {
  throw new Error(
    'Set STOCKFISH_SOURCE_DIR to a checkout of https://github.com/nmrugg/stockfish.js at commit ' +
      expectedCommit
  );
}

if (!existsSync(path.join(sourceDirectory, 'build.js'))) {
  throw new Error(`STOCKFISH_SOURCE_DIR is not a stockfish.js source checkout: ${sourceDirectory}`);
}

function run(command, argumentsList) {
  const result = spawnSync(command, argumentsList, {
    cwd: sourceDirectory,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const currentCommit = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: sourceDirectory,
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
if (currentCommit.status !== 0 || currentCommit.stdout.trim() !== expectedCommit) {
  throw new Error(`STOCKFISH_SOURCE_DIR must be checked out at ${expectedCommit}`);
}

const emcc = spawnSync('emcc', ['--version'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
if (emcc.status !== 0 || !/\b3\.1\.7\b/.test(emcc.stdout)) {
  throw new Error('Emscripten 3.1.7 is required to reproduce the pinned artifacts.');
}
run(process.execPath, ['build.js', '--lite', '--single-threaded', '-f']);
run(process.execPath, ['build.js', '--lite', '-f']);

const outputDirectories = ['bin', 'src', '.'];
function output(name) {
  const candidate = outputDirectories
    .map((directory) => path.join(sourceDirectory, directory, name))
    .find(existsSync);
  if (!candidate) throw new Error(`Stockfish build did not produce ${name}.`);
  return candidate;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifactDirectory = path.join(root, 'public', 'stockfish');
const generated = [
  ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.js'],
  ['stockfish-18-lite-single.wasm', 'stockfish-18-lite-single.wasm'],
  ['stockfish-18-lite.js', 'stockfish-18-lite.js'],
  ['stockfish-18-lite.wasm', 'stockfish-18-lite.wasm'],
  ['stockfish-18-lite-single.js', 'single/stockfish.js'],
  ['stockfish-18-lite-single.wasm', 'single/stockfish.wasm'],
  ['stockfish-18-lite.js', 'threaded/stockfish.js'],
  ['stockfish-18-lite.wasm', 'threaded/stockfish.wasm'],
];
for (const [source, target] of generated) {
  await copyFile(output(source), path.join(artifactDirectory, target));
}

const manifestPath = path.join(artifactDirectory, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
for (const artifact of manifest.artifacts) {
  const contents = await readFile(path.join(artifactDirectory, artifact.file));
  artifact.sha256 = createHash('sha256').update(contents).digest('hex');
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Rebuild complete. Run npm run verify:stockfish to verify the regenerated artifacts.');
