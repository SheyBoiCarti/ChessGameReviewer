import type { ParsedGame } from '@/lib/chess/pgnParser';
import { Chess } from 'chess.js';
import { classifyMoveAccuracy, type MoveAccuracy } from '@/lib/engine/accuracy';
import {
  normalizeUciScoreToWhite,
  parseFenSideToMove,
  type EvaluationScore,
  type PlayerColor,
} from '@/lib/engine/evaluation';
import type { EvaluationResult } from '@/lib/engine/stockfishAdapter';

import { EvaluationCache, serializeEvaluationKey, type EvaluationKey } from './evaluationCache';

export interface AnalysisEngine {
  evaluate(
    fen: string,
    limit: EvaluationKey['limit'],
    multiPv: number,
    signal?: AbortSignal
  ): Promise<EvaluationResult>;
}

export type AnalysisSettings = Omit<EvaluationKey, 'fen'>;

export interface PositionEvaluation {
  score: EvaluationScore;
  depth: number;
  pv: readonly string[];
  bestMove: string;
}

export interface GameAnnotation {
  ply: number;
  san: string;
  uci: string;
  mover: PlayerColor;
  before: PositionEvaluation;
  after: PositionEvaluation;
  accuracy: MoveAccuracy;
  settings: AnalysisSettings;
}

export interface ColorAnalysisSummary {
  accuracyEstimate: number | null;
  eligibleMoves: number;
  excludedMoves: number;
}

export interface GameAnalysisSummary {
  white: ColorAnalysisSummary;
  black: ColorAnalysisSummary;
}

export type GameAnalysisStatus = 'complete' | 'partial' | 'cancelled' | 'failed';

export interface GameAnalysisResult {
  status: GameAnalysisStatus;
  annotations: readonly GameAnnotation[];
  analyzedPlies: number;
  totalPlies: number;
  summary: GameAnalysisSummary;
  error?: string;
}

export interface AnalyzeGameInput {
  game: ParsedGame;
  settings: AnalysisSettings;
  engine: AnalysisEngine;
  cache: EvaluationCache;
  /** A subset of one-based ply numbers; omitted means all legal plies. */
  plies?: readonly number[];
  signal?: AbortSignal;
  onProgress?: (progress: { analyzedPlies: number; totalPlies: number }) => void;
}

/**
 * Analyses selected legal plies in order. Successful exact positions are saved
 * immediately, so a later cancellation or failure can resume from the cache.
 */
export async function analyzeGame(input: AnalyzeGameInput): Promise<GameAnalysisResult> {
  const plies = selectAndValidatePlies(input.game, input.plies);
  const annotations: GameAnnotation[] = [];
  const evaluations = new Map<string, Promise<PositionEvaluation>>();
  let failure: unknown;

  for (const ply of plies) {
    if (input.signal?.aborted) return result('cancelled', annotations, plies.length);
    try {
      const mover = parseFenSideToMove(ply.fenBefore);
      const before = await getPositionEvaluation(ply.fenBefore, input, evaluations);
      if (input.signal?.aborted) return result('cancelled', annotations, plies.length);
      const after = await getPositionEvaluation(ply.fenAfter, input, evaluations);
      const accuracy = classifyMoveAccuracy({ before: before.score, after: after.score, mover });
      annotations.push({
        ply: ply.ply,
        san: ply.san,
        uci: ply.uci,
        mover,
        before,
        after,
        accuracy,
        settings: input.settings,
      });
      input.onProgress?.({ analyzedPlies: annotations.length, totalPlies: plies.length });
    } catch (error) {
      failure = error;
      break;
    }
  }

  if (!failure) return result('complete', annotations, plies.length);
  if (isAbortError(failure) || input.signal?.aborted)
    return result('cancelled', annotations, plies.length);
  return {
    ...result(annotations.length === 0 ? 'failed' : 'partial', annotations, plies.length),
    error: errorMessage(failure),
  };
}

