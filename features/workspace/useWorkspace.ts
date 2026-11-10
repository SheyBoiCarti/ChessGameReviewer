'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import type { GameQuery } from '@/lib/api/contracts';
import { validateGameQuery } from '@/lib/validation/gameQuery';

import {
  createWorkspaceController,
  type WorkspaceController,
  type WorkspaceServices,
} from './createWorkspaceController';
import type { WorkspacePreferences } from './types';
import { readWorkspaceSession, type SavedWorkspaceSession } from './session';

const preferencesStorageKey = 'chess-game-reviewer:preferences';
const recentQueryStorageKey = 'chess-game-reviewer:recent-query';

export interface UseWorkspaceResult {
  controller: WorkspaceController;
  state: ReturnType<WorkspaceController['getState']>;
  recentQuery: GameQuery | null;
  recoveredSession: SavedWorkspaceSession | null;
}

export function useWorkspace(createServices: () => WorkspaceServices): UseWorkspaceResult {
  const [controller] = useState(() =>
    createWorkspaceController(createServices(), readStoredPreferences())
  );
  const [recentQuery, setRecentQuery] = useState<GameQuery | null>(() => readStoredQuery());
  const [startupQuery] = useState(() => readStoredQuery());
  const [startupSession] = useState(() => readWorkspaceSession());
  const [recoveredSession, setRecoveredSession] = useState<SavedWorkspaceSession | null>(null);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState
  );

  useEffect(() => {
    return () => {
      controller.dispose();
    };
  }, [controller]);

  useEffect(() => {
    writeStoredValue(preferencesStorageKey, state.preferences);
  }, [state.preferences]);

  useEffect(() => {
    if (!state.query.active) return;
    writeStoredValue(recentQueryStorageKey, state.query.active);
    setRecentQuery(state.query.active);
  }, [state.query.active]);

  useEffect(() => {
    let active = true;
    if (startupQuery) {
      void controller
        .listStoredUsernames()
        .then(async (usernames) => {
          if (
            !active ||
            controller.getState().query.token !== 0 ||
            !usernames.includes(startupQuery.username)
          )
            return;
          await controller.submitQuery(startupQuery);
          const loaded = controller.getState();
          if (
            !active ||
            loaded.query.token !== 1 ||
            !startupSession ||
            startupSession.username !== startupQuery.username
          )
            return;
          const game = loaded.ingestion.result?.games.find(
            ({ id }) => id === startupSession.gameId
          );
          if (!game) return;
          controller.selectGame(game.id);
          controller.selectPly(startupSession.ply);
          setRecoveredSession(startupSession);
        })
        .catch(() => {
          /* Manual import remains available if local recovery fails. */
        });
    }
    return () => {
      active = false;
    };
  }, [controller, startupQuery, startupSession]);

  return { controller, state, recentQuery, recoveredSession };
}

function readStoredPreferences(): Partial<WorkspacePreferences> {
  const stored = readStoredValue(preferencesStorageKey);
  if (!isRecord(stored)) return {};
  return {
    ...(stored.boardOrientation === 'white' || stored.boardOrientation === 'black'
      ? { boardOrientation: stored.boardOrientation }
      : {}),
    ...(stored.resultPerspective === 'user' || stored.resultPerspective === 'board'
      ? { resultPerspective: stored.resultPerspective }
      : {}),
    ...(stored.theme === 'system' || stored.theme === 'light' || stored.theme === 'dark'
      ? { theme: stored.theme }
      : {}),
    ...(typeof stored.openingHorizon === 'number' &&
    Number.isInteger(stored.openingHorizon) &&
    stored.openingHorizon >= 2 &&
    stored.openingHorizon <= 40
      ? { openingHorizon: stored.openingHorizon }
      : {}),
    ...(stored.analysisStrength === 'quick' ||
    stored.analysisStrength === 'balanced' ||
    stored.analysisStrength === 'deep'
      ? { analysisStrength: stored.analysisStrength }
      : {}),
  };
}

function readStoredQuery(): GameQuery | null {
  const stored = readStoredValue(recentQueryStorageKey);
  if (!isRecord(stored)) return null;
  const validation = validateGameQuery(stored);
  return validation.success ? validation.data : null;
}

function readStoredValue(key: string): unknown {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeStoredValue(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A private browsing context or a full storage area must not break reviewing games.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
