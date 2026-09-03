import type { GameQuery } from '@/lib/api/contracts';
import type { SerializedOpeningGraph } from '@/lib/chess/graph/serialization';
import type { GameRecord } from '@/lib/db/schema';
import type { EngineCapability } from '@/lib/engine/capabilities';

import type { GameAnalysisResult } from '../stockfish-analysis/analyzeGame';
import type { IngestionProgress, IngestionResult } from '../ingestion/types';

export type ResultPerspective = 'user' | 'board';
export type BoardOrientation = 'white' | 'black';
export type ThemePreference = 'system' | 'light' | 'dark';
export type AnalysisStrength = 'quick' | 'balanced' | 'deep';

export interface WorkspacePreferences {
  boardOrientation: BoardOrientation;
  resultPerspective: ResultPerspective;
  theme: ThemePreference;
  openingHorizon: number;
  analysisStrength: AnalysisStrength;
}

export interface WorkspaceSelection {
  gameId: string | null;
  positionKey: string | null;
  pathId: number | null;
  ply: number;
}

export interface WorkspaceState {
  query: {
    draft: GameQuery;
    active: GameQuery | null;
    token: number;
  };
  ingestion: {
    status: 'idle' | 'loading' | 'partial' | 'cancelled' | 'empty' | 'failed' | 'complete';
    progress: IngestionProgress | null;
    result: IngestionResult | null;
    error: string | null;
  };
  graph: {
    status: 'idle' | 'building' | 'partial' | 'limited' | 'failed' | 'complete';
    snapshot: SerializedOpeningGraph | null;
    diagnosticCodes: readonly string[];
    error: string | null;
  };
  dataMaintenance: {
    status: 'idle' | 'deleting-user' | 'clearing-all';
    error: string | null;
  };
  selection: WorkspaceSelection;
  analysis: {
    status:
      | 'idle'
      | 'probing'
      | 'unavailable'
      | 'running'
      | 'partial'
      | 'cancelled'
      | 'failed'
      | 'complete';
    capability: EngineCapability | null;
    result: GameAnalysisResult | null;
    progress: { analyzedPlies: number; totalPlies: number } | null;
    error: string | null;
    resultsByGameId: Record<string, GameAnalysisResult>;
  };
  preferences: WorkspacePreferences;
}

export type WorkspaceAction =
  | { type: 'query/draftChanged'; query: GameQuery }
  | { type: 'query/started'; query: GameQuery; token: number }
  | { type: 'ingestion/progress'; token: number; progress: IngestionProgress }
  | { type: 'ingestion/terminal'; token: number; result: IngestionResult }
  | { type: 'ingestion/failed'; token: number; error: string }
  | { type: 'graph/started'; token: number }
  | {
      type: 'graph/terminal';
      token: number;
      status: 'partial' | 'limited' | 'complete';
      snapshot: SerializedOpeningGraph;
      diagnosticCodes: readonly string[];
    }
  | { type: 'graph/failed'; token: number; error: string }
  | { type: 'selection/game'; gameId: string | null }
  | { type: 'selection/position'; positionKey: string; pathId: number | null }
  | { type: 'selection/ply'; ply: number }
  | { type: 'analysis/probing' }
  | { type: 'analysis/capability'; capability: EngineCapability }
  | { type: 'analysis/started'; token: number }
  | {
      type: 'analysis/progress';
      token: number;
      progress: { analyzedPlies: number; totalPlies: number };
    }
  | { type: 'analysis/terminal'; token: number; result: GameAnalysisResult }
  | { type: 'analysis/cancelled'; token: number }
  | { type: 'analysis/failed'; token: number; error: string }
  | { type: 'preferences/changed'; preferences: Partial<WorkspacePreferences> }
  | { type: 'operations/invalidated'; token: number }
  | { type: 'data/deletionStarted'; kind: 'user' | 'all' }
  | { type: 'data/deletionFailed'; error: string }
  | { type: 'data/userDeleted'; username: string }
  | { type: 'data/allCleared' };

export interface WorkspaceView {
  state: WorkspaceState;
  selectedGame: GameRecord | null;
}
