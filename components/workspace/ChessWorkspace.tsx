'use client';

import dynamic from 'next/dynamic';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react';
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
import { AppIcon } from '@/components/ui/AppIcon';
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

import { AppTopBar } from './AppTopBar';
import { makeBackgroundInert, trapFocus } from './ProductInformation';
import { UtilityRail } from './UtilityRail';
import { WorkspaceLayout } from './WorkspaceLayout';
import { WorkspaceNavigation } from './WorkspaceNavigation';
import { WorkspaceTabs, type ReviewMode, type WorkspaceTab } from './WorkspaceTabs';

const LazyAnalyzerWorkspace = dynamic(
  () =>
    import('@/components/analysis/AnalyzerWorkspace').then((module) => module.AnalyzerWorkspace),
  { loading: () => <p role="status">Loading the local analyzer…</p>, ssr: false }
);

export function ChessWorkspace({
  createServices = createBrowserWorkspaceServices,
}: {
  createServices?: (() => WorkspaceServices) | undefined;
} = {}): JSX.Element {
  const { controller, state, recentQuery } = useWorkspace(createServices);
  const [tab, setTab] = useState<WorkspaceTab>('games');
  const [reviewMode, setReviewMode] = useState<ReviewMode>('review');
  const [menuOpen, setMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [navigation, setNavigation] = useState<GraphNavigationState | null>(null);
  const [moveOrdersOpen, setMoveOrdersOpen] = useState(false);
  const [resultFocusVersion, setResultFocusVersion] = useState(0);
  const [variation, setVariation] = useState<AnalysisVariationState | null>(null);
  const [unobservedMove, setUnobservedMove] = useState<{
    move: AppliedBoardMove;
    returnPositionKey: string;
    returnPathId: number;
  } | null>(null);

  const moveOrdersButton = useRef<HTMLButtonElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const importTriggerRef = useRef<HTMLButtonElement>(null);
  const aboutTriggerRef = useRef<HTMLButtonElement>(null);
  const titleHeadingRef = useRef<HTMLHeadingElement>(null);
  const menuBackdropRef = useRef<HTMLDivElement>(null);
  const menuDialogRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (tab === 'games' && state.selection.gameId) {
      if (typeof boardRef.current?.scrollIntoView === 'function') {
        boardRef.current.scrollIntoView({ block: 'start' });
      }
    }
  }, [tab, state.selection.gameId]);

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
    if (previous === 'loading' && state.ingestion.status !== 'loading') {
      const hasGames = (state.ingestion.result?.games.length ?? 0) > 0;
      if (['complete', 'partial'].includes(state.ingestion.status) && hasGames) {
        setImportOpen(false);
        selectTab('games');
        requestAnimationFrame(() => titleHeadingRef.current?.focus());
      } else {
        setResultFocusVersion((v) => v + 1);
      }
    }
  }, [state.ingestion.status, state.ingestion.result]);

  useEffect(() => {
    if (tab === 'analysis' && state.analysis.status === 'idle' && !state.analysis.capability) {
      void controller.probeEngine();
    }
  }, [controller, state.analysis.capability, state.analysis.status, tab]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.preferences.theme;
  }, [state.preferences.theme]);

  // Trap focus & inert background for mobile menu drawer
  useLayoutEffect(() => {
    if (!menuOpen || !menuBackdropRef.current || !menuDialogRef.current) return;
    const dialog = menuDialogRef.current;
    const focusable = dialog.querySelector<HTMLElement>(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    (focusable ?? dialog).focus();
    return makeBackgroundInert(menuBackdropRef.current);
  }, [menuOpen]);

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
    if (next !== 'analysis') {
      setVariation(null);
    }
  };

  const handlePlyChange = (ply: number) => {
    setVariation(null);
    controller.selectPly(ply);
  };

  const handleBoardMove = (applied: AppliedBoardMove): boolean => {
    // Piece moves only allowed in analysis mode of analysis tab
    if (tab === 'analysis' && reviewMode === 'analysis') {
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

  // Board interactivity by view:
  // Games & Review: playback and orientation only (isInteractive = false)
  // Analysis: piece moves and variations allowed (isInteractive = true)
  // Openings: graph moves allowed
  const isInteractive =
    (tab === 'analysis' && reviewMode === 'analysis' && Boolean(displayedBoardFen)) ||
    (tab === 'opening' && Boolean(graph && navigation) && !unobservedMove);

  const hasGamesLoaded = (state.ingestion.result?.games.length ?? 0) > 0;
  const isSelectedGameWithoutMoves = Boolean(
    selectedRecord && (!parsedGame || parsedGame.plies.length === 0)
  );

  const board = isSelectedGameWithoutMoves ? (
    <div className="workspace-board workspace-board--no-moves">
      <p role="status">This game has no reviewable moves.</p>
    </div>
  ) : (
    <div ref={boardRef} className="workspace-board">
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

  // Determine whether board should be rendered:
  // - Settings: no board
  // - Analysis without selected game: no board
  // - Openings without graph: no board
  // - Games with no game selected (initial visit or loaded list without selection): no board
  const shouldRenderBoard =
    tab !== 'settings' &&
    !(tab === 'analysis' && !selectedRecord) &&
    !(tab === 'opening' && !graph) &&
    !(tab === 'games' && !selectedRecord);

  const viewTitle =
    tab === 'games'
      ? 'Games'
      : tab === 'analysis'
        ? 'Review'
        : tab === 'opening'
          ? 'Openings'
          : 'Settings';

  const queryForm = (
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
  );

  return (
    <div className="workspace-shell" data-modal-root>
      {/* Desktop Left Rail Navigation (hidden < 960px via CSS) */}
      <aside className="workspace-rail">
        <WorkspaceNavigation
          selected={tab}
          onSelect={selectTab}
          onOpenAbout={() => setAboutOpen(true)}
          titleHeadingRef={titleHeadingRef}
        />
      </aside>

      {/* Main Column */}
      <div className="workspace-main">
        <AppTopBar
          viewTitle={viewTitle}
          onOpenMenu={() => {
            setImportOpen(false);
            setMenuOpen(true);
          }}
          menuTriggerRef={menuTriggerRef}
          onOpenImport={() => {
            setMenuOpen(false);
            setImportOpen(true);
          }}
          importTriggerRef={importTriggerRef}
          titleHeadingRef={titleHeadingRef}
          aboutOpen={aboutOpen}
          onCloseAbout={() => setAboutOpen(false)}
          aboutTriggerRef={aboutTriggerRef}
        />

        <main className="workspace-content">
          {tab === 'settings' ? (
            <div className="settings-surface">
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
          ) : (
            <WorkspaceLayout
              board={shouldRenderBoard ? board : null}
              tabs={
                tab === 'analysis' ? (
                  <WorkspaceTabs selected={reviewMode} onSelect={setReviewMode} />
                ) : null
              }
              panel={
                <div
                  className="workspace-panel"
                  id={tab === 'analysis' ? `review-panel-${reviewMode}` : `workspace-panel-${tab}`}
                  role={tab === 'analysis' ? 'tabpanel' : 'region'}
                  aria-labelledby={tab === 'analysis' ? `review-tab-${reviewMode}` : undefined}
                  aria-label={tab !== 'analysis' ? viewTitle : undefined}
                  tabIndex={-1}
                >
                  {tab === 'games' ? (
                    hasGamesLoaded ? (
                      <GameSelector
                        games={state.ingestion.result?.games ?? []}
                        selectedGameId={state.selection.gameId}
                        onSelect={(gameId) => {
                          controller.selectGame(gameId);
                          setVariation(null);
                        }}
                        onAnalyze={(gameId) => {
                          controller.selectGame(gameId);
                          setVariation(null);
                          setReviewMode('review');
                          selectTab('analysis');
                        }}
                        analysisStatus={analysisStatusMap}
                        hasLoaded={hasGamesLoaded}
                      />
                    ) : (
                      <div className="onboarding-panel">
                        <div className="onboarding-heading">
                          <h2>Review your games</h2>
                          <p>
                            Enter your Chess.com username to import games and explore your play.
                          </p>
                        </div>
                        {importOpen ? (
                          <p className="onboarding-notice" role="status">
                            Import is open
                          </p>
                        ) : (
                          queryForm
                        )}
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
                                if (active)
                                  void controller.submitQuery(active, { manualRefresh: true });
                              }}
                            />
                          </div>
                        ) : null}
                        {state.ingestion.result?.offlineCacheOnly ? <OfflineCacheNotice /> : null}
                      </div>
                    )
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
                      <div className="workspace-empty">
                        <h2>Explore your openings</h2>
                        <p>Import games to see which moves you play and how they score.</p>
                        <button
                          type="button"
                          className="button-primary"
                          onClick={() => setImportOpen(true)}
                        >
                          Import games
                        </button>
                      </div>
                    )
                  ) : null}

                  {tab === 'analysis' ? (
                    selectedRecord && parsedGame ? (
                      <>
                        {/* Temporary shared analyzer header for Phase 1 (split in Phase 4) */}
                        <div className="analyzer-mode-header">
                          <h2>{reviewMode === 'review' ? 'Review mode' : 'Analysis mode'}</h2>
                        </div>
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
                      </>
                    ) : (
                      <div className="workspace-empty">
                        <h2>Choose a game to review</h2>
                        <p>Open your games and select Review game.</p>
                        <button
                          type="button"
                          className="button-primary"
                          onClick={() => selectTab('games')}
                        >
                          Go to games
                        </button>
                      </div>
                    )
                  ) : null}
                </div>
              }
            />
          )}
        </main>
      </div>

      {/* Modal Import Drawer (rendered only when open) */}
      <UtilityRail
        title="Import games"
        open={importOpen}
        onOpenChange={setImportOpen}
        id="game-query-drawer"
        returnFocusRef={importTriggerRef}
        resultFocusVersion={resultFocusVersion}
      >
        {queryForm}
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

      {/* Mobile Navigation Drawer (< 960px) */}
      {menuOpen ? (
        <div
          className="workspace-menu__backdrop"
          ref={menuBackdropRef}
          onClick={(e) => {
            if (e.target === menuBackdropRef.current) {
              setMenuOpen(false);
              menuTriggerRef.current?.focus();
            }
          }}
        >
          <div
            ref={menuDialogRef}
            className="workspace-menu__drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setMenuOpen(false);
                menuTriggerRef.current?.focus();
              }
              if (e.key === 'Tab' && menuDialogRef.current) {
                trapFocus(e, menuDialogRef.current);
              }
            }}
          >
            <div className="workspace-menu__header">
              <h2 className="workspace-menu__title">Menu</h2>
              <button
                type="button"
                className="button-ghost workspace-menu__close-btn"
                aria-label="Close menu"
                onClick={() => {
                  setMenuOpen(false);
                  menuTriggerRef.current?.focus();
                }}
              >
                <AppIcon name="close" />
              </button>
            </div>
            <WorkspaceNavigation
              selected={tab}
              onSelect={(nextTab) => {
                selectTab(nextTab);
                setMenuOpen(false);
                requestAnimationFrame(() => titleHeadingRef.current?.focus());
              }}
              onOpenAbout={() => {
                setMenuOpen(false);
                setAboutOpen(true);
              }}
              isDrawer
              onCloseDrawer={() => setMenuOpen(false)}
              titleHeadingRef={titleHeadingRef}
            />
          </div>
        </div>
      ) : null}
    </div>
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
