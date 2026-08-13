import type { ScoreBound, UciInfo, UciLine, UciScore } from './types';

const numericFields = new Map<string, keyof Pick<UciInfo, 'depth' | 'selDepth' | 'multiPv' | 'nodes' | 'nps' | 'time' | 'hashFull'>>([
  ['depth', 'depth'],
  ['seldepth', 'selDepth'],
  ['multipv', 'multiPv'],
  ['nodes', 'nodes'],
  ['nps', 'nps'],
  ['time', 'time'],
  ['hashfull', 'hashFull'],
]);

export function parseUciLine(raw: string): UciLine {
  const line = raw.trim();
  if (line === 'uciok') return { type: 'uciok' };
  if (line === 'readyok') return { type: 'readyok' };
  if (/^Unknown command\b/i.test(line)) return { type: 'error', message: line };

  const id = /^(name|author)\s+(.+)$/i.exec(line.startsWith('id ') ? line.slice(3) : '');
  if (id) return { type: 'id', field: id[1]!.toLowerCase() as 'name' | 'author', value: id[2]! };
  if (line.startsWith('option ')) return parseOption(line);
  if (line.startsWith('info')) return parseInfo(line);
  if (line.startsWith('bestmove')) return parseBestMove(line);
  return { type: 'unknown', raw: line };
}

function parseOption(line: string): UciLine {
  const name = /\bname\s+(.+?)(?=\s+type\s+|$)/i.exec(line)?.[1]?.trim();
  return name ? { type: 'option', name, value: line } : { type: 'unknown', raw: line };
}

function parseInfo(line: string): UciInfo {
  const tokens = line.trim().split(/\s+/);
  const result: UciInfo = { type: 'info' };
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]?.toLowerCase();
    if (token === 'pv') {
      const pv = tokens.slice(index + 1).filter(Boolean);
      if (pv.length) result.pv = pv;
      break;
    }
    if (token === 'score') {
      const kind = tokens[index + 1];
      const value = finiteNumber(tokens[index + 2]);
      if ((kind === 'cp' || kind === 'mate') && value !== undefined) {
        const boundToken = tokens[index + 3]?.toLowerCase();
        const bound: ScoreBound | undefined =
          boundToken === 'lowerbound' ? 'lower' : boundToken === 'upperbound' ? 'upper' : undefined;
        const score: UciScore = bound ? { kind, value, bound } : { kind, value };
        result.score = score;
      }
      index += 2;
      continue;
    }
    const field = token ? numericFields.get(token) : undefined;
    if (field) {
      const value = finiteNumber(tokens[index + 1]);
      if (value !== undefined) result[field] = value;
      index += 1;
    }
  }
  return result;
}

function parseBestMove(line: string): UciLine {
  const tokens = line.trim().split(/\s+/);
  const move = tokens[1];
  if (!move || move === '(none)') return { type: 'unknown', raw: line };
  const ponder = tokens[2] === 'ponder' ? tokens[3] : undefined;
  return ponder ? { type: 'bestmove', move, ponder } : { type: 'bestmove', move };
}

function finiteNumber(value: string | undefined): number | undefined {
  if (value === undefined || !/^-?\d+(?:\.\d+)?$/.test(value)) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
