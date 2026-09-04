'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Square } from 'chess.js';

import { GameSelector } from '@/components/analysis/GameSelector';
import { VariationSandboxBanner } from '@/components/analysis/VariationSandboxBanner';
import { ChessboardView, type MoveHistoryModel } from '@/components/board/ChessboardView';
import { GameQueryForm } from '@/components/controls/GameQueryForm';
import { LocalDataSettings } from '@/components/controls/LocalDataSettings';
import { DiagnosticSummary } from '@/components/feedback/DiagnosticSummary';
import { IngestionProgress } from '@/components/feedback/IngestionProgress';
import { OfflineCacheNotice } from '@/components/feedback/OfflineCacheNotice';
import { MoveOrderDialog } from '@/components/tree/MoveOrderDialog';
import { OpeningTreeTable } from '@/components/tree/OpeningTreeTable';
import { UnobservedMoveNotice } from '@/components/opening/UnobservedMoveNotice';
import type { AppliedBoardMove } from '@/features/board/moves';
import {
  appendVariationMove,
  createVariationFromUciSequence,
  moveVariationCursor,
  startVariation,
  variationFen,
  type AnalysisVariationState,
} from '@/features/board/variation';
import {
  createGraphNavigation,
  navigateCandidate,
  resolveBoardMoveInGraph,
  type GraphNavigationState,
} from '@/features/opening-tree/navigation';
import { createBrowserWorkspaceServices } from '@/features/workspace/browserServices';
import type { WorkspaceServices } from '@/features/workspace/createWorkspaceController';
import { useWorkspace } from '@/features/workspace/useWorkspace';
import type { PlayerMetadata } from '@/lib/api/contracts';
import { parseGamePgn, type ParsedGame } from '@/lib/chess/pgnParser';
import { deserializeOpeningGraph } from '@/lib/chess/graph/serialization';
import type { GameRecord } from '@/lib/db/schema';
import type { MoveQuality } from '@/lib/engine/accuracy';
import type { EvaluationScore } from '@/lib/engine/evaluation';

import { WorkspaceTabs, type WorkspaceTab } from './WorkspaceTabs';
import { AppTopBar } from './AppTopBar';
import { UtilityRail } from './UtilityRail';
import { WorkspaceLayout } from './WorkspaceLayout';

const LazyAnalyzerWorkspace = dynamic(
  () =>
    import('@/components/analysis/AnalyzerWorkspace').then((module) => module.AnalyzerWorkspace),
  { loading: () => <p role="status">Loading the local analyzer…</p>, ssr: false }
);

