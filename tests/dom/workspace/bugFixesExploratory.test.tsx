import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChessWorkspace } from '@/components/workspace/ChessWorkspace';
import type { WorkspaceServices } from '@/features/workspace/createWorkspaceController';
import type { GameRecord } from '@/lib/db/schema';
import type { GameAnalysisResult } from '@/features/stockfish-analysis/analyzeGame';

const sampleGame: GameRecord = {
  id: 'game-173037119764',
  username: 'iamsheyboicarti',
  url: 'https://www.chess.com/game/live/173037119764',
  userColor: 'white',
  result: 'loss',
  endedAt: 1704067200,
  timeClass: 'rapid',
  rated: true,
  userRating: 1200,
  opponentRating: 1150,
  whitePlayer: { username: 'iamSheyBoiCarti', rating: 1200 },
  blackPlayer: { username: 'opponent', rating: 1150 },
  pgn: `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2024.01.01"]
[White "iamSheyBoiCarti"]
[Black "opponent"]
[Result "0-1"]

1. e4 e5 2. Nf3 Nc6 3. d4 exd4 0-1`,
  rules: 'chess',
};

const mockAnalysisResult: GameAnalysisResult = {
  status: 'complete',
  analyzedPlies: 6,
  totalPlies: 6,
  warnings: [],
  annotations: [
    {
      ply: 1,
      san: 'e4',
      uci: 'e2e4',
      mover: 'white',
      before: {
        score: { kind: 'cp', value: 20 },
        depth: 14,
        pv: ['e2e4', 'e7e5'],
        bestMove: 'e2e4',
        candidates: [],
      },
      after: {
        score: { kind: 'cp', value: 25 },
        depth: 14,
        pv: ['e7e5', 'g1f3'],
        bestMove: 'e7e5',
        candidates: [],
      },
      accuracy: {
        status: 'classified',
        quality: 'best',
        probabilityLoss: 0,
        accuracyEstimate: 100,
        heuristicVersion: 'analyzer-accuracy-v3',
      },
      settings: {
        engineBuild: 'Stockfish 18',
        networkHash: '9067e33176e',
        limit: { depth: 14 },
        multiPv: 1,
        threads: 1,
        hashMb: 16,
        analysisVersion: 'analyzer-accuracy-v1',
        normalizationVersion: 'white-perspective-v1',
      },
    },
    {
      ply: 3,
      san: 'Nf3',
      uci: 'g1f3',
      mover: 'white',
      before: {
        score: { kind: 'cp', value: 30 },
        depth: 14,
        pv: ['d2d4', 'e5d4'],
        bestMove: 'd2d4',
        candidates: [],
      },
      after: {
        score: { kind: 'cp', value: 10 },
        depth: 14,
        pv: ['b8c6', 'f1c4'],
        bestMove: 'b8c6',
        candidates: [],
      },
      accuracy: {
        status: 'classified',
        quality: 'inaccuracy',
        probabilityLoss: 0.05,
        accuracyEstimate: 70,
        heuristicVersion: 'analyzer-accuracy-v3',
      },
      settings: {
        engineBuild: 'Stockfish 18',
        networkHash: '9067e33176e',
        limit: { depth: 14 },
        multiPv: 1,
        threads: 1,
        hashMb: 16,
        analysisVersion: 'analyzer-accuracy-v1',
        normalizationVersion: 'white-perspective-v1',
      },
    },
  ],
  summary: {
    white: {
      accuracyEstimate: 78.5,
      eligibleMoves: 3,
      excludedMoves: 0,
      breakdown: {
        blunder: 0,
        mistake: 0,
        inaccuracy: 1,
        miss: 0,
        brilliant: 0,
        great: 0,
        best: 1,
        excellent: 0,
        good: 1,
        forced: 0,
      },
    },
    black: {
      accuracyEstimate: 82.0,
      eligibleMoves: 3,
      excludedMoves: 0,
      breakdown: {
        blunder: 0,
        mistake: 0,
        inaccuracy: 0,
        miss: 0,
        brilliant: 0,
        great: 0,
        best: 2,
        excellent: 0,
        good: 1,
        forced: 0,
      },
    },
  },
};

function makeMockServices(games: GameRecord[] = [sampleGame]): WorkspaceServices {
  return {
    ingestion: {
      start: vi.fn().mockImplementation(async (query) => {
        if (query.username === 'nonexistent_user_404') {
          throw new Error('User not found (404)');
        }
        return {
          jobId: 'test-job',
          fingerprint: 'test-fp',
          status: 'complete',
          games,
          failedMonths: [],
          diagnostics: [],
          offlineCacheOnly: false,
        };
      }),
      cancel: vi.fn(),
      dispose: vi.fn(),
    },
    graph: {
      build: vi.fn().mockResolvedValue({
        status: 'complete',
        snapshot: {
          rootKey: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
          graph: {
            rootKey: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -',
            positions: new Map(),
          },
        },
      }),
      cancel: vi.fn(),
      dispose: vi.fn(),
    },
    engine: {
      initialize: vi.fn().mockResolvedValue({
        mode: 'single-thread',
        threads: 1,
        simd: false,
        sharedArrayBuffer: false,
        crossOriginIsolated: true,
        engineInitialized: true,
        hashMb: 16,
      }),
      dispose: vi.fn(),
    },
    data: {
      deleteUsername: vi.fn().mockResolvedValue(undefined),
      clearAll: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
    },
    analysis: {
      analyze: vi.fn().mockResolvedValue(mockAnalysisResult),
    },
  };
}

