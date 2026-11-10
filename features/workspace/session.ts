import type { WorkspaceTab, ReviewMode } from '@/components/workspace/WorkspaceTabs';

const key = 'chess-game-reviewer:session';
export interface SavedWorkspaceSession {
  username: string;
  gameId: string;
  ply: number;
  tab: WorkspaceTab;
  reviewMode: ReviewMode;
}

export function readWorkspaceSession(): SavedWorkspaceSession | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    if (
      !value ||
      typeof value.username !== 'string' ||
      typeof value.gameId !== 'string' ||
      !Number.isInteger(value.ply) ||
      value.ply < 0 ||
      !['games', 'analysis', 'opening', 'insights', 'settings'].includes(value.tab) ||
      !['review', 'analysis'].includes(value.reviewMode)
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

export function saveWorkspaceSession(value: SavedWorkspaceSession): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage is optional. */
  }
}