export function ChessWorkspace({
  createServices = createBrowserWorkspaceServices,
}: {
  createServices?: (() => WorkspaceServices) | undefined;
} = {}) {
  const { controller, state, recentQuery } = useWorkspace(createServices);
  const [tab, setTab] = useState<WorkspaceTab>('games');
  const [navigation, setNavigation] = useState<GraphNavigationState | null>(null);
  const [moveOrdersOpen, setMoveOrdersOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(() => !state.ingestion.result);
  const [resultFocusVersion, setResultFocusVersion] = useState(0);
  const [variation, setVariation] = useState<AnalysisVariationState | null>(null);
  const [unobservedMove, setUnobservedMove] = useState<{
    move: AppliedBoardMove;
    returnPositionKey: string;
    returnPathId: number;
  } | null>(null);

  const moveOrdersButton = useRef<HTMLButtonElement>(null);
  const filtersTrigger = useRef<HTMLButtonElement>(null);
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

  const analysisStatusMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (state.analysis.resultsByGameId) {
      for (const id of Object.keys(state.analysis.resultsByGameId)) {
        map[id] = 'Analysed';
      }
    }
    if (state.analysis.status === 'running' && state.selection.gameId) {
      map[state.selection.gameId] = 'Analysing…';
    }
    return map;
  }, [state.analysis.resultsByGameId, state.analysis.status, state.selection.gameId]);

  useEffect(() => {
    setVariation(null);
  }, [state.selection.gameId]);

  const selectedAnnotation =
    tab === 'analysis' && !variation
      ? state.analysis.result?.annotations.find(({ ply }) => ply === state.selection.ply)
      : undefined;
  const selectedArrow = uciArrow(selectedAnnotation?.after.pv[0]);
  const selectedBadge =
    selectedAnnotation && selectedAnnotation.accuracy.status === 'classified'
      ? {
          square: selectedAnnotation.uci.slice(2, 4) as Square,
          quality: selectedAnnotation.accuracy.quality as MoveQuality,
        }
      : undefined;

  useEffect(() => {
    if (graph) {
      setNavigation(createGraphNavigation(graph));
      setUnobservedMove(null);
    } else {
      setNavigation(null);
      setUnobservedMove(null);
    }
  }, [graph]);

  useEffect(() => {
    const previous = previousIngestionStatus.current;
    previousIngestionStatus.current = state.ingestion.status;
    const completedIngestion = ['complete', 'partial', 'empty'].includes(state.ingestion.status);
    if (previous === 'loading' && state.ingestion.status !== 'loading') {
      const desktopLayout =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(min-width: 80.0625rem)').matches;
      if (completedIngestion && desktopLayout) {
        setFiltersOpen(false);
        loadedRegion.current?.focus();
      } else if (completedIngestion && filtersOpen) {
        setResultFocusVersion((version) => version + 1);
      } else if (!completedIngestion) {
        loadedRegion.current?.focus();
      }
    }
  }, [filtersOpen, state.ingestion.status]);

  useEffect(() => {
    if (tab === 'analysis' && state.analysis.status === 'idle' && !state.analysis.capability) {
      void controller.probeEngine();
    }
  }, [controller, state.analysis.capability, state.analysis.status, tab]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.preferences.theme;
  }, [state.preferences.theme]);

  const [storedUsernames, setStoredUsernames] = useState<string[]>([]);

  useEffect(() => {
    if (tab === 'settings') {
      void controller.listStoredUsernames().then((users) => {
        setStoredUsernames(users);
      });
    }
  }, [tab, controller]);

  const allStoredUsers = useMemo(() => {
    const set = new Set(storedUsernames.map((u) => u.toLowerCase()));
    if (state.query.active?.username) {
      set.add(state.query.active.username.toLowerCase());
    }
    return Array.from(set).map((username) => ({ username }));
  }, [storedUsernames, state.query.active]);

  const selectTab = (next: WorkspaceTab) => {
    setTab(next);
    if (next !== 'opening') {
      setMoveOrdersOpen(false);
      setUnobservedMove(null);
    }
    if (next !== 'analysis') setVariation(null);
  };

  const handlePlyChange = (ply: number) => {
    setVariation(null);
    controller.selectPly(ply);
  };

  const handleBoardMove = (applied: AppliedBoardMove): boolean => {
    if (tab === 'analysis') {
      if (!variation) {
        const nextMainMove = parsedGame?.plies[state.selection.ply];
        if (nextMainMove && applied.uci === nextMainMove.uci) {
          handlePlyChange(state.selection.ply + 1);
          return true;
        }
        if (displayedFen) {
          try {
            const newVar = startVariation(state.selection.ply, displayedFen, applied);
            setVariation(newVar);
            return true;
          } catch {
            return false;
          }
        }
        return false;
      } else {
        try {
          const nextVar = appendVariationMove(variation, applied);
          setVariation(nextVar);
          return true;
        } catch {
          return false;
        }
      }
    }

    if (tab === 'opening') {
      if (!graph || !navigation) return false;
      if (unobservedMove) return false;

      const res = resolveBoardMoveInGraph(
        graph,
        navigation.positionKey,
        navigation.pathId,
        applied
      );

      if (res.observed && res.nextPathId !== null) {
        setUnobservedMove(null);
        try {
          setNavigation((prev) =>
            prev
              ? navigateCandidate(
                  graph,
                  prev,
                  {
                    targetKey: res.nextPositionKey,
                    uci: applied.uci,
                    san: applied.san,
                  },
                  res.nextPathId
                )
              : null
          );
          controller.navigateGraph(res.nextPositionKey, res.nextPathId);
          return true;
        } catch {
          return false;
        }
      } else {
        setUnobservedMove({
          move: applied,
          returnPositionKey: navigation.positionKey,
          returnPathId: navigation.pathId,
        });
        return true;
      }
    }

    return false;
  };

  const isOpeningBoard = tab === 'opening' && Boolean(graph && navigation);
  const displayedBoardFen =
    tab === 'analysis' && variation
      ? variationFen(variation)
      : tab === 'opening' && unobservedMove
        ? unobservedMove.move.fenAfter
        : displayedFen;

  const lastMoveValue: { from: Square; to: Square } | undefined =
    tab === 'analysis' && variation
      ? variation.cursor > 0
        ? {
            from: variation.moves[variation.cursor - 1]!.from,
            to: variation.moves[variation.cursor - 1]!.to,
          }
        : undefined
      : tab === 'opening' && unobservedMove
        ? {
            from: unobservedMove.move.from,
            to: unobservedMove.move.to,
          }
        : state.selection.ply > 0 && parsedGame && !isOpeningBoard
          ? {
              from: parsedGame.plies[state.selection.ply - 1]!.uci.slice(0, 2) as Square,
              to: parsedGame.plies[state.selection.ply - 1]!.uci.slice(2, 4) as Square,
            }
          : undefined;

  const historyValue: MoveHistoryModel | undefined = isOpeningBoard
    ? undefined
    : tab === 'analysis' && variation
      ? {
          currentPly: variation.cursor,
          totalPlies: variation.moves.length,
          onPlyChange: (cursor) =>
            setVariation((prev) => (prev ? moveVariationCursor(prev, cursor) : null)),
        }
      : parsedGame
        ? {
            currentPly: state.selection.ply,
            totalPlies: parsedGame.plies.length,
            onPlyChange: handlePlyChange,
          }
        : undefined;

  const isInteractive =
    (tab === 'analysis' && Boolean(displayedBoardFen)) ||
    (tab === 'opening' && Boolean(graph && navigation) && !unobservedMove);

  const board = (
    <div className="workspace-board">
      {tab === 'analysis' && variation ? (
        <VariationSandboxBanner
          state={variation}
          onCursorChange={(cursor) =>
            setVariation((prev) => (prev ? moveVariationCursor(prev, cursor) : null))
          }
          onClose={() => setVariation(null)}
        />
      ) : null}
      {tab === 'opening' && unobservedMove ? (
        <UnobservedMoveNotice
          san={unobservedMove.move.san}
          onReturn={() => {
            controller.navigateGraph(unobservedMove.returnPositionKey, unobservedMove.returnPathId);
            setUnobservedMove(null);
          }}
        />
      ) : null}
      <BoardPanel
        fen={displayedBoardFen}
        orientation={state.preferences.boardOrientation}
        isInteractive={isInteractive}
        onMove={handleBoardMove}
        onFlipOrientation={() =>
          controller.dispatch({
            type: 'preferences/changed',
            preferences: {
              boardOrientation: state.preferences.boardOrientation === 'white' ? 'black' : 'white',
            },
          })
        }
        {...(tab !== 'opening' && parsedGame
          ? {
              players: {
                white: parsedGame.whitePlayer,
                black: parsedGame.blackPlayer,
              },
            }
          : {})}
        {...(lastMoveValue !== undefined ? { lastMove: lastMoveValue } : {})}
        {...(selectedBadge !== undefined ? { lastMoveBadge: selectedBadge } : {})}
        {...(historyValue !== undefined ? { history: historyValue } : {})}
        {...(selectedAnnotation ? { evaluationScore: selectedAnnotation.after.score } : {})}
        {...(tab === 'analysis' && selectedArrow ? { pvArrow: selectedArrow } : {})}
      />
    </div>
  );

  return (
    <AppTopBar
      onOpenFilters={() => setFiltersOpen(true)}
      filtersOpen={filtersOpen}
      filterControlsId="game-query-rail"
      filterTriggerRef={filtersTrigger}
    >
      <div className={`workspace-shell${filtersOpen ? ' workspace-shell--rail-open' : ''}`}>
        <WorkspaceLayout
          utility={
            <UtilityRail
              title="Game query and progress"
              open={filtersOpen}
              onOpenChange={setFiltersOpen}
              id="game-query-rail"
              returnFocusRef={filtersTrigger}
              resultFocusVersion={resultFocusVersion}
            >
              <GameQueryForm
                disabled={state.ingestion.status === 'loading'}
                initialQuery={state.query.active ?? state.query.draft}
                onDraftChange={(draft) =>
                  controller.dispatch({
                    type: 'query/draftChanged',
                    query: { ...state.query.draft, ...draft },
                  })
                }
                openingHorizon={state.preferences.openingHorizon}
                onOpeningHorizonChange={(openingHorizon) =>
                  controller.dispatch({
                    type: 'preferences/changed',
                    preferences: { openingHorizon },
                  })
                }
                onSubmit={(query) => controller.submitQuery(query)}
                recentQuery={recentQuery}
                onResume={(query) => controller.submitQuery(query)}
              />
              {state.ingestion.progress && state.ingestion.status === 'loading' ? (
                <IngestionProgress
                  progress={state.ingestion.progress}
                  onCancel={controller.cancelIngestion}
                />
              ) : null}
              {state.ingestion.result && state.ingestion.status !== 'loading' ? (
                <div
                  className="utility-rail__result"
                  data-utility-rail-result
                  role="region"
                  aria-label="Ingestion result"
                  tabIndex={-1}
                >
                  <DiagnosticSummary
                    result={state.ingestion.result}
                    onRetry={() => {
                      const active = state.query.active;
                      if (active) void controller.submitQuery(active, { manualRefresh: true });
                    }}
                  />
                </div>
              ) : null}
              {state.ingestion.result?.offlineCacheOnly ? <OfflineCacheNotice /> : null}
            </UtilityRail>
          }
          board={tab === 'settings' ? null : board}
          tabs={<WorkspaceTabs selected={tab} onSelect={selectTab} />}
          panel={
            <div
              ref={loadedRegion}
              className="workspace-panel"
              id={`workspace-panel-${tab}`}
              role="tabpanel"
              aria-labelledby={`workspace-tab-${tab}`}
              tabIndex={-1}
            >
              {tab === 'games' ? (
                <GameSelector
                  games={state.ingestion.result?.games ?? []}
                  selectedGameId={state.selection.gameId}
                  onSelect={(gameId) => {
                    controller.selectGame(gameId);
                    if (
                      typeof window.matchMedia === 'function' &&
                      window.matchMedia('(max-width: 64rem)').matches
                    ) {
                      requestAnimationFrame(() =>
                        document.querySelector<HTMLElement>('.board-region')?.scrollIntoView({
                          block: 'start',
                        })
                      );
                    }
                  }}
                  onAnalyze={(gameId) => {
                    controller.selectGame(gameId);
                    selectTab('analysis');
                  }}
                  analysisStatus={analysisStatusMap}
                  hasLoaded={state.ingestion.result !== null}
                />
              ) : null}

              {tab === 'opening' ? (
                graph && navigation ? (
                  <>
                    <OpeningTreeTable
                      graph={graph}
                      navigation={navigation}
                      perspective={state.preferences.resultPerspective}
                      excludedGameCount={state.graph.snapshot?.excludedGameCount ?? 0}
                      diagnosticCodes={state.graph.diagnosticCodes}
                      onNavigate={(next) => {
                        setUnobservedMove(null);
                        setNavigation(next);
                        controller.navigateGraph(next.positionKey, next.pathId);
                      }}
                    />
                    <button
                      ref={moveOrdersButton}
                      type="button"
                      onClick={() => setMoveOrdersOpen(true)}
                      disabled={
                        Boolean(unobservedMove) ||
                        !graph.positions.get(navigation.positionKey)?.arrivalsByPath.size
                      }
                    >
                      View move orders
                    </button>
                    {moveOrdersOpen ? (
                      <MoveOrderDialog
                        node={graph.positions.get(navigation.positionKey)!}
                        paths={graph.paths}
                        perspective={state.preferences.resultPerspective}
                        returnFocusRef={moveOrdersButton}
                        onClose={() => setMoveOrdersOpen(false)}
                      />
                    ) : null}
                  </>
                ) : (
                  <EmptyWorkspace message="Load games to build and navigate the opening tree." />
                )
              ) : null}

              {tab === 'analysis' ? (
                selectedRecord && parsedGame ? (
                  <LazyAnalyzerWorkspace
                    capability={state.analysis.capability}
                    status={state.analysis.status}
                    result={state.analysis.result}
                    progress={state.analysis.progress}
                    strength={state.preferences.analysisStrength}
                    upstreamAccuracies={selectedRecord.accuracies}
                    onStrengthChange={(analysisStrength) =>
                      controller.dispatch({
                        type: 'preferences/changed',
                        preferences: { analysisStrength },
                      })
                    }
                    onStart={(strength) => void controller.startAnalysis(strength)}
                    onCancel={controller.cancelAnalysis}
                    onResume={() => void controller.startAnalysis()}
                    onSelectPly={handlePlyChange}
                    selectedPly={state.selection.ply}
                    fenByPly={Object.fromEntries(
                      parsedGame.plies.map((move) => [move.ply, move.fenBefore])
                    )}
                    onExplorePv={(pvFen, uciMoves) => {
                      const variationState = createVariationFromUciSequence(
                        state.selection.ply,
                        pvFen,
                        uciMoves
                      );
                      if (variationState) {
                        setVariation(variationState);
                      }
                    }}
                  />
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
                    users={allStoredUsers}
                    maintenance={state.dataMaintenance}
                    onDeleteUsername={async (username) => {
                      const res = await controller.deleteUserData(username);
                      setStoredUsernames((prev) =>
                        prev.filter((u) => u.toLowerCase() !== username.toLowerCase())
                      );
                      return res;
                    }}
                    onClearAll={async () => {
                      const res = await controller.clearAllData();
                      setStoredUsernames([]);
                      return res;
                    }}
                  />
                </div>
              ) : null}
            </div>
          }
        />
      </div>
    </AppTopBar>
  );
}

