import type { GameQuery } from '@/lib/api/contracts';
import type { SerializedOpeningGraph } from '@/lib/chess/graph/serialization';
import type { GameRecord } from '@/lib/db/schema';
import type { EngineCapability } from '@/lib/engine/capabilities';

import type { AnalysisUpdate, GameAnalysisResult } from '../stockfish-analysis/analyzeGame';
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

/** Authoritative main-game selection; variation/opening/browser histories are separate.
 * Ownership and future identity contracts: docs/implementation-progress.md#t03--state-transitions-and-contracts
 */
export interface WorkspaceSelection {
  gameId: string | null;
  positionKey: string | null;
  pathId: number | null;
  ply: number;
}

/** T27: retained last-reviewed original ply per game.
 * The synchronous index is keyed by normalized username + game id; the durable content
 * identity is the PGN digest (T06), so a changed PGN resets the retained ply to zero.
 */
export interface GameReviewCursor {
  ply: number;
  pgn: string;
  digest: string | null;
}

export interface ReviewRunIdentity {
  queryToken: number;
  username: string;
  gameId: string;
  pgnDigest: string;
  strength: AnalysisStrength;
  jobId: number;
}

export interface WorkspaceState {
  query: {
    draft: GameQuery;
    active: GameQuery | null;
    /** Latest request is separate from the committed dataset, including after failure. */
    requested?: GameQuery | null;
    token: number;
  };
  ingestion: {
    status: 'idle' | 'loading' | 'partial' | 'cancelled' | 'empty' | 'failed' | 'complete';
    progress: IngestionProgress | null;
    result: IngestionResult | null;
    lastAttempt?: IngestionResult | null;
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
      | 'stopping'
      | 'partial'
      | 'cancelled'
      | 'failed'
      | 'complete';
    capability: EngineCapability | null;
    identity?: ReviewRunIdentity | null;
    result: GameAnalysisResult | null;
    previousResult?: GameAnalysisResult | null;
    resultStrength?: AnalysisStrength | null;
    previousStrength?: AnalysisStrength | null;
    showingPrevious?: boolean;
    // Coverage derives from completed annotations, never raw engine-depth messages.
    progress: { analyzedPlies: number; totalPlies: number } | null;
    error: string | null;
    resultsByGameId: Record<string, GameAnalysisResult>;
    reviewEntries?: Record<
      string,
      { lastComplete: GameAnalysisResult | null; latestAttempt: GameAnalysisResult }
    >;
    resultStrengthsByGameId?: Record<string, AnalysisStrength>;
  };
  preferences: WorkspacePreferences;
}

export type WorkspaceAction =
  | { type: 'query/draftChanged'; query: GameQuery }
  | { type: 'query/started'; query: GameQuery; token: number }
  | { type: 'ingestion/progress'; token: number; progress: IngestionProgress }
  | { type: 'ingestion/terminal'; token: number; result: IngestionResult }
  | { type: 'ingestion/failed'; token: number; error: string }
  | { type: 'ingestion/errorDismissed' }
  | { type: 'graph/started'; token: number }
  | {
      type: 'graph/terminal';
      token: number;
      status: 'partial' | 'limited' | 'complete';
      snapshot: SerializedOpeningGraph;
      diagnosticCodes: readonly string[];
    }
  | { type: 'graph/failed'; token: number; error: string }
  | { type: 'selection/game'; gameId: string | null; ply?: number }
  | { type: 'selection/position'; positionKey: string; pathId: number | null }
  | { type: 'selection/ply'; ply: number }
  | { type: 'analysis/probing' }
  | { type: 'analysis/preparationCancelled' }
  | { type: 'analysis/capability'; capability: EngineCapability }
  | { type: 'analysis/started'; token: number; identity?: ReviewRunIdentity }
  | { type: 'analysis/update'; identity: ReviewRunIdentity; update: AnalysisUpdate }
  | { type: 'analysis/stopping'; identity: ReviewRunIdentity }
  | {
      type: 'analysis/progress';
      token: number;
      progress: { analyzedPlies: number; totalPlies: number };
    }
  | {
      type: 'analysis/terminal';
      token: number;
      result: GameAnalysisResult;
      gameId?: string;
      identity?: ReviewRunIdentity;
      strength?: AnalysisStrength;
      reviewKey?: string;
    }
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
