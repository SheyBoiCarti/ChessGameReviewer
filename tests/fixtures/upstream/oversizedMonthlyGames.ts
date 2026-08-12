import validMonthlyGames from './validMonthlyGames.json';

const validRawGame = validMonthlyGames.games[0];

export function makeOversizedMonthlyGamesFixture(): unknown {
  return {
    games: Array.from({ length: 20_001 }, (_, index) => ({
      ...validRawGame,
      uuid: `oversized-${index}`,
    })),
  };
}
