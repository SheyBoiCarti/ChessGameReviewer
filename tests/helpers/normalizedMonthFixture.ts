import type { NormalizedMonthRecord } from '@/lib/db/schema';
import { NORMALIZER_VERSION } from '@/lib/db/schema';
import { PGN_PARSER_VERSION, POSITION_KEY_VERSION } from '@/lib/chess/graph/types';
import { makeGameRecord, NOW } from './phase1Fixtures';
export function makeNormalizedMonth(
  overrides: Partial<NormalizedMonthRecord> = {}
): NormalizedMonthRecord {
  return {
    username: 'janedoe',
    month: '2026-08',
    fetchedAt: NOW,
    completeFetch: true,
    lastUsedAt: NOW,
    candidates: [
      {
        game: makeGameRecord(),
        validation: {
          state: 'unknown',
          pgnDigest: '0'.repeat(64),
          parserVersion: PGN_PARSER_VERSION,
          positionVersion: POSITION_KEY_VERSION,
          normalizerVersion: NORMALIZER_VERSION,
          diagnosticCodes: [],
        },
      },
    ],
    ...overrides,
  };
}
