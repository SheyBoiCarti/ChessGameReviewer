import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

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

run('emcc', ['--version']);
run(process.execPath, ['build.js', '--lite', '--single-threaded', '-f']);
run(process.execPath, ['build.js', '--lite', '-f']);
console.log(
  'Rebuild complete. Copy the two generated lite JS/WASM pairs into public/stockfish, update manifest hashes, then run npm run verify:stockfish.'
);
