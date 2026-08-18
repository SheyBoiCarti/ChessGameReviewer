import type { GameAnalysisResult, GameAnnotation } from '@/features/stockfish-analysis/analyzeGame';
import type { MoveQuality } from '@/lib/engine/accuracy';

const SAMPLE_MOVES = [
  'e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6',
  'Be3', 'e5', 'Nb3', 'Be6', 'f3', 'Be7', 'Qd2', 'O-O', 'O-O-O', 'Nbd7',
  'g4', 'b5', 'g5', 'b4', 'Ne2', 'Ne8', 'f4', 'a5', 'f5', 'a4',
  'Nbd4', 'exd4', 'Nxd4', 'b3', 'Kb1', 'bxc2+', 'Nxc2', 'Bb3', 'axb3', 'axb3', 'Na3',
];

export function createLongGameAnalysisResult(plyCount = 41): GameAnalysisResult {
  const annotations: GameAnnotation[] = [];
  for (let ply = 1; ply <= plyCount; ply++) {
    const san = SAMPLE_MOVES[(ply - 1) % SAMPLE_MOVES.length]!;
    const isWhite = ply % 2 === 1;
    const quality: MoveQuality =
      ply % 7 === 0 ? 'blunder' : ply % 5 === 0 ? 'mistake' : ply % 3 === 0 ? 'good' : 'excellent';
    annotations.push({
      ply,
      san,
      uci: `${san.toLowerCase().replace(/[^a-h1-8]/g, '').padEnd(4, '1')}`,
      mover: isWhite ? 'white' : 'black',
      before: {
        score: { kind: 'cp', value: 20 },
        depth: 14,
        pv: [san],
        bestMove: san,
        candidates: [],
      },
      after: {
        score: { kind: 'cp', value: isWhite ? 25 : -25 },
        depth: 14,
        pv: [san],
        bestMove: san,
        candidates: [],
      },
      accuracy: {
        status: 'classified',
        quality,
        probabilityLoss: 0.02,
        accuracyEstimate: 95,
        heuristicVersion: 'analyzer-accuracy-v2',
      },
      settings: {
        engineBuild: 'Stockfish 18',
        networkHash: '9067e33176e',
        limit: { depth: 14 },
        multiPv: 2,
        threads: 4,
        hashMb: 64,
        analysisVersion: 'analyzer-accuracy-v1',
        normalizationVersion: 'white-perspective-v1',
      },
    });
  }

  return {
    status: 'complete',
    annotations,
    analyzedPlies: plyCount,
    totalPlies: plyCount,
    summary: {
      white: {
        accuracyEstimate: 92.4,
        eligibleMoves: Math.ceil(plyCount / 2),
        excludedMoves: 0,
        breakdown: {
          brilliant: 0,
          great: 0,
          best: 0,
          excellent: Math.ceil(plyCount / 2),
          good: 0,
          book: 0,
          inaccuracy: 0,
          mistake: 0,
          blunder: 0,
          miss: 0,
          forced: 0,
        },
      },
      black: {
        accuracyEstimate: 89.1,
        eligibleMoves: Math.floor(plyCount / 2),
        excludedMoves: 0,
        breakdown: {
          brilliant: 0,
          great: 0,
          best: 0,
          excellent: Math.floor(plyCount / 2),
          good: 0,
          book: 0,
          inaccuracy: 0,
          mistake: 0,
          blunder: 0,
          miss: 0,
          forced: 0,
        },
      },
    },
  };
}
