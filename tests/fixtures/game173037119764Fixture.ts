import type { EvaluationResult } from '@/lib/engine/stockfishAdapter';
import type { GameRecord } from '@/lib/db/schema';
import type { NormalizedGameSummary, SideAccuracy } from '@/lib/api/contracts';

/**
 * Deterministic fixture for Chess.com game 173037119764 (cmzulu vs iamSheyBoiCarti).
 * Upstream accuracies reported by Chess.com: White 93.11, Black 72.15.
 * In this game, 8.Nc3 was falsely classified as Brilliant under shallow sacrifice heuristics.
 */
export const GAME_173037119764_ID = '173037119764';
export const GAME_173037119764_URL = 'https://www.chess.com/game/live/173037119764';
export const GAME_173037119764_UPSTREAM_ACCURACIES: SideAccuracy = {
  white: 93.11,
  black: 72.15,
};

export const GAME_173037119764_PGN = `[Event "Live Chess"]
[Site "Chess.com"]
[Date "2024.01.01"]
[Round "-"]
[White "cmzulu"]
[Black "iamSheyBoiCarti"]
[Result "1-0"]
[WhiteElo "1200"]
[BlackElo "1150"]
[TimeControl "600"]
[Termination "cmzulu won by resignation"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Bd2 Bxd2+ 8. Nbxd2 d5 9. exd5 Nxd5 10. Qb3 Nce7 11. O-O O-O 12. Rfe1 c6 13. Re5 Nb6 14. Bd3 Ng6 15. Bxg6 hxg6 16. Rae1 Nd5 17. h4 b6 18. h5 gxh5 19. Rxh5 Bg4 20. Rh4 Bxf3 21. Nxf3 Re8 22. Qd3 Rxe1+ 23. Nxe1 Qxh4 1-0`;

export const GAME_173037119764_RECORD: GameRecord = {
  id: GAME_173037119764_ID,
  username: 'iamsheyboicarti',
  url: GAME_173037119764_URL,
  userColor: 'black',
  result: 'loss',
  endedAt: 1704067200,
  timeClass: 'rapid',
  timeControl: '600',
  rated: true,
  userRating: 1150,
  opponentRating: 1200,
  pgn: GAME_173037119764_PGN,
  rules: 'chess',
  accuracies: GAME_173037119764_UPSTREAM_ACCURACIES,
};

export const GAME_173037119764_SUMMARY: NormalizedGameSummary = {
  ...GAME_173037119764_RECORD,
  usernameKey: 'iamsheyboicarti',
};

/**
 * Deterministic fake UCI evaluations for the plies in game 173037119764.
 * UCI evaluations are emitted relative to the side to move (FEN turn).
 * White played accurately (few small inaccuracies, e.g. 20.Rh4 losing a rook after blunder 22...Rxe1+ 23...Qxh4 is Black's only win ply, but prior Black blunders 13...Nb6, 17...b6, etc. caused large win probability loss).
 */
