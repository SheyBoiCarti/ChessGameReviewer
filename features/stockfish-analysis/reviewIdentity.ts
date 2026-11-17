import type { AnalysisStrength } from '@/features/workspace/types';

export async function computePgnDigest(pgn: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pgn));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function reviewResultKey(
  username: string,
  gameId: string,
  pgnDigest: string,
  strength: AnalysisStrength
): string {
  return JSON.stringify([username.toLowerCase(), gameId, pgnDigest, strength]);
}
