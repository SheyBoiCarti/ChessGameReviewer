const { Chess } = require('chess.js');
const base = require('../../tests/fixtures/openingScopeGames.json');

// Seeded legal move selection gives distinct full games, rather than repeated short lines.
function diverseGames(count, plies) {
  return Array.from({ length: count }, (_, index) => {
    const template = base[index % base.length];
    let board;
    for (let attempt = 0; ; attempt++) {
      board = new Chess();
      let seed = (index + 1) * 65537 + attempt;
      for (let ply = 0; ply < plies && !board.isGameOver(); ply++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const moves = board.moves();
        board.move(moves[seed % moves.length]);
      }
      if (board.history().length === plies) break;
    }
    board.header(
      'White',
      template.white.username,
      'Black',
      template.black.username,
      'Result',
      template.white.result === 'win' ? '1-0' : template.black.result === 'win' ? '0-1' : '1/2-1/2'
    );
    return {
      ...template,
      uuid: `diverse-${plies}-${index}`,
      url: `https://www.chess.com/game/live/${540000000 + index}`,
      pgn: board.pgn(),
      end_time: 1704067200 + index * 60,
    };
  });
}
const workloads = [
  ...[20, 100, 500].map((count) => ({
    name: `retained-${count}`,
    count,
    plies: 6,
    games: () =>
      Array.from({ length: count }, (_, i) => ({
        ...base[i % base.length],
        uuid: `retained-${i}`,
        url: `https://www.chess.com/game/live/${520000000 + i}`,
      })),
  })),
  ...[30, 90].map((plies) => ({
    name: `diverse-1000-${plies}`,
    count: 1000,
    plies,
    games: () => diverseGames(1000, plies),
  })),
];
module.exports = { workloads };
