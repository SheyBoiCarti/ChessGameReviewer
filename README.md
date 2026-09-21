# Chess Game Reviewer

Chess Game Reviewer is an unaffiliated, browser-based tool for reviewing public Chess.com games, exploring opening trees, and running local Stockfish analysis.

It works without an account or application backend:

- Public game archives are requested directly from the Chess.com Published Data API.
- Normalized games, opening data, and evaluations are stored in the browser's IndexedDB.
- PGNs and engine evaluations are not uploaded to an application server.
- Stockfish runs locally in Web Workers with a single-thread fallback when browser isolation is unavailable.

This project is not affiliated with, endorsed by, or sponsored by Chess.com.

## Features

- Import standard games by Chess.com username and UTC date range.
- Filter by time class, colour, rated status, and game count.
- Browse a transposition-aware opening tree with outcome and sample-size context.
- Review a selected game with local Stockfish evaluations, move classifications, and variations.
- Keep data offline in versioned IndexedDB stores, with controls to delete local data.
- Continue using import and opening features when the analysis engine is unavailable.

Advanced repertoire and statistical comparison features described in the technical specification are planned and are not part of the current release.

## Requirements

- Node.js 20.11 or newer (Node.js 22 is used in CI)
- npm 11
- A modern browser with Web Workers, IndexedDB, and WebAssembly support

## Development

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful checks:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run verify:stockfish
npm run build
```

The complete CI-equivalent verification command is `npm run verify`. Playwright browsers must be installed before running the end-to-end suite:

```bash
npx playwright install --with-deps
npm run verify
```

## Deployment

The app can be deployed as a standard Next.js application:

```bash
npm ci
npm run build
npm start
```

The deployed origin must preserve the response headers configured in `next.config.ts`, especially cross-origin isolation for the threaded Stockfish build. The app has no required environment variables and does not use a server-side Chess.com proxy.

## Privacy and data

The application uses the browser to call approved public Chess.com API endpoints. Imported games, opening data, and engine evaluations remain in local browser storage. Clearing application data from the Settings view removes the stored data for this app.

Chess.com usernames and public game records are sent to Chess.com's API when the user requests an import. No analytics or telemetry service is included by default.

## Licensing

The application source code is licensed under the [MIT License](LICENSE).

The repository also distributes Stockfish.js WebAssembly artifacts under GPL-3.0-or-later. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [public/stockfish/COPYING.txt](public/stockfish/COPYING.txt), and [docs/stockfish-source-offer.md](docs/stockfish-source-offer.md) for attribution, source correspondence, and rebuild instructions. The chess-piece SVG assets are dedicated to the public domain under CC0; see [public/chess-pieces/LICENSE.md](public/chess-pieces/LICENSE.md).

## Security

Please report security issues privately according to [SECURITY.md](SECURITY.md), rather than opening a public issue with sensitive details.
