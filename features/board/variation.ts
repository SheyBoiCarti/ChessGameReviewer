import type { AppliedBoardMove } from './moves';

export interface AnalysisVariationState {
  basePly: number;
  baseFen: string;
  moves: readonly AppliedBoardMove[];
  cursor: number;
}

export function startVariation(
  basePly: number,
  baseFen: string,
  firstMove: AppliedBoardMove
): AnalysisVariationState {
  if (firstMove.fenBefore !== baseFen) {
    throw new Error(
      `DISCONTINUOUS_VARIATION_MOVE: move fenBefore ${firstMove.fenBefore} does not match base FEN ${baseFen}`
    );
  }
  return {
    basePly,
    baseFen,
    moves: [firstMove],
    cursor: 1,
  };
}

export function appendVariationMove(
  state: AnalysisVariationState,
  move: AppliedBoardMove
): AnalysisVariationState {
  const currentFen = variationFen(state);
  if (move.fenBefore !== currentFen) {
    throw new Error(
      `DISCONTINUOUS_VARIATION_MOVE: move fenBefore ${move.fenBefore} does not match current variation FEN ${currentFen}`
    );
  }
  const keptMoves = state.moves.slice(0, state.cursor);
  return {
    ...state,
    moves: [...keptMoves, move],
    cursor: state.cursor + 1,
  };
}

export function moveVariationCursor(
  state: AnalysisVariationState,
  cursor: number
): AnalysisVariationState {
  const clamped = Math.min(Math.max(cursor, 0), state.moves.length);
  return {
    ...state,
    cursor: clamped,
  };
}

export function variationFen(state: AnalysisVariationState): string {
  if (state.cursor === 0 || state.moves.length === 0) {
    return state.baseFen;
  }
  const lastMove = state.moves[state.cursor - 1];
  return lastMove ? lastMove.fenAfter : state.baseFen;
}
