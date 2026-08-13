# Stockfish.js corresponding source

This application distributes the Stockfish.js 18.0.8 lite WASM binaries in `public/stockfish/` under GPL-3.0-or-later. The exact corresponding source checkout is the Stockfish.js repository at commit [`93c994592dcf3b4b21052ab925e9b534df9c0918`](https://github.com/nmrugg/stockfish.js/tree/93c994592dcf3b4b21052ab925e9b534df9c0918).

The shipped files originate from the immutable npm package [`stockfish@18.0.8`](https://registry.npmjs.org/stockfish/-/stockfish-18.0.8.tgz), whose SHA-512 integrity value is recorded in `public/stockfish/manifest.json`. They are not downloaded by the application at build time or runtime.

To rebuild, use Node.js and Emscripten 3.1.7, clone the exact commit, and run:

```sh
git clone https://github.com/nmrugg/stockfish.js.git stockfish.js
git -C stockfish.js checkout 93c994592dcf3b4b21052ab925e9b534df9c0918
STOCKFISH_SOURCE_DIR="$PWD/stockfish.js" node scripts/stockfish/rebuild.mjs
```

The rebuild commands are `node build.js --lite --single-threaded -f` and `node build.js --lite -f`. The latter uses pthreads and requires cross-origin isolation in browsers. The build embeds NNUE network `nn-9067e33176e`; its identifier and all distributed file hashes are in the manifest.

Reproducing byte-identical WASM output can depend on the host toolchain beyond the pinned Emscripten release. The committed package files are therefore the verified trusted distribution path: obtain the immutable npm tarball, verify its recorded integrity, copy the named files, and run `npm run verify:stockfish` before release.