describe('Bug fixes exploratory verification', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('Bug 3: retains existing active games when a re-import query fails and provides recovery', async () => {
    const user = userEvent.setup();
    const services = makeMockServices([sampleGame]);

    render(<ChessWorkspace createServices={() => services} />);

    // Initial successful load
    await user.type(screen.getByLabelText(/^username$/i), 'iamSheyBoiCarti');
    await user.click(screen.getByRole('button', { name: /load games/i }));

    // Verify game is loaded in the list
    expect(screen.getByRole('button', { name: /opponent/i })).toBeInTheDocument();

    // Now open Import games utility drawer
    const importBtn = screen.getByRole('button', { name: /import games/i });
    await user.click(importBtn);

    // Type a nonexistent user that causes 404
    const drawerUsernameInput = screen.getByLabelText(/^username$/i);
    await user.clear(drawerUsernameInput);
    await user.type(drawerUsernameInput, 'nonexistent_user_404');
    const drawerSubmit = screen.getByRole('button', { name: /load games/i });
    await user.click(drawerSubmit);

    // Close the drawer using its close button
    const closeBtn = screen.getByRole('button', { name: /close import games/i });
    fireEvent.click(closeBtn);

    // User should still see their previously loaded game in the list!
    expect(screen.getByRole('button', { name: /opponent/i })).toBeInTheDocument();

    // An alert banner informing them of the failure is shown with "Keep current games"
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/User not found \(404\)/i)).toBeInTheDocument();
    const keepGamesBtn = screen.getByRole('button', { name: /keep current games/i });
    expect(keepGamesBtn).toBeInTheDocument();

    // Clicking "Keep current games" dismisses the failure banner
    await user.click(keepGamesBtn);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /opponent/i })).toBeInTheDocument();
  });

  it('Bug 4: draws best move arrow (before.bestMove) for inaccuracies instead of opponent response', async () => {
    const user = userEvent.setup();
    const services = makeMockServices([sampleGame]);

    render(<ChessWorkspace createServices={() => services} />);

    // Load games
    await user.type(screen.getByLabelText(/^username$/i), 'iamSheyBoiCarti');
    await user.click(screen.getByRole('button', { name: /load games/i }));

    // Switch to Analysis tab directly and start review
    const reviewBtn = screen.getByRole('button', { name: /review game/i });
    await user.click(reviewBtn);

    // Start analysis
    const startAnalysisBtn = await screen.findByRole('button', { name: /run review/i });
    await user.click(startAnalysisBtn);

    // Wait for analysis to complete and navigate to ply 3 (an inaccuracy)
    const ply3Button = await screen.findByRole('button', { name: /ply 3/i });
    await user.click(ply3Button);

    // Move 3 is Nf3?! (inaccuracy). Best move was d2d4 (d4).
    // Opponent's response in after.pv[0] was b8c6.
    // The PV arrow on the board must show d2 to d4 (the best move), NOT b8 to c6!
    const arrow = screen.getByRole('img', { name: /principal variation d2 to d4/i });
    expect(arrow).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: /principal variation b8 to c6/i })
    ).not.toBeInTheDocument();
  });

  it('Bug 6: keyboard arrow navigation steps through moves when focus is outside chessboard', async () => {
    const user = userEvent.setup();
    const services = makeMockServices([sampleGame]);

    render(<ChessWorkspace createServices={() => services} />);

    // Load games
    await user.type(screen.getByLabelText(/^username$/i), 'iamSheyBoiCarti');
    await user.click(screen.getByRole('button', { name: /load games/i }));

    // Focus on an element outside the chessboard (e.g. Games nav item)
    const gamesNav = screen.getByRole('button', { name: /^games$/i });
    gamesNav.focus();
    expect(document.activeElement).toBe(gamesNav);

    // Initial ply should be 0 (Position 0 of 6)
    expect(screen.getByLabelText('Position 0 of 6')).toBeInTheDocument();

    // Press ArrowRight while focused on the nav button
    await user.keyboard('{ArrowRight}');
    expect(screen.getByLabelText('Position 1 of 6')).toBeInTheDocument();

    // Press ArrowRight again
    await user.keyboard('{ArrowRight}');
    expect(screen.getByLabelText('Position 2 of 6')).toBeInTheDocument();

    // Press ArrowLeft to step backward
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByLabelText('Position 1 of 6')).toBeInTheDocument();

    // Press Home to jump to start
    await user.keyboard('{Home}');
    expect(screen.getByLabelText('Position 0 of 6')).toBeInTheDocument();

    // Press End to jump to end
    await user.keyboard('{End}');
    expect(screen.getByLabelText('Position 6 of 6')).toBeInTheDocument();
  });
});
