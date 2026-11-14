import type { OpeningScope } from '../opening-tree/graphIdentity';

const storageKey = 'chess-game-reviewer:opening-scope';

/** T40: an explicit opening scope choice persists per normalized username. */
export function readStoredOpeningScope(username: string): OpeningScope | null {
  if (typeof window === 'undefined' || !username) return null;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return null;
    const map = JSON.parse(stored) as Record<string, unknown>;
    const value = map[username.toLowerCase()];
    return value === 'white' || value === 'black' || value === 'both' ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredOpeningScope(username: string, scope: OpeningScope): void {
  if (typeof window === 'undefined' || !username) return;
  try {
    const stored = window.localStorage.getItem(storageKey);
    const map = (stored ? (JSON.parse(stored) as Record<string, unknown>) : {}) ?? {};
    map[username.toLowerCase()] = scope;
    window.localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    // A private browsing context must not break scope selection.
  }
}
