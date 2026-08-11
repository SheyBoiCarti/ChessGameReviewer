import type { Diagnostic, GameResult, PlayerColor } from '../api/contracts';

export type OutcomeCategory = 'win' | 'loss' | 'draw';

export const CHESSCOM_RESULT_TOKENS: Readonly<Record<string, OutcomeCategory>> = {
  // Win token
  win: 'win',

  // Loss tokens
  checkmated: 'loss',
  resigned: 'loss',
  timeout: 'loss',
  lose: 'loss',
  abandoned: 'loss',
  kingofthehill: 'loss',
  threecheck: 'loss',
  timeforfeit: 'loss',
  timefortfeit: 'loss', // common typo in historical records
  bughousepartnerlose: 'loss',

  // Draw tokens
  agreed: 'draw',
  repetition: 'draw',
  stalemate: 'draw',
  insufficient: 'draw',
  '50move': 'draw',
};

export function isKnownResultToken(token: string): boolean {
  return Object.prototype.hasOwnProperty.call(CHESSCOM_RESULT_TOKENS, token);
}

export function getOutcomeCategory(token: string): OutcomeCategory | undefined {
  return CHESSCOM_RESULT_TOKENS[token];
}

export interface DetermineUserOutcomeParams {
  userColor: PlayerColor;
  whiteResult: string;
  blackResult: string;
  gameId?: string;
}

export function determineUserOutcome(
  params: DetermineUserOutcomeParams
):
  | { success: true; userResult: GameResult; userToken: string; opponentToken: string }
  | { success: false; diagnostic: Diagnostic } {
  const { userColor, whiteResult, blackResult, gameId } = params;

  const whiteCategory = getOutcomeCategory(whiteResult);
  const blackCategory = getOutcomeCategory(blackResult);

  if (whiteCategory === undefined) {
    return {
      success: false,
      diagnostic: {
        code: 'UNKNOWN_RESULT_TOKEN',
        message: `Unknown White player result token: '${whiteResult}'`,
        severity: 'warning',
        gameId,
        details: { player: 'white', token: whiteResult },
      },
    };
  }

  if (blackCategory === undefined) {
    return {
      success: false,
      diagnostic: {
        code: 'UNKNOWN_RESULT_TOKEN',
        message: `Unknown Black player result token: '${blackResult}'`,
        severity: 'warning',
        gameId,
        details: { player: 'black', token: blackResult },
      },
    };
  }

  // Check consistency between player result categories
  let whiteGameResult: GameResult;
  let blackGameResult: GameResult;

  if (whiteCategory === 'win' && blackCategory === 'loss') {
    whiteGameResult = 'win';
    blackGameResult = 'loss';
  } else if (whiteCategory === 'loss' && blackCategory === 'win') {
    whiteGameResult = 'loss';
    blackGameResult = 'win';
  } else if (whiteCategory === 'draw' && blackCategory === 'draw') {
    whiteGameResult = 'draw';
    blackGameResult = 'draw';
  } else if (whiteCategory === 'loss' && blackCategory === 'loss') {
    // Double forfeit / both players lose
    whiteGameResult = 'loss';
    blackGameResult = 'loss';
  } else {
    return {
      success: false,
      diagnostic: {
        code: 'INCONSISTENT_PLAYER_RESULTS',
        message: `Inconsistent player result tokens: White '${whiteResult}' (${whiteCategory}) vs Black '${blackResult}' (${blackCategory})`,
        severity: 'warning',
        gameId,
        details: {
          whiteResult,
          blackResult,
          whiteCategory,
          blackCategory,
        },
      },
    };
  }

  const userResult = userColor === 'white' ? whiteGameResult : blackGameResult;
  const userToken = userColor === 'white' ? whiteResult : blackResult;
  const opponentToken = userColor === 'white' ? blackResult : whiteResult;

  return {
    success: true,
    userResult,
    userToken,
    opponentToken,
  };
}
