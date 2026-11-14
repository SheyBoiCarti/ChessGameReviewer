'use client';

import { selectMovePresentation } from '@/features/stockfish-analysis/presentation';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type JSX,
} from 'react';
import type { GameQuery } from '@/lib/api/contracts';
import type { Square } from 'chess.js';

import {
  GameSelector,
  defaultGameListState,
  type GameListState,
} from '@/components/analysis/GameSelector';
import { VariationSandboxBanner } from '@/components/analysis/VariationSandboxBanner';
import { ChessboardView, type MoveHistoryModel } from '@/components/board/ChessboardView';
import { GameQueryForm } from '@/components/controls/GameQueryForm';
import { LocalDataSettings } from '@/components/controls/LocalDataSettings';
import { DiagnosticSummary } from '@/components/feedback/DiagnosticSummary';
import { IngestionProgress } from '@/components/feedback/IngestionProgress';
import { OfflineCacheNotice } from '@/components/feedback/OfflineCacheNotice';
import { MoveOrderDialog } from '@/components/tree/MoveOrderDialog';
import { OpeningTreeTable } from '@/components/tree/OpeningTreeTable';
import { OpeningScopeControl } from '@/components/opening/OpeningScopeControl';
import { OpeningDisclosure } from '@/components/opening/OpeningDisclosure';
import { OpeningSettings } from '@/components/opening/OpeningSettings';
import { UnobservedMoveNotice } from '@/components/opening/UnobservedMoveNotice';
import { OpeningPositionAnalysis } from '@/components/opening/OpeningPositionAnalysis';
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
  appendVisitedEntry,
  createGraphNavigation,
  replayGraphNavigation,
  navigateBack,
  navigateToHistoryIndex,
  resolveBoardMoveInGraph,
  type GraphNavigationEntry,
  type GraphNavigationState,
} from '@/features/opening-tree/navigation';
import { applyRepertoireContext } from '@/features/stockfish-analysis/repertoireContext';
import { initialOpeningScope, type OpeningScope } from '@/features/opening-tree/graphIdentity';
import {
  readStoredOpeningScope,
  writeStoredOpeningScope,
} from '@/features/workspace/openingScopePreference';
import { createBrowserWorkspaceServices } from '@/features/workspace/browserServices';
import type { WorkspaceServices } from '@/features/workspace/createWorkspaceController';
import { useWorkspace } from '@/features/workspace/useWorkspace';
import { computePgnDigest } from '@/features/stockfish-analysis/reviewIdentity';
import { saveWorkspaceSession } from '@/features/workspace/session';
import {
  readWorkspaceUrl,
  sameWorkspaceUrlIntent,
  writeWorkspaceUrl,
  type WorkspaceUrlIntent,
} from '@/features/workspace/urlState';
import type { PlayerMetadata } from '@/lib/api/contracts';
import type { ParsedGame } from '@/lib/chess/pgnParser';
import { parseSelectedGame } from '@/features/workspace/parseSelectedGame';
import { selectPrefixGameIds, selectPositionGameIds } from '@/features/opening-tree/selectors';
import { OpeningView } from '@/components/opening/OpeningView';
import { ReviewView } from '@/components/analysis/ReviewView';
import { ReviewFeedback } from '@/components/analysis/ReviewFeedback';
import {
  reviewMomentNavigation,
  type ReviewFilter,
} from '@/features/stockfish-analysis/reviewNavigation';
import { deserializeOpeningGraph } from '@/lib/chess/graph/serialization';
import type { MoveQuality } from '@/lib/engine/accuracy';
import type { EvaluationScore } from '@/lib/engine/evaluation';

import { AppTopBar } from './AppTopBar';
import { makeBackgroundInert, trapFocus } from './ProductInformation';
import { UtilityRail } from './UtilityRail';
import { WorkspaceLayout } from './WorkspaceLayout';
import { WorkspaceNavigation } from './WorkspaceNavigation';
import { WorkspaceTabs, type ReviewMode, type WorkspaceTab } from './WorkspaceTabs';
import { ProfileInsightsDashboard } from '@/components/profile-insights/ProfileInsightsDashboard';

