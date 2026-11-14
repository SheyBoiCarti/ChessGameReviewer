'use client';

import type { ReviewMode, WorkspaceTab } from '@/components/workspace/WorkspaceTabs';

/** T28: the workspace state encoded in the URL. Review is `view=analysis`,
 * Openings is `view=opening`; `mode` is the review-mode union, `game` the
 * selected game id, and `ply` an optional nonnegative integer position. */
export interface WorkspaceUrlIntent {
  tab: WorkspaceTab;
  reviewMode: ReviewMode;
  gameId?: string;
  ply?: number;
}

const workspaceTabs: ReadonlyArray<WorkspaceTab> = [
  'games',
  'opening',
  'analysis',
  'insights',
  'settings',
];
const reviewModes: ReadonlyArray<ReviewMode> = ['review', 'analysis'];

const isWorkspaceTab = (value: string): value is WorkspaceTab =>
  (workspaceTabs as ReadonlyArray<string>).includes(value);
const isReviewMode = (value: string): value is ReviewMode =>
  (reviewModes as ReadonlyArray<string>).includes(value);

/** Reads a workspace intent from `url`, or null when the URL does not describe
 * one. Invalid enums or a non-integer/negative `ply` make the URL invalid so
 * callers fall back to stored defaults and can show a recovery state. */
export function readWorkspaceUrl(url: URL): WorkspaceUrlIntent | null {
  const view = url.searchParams.get('view');
  if (!view || !isWorkspaceTab(view)) return null;
  const mode = url.searchParams.get('mode');
  if (mode !== null && !isReviewMode(mode)) return null;
  const gameId = url.searchParams.get('game') ?? undefined;
  const plyParam = url.searchParams.get('ply');
  if (plyParam !== null && !/^\d+$/.test(plyParam)) return null;
  const ply = plyParam === null ? undefined : Number(plyParam);
  if (ply !== undefined && !Number.isSafeInteger(ply)) return null;
  return {
    tab: view,
    reviewMode: mode ?? 'review',
    ...(gameId !== undefined && gameId !== '' ? { gameId } : {}),
    ...(ply !== undefined ? { ply } : {}),
  };
}

/** Returns a copy of `url` with the workspace intent encoded; unrelated
 * parameters (engine test modes) and the hash are preserved. */
export function writeWorkspaceUrl(url: URL, intent: WorkspaceUrlIntent): URL {
  const next = new URL(url.toString());
  next.searchParams.set('view', intent.tab);
  next.searchParams.set('mode', intent.reviewMode);
  if (intent.gameId !== undefined && intent.gameId !== '') {
    next.searchParams.set('game', intent.gameId);
  } else {
    next.searchParams.delete('game');
    next.searchParams.delete('ply');
    return next;
  }
  if (intent.ply !== undefined) {
    next.searchParams.set('ply', String(Math.max(0, Math.trunc(intent.ply))));
  } else {
    next.searchParams.delete('ply');
  }
  return next;
}

/** SSR-safe read of the current location's workspace intent, or null outside
 * the browser or when the URL does not describe a workspace state. */
export function readCurrentWorkspaceUrlIntent(): WorkspaceUrlIntent | null {
  if (typeof window === 'undefined') return null;
  try {
    const intent = readWorkspaceUrl(new URL(window.location.href));
    return intent;
  } catch {
    return null;
  }
}

/** Equality used by the history sync to avoid rewriting an already-current URL
 * (e.g. one just applied from `popstate`). */
export function sameWorkspaceUrlIntent(
  left: WorkspaceUrlIntent | null,
  right: WorkspaceUrlIntent | null
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.tab === right.tab &&
    left.reviewMode === right.reviewMode &&
    left.gameId === right.gameId &&
    left.ply === right.ply
  );
}
