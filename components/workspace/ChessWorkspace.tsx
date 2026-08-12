'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';

import { GameSelector } from '@/components/analysis/GameSelector';
import { ChessboardView } from '@/components/board/ChessboardView';
import { EvaluationBar } from '@/components/board/EvaluationBar';
import { GameQueryForm } from '@/components/controls/GameQueryForm';
import { LocalDataSettings } from '@/components/controls/LocalDataSettings';
import { DiagnosticSummary } from '@/components/feedback/DiagnosticSummary';
import { IngestionProgress } from '@/components/feedback/IngestionProgress';
import { OfflineCacheNotice } from '@/components/feedback/OfflineCacheNotice';
import { MoveOrderDialog } from '@/components/tree/MoveOrderDialog';
import { OpeningTreeTable } from '@/components/tree/OpeningTreeTable';
import { parseGamePgn, type ParsedGame } from '@/lib/chess/pgnParser';
import { deserializeOpeningGraph } from '@/lib/chess/graph/serialization';
import type { GameRecord } from '@/lib/db/schema';
import {
  createGraphNavigation,
  type GraphNavigationState,
} from '@/features/opening-tree/navigation';
import { createBrowserWorkspaceServices } from '@/features/workspace/browserServices';
import { useWorkspace } from '@/features/workspace/useWorkspace';

import { WorkspaceTabs, type WorkspaceTab } from './WorkspaceTabs';

const LazyAnalyzerWorkspace = dynamic(
  () =>
    import('@/components/analysis/AnalyzerWorkspace').then((module) => module.AnalyzerWorkspace),
  { loading: () => <p role="status">Loading the local analyzer…</p>, ssr: false }
);