export const GAME_173037119764_EVALUATIONS: Record<string, EvaluationResult> = {
  // Start position (White to move)
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1': {
    bestMove: 'e2e4',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 20 }, pv: ['e2e4', 'e7e5', 'g1f3'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 18 }, pv: ['d2d4', 'd7d5', 'c2c4'] },
    ],
  },
  // 1. e4 (Black to move, White is +20 => UCI score is -20)
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1': {
    bestMove: 'e7e5',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -20 }, pv: ['e7e5', 'g1f3', 'b8c6'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -25 }, pv: ['c7c5', 'g1f3', 'd7d6'] },
    ],
  },
  // 1... e5 (White to move)
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2': {
    bestMove: 'g1f3',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 22 }, pv: ['g1f3', 'b8c6', 'f1c4'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 15 }, pv: ['f1c4', 'g8f6', 'd2d3'] },
    ],
  },
  // 2. Nf3 (Black to move, White is +20 => UCI score is -20)
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2': {
    bestMove: 'b8c6',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -20 }, pv: ['b8c6', 'f1c4', 'f8c5'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -30 }, pv: ['g8f6', 'f3e5', 'd7d6'] },
    ],
  },
  // 2... Nc6 (White to move)
  'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3': {
    bestMove: 'f1c4',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 25 }, pv: ['f1c4', 'f8c5', 'c2c3'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 20 }, pv: ['f1b5', 'a7a6', 'b5a4'] },
    ],
  },
  // 3. Bc4 (Black to move, White is +25 => UCI score is -25)
  'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3': {
    bestMove: 'f8c5',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -25 }, pv: ['f8c5', 'c2c3', 'g8f6'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -28 }, pv: ['g8f6', 'd2d3', 'f8c5'] },
    ],
  },
  // 3... Bc5 (White to move)
  'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4': {
    bestMove: 'c2c3',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 30 }, pv: ['c2c3', 'g8f6', 'd2d4'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 20 }, pv: ['d2d3', 'g8f6', 'e1g1'] },
    ],
  },
  // 4. c3 (Black to move, White is +28 => UCI score is -28)
  'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R b KQkq - 0 4': {
    bestMove: 'g8f6',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -28 }, pv: ['g8f6', 'd2d4', 'e5d4'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -35 }, pv: ['d7d6', 'd2d4', 'e5d4'] },
    ],
  },
  // 4... Nf6 (White to move)
  'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R w KQkq - 1 5': {
    bestMove: 'd2d4',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 35 }, pv: ['d2d4', 'e5d4', 'c3d4'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 20 }, pv: ['d2d3', 'd7d6', 'e1g1'] },
    ],
  },
  // 5. d4 (Black to move, White is +35 => UCI score is -35)
  'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2BPP3/2P2N2/PP3PPP/RNBQK2R b KQkq - 0 5': {
    bestMove: 'e5d4',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -35 }, pv: ['e5d4', 'c3d4', 'c5b4'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -80 }, pv: ['c5b6', 'd4e5', 'f6g4'] },
    ],
  },
  // 5... exd4 (White to move)
  'r1bqk2r/pppp1ppp/2n2n2/2b5/2BpP3/2P2N2/PP3PPP/RNBQK2R w KQkq - 0 6': {
    bestMove: 'c3d4',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 40 }, pv: ['c3d4', 'c5b4', 'c1d2'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 30 }, pv: ['e4e5', 'd7d5', 'e5f6'] },
    ],
  },
  // 6. cxd4 (Black to move, White is +40 => UCI score is -40)
  'r1bqk2r/pppp1ppp/2n2n2/2b5/2BPP3/5N2/PP3PPP/RNBQK2R b KQkq - 0 6': {
    bestMove: 'c5b4',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -40 }, pv: ['c5b4', 'c1d2', 'b4d2'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -120 }, pv: ['c5b6', 'd4d5', 'c6e7'] },
    ],
  },
  // 6... Bb4+ (White to move)
  'r1bqk2r/pppp1ppp/2n2n2/8/1bBPP3/5N2/PP3PPP/RNBQK2R w KQkq - 1 7': {
    bestMove: 'c1d2',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 45 }, pv: ['c1d2', 'b4d2', 'b1d2'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 40 }, pv: ['b1c3', 'f6e4', 'e1g1'] },
    ],
  },
  // 7. Bd2 (Black to move, White is +45 => UCI score is -45)
  'r1bqk2r/pppp1ppp/2n2n2/8/1bBPP3/5N2/PP1B1PPP/RN1QK2R b KQkq - 2 7': {
    bestMove: 'b4d2',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -45 }, pv: ['b4d2', 'b1d2', 'd7d5'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -60 }, pv: ['f6e4', 'd2b4', 'c6b4'] },
    ],
  },
  // 7... Bxd2+ (White to move)
  'r1bqk2r/pppp1ppp/2n2n2/8/2BPP3/5N2/PP1b1PPP/RN1QK2R w KQkq - 0 8': {
    bestMove: 'b1d2',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 45 }, pv: ['b1d2', 'd7d5', 'e4d5'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 40 }, pv: ['d1d2', 'd7d5', 'e4d5'] },
    ],
  },
  // 8. Nbxd2 (Black to move, White is +45 => UCI score is -45)
  'r1bqk2r/pppp1ppp/2n2n2/8/2BPP3/5N2/PP1N1PPP/R2QK2R b KQkq - 0 8': {
    bestMove: 'd7d5',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -45 }, pv: ['d7d5', 'e4d5', 'f6d5'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -65 }, pv: ['e8g8', 'e4e5', 'f6e8'] },
    ],
  },
  // 8... d5 (White to move)
  'r1bqk2r/ppp2ppp/2n2n2/3p4/2BPP3/5N2/PP1N1PPP/R2QK2R w KQkq - 0 9': {
    bestMove: 'e4d5',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 50 }, pv: ['e4d5', 'f6d5', 'd1b3'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 30 }, pv: ['c4b5', 'd5e4', 'd2e4'] },
    ],
  },
  // 9. exd5 (Black to move, White is +50 => UCI score is -50)
  'r1bqk2r/ppp2ppp/2n2n2/3P4/2BP4/5N2/PP1N1PPP/R2QK2R b KQkq - 0 9': {
    bestMove: 'f6d5',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -50 }, pv: ['f6d5', 'd1b3', 'c6e7'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -150 }, pv: ['c6e7', 'e1g1', 'e8g8'] },
    ],
  },
  // 9... Nxd5 (White to move)
  'r1bqk2r/ppp2ppp/2n5/3n4/2BP4/5N2/PP1N1PPP/R2QK2R w KQkq - 0 10': {
    bestMove: 'd1b3',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 70 }, pv: ['d1b3', 'c6e7', 'e1g1'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 40 }, pv: ['e1g1', 'e8g8', 'f1e1'] },
    ],
  },
  // 10. Qb3 (Black to move, White is +70 => UCI score is -70)
  'r1bqk2r/ppp2ppp/2n5/3n4/2BP4/1Q3N2/PP1N1PPP/R3K2R b KQkq - 1 10': {
    bestMove: 'c6e7',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -70 }, pv: ['c6e7', 'e1g1', 'e8g8'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -220 }, pv: ['c8e6', 'b3b7', 'a8b8'] },
    ],
  },
  // 10... Nce7 (White to move)
  'r1bqk2r/ppp1nppp/8/3n4/2BP4/1Q3N2/PP1N1PPP/R3K2R w KQkq - 2 11': {
    bestMove: 'e1g1',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 75 }, pv: ['e1g1', 'e8g8', 'f1e1'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 60 }, pv: ['f1e1', 'e8g8', 'e1e5'] },
    ],
  },
  // 11. O-O (Black to move, White is +75 => UCI score is -75)
  'r1bqk2r/ppp1nppp/8/3n4/2BP4/1Q3N2/PP1N1PPP/R4RK1 b kq - 3 11': {
    bestMove: 'e8g8',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -75 }, pv: ['e8g8', 'f1e1', 'c7c6'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -120 }, pv: ['c7c6', 'f1e1', 'e8g8'] },
    ],
  },
  // 11... O-O (White to move)
  'r1bq1rk1/ppp1nppp/8/3n4/2BP4/1Q3N2/PP1N1PPP/R4RK1 w - - 4 12': {
    bestMove: 'f1e1',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 80 }, pv: ['f1e1', 'c7c6', 'a2a4'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 65 }, pv: ['a1e1', 'c7c6', 'd2e4'] },
    ],
  },
  // 12. Rfe1 (Black to move, White is +80 => UCI score is -80)
  'r1bq1rk1/ppp1nppp/8/3n4/2BP4/1Q3N2/PP1N1PPP/R3R1K1 b - - 5 12': {
    bestMove: 'c7c6',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -80 }, pv: ['c7c6', 'a2a4', 'a7a5'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -130 }, pv: ['b7b6', 'a2a4', 'c8b7'] },
    ],
  },
  // 12... c6 (White to move)
  'r1bq1rk1/pp2nppp/2p5/3n4/2BP4/1Q3N2/PP1N1PPP/R3R1K1 w - - 0 13': {
    bestMove: 'e1e5',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 85 }, pv: ['e1e5', 'b7b5', 'c4d5'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 75 }, pv: ['a2a4', 'd8c7', 'a4a5'] },
    ],
  },
  // 13. Re5 (Black to move, White is +85 => UCI score is -85)
  'r1bq1rk1/pp2nppp/2p5/3nR3/2BP4/1Q3N2/PP1N1PPP/R5K1 b - - 1 13': {
    bestMove: 'f7f6',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -85 }, pv: ['f7f6', 'e5e1', 'g8h8'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -250 }, pv: ['d5b6', 'c4d3', 'e7d5'] },
    ],
  },
  // 13... Nb6 (White to move, Black blunder: White is +250)
  'r1bq1rk1/pp2nppp/1np5/4R3/2BP4/1Q3N2/PP1N1PPP/R5K1 w - - 2 14': {
    bestMove: 'c4d3',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 250 }, pv: ['c4d3', 'e7d5', 'a1e1'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 220 }, pv: ['a1e1', 'e7g6', 'e5e3'] },
    ],
  },
  // 14. Bd3 (Black to move, White is +250 => UCI score is -250)
  'r1bq1rk1/pp2nppp/1np5/4R3/3P4/1Q1B1N2/PP1N1PPP/R5K1 b - - 3 14': {
    bestMove: 'e7d5',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -250 }, pv: ['e7d5', 'a1e1', 'c8g4'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -360 }, pv: ['e7g6', 'e5e1', 'c8e6'] },
    ],
  },
  // 14... Ng6 (White to move, Black inaccuracy: White is +360)
  'r1bq1rk1/pp3ppp/1np3n1/4R3/3P4/1Q1B1N2/PP1N1PPP/R5K1 w - - 4 15': {
    bestMove: 'd3g6',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 360 }, pv: ['d3g6', 'h7g6', 'a1e1'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 260 }, pv: ['e5e1', 'c8e6', 'b3c2'] },
    ],
  },
  // 15. Bxg6 (Black to move, White is +360 => UCI score is -360)
  'r1bq1rk1/pp3ppp/1np3B1/4R3/3P4/1Q3N2/PP1N1PPP/R5K1 b - - 0 15': {
    bestMove: 'h7g6',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -360 }, pv: ['h7g6', 'a1e1', 'c8e6'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -650 }, pv: ['b6d5', 'g6h7', 'g8h7'] },
    ],
  },
  // 15... hxg6 (White to move)
  'r1bq1rk1/pp3pp1/1np3p1/4R3/3P4/1Q3N2/PP1N1PPP/R5K1 w - - 0 16': {
    bestMove: 'a1e1',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 360 }, pv: ['a1e1', 'c8e6', 'b3c2'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 280 }, pv: ['h2h4', 'c8e6', 'b3c2'] },
    ],
  },
  // 16. Rae1 (Black to move, White is +360 => UCI score is -360)
  'r1bq1rk1/pp3pp1/1np3p1/4R3/3P4/1Q3N2/PP1N1PPP/4R1K1 b - - 1 16': {
    bestMove: 'c8e6',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -360 }, pv: ['c8e6', 'e5e6', 'f7e6'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -450 }, pv: ['b6d5', 'd2e4', 'd8c7'] },
    ],
  },
  // 16... Nd5 (White to move, Black inaccuracy: White is +450)
  'r1bq1rk1/pp3pp1/2p3p1/3nR3/3P4/1Q3N2/PP1N1PPP/4R1K1 w - - 2 17': {
    bestMove: 'h2h4',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 450 }, pv: ['h2h4', 'b7b6', 'h4h5'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 330 }, pv: ['d2e4', 'b7b6', 'h2h4'] },
    ],
  },
  // 17. h4 (Black to move, White is +450 => UCI score is -450)
  'r1bq1rk1/pp3pp1/2p3p1/3nR3/3P3P/1Q3N2/PP1N1PP1/4R1K1 b - - 0 17': {
    bestMove: 'a7a5',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -450 }, pv: ['a7a5', 'h4h5', 'g6h5'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -550 }, pv: ['b7b6', 'h4h5', 'g6h5'] },
    ],
  },
  // 17... b6 (White to move, Black mistake: White is +550)
  'r1bq1rk1/p4pp1/1pp3p1/3nR3/3P3P/1Q3N2/PP1N1PP1/4R1K1 w - - 0 18': {
    bestMove: 'h4h5',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 550 }, pv: ['h4h5', 'g6h5', 'e5h5'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 320 }, pv: ['d2e4', 'c8g4', 'f3g5'] },
    ],
  },
  // 18. h5 (Black to move, White is +550 => UCI score is -550)
  'r1bq1rk1/p4pp1/1pp3p1/3nR2P/3P4/1Q3N2/PP1N1PP1/4R1K1 b - - 0 18': {
    bestMove: 'g6h5',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -550 }, pv: ['g6h5', 'e5h5', 'c8g4'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -600 }, pv: ['c8e6', 'h5g6', 'd8f6'] },
    ],
  },
  // 18... gxh5 (White to move)
  'r1bq1rk1/p4pp1/1pp5/3nR2p/3P4/1Q3N2/PP1N1PP1/4R1K1 w - - 0 19': {
    bestMove: 'e5h5',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 550 }, pv: ['e5h5', 'c8g4', 'h5g5'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 300 }, pv: ['d2e4', 'c8g4', 'b3c2'] },
    ],
  },
  // 19. Rxh5 (Black to move, White is +550 => UCI score is -550)
  'r1bq1rk1/p4pp1/1pp5/3n3R/3P4/1Q3N2/PP1N1PP1/4R1K1 b - - 0 19': {
    bestMove: 'f7f6',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -550 }, pv: ['f7f6', 'b3d3', 'f8e8'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -650 }, pv: ['c8g4', 'h5g5', 'd8d7'] },
    ],
  },
  // 19... Bg4 (White to move, Black inaccuracy: White is +650)
  'r2q1rk1/p4pp1/1pp5/3n3R/3P2b1/1Q3N2/PP1N1PP1/4R1K1 w - - 1 20': {
    bestMove: 'h5g5',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 650 }, pv: ['h5g5', 'd8g5', 'f3g5'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 120 }, pv: ['h5h4', 'g4f3', 'd2f3'] },
    ],
  },
  // 20. Rh4 (Black to move, White inaccuracy Rh4 instead of Rg5: White is +120 => UCI score is -120)
  'r2q1rk1/p4pp1/1pp5/3n4/3P2bR/1Q3N2/PP1N1PP1/4R1K1 b - - 2 20': {
    bestMove: 'g4f3',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -120 }, pv: ['g4f3', 'd2f3', 'f8e8'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -380 }, pv: ['g4e6', 'b3c2', 'f8e8'] },
    ],
  },
  // 20... Bxf3 (White to move)
  'r2q1rk1/p4pp1/1pp5/3n4/3P3R/1Q3b2/PP1N1PP1/4R1K1 w - - 0 21': {
    bestMove: 'd2f3',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 120 }, pv: ['d2f3', 'f8e8', 'e1e8'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 80 }, pv: ['b3f3', 'd8h4', 'f3f5'] },
    ],
  },
  // 21. Nxf3 (Black to move, White is +120 => UCI score is -120)
  'r2q1rk1/p4pp1/1pp5/3n4/3P3R/1Q3N2/PP3PP1/4R1K1 b - - 0 21': {
    bestMove: 'f8e8',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -120 }, pv: ['f8e8', 'e1e8', 'd8e8'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -250 }, pv: ['d8f6', 'h4g4', 'g8f8'] },
    ],
  },
  // 21... Re8 (White to move)
  'r2qr1k1/p4pp1/1pp5/3n4/3P3R/1Q3N2/PP3PP1/4R1K1 w - - 1 22': {
    bestMove: 'e1e8',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 120 }, pv: ['e1e8', 'd8e8', 'b3d3'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: 60 }, pv: ['b3d3', 'e8e1', 'f3e1'] },
    ],
  },
  // 22. Qd3 (Black to move, White is +60 => UCI score is -60)
  'r2qr1k1/p4pp1/1pp5/3n4/3P3R/3Q1N2/PP3PP1/4R1K1 b - - 2 22': {
    bestMove: 'e8e1',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -60 }, pv: ['e8e1', 'f3e1', 'd8h4'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -500 }, pv: ['d8f6', 'd3h7', 'g8f8'] },
    ],
  },
  // 22... Rxe1+ (White to move)
  'r2q2k1/p4pp1/1pp5/3n4/3P3R/3Q1N2/PP3PP1/4r1K1 w - - 0 23': {
    bestMove: 'f3e1',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 60 }, pv: ['f3e1', 'd8h4', 'd3g3'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -400 }, pv: ['g1h2', 'd8h4', 'h2g1'] },
    ],
  },
  // 23. Nxe1 (Black to move, Black wins rook: Black is +400 => UCI score is 400)
  'r2q2k1/p4pp1/1pp5/3n4/3P3R/3Q4/PP3PP1/4N1K1 b - - 0 23': {
    bestMove: 'd8h4',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: 400 }, pv: ['d8h4', 'e1f3', 'h4f6'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -300 }, pv: ['d5f6', 'd3h7', 'g8f8'] },
    ],
  },
  // 23... Qxh4 (White to move, White is -400)
  'r5k1/p4pp1/1pp5/3n4/3P3q/3Q4/PP3PP1/4N1K1 w - - 0 24': {
    bestMove: 'e1f3',
    lines: [
      { multiPv: 1, depth: 14, score: { kind: 'cp', value: -400 }, pv: ['e1f3', 'h4f6', 'f3e5'] },
      { multiPv: 2, depth: 14, score: { kind: 'cp', value: -450 }, pv: ['d3c2', 'a8c8', 'e1f3'] },
    ],
  },
};