async function getPositionEvaluation(
  fen: string,
  input: AnalyzeGameInput,
  inflight: Map<string, Promise<PositionEvaluation>>
): Promise<PositionEvaluation> {
  const key: EvaluationKey = { fen, ...input.settings };
  const serialized = serializeEvaluationKey(key);
  const existing = inflight.get(serialized);
  if (existing) return existing;

  const evaluation = (async () => {
    const terminal = terminalPositionEvaluation(fen);
    if (terminal) return terminal;
    let raw: EvaluationResult | null = null;
    try {
      raw = await input.cache.get(key);
    } catch {
      // A cache read must never prevent a selected game's live analysis.
    }
    if (!raw) {
      raw = await input.engine.evaluate(
        fen,
        input.settings.limit,
        input.settings.multiPv,
        input.signal
      );
      try {
        await input.cache.put(key, raw);
      } catch {
        // Quota/persistence errors retain the in-memory result for this session.
      }
    }
    return normalizePrimaryLine(raw, fen);
  })();
  inflight.set(serialized, evaluation);
  return evaluation;
}

function terminalPositionEvaluation(fen: string): PositionEvaluation | undefined {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) {
    return {
      score: { kind: 'mate', value: chess.turn() === 'w' ? -1 : 1 },
      depth: 0,
      pv: [],
      bestMove: '(terminal)',
    };
  }
  if (
    chess.isDraw() ||
    chess.isStalemate() ||
    chess.isInsufficientMaterial() ||
    chess.isThreefoldRepetition()
  ) {
    return { score: { kind: 'cp', value: 0 }, depth: 0, pv: [], bestMove: '(terminal)' };
  }
  return undefined;
}

function normalizePrimaryLine(raw: EvaluationResult, fen: string): PositionEvaluation {
  const primary = raw.lines.find((line) => line.multiPv === 1 && line.pv.length > 0);
  if (!primary) throw new Error('Engine evaluation did not contain a primary PV line.');
  const score = normalizeUciScoreToWhite(primary.score, fen);
  if (!score) throw new Error('Engine evaluation contained a non-finite score.');
  return { score, depth: primary.depth, pv: primary.pv, bestMove: raw.bestMove };
}

function selectAndValidatePlies(game: ParsedGame, requested: readonly number[] | undefined) {
  const all = game.plies;
  for (let index = 0; index < all.length; index += 1) {
    const ply = all[index]!;
    if (ply.ply !== index + 1 || !ply.fenBefore || !ply.fenAfter)
      throw new Error('Parsed game does not contain a complete ordered ply chain.');
    parseFenSideToMove(ply.fenBefore);
    parseFenSideToMove(ply.fenAfter);
    if (index > 0 && ply.fenBefore !== all[index - 1]!.fenAfter)
      throw new Error('Parsed game ply chain is discontinuous.');
  }
  if (!requested) return [...all];
  const selected = new Set(requested);
  if (
    selected.size !== requested.length ||
    [...selected].some((ply) => !Number.isInteger(ply) || ply < 1)
  )
    throw new Error('Requested plies must be unique positive integers.');
  const plies = all.filter((ply) => selected.has(ply.ply));
  if (plies.length !== selected.size)
    throw new Error('A requested ply is not present in the parsed game.');
  return plies;
}

function result(
  status: GameAnalysisStatus,
  annotations: readonly GameAnnotation[],
  totalPlies: number
): Omit<GameAnalysisResult, 'error'> {
  return {
    status,
    annotations,
    analyzedPlies: annotations.length,
    totalPlies,
    summary: summarize(annotations),
  };
}

function summarize(annotations: readonly GameAnnotation[]): GameAnalysisSummary {
  return {
    white: summarizeColor(annotations, 'white'),
    black: summarizeColor(annotations, 'black'),
  };
}

function summarizeColor(
  annotations: readonly GameAnnotation[],
  color: PlayerColor
): ColorAnalysisSummary {
  const moves = annotations.filter((annotation) => annotation.mover === color);
  const estimates = moves.flatMap((annotation) =>
    annotation.accuracy.status === 'classified' ? [annotation.accuracy.accuracyEstimate] : []
  );
  return {
    accuracyEstimate:
      estimates.length === 0
        ? null
        : estimates.reduce((sum, estimate) => sum + estimate, 0) / estimates.length,
    eligibleMoves: estimates.length,
    excludedMoves: moves.length - estimates.length,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Game analysis failed.';
}
