import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ChessWorkspace } from '@/components/workspace/ChessWorkspace';
import type { WorkspaceServices } from '@/features/workspace/createWorkspaceController';
import type { GameRecord } from '@/lib/db/schema';

const sampleGame: GameRecord = {
  id: 'game-173037119764',
  username: 'iamsheyboicarti',
  url: 'https://www.chess.com/game/live/173037119764',
  userColor: 'black',
  result: 'loss',
  endedAt: 1704067200,
  timeClass: 'rapid',
  rated: true,
  userRating: 1150,
  opponentRating: 1200,
  whitePlayer: { username: 'cmzulu', rating: 1200 },
  blackPlayer: { username: 'iamSheyBoiCarti', rating: 1150 },
  pgn: `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2024.01.01"]
[Round "-"]
[White "cmzulu"]
[Black "iamSheyBoiCarti"]
[Result "1-0"]
[WhiteElo "1200"]
[BlackElo "1150"]

1. e4 e5 2. Nf3 Nc6 1-0`,
  rules: 'chess',
};

function makeMockServices(games: GameRecord[] = [sampleGame]): WorkspaceServices {
  return {
    ingestion: {
      start: vi.fn().mockResolvedValue({
        jobId: 'test-job',
        fingerprint: 'test-fp',
        status: 'complete',
        games,
        failedMonths: [],
        diagnostics: [],
        offlineCacheOnly: false,
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
        profile: 'single-thread',
        threads: 1,
        simd: false,
        sharedArrayBuffer: false,
      }),
      dispose: vi.fn(),
    },
    data: {
      deleteUsername: vi.fn().mockResolvedValue(undefined),
      clearAll: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
    },
    analysis: {
      analyze: vi.fn(),
    },
  };
}

describe('Board orientation and player metadata invariants', () => {
  it('toggles board orientation via Flip board button and synchronizes with Settings', async () => {
    const user = userEvent.setup();
    const services = makeMockServices([sampleGame]);

    render(<ChessWorkspace createServices={() => services} />);

    // Load games via query
    const usernameInput = screen.getByLabelText(/^username$/i);
    await user.type(usernameInput, 'iamSheyBoiCarti');
    await user.click(screen.getByRole('button', { name: /load games/i }));

    // Select the game
    await user.click(screen.getByRole('button', { name: /select game versus cmzulu/i }));

    // Verify initial White orientation: Black on top, White on bottom
    const topRowInitial = screen.getByLabelText(/black: iamsheyboicarti \(1150\)/i);
    const bottomRowInitial = screen.getByLabelText(/white: cmzulu \(1200\)/i);
    expect(topRowInitial).toHaveClass('player-row--top');
    expect(bottomRowInitial).toHaveClass('player-row--bottom');

    // Click Flip board button
    const flipButton = screen.getByRole('button', { name: /flip board/i });
    await user.click(flipButton);

    // Verify flipped Black orientation: White on top, Black on bottom
    const topRowFlipped = screen.getByLabelText(/white: cmzulu \(1200\)/i);
    const bottomRowFlipped = screen.getByLabelText(/black: iamsheyboicarti \(1150\)/i);
    expect(topRowFlipped).toHaveClass('player-row--top');
    expect(bottomRowFlipped).toHaveClass('player-row--bottom');

    // Switch to Settings tab and verify Settings board orientation selector reflects 'black'
    const settingsTab = screen.getByRole('tab', { name: /settings/i });
    await user.click(settingsTab);

    const orientationSelect = screen.getByRole('combobox', { name: /^board orientation$/i });
    expect(orientationSelect).toHaveValue('black');

    // Change Settings selector back to 'white' and switch to Games tab
    await user.selectOptions(orientationSelect, 'white');
    const gamesTab = screen.getByRole('tab', { name: /games and board/i });
    await user.click(gamesTab);

    // Verify board orientation updated back to White
    const topRowRestored = screen.getByLabelText(/black: iamsheyboicarti \(1150\)/i);
    const bottomRowRestored = screen.getByLabelText(/white: cmzulu \(1200\)/i);
    expect(topRowRestored).toHaveClass('player-row--top');
    expect(bottomRowRestored).toHaveClass('player-row--bottom');
  });

  it('preserves all chess navigation and position invariants across flip', async () => {
    const user = userEvent.setup();
    const services = makeMockServices([sampleGame]);

    render(<ChessWorkspace createServices={() => services} />);

    // Load and select game
    const usernameInput = screen.getByLabelText(/^username$/i);
    await user.type(usernameInput, 'iamSheyBoiCarti');
    await user.click(screen.getByRole('button', { name: /load games/i }));
    await user.click(screen.getByRole('button', { name: /select game versus cmzulu/i }));

    // Navigate history to ply 2 (1...e5)
    const board = screen.getByRole('grid', { name: /chess board/i });
    board.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');

    // Record position attributes before flip
    const squaresBefore = screen
      .getAllByRole('gridcell')
      .map((cell) => cell.getAttribute('data-square'));
    const pawnE5Before = screen.getByLabelText(/black pawn on e5/i);
    expect(pawnE5Before).toBeInTheDocument();

    // Flip board
    const flipButton = screen.getByRole('button', { name: /flip board/i });
    await user.click(flipButton);

    // After flip: square order inverted for Black perspective
    const squaresAfter = screen
      .getAllByRole('gridcell')
      .map((cell) => cell.getAttribute('data-square'));
    expect(squaresAfter[0]).toBe('h1');
    expect(squaresBefore[0]).toBe('a8');

    // But chess position (e5 pawn) remains at e5
    const pawnE5After = screen.getByLabelText(/black pawn on e5/i);
    expect(pawnE5After).toBeInTheDocument();
  });
});
