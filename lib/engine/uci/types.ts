export type ScoreBound = 'lower' | 'upper';

export interface UciScore {
  kind: 'cp' | 'mate';
  value: number;
  bound?: ScoreBound;
}

export interface UciInfo {
  type: 'info';
  depth?: number;
  selDepth?: number;
  multiPv?: number;
  score?: UciScore;
  nodes?: number;
  nps?: number;
  time?: number;
  hashFull?: number;
  pv?: readonly string[];
}

export type UciLine =
  | { type: 'uciok' }
  | { type: 'readyok' }
  | { type: 'id'; field: 'name' | 'author'; value: string }
  | { type: 'option'; name: string; value: string }
  | UciInfo
  | { type: 'bestmove'; move: string; ponder?: string }
  | { type: 'error'; message: string }
  | { type: 'unknown'; raw: string };