export function ChessWorkspace({
  createServices = createBrowserWorkspaceServices,
}: {
  createServices?: (() => WorkspaceServices) | undefined;
} = {}): JSX.Element {
  const {
    controller,
    state,
    recentQuery,
    recoveredSession,
    initialUrlIntent: urlIntentAtMount,
    startupComplete,
  } = useWorkspace(createServices);
  // T28: a valid URL intent wins over stored defaults, so view and mode are
  // initialized from the address bar before session recovery can apply.
  const [tab, setTab] = useState<WorkspaceTab>(() => urlIntentAtMount?.tab ?? 'games');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>({});
  const [reviewMode, setReviewMode] = useState<ReviewMode>(
    () => urlIntentAtMount?.reviewMode ?? 'review'
  );
  const [urlRecovery, setUrlRecovery] = useState<string | null>(() => {
    const url = new URL(window.location.href);
    return url.searchParams.has('view') && !urlIntentAtMount
      ? 'This workspace link is invalid. Choose a view or find games to continue.'
      : null;
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [queryRecovery, setQueryRecovery] = useState<{
    target: 'username' | 'dates';
    version: number;
  } | null>(null);
  const [openingImportQuery, setOpeningImportQuery] = useState<GameQuery | null>(null);
  const [openingNotice, setOpeningNotice] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [navigation, setNavigation] = useState<GraphNavigationState | null>(null);
  // T40: visited histories are kept per username/dataset/scope/horizon above the
  // view mount lifetime so opening → Review → Back restores scope and line.
  const openingHistoryRef = useRef(new Map<string, GraphNavigationState>());
  const [moveOrdersOpen, setMoveOrdersOpen] = useState(false);
  const [resultFocusVersion, setResultFocusVersion] = useState(0);
  const [variationOrigin, setVariationOrigin] = useState<{
    gameId: string;
    selectedPly: number;
    fen: string;
    mode: ReviewMode;
  } | null>(null);
  const [variation, setVariation] = useState<AnalysisVariationState | null>(null);
  // T26: list presentation state is owned above GameSelector's mount lifetime, keyed by
  // the canonical import query, so Review returns retain filter/sort/page/scroll.
  const listStateStoreRef = useRef(new Map<string, GameListState>());
  const listStateKey = canonicalQueryKey(state.query.active ?? recentQuery ?? state.query.draft);
  const [listPresentation, setListPresentation] = useState(() => ({
    key: listStateKey,
    state: listStateStoreRef.current.get(listStateKey) ?? { ...defaultGameListState },
  }));
  const listState =
    listPresentation.key === listStateKey
      ? listPresentation.state
      : (listStateStoreRef.current.get(listStateKey) ?? { ...defaultGameListState });
  const handleListStateChange = useCallback(
    (next: GameListState) => {
      listStateStoreRef.current.set(listStateKey, next);
      setListPresentation({ key: listStateKey, state: next });
    },
    [listStateKey]
  );
  const selectedRecord =
    state.ingestion.result?.games.find(({ id }) => id === state.selection.gameId) ?? null;
  const [sessionContent, setSessionContent] = useState<{
    record: NonNullable<typeof selectedRecord>;
    digest: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    if (selectedRecord)
      void computePgnDigest(selectedRecord.pgn)
        .then((digest) => {
          if (active) setSessionContent({ record: selectedRecord, digest });
        })
        .catch(() => {
          /* Session recovery remains optional if hashing is unavailable. */
        });
    return () => {
      active = false;
    };
  }, [selectedRecord]);
  useEffect(() => {
    // T28: a valid URL intent already governs view and mode; stored session
    // defaults only apply when the URL did not describe a workspace state.
    if (recoveredSession && !urlIntentAtMount) {
      setTab(recoveredSession.tab);
      setReviewMode(recoveredSession.reviewMode);
    }
  }, [recoveredSession, urlIntentAtMount]);

  useEffect(() => {
    if (
      startupComplete &&
      sessionContent?.record === selectedRecord &&
      sessionContent &&
      state.query.active &&
      state.selection.gameId &&
      ['complete', 'partial'].includes(state.ingestion.status)
    ) {
      saveWorkspaceSession({
        username: state.query.active.username,
        gameId: state.selection.gameId,
        ply: state.selection.ply,
        pgnDigest: sessionContent.digest,
        tab,
        reviewMode,
      });
    }
  }, [
    startupComplete,
    sessionContent,
    selectedRecord,
    state.query.active,
    state.selection.gameId,
    state.selection.ply,
    state.ingestion.status,
    tab,
    reviewMode,
  ]);

  // T28: keep the address bar synchronized with view/game/mode/ply without a
  // state-sync loop. The mount run only records state (the URL already
  // describes it); an already-current URL — e.g. one just applied from
  // popstate — is left untouched; view/game/mode changes push a history entry
  // while position-only changes replace it, so thirty ply advances do not
  // create thirty Back steps.
  const urlSyncRef = useRef<{
    tab: WorkspaceTab;
    reviewMode: ReviewMode;
    gameId: string | null;
    ply: number;
  } | null>(null);
  const suppressUrlSyncRef = useRef(false);
  useEffect(() => {
    if (!startupComplete) return;
    const suppressed = suppressUrlSyncRef.current;
    suppressUrlSyncRef.current = false;
    const gameId = state.selection.gameId;
    const previous = urlSyncRef.current;
    urlSyncRef.current = { tab, reviewMode, gameId, ply: state.selection.ply };
    if (!previous) {
      if (urlIntentAtMount?.gameId && !gameId) {
        setUrlRecovery(
          'This game is not available locally. Import its games or choose a game from Games.'
        );
        return;
      }
      const initial = writeWorkspaceUrl(new URL(window.location.href), {
        tab,
        reviewMode,
        ...(gameId ? { gameId, ply: state.selection.ply } : {}),
      });
      window.history.replaceState(null, '', `${initial.pathname}${initial.search}${initial.hash}`);
      return;
    }
    if (
      previous.tab === tab &&
      previous.reviewMode === reviewMode &&
      previous.gameId === gameId &&
      previous.ply === state.selection.ply
    )
      return;
    if (suppressed) return;
    setUrlRecovery(null);
    const intent: WorkspaceUrlIntent = {
      tab,
      reviewMode,
      ...(gameId ? { gameId } : {}),
      ...(gameId ? { ply: state.selection.ply } : {}),
    };
    const url = new URL(window.location.href);
    if (sameWorkspaceUrlIntent(readWorkspaceUrl(url), intent)) return;
    const next = writeWorkspaceUrl(url, intent);
    const target = `${next.pathname}${next.search}${next.hash}`;
    const positionOnly =
      previous.tab === tab && previous.reviewMode === reviewMode && previous.gameId === gameId;
    if (positionOnly) window.history.replaceState(null, '', target);
    else window.history.pushState(null, '', target);
  }, [
    tab,
    reviewMode,
    state.selection.gameId,
    state.selection.ply,
    startupComplete,
    urlIntentAtMount,
  ]);

  // T28: one popstate owner applies Back/Forward URL intents; applying a URL
  // never writes another history entry.
  const popStateRef = useRef({
    tab,
    reviewMode,
    selectionGameId: state.selection.gameId,
    selectionPly: state.selection.ply,
    games: state.ingestion.result?.games ?? [],
  });
  popStateRef.current = {
    tab,
    reviewMode,
    selectionGameId: state.selection.gameId,
    selectionPly: state.selection.ply,
    games: state.ingestion.result?.games ?? [],
  };
  useEffect(() => {
    const applyPopState = () => {
      const intent = readWorkspaceUrl(new URL(window.location.href));
      const snapshot = popStateRef.current;
      controller.invalidateReviewIntent();
      setVariation(null);
      setVariationOrigin(null);
      if (!intent) {
        setUrlRecovery('This workspace link is invalid. Choose a view or find games to continue.');
        return;
      }
      setTab(intent.tab);
      setReviewMode(intent.reviewMode);
      const game = snapshot.games.find(({ id }) => id === intent.gameId);
      setUrlRecovery(
        intent.gameId && !game
          ? 'This game is not available locally. Import its games or choose a game from Games.'
          : null
      );
      controller.selectGame(game?.id ?? null);
      if (game && intent.ply !== undefined) {
        controller.selectPly(Math.min(intent.ply, parseSelectedGame(game)?.plies.length ?? 0));
      }
      const changed =
        intent.tab !== snapshot.tab ||
        intent.reviewMode !== snapshot.reviewMode ||
        (game?.id ?? null) !== snapshot.selectionGameId ||
        controller.getState().selection.ply !== snapshot.selectionPly;
      // The applied state must not write the URL back; the sync effect skips
      // the render this produces.
      if (changed) suppressUrlSyncRef.current = true;
    };
    window.addEventListener('popstate', applyPopState);
    return () => window.removeEventListener('popstate', applyPopState);
  }, [controller]);

  const [loadedAnnouncement, setLoadedAnnouncement] = useState<string | null>(null);

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

  // T40: the per-scope history key spans username, dataset revision, scope and horizon.
  const openingDatasetKey = [
    state.query.active?.username ?? '',
    state.graph.datasetRevision ?? '',
    state.graph.scope ?? '',
    state.graph.snapshot?.openingHorizon ?? state.preferences.openingHorizon,
  ].join('\u0000');
  const datasetKeyRef = useRef(openingDatasetKey);

  const openingColorCounts = useMemo(() => {
    const games = state.ingestion.result?.games ?? [];
    return {
      white: games.filter((game) => game.userColor === 'white').length,
      black: games.filter((game) => game.userColor === 'black').length,
    };
  }, [state.ingestion.result]);

  const openingGamesById = useMemo(
    () => new Map((state.ingestion.result?.games ?? []).map((game) => [game.id, game])),
    [state.ingestion.result]
  );
  const openingNode = navigation?.observed
    ? graph?.positions.get(navigation.positionKey)
    : undefined;
  const openingExactMatchCount =
    state.graph.snapshot && navigation?.observed
      ? selectPrefixGameIds(state.graph.snapshot, navigation.pathId).length
      : 0;

  // Initialize once per committed import. Horizon changes made outside Openings
  // are applied on entry, independently of the import query and Review selection.
  const scopeInitializedDatasetRef = useRef(state.ingestion.result);
  const requestedOpeningRef = useRef('');
  useEffect(() => {
    if (tab !== 'opening') return;
    const result = state.ingestion.result;
    if (!result || result.games.length === 0 || state.ingestion.status === 'loading') return;
    const username = state.query.active?.username ?? '';
    const freshDataset =
      scopeInitializedDatasetRef.current !== result || !requestedOpeningRef.current;
    const effective = freshDataset
      ? (readStoredOpeningScope(username) ?? initialOpeningScope(result.games))
      : state.preferences.openingScope;
    scopeInitializedDatasetRef.current = result;
    if (effective !== state.preferences.openingScope) {
      controller.dispatch({
        type: 'preferences/changed',
        preferences: { openingScope: effective },
      });
    }
    const requestKey = JSON.stringify([
      state.query.token,
      effective,
      state.preferences.openingHorizon,
    ]);
    if (requestedOpeningRef.current === requestKey) return;
    requestedOpeningRef.current = requestKey;
    void controller.requestOpeningGraph(effective);
  }, [
    tab,
    controller,
    state.ingestion.result,
    state.ingestion.status,
    state.query.active?.username,
    state.query.token,
    state.preferences.openingScope,
    state.preferences.openingHorizon,
  ]);

  const handleOpeningScopeChange = (scope: OpeningScope) => {
    writeStoredOpeningScope(state.query.active?.username ?? '', scope);
    controller.dispatch({ type: 'preferences/changed', preferences: { openingScope: scope } });
  };

  const navigationRef = useRef(navigation);
  navigationRef.current = navigation;
  const latestOpeningHistoryRef = useRef(new Map<string, GraphNavigationState>());
  // Resolve the current entry before painting a replacement graph, so old
  // arrival IDs never label the new graph's exact-line counts.
  useLayoutEffect(() => {
    const previousKey = datasetKeyRef.current;
    const previous = navigationRef.current;
    if (previous && previousKey) openingHistoryRef.current.set(previousKey, previous);
    datasetKeyRef.current = openingDatasetKey;
    // Save the leaving scope separately; an unchanged dataset restores all redo.
    if (previous && previousKey) {
      const [username, , scope] = previousKey.split('\u0000');
      latestOpeningHistoryRef.current.set(JSON.stringify([username, scope]), previous);
    }
    if (!graph) {
      setNavigation(null);
      return;
    }
    const lineKey = JSON.stringify([state.query.active?.username, state.graph.scope]);
    const exact = openingHistoryRef.current.get(openingDatasetKey);
    const saved = exact ?? latestOpeningHistoryRef.current.get(lineKey);
    const restored = saved ? replayGraphNavigation(saved, graph) : null;
    setNavigation(restored ?? createGraphNavigation(graph));
    setMoveOrdersOpen(false);
    setOpeningNotice(
      saved && !exact
        ? 'Imported games or opening depth changed. The valid part of your visited line was restored.'
        : null
    );
    if (openingHistoryRef.current.size > 24) {
      openingHistoryRef.current.delete(openingHistoryRef.current.keys().next().value!);
    }
  }, [graph, openingDatasetKey, state.query.active?.username, state.graph.scope]);

  useEffect(() => {
    if (navigation) controller.navigateGraph(navigation.positionKey, navigation.pathId);
  }, [controller, navigation]);

  const parsedGame = useMemo(() => parseSelectedGame(selectedRecord), [selectedRecord]);
  const fenByPly = useMemo(
    () => Object.fromEntries(parsedGame?.plies.map((move) => [move.ply, move.fenBefore]) ?? []),
    [parsedGame]
  );
  const displayedFen = boardFen(tab, graph, navigation, parsedGame, state.selection.ply);

  // T28: a URL or stored ply is clamped once the selected game is known.
  useEffect(() => {
    if (parsedGame && state.selection.ply > parsedGame.plies.length) {
      controller.selectPly(parsedGame.plies.length);
    }
  }, [controller, parsedGame, state.selection.ply]);

  const analysisStatusMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (state.analysis.resultsByGameId) {
      for (const [id, result] of Object.entries(state.analysis.resultsByGameId)) {
        if (result.status === 'complete') {
          map[id] = 'Reviewed';
        } else if (result.status === 'partial' || result.status === 'cancelled') {
          map[id] = 'Partial review';
        } else if (result.status === 'failed') {
          map[id] = 'Review failed';
        }
      }
    }
    if (state.analysis.status === 'running' && state.selection.gameId) {
      map[state.selection.gameId] = 'Analysing…';
    }
    return map;
  }, [state.analysis.resultsByGameId, state.analysis.status, state.selection.gameId]);

  useEffect(() => {
    setVariation(null);
    setVariationOrigin(null);
    setReviewFilter({});
  }, [state.selection.gameId]);

  const repertoireKeys = useMemo(
    () =>
      state.repertoire?.horizon === state.preferences.openingHorizon
        ? new Set(state.repertoire.moveKeys)
        : null,
    [state.repertoire, state.preferences.openingHorizon]
  );
  const reviewResult = useMemo(
    () =>
      state.analysis.result && parsedGame
        ? applyRepertoireContext(state.analysis.result, parsedGame, repertoireKeys)
        : state.analysis.result,
    [state.analysis.result, parsedGame, repertoireKeys]
  );

  const reviewMoments = reviewMomentNavigation(
    reviewResult?.annotations ?? [],
    state.selection.ply,
    reviewFilter
  );
  const selectedPresentation = parsedGame
    ? selectMovePresentation(parsedGame, reviewResult, state.selection.ply)
    : null;
  const selectedAnnotation =
    tab === 'analysis' && !variation && selectedPresentation?.state === 'ready'
      ? (selectedPresentation.annotation ?? undefined)
      : undefined;
  const selectedArrow = uciArrow(
    selectedAnnotation && selectedPresentation?.state === 'ready'
      ? (selectedPresentation.reply ?? undefined)
      : undefined
  );
  const selectedBadge =
    selectedAnnotation && selectedAnnotation.accuracy.status === 'classified'
      ? {
          square: selectedAnnotation.uci.slice(2, 4) as Square,
          quality: selectedAnnotation.accuracy.quality as MoveQuality,
        }
      : undefined;

  useEffect(() => {
    const previous = previousIngestionStatus.current;
    previousIngestionStatus.current = state.ingestion.status;
    if (previous === 'loading' && state.ingestion.status !== 'loading') {
      // Recovery is a one-time form intent; later saved searches own their dates.
      if (queryRecovery) setQueryRecovery(null);
      const hasGames = (state.ingestion.result?.games.length ?? 0) > 0;
      if (startupComplete && ['complete', 'partial'].includes(state.ingestion.status) && hasGames) {
        setImportOpen(false);
        setOpeningImportQuery(null);
        selectTab('games');
        setLoadedAnnouncement(`${state.ingestion.result?.games.length} games loaded`);
        requestAnimationFrame(() => titleHeadingRef.current?.focus());
      } else {
        if (state.ingestion.status === 'empty') setLoadedAnnouncement(null);
        setResultFocusVersion((v) => v + 1);
      }
    }
  }, [state.ingestion.status, state.ingestion.result]);

  useEffect(() => {
    if (
      tab === 'analysis' &&
      state.analysis.status !== 'probing' &&
      !state.analysis.capability &&
      !state.analysis.result
    ) {
      void controller.probeEngine();
    }
  }, [controller, state.analysis.capability, state.analysis.status, state.analysis.result, tab]);

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
    if (next !== tab) controller.invalidateReviewIntent();
    setTab(next);
    if (next !== 'opening') {
      setMoveOrdersOpen(false);
      // An unobserved novelty is transient: leaving Openings returns to the
      // last observed entry instead of keeping a disabled board.
      setNavigation((prev) => (prev && !prev.observed ? navigateBack(prev) : prev));
    }
    if (next !== 'analysis') {
      setVariation(null);
    }
  };

  const handlePlyChange = (ply: number) => {
    setVariation(null);
    controller.selectPly(ply);
  };

  const rememberVariationOrigin = () => {
    if (state.selection.gameId && displayedFen)
      setVariationOrigin({
        gameId: state.selection.gameId,
        selectedPly: state.selection.ply,
        fen: displayedFen,
        mode: reviewMode,
      });
  };
  const returnToGame = () => {
    if (variationOrigin && variationOrigin.gameId === state.selection.gameId) {
      controller.selectPly(variationOrigin.selectedPly);
      setReviewMode(variationOrigin.mode);
    }
    setVariation(null);
    setVariationOrigin(null);
  };
  const explorePv = (pvFen: string, uciMoves: readonly string[]) => {
    const preview = createVariationFromUciSequence(state.selection.ply, pvFen, uciMoves);
    if (!preview) return;
    rememberVariationOrigin();
    setVariation(preview);
    setReviewMode('analysis');
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
            rememberVariationOrigin();
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
      // T38: an unobserved novelty disables further opening input until Return.
      if (!navigation.observed) return false;

      const res = resolveBoardMoveInGraph(
        graph,
        navigation.positionKey,
        navigation.pathId,
        applied
      );

      // T38: the visited entry is the authoritative current position; the board
      // shows its actual FEN for both observed and unobserved moves.
      const entry: GraphNavigationEntry = {
        positionKey: res.nextPositionKey,
        fen: res.nextFen,
        pathId: res.nextPathId,
        uci: applied.uci,
        san: applied.san,
        observed: res.observed,
      };
      setNavigation((prev) => (prev ? appendVisitedEntry(prev, entry) : null));
      controller.navigateGraph(res.nextPositionKey, res.nextPathId);
      return true;
    }

    return false;
  };

  const isOpeningBoard = tab === 'opening' && Boolean(graph && navigation);
  // T38: the unobserved visited entry drives the notice; it is no longer separate state.
  const unobservedMove = navigation && !navigation.observed ? navigation : null;
  const displayedBoardFen =
    tab === 'analysis' && variation
      ? variationFen(variation)
      : isOpeningBoard && unobservedMove
        ? unobservedMove.fen
        : displayedFen;

  const lastMoveValue: { from: Square; to: Square } | undefined =
    tab === 'analysis' && variation
      ? variation.cursor > 0
        ? {
            from: variation.moves[variation.cursor - 1]!.from,
            to: variation.moves[variation.cursor - 1]!.to,
          }
        : undefined
      : tab === 'opening' && navigation?.uci
        ? {
            from: navigation.uci.slice(0, 2) as Square,
            to: navigation.uci.slice(2, 4) as Square,
          }
        : state.selection.ply > 0 && parsedGame && !isOpeningBoard
          ? {
              from: parsedGame.plies[state.selection.ply - 1]!.uci.slice(0, 2) as Square,
              to: parsedGame.plies[state.selection.ply - 1]!.uci.slice(2, 4) as Square,
            }
          : undefined;

  // T39: opening playback reuses the same MoveHistoryModel primitives as Review;
  // the cursor maps onto the visited history so all controls stay consistent.
  const historyValue: MoveHistoryModel | undefined = isOpeningBoard
    ? {
        currentPly: navigation!.cursor,
        totalPlies: navigation!.history.length - 1,
        onPlyChange: (index) =>
          setNavigation((prev) => (prev ? navigateToHistoryIndex(prev, index) : null)),
      }
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

  useEffect(() => {
    if (tab !== 'games' && tab !== 'analysis' && tab !== 'opening') return;
    if (importOpen || aboutOpen || menuOpen || moveOrdersOpen) return;
    if (!historyValue) return;

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing)
        return;

      const active = document.activeElement;
      if (active) {
        const tag = active.tagName.toLowerCase();
        if (
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          active.closest('[contenteditable]:not([contenteditable="false"])') ||
          active.getAttribute('role') === 'textbox' ||
          active.closest('[role="dialog"]')
        ) {
          return;
        }
        if (active.closest('.chessboard')) {
          return;
        }
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        historyValue.onPlyChange(Math.max(0, historyValue.currentPly - 1));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        historyValue.onPlyChange(Math.min(historyValue.totalPlies, historyValue.currentPly + 1));
      } else if (event.key === 'Home') {
        event.preventDefault();
        historyValue.onPlyChange(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        historyValue.onPlyChange(historyValue.totalPlies);
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [tab, importOpen, aboutOpen, menuOpen, moveOrdersOpen, historyValue]);

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

  const board =
    !isOpeningBoard && isSelectedGameWithoutMoves ? (
      <div className="workspace-board workspace-board--no-moves">
        <p role="status">This game has no reviewable moves.</p>
      </div>
    ) : (
      <div ref={boardRef} className="workspace-board">
        {tab === 'analysis' && variation ? (
          <VariationSandboxBanner
            state={variation}
            returnNotation={
              variationOrigin?.selectedPly
                ? `${Math.ceil(variationOrigin.selectedPly / 2)}${variationOrigin.selectedPly % 2 ? '.' : '…'} ${parsedGame?.plies[variationOrigin.selectedPly - 1]?.san ?? ''}`
                : 'Starting position'
            }
            onCursorChange={(cursor) =>
              setVariation((prev) => (prev ? moveVariationCursor(prev, cursor) : null))
            }
            onClose={returnToGame}
          />
        ) : null}
        {tab === 'opening' && unobservedMove ? (
          <UnobservedMoveNotice
            san={unobservedMove.san ?? ''}
            onReturn={() => {
              const next = navigateBack(navigation!);
              setNavigation(next);
              controller.navigateGraph(next.positionKey, next.pathId);
            }}
          />
        ) : null}
        <BoardPanel
          fen={displayedBoardFen}
          orientation={state.preferences.boardOrientation}
          isInteractive={isInteractive}
          squareNavigation={isOpeningBoard || isInteractive}
          onMove={handleBoardMove}
          onFlipOrientation={() =>
            controller.dispatch({
              type: 'preferences/changed',
              preferences: {
                boardOrientation:
                  state.preferences.boardOrientation === 'white' ? 'black' : 'white',
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
  // - Openings without a graph or selected game position: no board
  // - Games with no game selected (initial visit or loaded list without selection): no board
  const shouldRenderBoard =
    tab !== 'settings' &&
    tab !== 'insights' &&
    !(tab === 'analysis' && !selectedRecord) &&
    !(tab === 'opening' && !displayedBoardFen) &&
    !(tab === 'games' && !selectedRecord);

  const viewTitle =
    tab === 'games'
      ? 'Games'
      : tab === 'analysis'
        ? 'Review'
        : tab === 'opening'
          ? 'Openings'
          : tab === 'insights'
            ? 'Insights'
            : 'Settings';

  const queryForm = (
    <GameQueryForm
      key={openingImportQuery ? JSON.stringify(openingImportQuery) : 'default-import'}
      disabled={state.ingestion.status === 'loading'}
      recoveryTarget={queryRecovery?.target ?? null}
      recoveryVersion={queryRecovery?.version ?? 0}
      initialQuery={
        openingImportQuery ??
        state.query.requested ??
        state.query.active ??
        recentQuery ??
        state.query.draft
      }
      onDraftChange={(draft) => {
        if (state.ingestion.error || state.ingestion.status === 'failed')
          controller.dismissIngestionError();
        controller.dispatch({
          type: 'query/draftChanged',
          query: { ...state.query.draft, ...draft },
        });
      }}
      openingHorizon={state.preferences.openingHorizon}
      onOpeningHorizonChange={(openingHorizon) =>
        controller.dispatch({
          type: 'preferences/changed',
          preferences: { openingHorizon },
        })
      }
      onSubmit={(query) => {
        setOpeningImportQuery(null);
        return controller.submitQuery(query);
      }}
      recentQuery={recentQuery}
      onResume={(query) => controller.submitQuery(query)}
    />
  );

  const recoverQuery = (target: 'username' | 'dates') => {
    setQueryRecovery((previous) => ({ target, version: (previous?.version ?? 0) + 1 }));
    setImportOpen(true);
  };
  const feedbackResult = ['failed', 'cancelled'].includes(state.ingestion.status)
    ? (state.ingestion.lastAttempt ?? {
        jobId: 'failed',
        fingerprint: '',
        status: 'failed' as const,
        games: [],
        failedMonths: [],
        diagnostics: [
          {
            code: 'IMPORT_FAILED',
            message: state.ingestion.error ?? 'Games could not be loaded.',
            severity: 'error' as const,
          },
        ],
        offlineCacheOnly: false,
      })
    : state.ingestion.result;
  const importFeedback =
    feedbackResult && state.ingestion.status !== 'loading' ? (
      <div
        className="utility-rail__result"
        data-utility-rail-result
        role="region"
        aria-label="Ingestion result"
        tabIndex={-1}
      >
        <DiagnosticSummary
          result={feedbackResult}
          onRetry={() => {
            const query = state.query.requested ?? state.query.active;
            if (query) void controller.submitQuery(query, { manualRefresh: true });
          }}
          onEditUsername={() => recoverQuery('username')}
          onExpandDates={() => recoverQuery('dates')}
          retainedCount={
            state.ingestion.status === 'failed' && hasGamesLoaded
              ? (state.ingestion.result?.games.length ?? 0)
              : 0
          }
          retainedUsername={state.query.active?.username}
          onKeepCurrent={() => controller.dismissIngestionError()}
        />
      </div>
    ) : null;

  const handleReviewModeChange = (mode: ReviewMode) => {
    if (mode !== reviewMode) controller.invalidateReviewIntent();
    if (mode === 'review') {
      setVariation(null);
    }
    setReviewMode(mode);
  };

  return (
    <div
      className={`workspace-shell${tab === 'opening' ? ' workspace-shell--opening' : ''}`}
      data-modal-root
    >
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
          viewTitle={
            tab === 'opening' && state.query.active?.username
              ? `Openings · ${state.query.active.username}`
              : viewTitle
          }
          onOpenMenu={() => {
            setImportOpen(false);
            setOpeningImportQuery(null);
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
          {urlRecovery ? (
            <div className="status-card" role="status">
              <p>{urlRecovery}</p>
              <button
                type="button"
                onClick={() => {
                  setUrlRecovery(null);
                  selectTab('games');
                }}
              >
                Choose a game
              </button>
              <button type="button" onClick={() => setImportOpen(true)}>
                Import linked games
              </button>
            </div>
          ) : null}

          {state.ingestion.status === 'cancelled' && !importOpen ? (
            <p role="status">
              Import cancelled.{' '}
              {hasGamesLoaded
                ? 'Previously loaded games are still available.'
                : 'You can load games again.'}
            </p>
          ) : null}
          {tab === 'games' && loadedAnnouncement ? (
            <div className="sr-only" role="status" aria-live="polite">
              {loadedAnnouncement}
            </div>
          ) : null}
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
          ) : tab === 'insights' ? (
            <div
              className="workspace-panel workspace-panel--insights"
              id="workspace-panel-insights"
              role="region"
              aria-label={viewTitle}
              tabIndex={-1}
            >
              <ProfileInsightsDashboard
                key={state.query.active?.username ?? 'no-player'}
                username={
                  state.query.active?.username ?? state.ingestion.result?.games[0]?.username ?? null
                }
                games={state.ingestion.result?.games ?? []}
                analysisMap={state.analysis.resultsByGameId ?? {}}
                onNavigateToGames={() => selectTab('games')}
              />
            </div>
          ) : (
            <WorkspaceLayout
              board={shouldRenderBoard ? board : null}
              review={tab === 'analysis'}
              opening={tab === 'opening'}
              header={
                tab === 'analysis' && selectedRecord ? (
                  <div className="review-header">
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => selectTab('games')}
                    >
                      Back to games
                    </button>
                    <div>
                      <strong>
                        {selectedRecord.whitePlayer.username ?? 'White'} vs{' '}
                        {selectedRecord.blackPlayer.username ?? 'Black'}
                      </strong>
                      <p>
                        {selectedRecord.result} ·{' '}
                        {new Date(selectedRecord.endedAt * 1000).toLocaleDateString()} · You played{' '}
                        {selectedRecord.userColor}
                      </p>
                    </div>
                  </div>
                ) : null
              }
              feedback={
                tab === 'analysis' && reviewMode === 'review' && selectedRecord && parsedGame ? (
                  <ReviewFeedback
                    onExplorePv={explorePv}
                    annotation={selectedAnnotation ?? null}
                    selectedPly={state.selection.ply}
                    startFen={fenByPly[state.selection.ply]}
                    firstMoment={reviewMoments.first}
                    previousMoment={reviewMoments.previous}
                    nextMistake={reviewMoments.next}
                    navigationKind="moment"
                    onSelectPly={handlePlyChange}
                    hasAnnotations={Boolean(state.analysis.result?.annotations.length)}
                    showingPrevious={state.analysis.showingPrevious}
                    previousStrength={state.analysis.previousStrength}
                  />
                ) : null
              }
              tabs={
                tab === 'analysis' ? (
                  <WorkspaceTabs selected={reviewMode} onSelect={handleReviewModeChange} />
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
                      <>
                        {state.ingestion.result?.offlineCacheOnly ? <OfflineCacheNotice /> : null}
                        {!importOpen &&
                        ['failed', 'partial', 'cancelled'].includes(state.ingestion.status)
                          ? importFeedback
                          : null}
                        <GameSelector
                          key={listStateKey}
                          games={state.ingestion.result?.games ?? []}
                          selectedGameId={state.selection.gameId}
                          listState={listState}
                          onListStateChange={handleListStateChange}
                          onSelect={(gameId) => {
                            controller.selectGame(gameId);
                            setVariation(null);
                          }}
                          onReview={(gameId) => {
                            setVariation(null);
                            controller.selectGame(gameId);
                            const candidate =
                              state.ingestion.result?.games.find((game) => game.id === gameId) ??
                              null;
                            if (!parseSelectedGame(candidate)?.plies.length) return;
                            setReviewMode('review');
                            selectTab('analysis');
                            void controller.openReview(gameId);
                          }}
                          analysisStatus={analysisStatusMap}
                          hasLoaded={hasGamesLoaded}
                          reviewDisabledReason={
                            isSelectedGameWithoutMoves
                              ? 'This game has no reviewable moves.'
                              : undefined
                          }
                        />
                      </>
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
                        {!importOpen ? importFeedback : null}
                        {state.ingestion.result?.offlineCacheOnly ? <OfflineCacheNotice /> : null}
                      </div>
                    )
                  ) : null}

                  {tab === 'opening' ? (
                    graph && navigation ? (
                      <div className="opening-panel">
                        {/* T41: compact scope/position context comes first. */}
                        <OpeningScopeControl
                          value={state.preferences.openingScope}
                          onChange={handleOpeningScopeChange}
                          whiteCount={openingColorCounts.white}
                          blackCount={openingColorCounts.black}
                          importColors={state.query.active?.colors ?? ['white', 'black']}
                          disabled={state.graph.status === 'building'}
                          onRequestLoad={() => {
                            const query = state.query.active;
                            if (!query) return;
                            setOpeningImportQuery({ ...query, colors: ['white', 'black'] });
                            setImportOpen(true);
                          }}
                        />
                        {state.graph.status === 'building' ? (
                          <p role="status" className="sr-only">
                            Updating opening candidates…
                          </p>
                        ) : null}
                        {state.graph.error ? <p role="alert">{state.graph.error}</p> : null}
                        {openingNotice ? <p role="status">{openingNotice}</p> : null}
                        {navigation.observed ? (
                          <p className="opening-membership field-help">
                            {state.graph.scope === 'both'
                              ? 'Both colors'
                              : state.graph.scope === 'black'
                                ? 'Black'
                                : 'White'}{' '}
                            · Position:{' '}
                            {state.graph.snapshot
                              ? selectPositionGameIds(state.graph.snapshot, navigation.positionKey)
                                  .length
                              : 0}{' '}
                            games · Exact line: {openingExactMatchCount} games
                          </p>
                        ) : null}
                        {/* T41: notation/navigation and candidates next. */}
                        <OpeningTreeTable
                          graph={graph}
                          navigation={navigation}
                          perspective={state.preferences.resultPerspective}
                          excludedGameCount={state.graph.snapshot?.excludedGameCount ?? 0}
                          diagnosticCodes={state.graph.diagnosticCodes}
                          onNavigate={(next) => {
                            setNavigation(next);
                            controller.navigateGraph(next.positionKey, next.pathId);
                          }}
                          moveOrdersAction={
                            <button
                              ref={moveOrdersButton}
                              type="button"
                              className="button-secondary"
                              onClick={() => setMoveOrdersOpen(true)}
                              disabled={
                                Boolean(unobservedMove) ||
                                !graph.positions.get(navigation.positionKey)?.arrivalsByPath.size
                              }
                            >
                              View move orders
                            </button>
                          }
                        />
                        <OpeningSettings
                          value={state.preferences.openingHorizon}
                          onChange={(openingHorizon) =>
                            controller.dispatch({
                              type: 'preferences/changed',
                              preferences: { openingHorizon },
                            })
                          }
                        />
                        {/* T41: expensive secondary contents mount only on expansion. */}
                        <OpeningDisclosure label="Stockfish analysis">
                          {displayedBoardFen ? (
                            <OpeningPositionAnalysis fen={displayedBoardFen} />
                          ) : null}
                        </OpeningDisclosure>
                        <OpeningDisclosure
                          label={`Matching games (${openingExactMatchCount})`}
                          className="opening-disclosure opening-matching-disclosure"
                        >
                          <OpeningView
                            gamesById={openingGamesById}
                            snapshot={state.graph.snapshot!}
                            positionKey={navigation.positionKey}
                            pathId={navigation.observed ? navigation.pathId : null}
                            onSelectGame={(id) => {
                              void controller.openReview(id);
                              selectTab('analysis');
                            }}
                          />
                        </OpeningDisclosure>
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
                      <ReviewView
                        feedbackInLayout
                        userColor={selectedRecord.userColor}
                        reviewFilter={reviewFilter}
                        onReviewFilterChange={setReviewFilter}
                        mode={reviewMode}
                        game={parsedGame}
                        players={{
                          white: parsedGame.whitePlayer,
                          black: parsedGame.blackPlayer,
                        }}
                        isVariationActive={Boolean(variation)}
                        onReturnToGame={returnToGame}
                        capability={state.analysis.capability}
                        status={state.analysis.status}
                        result={reviewResult}
                        showingPrevious={state.analysis.showingPrevious}
                        previousStrength={state.analysis.previousStrength}
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
                        onRetryEngine={() => void controller.retryEngine()}
                        onCancel={controller.cancelAnalysis}
                        onResume={() => void controller.startAnalysis()}
                        onStartOver={() => {
                          setVariation(null);
                          setVariationOrigin(null);
                          setReviewMode('review');
                          if (state.selection.gameId) controller.startOver(state.selection.gameId);
                        }}
                        onSelectPly={handlePlyChange}
                        selectedPly={state.selection.ply}
                        fenByPly={fenByPly}
                        onExplorePv={explorePv}
                      />
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
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) setOpeningImportQuery(null);
        }}
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
        {importFeedback}
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
  squareNavigation,
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
  squareNavigation: boolean;
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
      squareNavigation={squareNavigation}
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

/** Stable list-state owner key per canonical import query (T26). */
function canonicalQueryKey(
  query: {
    username: string;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
    maxGames?: number | undefined;
    timeClasses?: readonly string[] | undefined;
    colors?: readonly string[] | undefined;
    rated?: boolean | undefined;
  } | null
): string {
  if (!query) return 'no-query';
  return JSON.stringify([
    query.username.toLowerCase(),
    query.dateFrom ?? '',
    query.dateTo ?? '',
    query.maxGames ?? null,
    [...(query.timeClasses ?? [])].sort(),
    [...(query.colors ?? [])].sort(),
    query.rated ?? null,
  ]);
}

function EmptyWorkspace({ message }: { message: string }) {
  return <p className="empty-workspace">{message}</p>;
}

function boardFen(
  tab: WorkspaceTab,
  graph: ReturnType<typeof deserializeOpeningGraph> | null,
  navigation: GraphNavigationState | null,
  game: ParsedGame | null,
  ply: number
): string | null {
  // T36: the visited entry carries the actual full FEN; the four-field position
  // key is never promoted to a fake six-field FEN.
  if (tab === 'opening' && graph && navigation) {
    return navigation.fen;
  }
  if (!game || game.plies.length === 0) return null;
  if (ply <= 0) return game.plies[0]!.fenBefore;
  return game.plies[Math.min(ply, game.plies.length) - 1]!.fenAfter;
}
