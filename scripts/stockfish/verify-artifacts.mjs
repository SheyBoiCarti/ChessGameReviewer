import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifactDirectory = path.join(repositoryRoot, 'public', 'stockfish');
const manifestPath = path.join(artifactDirectory, 'manifest.json');

function fail(message) {
  throw new Error(`Stockfish artifact verification failed: ${message}`);
}

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isFile()) {
        fail(`unexpected non-file artifact ${entry.name}`);
      }

      return entry.name;
    })
  );

  return files.sort();
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

async function verify() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.formatVersion !== 1) fail('unsupported manifest format');

  const source = manifest.engine?.correspondingSource;
  if (typeof source !== 'string' || !source.includes(manifest.engine?.portCommit ?? '')) {
    fail('missing durable corresponding-source reference');
  }

  const licenseFile = manifest.license?.file;
  if (
    typeof licenseFile !== 'string' ||
    !(await stat(path.join(artifactDirectory, licenseFile))).isFile()
  ) {
    fail('missing GPL license file');
  }

  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    fail('missing artifact checksums');
  }

  const expected = new Map();
  for (const artifact of manifest.artifacts) {
    if (
      !artifact ||
      typeof artifact.file !== 'string' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(artifact.file) ||
      typeof artifact.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
      expected.has(artifact.file)
    ) {
      fail('invalid artifact manifest entry');
    }

    expected.set(artifact.file, artifact.sha256);
  }

  const actualFiles = await filesIn(artifactDirectory);
  const trackedArtifacts = actualFiles.filter((file) => file !== 'manifest.json');
  if (trackedArtifacts.join('\n') !== [...expected.keys()].sort().join('\n')) {
    fail('untracked or missing engine artifact');
  }

  for (const [file, expectedHash] of expected) {
    const actualHash = sha256(await readFile(path.join(artifactDirectory, file)));
    if (actualHash !== expectedHash) fail(`checksum mismatch for ${file}`);
  }
}

verify()
  .then(() => process.stdout.write('Stockfish artifacts verified.\n'))
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
