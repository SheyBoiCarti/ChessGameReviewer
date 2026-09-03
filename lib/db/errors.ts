export class StorageUnavailableError extends Error {
  constructor(message = 'IndexedDB storage is unavailable or blocked.') {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

export class QuotaExceededError extends Error {
  constructor(message = 'Storage quota exceeded while writing to IndexedDB.') {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

export class DatabaseBlockedError extends Error {
  constructor(message = 'Database upgrade is blocked by another open connection.') {
    super(message);
    this.name = 'DatabaseBlockedError';
  }
}

export class SchemaVersionError extends Error {
  constructor(message = 'Database schema version is incompatible.') {
    super(message);
    this.name = 'SchemaVersionError';
  }
}

export function wrapIDBError(err: unknown): Error {
  if (err instanceof Error) {
    if (err.name === 'QuotaExceededError' || err.message.includes('Quota')) {
      return new QuotaExceededError();
    }
    return new StorageUnavailableError();
  }
  if (typeof err === 'object' && err !== null) {
    const name = 'name' in err ? String((err as { name: unknown }).name) : '';
    const message = 'message' in err ? String((err as { message: unknown }).message) : '';
    if (name === 'QuotaExceededError' || message.includes('Quota')) {
      return new QuotaExceededError();
    }
  }
  return new StorageUnavailableError();
}