function BoardPanel({
  fen,
  orientation,
  isInteractive,
  onMove,
  lastMove,
  lastMoveBadge,
  history,
  pvArrow,
  evaluationScore,
  players,
  onFlipOrientation,
}: {
  fen: string | null;
  orientation: 'white' | 'black';
  isInteractive: boolean;
  onMove?: ((move: AppliedBoardMove) => boolean) | undefined;
  lastMove?: { from: Square; to: Square } | undefined;
  lastMoveBadge?: { square: Square; quality: MoveQuality } | undefined;
  history?: MoveHistoryModel | undefined;
  pvArrow?: { from: Square; to: Square } | undefined;
  evaluationScore?: EvaluationScore | undefined;
  players?: { white: PlayerMetadata; black: PlayerMetadata } | undefined;
  onFlipOrientation?: (() => void) | undefined;
}) {
  if (!fen)
    return <EmptyWorkspace message="Select a game or opening position to show the board." />;
  return (
    <ChessboardView
      fen={fen}
      orientation={orientation}
      isInteractive={isInteractive}
      {...(onMove !== undefined ? { onMove } : {})}
      {...(history !== undefined ? { history } : {})}
      {...(lastMove !== undefined ? { lastMove } : {})}
      {...(lastMoveBadge !== undefined ? { lastMoveBadge } : {})}
      {...(evaluationScore !== undefined ? { evaluationScore } : {})}
      {...(pvArrow !== undefined ? { pvArrow } : {})}
      {...(players !== undefined ? { players } : {})}
      {...(onFlipOrientation !== undefined ? { onFlipOrientation } : {})}
    />
  );
}

function uciArrow(uci: string | undefined): { from: Square; to: Square } | undefined {
  return uci && /^[a-h][1-8][a-h][1-8]/.test(uci)
    ? { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square }
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
      whitePlayer: record.whitePlayer,
      blackPlayer: record.blackPlayer,
      ...(record.accuracies ? { accuracies: record.accuracies } : {}),
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
