import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('Stockfish runtime artifacts', () => {
  it('checks out Stockfish artifacts without line-ending conversion', () => {
    const result = spawnSync('git', ['check-attr', 'text', '--', 'public/stockfish/COPYING.txt'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout.trim()).toBe('public/stockfish/COPYING.txt: text: unset');
  });

  it('verifies every public engine file against the committed provenance manifest', () => {
    const result = spawnSync(process.execPath, ['scripts/stockfish/verify-artifacts.mjs'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });
});