export function ChessWorkspace() {
  const { controller, state } = useWorkspace(createBrowserWorkspaceServices);
  const [tab, setTab] = useState<WorkspaceTab>('games');
  const [navigation, setNavigation] = useState<GraphNavigationState | null>(null);
  const [moveOrdersOpen, setMoveOrdersOpen] = useState(false);
  const moveOrdersButton = useRef<HTMLButtonElement>(null);
  const loadedRegion = useRef<HTMLDivElement>(null);
  const previousIngestionStatus = useRef(state.ingestion.status);
  const graph = useMemo(() => {
    if (!state.graph.snapshot) return null;
    try {
      return deserializeOpeningGraph(state.graph.snapshot);
    } catch {
      return null;
    }
  }, [state.graph.snapshot]);
  const selectedRecord =
    state.ingestion.result?.games.find(({ id }) => id === state.selection.gameId) ?? null;
  const parsedGame = useMemo(() => parseSelectedGame(selectedRecord), [selectedRecord]);
  const displayedFen = boardFen(tab, graph, navigation, parsedGame, state.selection.ply);
  const selectedAnnotation = state.analysis.result?.annotations.find(
    ({ ply }) => ply === state.selection.ply
  );
  const selectedArrow = uciArrow(selectedAnnotation?.after.pv[0]);

  useEffect(() => {
    if (graph) setNavigation(createGraphNavigation(graph));
    else setNavigation(null);
  }, [graph]);

  useEffect(() => {
    const previous = previousIngestionStatus.current;
    previousIngestionStatus.current = state.ingestion.status;
    if (previous === 'loading' && state.ingestion.status !== 'loading')
      loadedRegion.current?.focus();
  }, [state.ingestion.status]);

  useEffect(() => {
    if (tab === 'analysis' && state.analysis.status === 'idle' && !state.analysis.capability) {
      void controller.probeEngine();
    }
  }, [controller, state.analysis.capability, state.analysis.status, tab]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.preferences.theme;
  }, [state.preferences.theme]);

  const selectTab = (next: WorkspaceTab) => {
    setTab(next);
    if (next !== 'opening') setMoveOrdersOpen(false);
  };

  return (
    <div className="workspace-shell">
      <aside className="query-panel" aria-label="Game query and progress">
        <GameQueryForm
          disabled={state.ingestion.status === 'loading'}
          openingHorizon={state.preferences.openingHorizon}
          onOpeningHorizonChange={(openingHorizon) =>
            controller.dispatch({ type: 'preferences/changed', preferences: { openingHorizon } })
          }
          onSubmit={(query) => controller.submitQuery(query)}
        />
        {state.ingestion.progress && state.ingestion.status === 'loading' ? (
          <IngestionProgress
            progress={state.ingestion.progress}
            onCancel={controller.cancelIngestion}
          />
        ) : null}
        {state.ingestion.result && state.ingestion.status !== 'loading' ? (
          <DiagnosticSummary
            result={state.ingestion.result}
            onRetry={() => {
              const active = state.query.active;
              if (active) void controller.submitQuery(active, { manualRefresh: true });
            }}
          />
        ) : null}
        {state.ingestion.result?.offlineCacheOnly ? <OfflineCacheNotice /> : null}
      </aside>

      <main className="workspace-main">
        <WorkspaceTabs selected={tab} onSelect={selectTab} />
        <div
          ref={loadedRegion}
          className="workspace-panel"
          id={`workspace-panel-${tab}`}
          role="tabpanel"
          aria-labelledby={`workspace-tab-${tab}`}
          tabIndex={-1}
        >
          {tab === 'games' ? (
            <div className="board-workspace">
              <GameSelector
                games={state.ingestion.result?.games ?? []}
                selectedGameId={state.selection.gameId}
                onSelect={(gameId) => controller.selectGame(gameId)}
              />
              <BoardPanel
                fen={displayedFen}
                parsedGame={parsedGame}
                ply={state.selection.ply}
                orientation={state.preferences.boardOrientation}
                onPlyChange={controller.selectPly}
              />
            </div>
          ) : null}

          {tab === 'opening' ? (
            graph && navigation ? (
              <div className="board-workspace">
                <div>
                  <OpeningTreeTable
                    graph={graph}
                    navigation={navigation}
                    perspective={state.preferences.resultPerspective}
                    onNavigate={(next) => {
                      setNavigation(next);
                      controller.navigateGraph(next.positionKey, next.pathId);
                    }}
                  />
                  <button
                    ref={moveOrdersButton}
                    type="button"
                    onClick={() => setMoveOrdersOpen(true)}
                    disabled={!graph.positions.get(navigation.positionKey)?.arrivalsByPath.size}
                  >
                    View move orders
                  </button>
                </div>
                <BoardPanel
                  fen={displayedFen}
                  parsedGame={null}
                  ply={0}
                  orientation={state.preferences.boardOrientation}
                  onPlyChange={() => undefined}
                />
                {moveOrdersOpen ? (
                  <MoveOrderDialog
                    node={graph.positions.get(navigation.positionKey)!}
                    paths={graph.paths}
                    perspective={state.preferences.resultPerspective}
                    returnFocusRef={moveOrdersButton}
                    onClose={() => setMoveOrdersOpen(false)}
                  />
                ) : null}
              </div>
            ) : (
              <EmptyWorkspace message="Load games to build and navigate the opening tree." />
            )
          ) : null}

          {tab === 'analysis' ? (
            selectedRecord && parsedGame ? (
              <div className="analysis-workspace-grid">
                <div className="analysis-board">
                  <EvaluationBar
                    {...(selectedAnnotation ? { score: selectedAnnotation.after.score } : {})}
                  />
                  <BoardPanel
                    fen={displayedFen}
                    parsedGame={parsedGame}
                    ply={state.selection.ply}
                    orientation={state.preferences.boardOrientation}
                    onPlyChange={controller.selectPly}
                    {...(selectedArrow ? { pvArrow: selectedArrow } : {})}
                  />
                </div>
                <LazyAnalyzerWorkspace
                  capability={state.analysis.capability}
                  status={state.analysis.status}
                  result={state.analysis.result}
                  progress={state.analysis.progress}
                  strength={state.preferences.analysisStrength}
                  onStrengthChange={(analysisStrength) =>
                    controller.dispatch({
                      type: 'preferences/changed',
                      preferences: { analysisStrength },
                    })
                  }
                  onStart={(strength) => void controller.startAnalysis(strength)}
                  onCancel={controller.cancelAnalysis}
                  onResume={() => void controller.startAnalysis()}
                  onSelectPly={controller.selectPly}
                  fenByPly={Object.fromEntries(
                    parsedGame.plies.map((move) => [move.ply, move.fenBefore])
                  )}
                />
              </div>
            ) : (
              <EmptyWorkspace message="Select a parsed game before starting local analysis." />
            )
          ) : null}

          {tab === 'settings' ? (
            <div className="settings-grid">
              <section className="settings-card">
                <h3>View preferences</h3>
                <label>
                  Theme
                  <select
                    value={state.preferences.theme}
                    onChange={(event) =>
                      controller.dispatch({
                        type: 'preferences/changed',
                        preferences: {
                          theme: event.currentTarget.value as 'system' | 'light' | 'dark',
                        },
                      })
                    }
                  >
                    <option value="system">Follow system</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </label>
                <label>
                  Board orientation
                  <select
                    value={state.preferences.boardOrientation}
                    onChange={(event) =>
                      controller.dispatch({
                        type: 'preferences/changed',
                        preferences: {
                          boardOrientation: event.currentTarget.value as 'white' | 'black',
                        },
                      })
                    }
                  >
                    <option value="white">White at bottom</option>
                    <option value="black">Black at bottom</option>
                  </select>
                </label>
                <label>
                  Result perspective
                  <select
                    value={state.preferences.resultPerspective}
                    onChange={(event) =>
                      controller.dispatch({
                        type: 'preferences/changed',
                        preferences: {
                          resultPerspective: event.currentTarget.value as 'user' | 'board',
                        },
                      })
                    }
                  >
                    <option value="user">User win / draw / loss</option>
                    <option value="board">White / draw / Black</option>
                  </select>
                </label>
              </section>
              <LocalDataSettings
                users={state.query.active ? [{ username: state.query.active.username }] : []}
                onDeleteUsername={controller.deleteUserData}
                onClearAll={controller.clearAllData}
              />
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function BoardPanel({
  fen,
  parsedGame,
  ply,
  orientation,
  onPlyChange,
  pvArrow,
}: {
  fen: string | null;
  parsedGame: ParsedGame | null;
  ply: number;
  orientation: 'white' | 'black';
  onPlyChange(ply: number): void;
  pvArrow?: { from: string; to: string };
}) {
  if (!fen)
    return <EmptyWorkspace message="Select a game or opening position to show the board." />;
  const move = ply > 0 ? parsedGame?.plies[ply - 1] : undefined;
  return (
    <ChessboardView
      fen={fen}
      orientation={orientation}
      currentPly={ply}
      totalPlies={parsedGame?.plies.length ?? 0}
      onPlyChange={onPlyChange}
      {...(pvArrow ? { pvArrow } : {})}
      {...(move ? { lastMove: { from: move.uci.slice(0, 2), to: move.uci.slice(2, 4) } } : {})}
    />
  );
}

function uciArrow(uci: string | undefined) {
  return uci && /^[a-h][1-8][a-h][1-8]/.test(uci)
    ? { from: uci.slice(0, 2), to: uci.slice(2, 4) }
    : undefined;
}

function EmptyWorkspace({ message }: { message: string }) {
  return <p className="empty-workspace">{message}</p>;
}

function parseSelectedGame(record: GameRecord | null): ParsedGame | null {
  if (!record) return null;
  const result = parseGamePgn({
    game: {
      id: record.id,
      url: record.url,
      ...(record.uuid ? { uuid: record.uuid } : {}),
      usernameKey: record.username,
      userColor: record.userColor,
      result: record.result,
      endedAt: record.endedAt,
      timeClass: record.timeClass,
      ...(record.timeControl ? { timeControl: record.timeControl } : {}),
      rated: record.rated,
      userRating: record.userRating,
      opponentRating: record.opponentRating,
      pgn: record.pgn,
      rules: record.rules,
    },
  });
  return result.ok ? result.game : null;
}

function boardFen(
  tab: WorkspaceTab,
  graph: ReturnType<typeof deserializeOpeningGraph> | null,
  navigation: GraphNavigationState | null,
  game: ParsedGame | null,
  ply: number
): string | null {
  if (tab === 'opening' && graph && navigation) {
    const key = graph.positions.get(navigation.positionKey)?.key;
    return key ? `${key} 0 1` : null;
  }
  if (!game || game.plies.length === 0) return null;
  if (ply <= 0) return game.plies[0]!.fenBefore;
  return game.plies[Math.min(ply, game.plies.length) - 1]!.fenAfter;
}
