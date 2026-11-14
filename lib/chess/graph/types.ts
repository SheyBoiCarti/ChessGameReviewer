import type { GameResult, PlayerColor } from '../../api/contracts';

export interface OutcomeAggregate {
  games: number;
  userWins: number;
  draws: number;
  userLosses: number;
  whiteWins: number;
  blackWins: number;
  opponentRatingSum: number;
  opponentRatingCount: number;
}

export interface MoveEdge {
  uci: string;
  san: string;
  targetKey: string;
  aggregate: OutcomeAggregate;
}

export interface PositionNode {
  key: string;
  aggregate: OutcomeAggregate;
  outgoing: Map<string, MoveEdge>;
  arrivalsByPath: Map<number, OutcomeAggregate>;
}

export interface PathNode {
  id: number;
  parentId: number | null;
  uci: string | null;
  san: string | null;
  ply: number;
}

export interface GameVisit {
  result: GameResult;
  userColor: PlayerColor;
  opponentRating: number | null;
}

export interface GraphBuildOptions {
  maxOpeningPlies: number;
  includeRepeatedPositions: boolean;
}

export interface GraphStructuralLimits {
  maxPositions: number;
  maxEdges: number;
  maxPathNodes: number;
}

export const PGN_PARSER_VERSION = 'chessjs-1.4.0-strict-v1';
export const POSITION_KEY_VERSION = 'legal-ep-four-field-v1';
export const OPENING_PROJECTION_VERSION = 1;
