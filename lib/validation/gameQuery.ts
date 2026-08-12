import type {
  Diagnostic,
  GameQuery,
  PlayerColor,
  TimeClass,
  ValidationResult,
} from '../api/contracts';

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,25}$/;
const DATE_FORMAT_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const VALID_TIME_CLASSES: ReadonlySet<string> = new Set(['bullet', 'blitz', 'rapid', 'daily']);
const VALID_COLORS: ReadonlySet<string> = new Set(['white', 'black']);

function isValidUtcDateString(dateStr: string): boolean {
  if (!DATE_FORMAT_REGEX.test(dateStr)) {
    return false;
  }
  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  if (yearStr === undefined || monthStr === undefined || dayStr === undefined) {
    return false;
  }
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  const dateObj = new Date(Date.UTC(year, month - 1, day));
  return (
    dateObj.getUTCFullYear() === year &&
    dateObj.getUTCMonth() === month - 1 &&
    dateObj.getUTCDate() === day
  );
}

export function validateGameQuery(input: unknown): ValidationResult<GameQuery> {
  if (typeof input !== 'object' || input === null) {
    return {
      success: false,
      diagnostics: [
        {
          code: 'INVALID_QUERY_OBJECT',
          message: 'Game query input must be a non-null object',
          severity: 'error',
        },
      ],
    };
  }

  const obj = input as Record<string, unknown>;
  const diagnostics: Diagnostic[] = [];

  // 1. Username
  let username = '';
  if (typeof obj['username'] !== 'string') {
    diagnostics.push({
      code: 'INVALID_USERNAME',
      message: 'Username must be a string',
      severity: 'error',
    });
  } else {
    username = obj['username'].trim();
    if (!USERNAME_REGEX.test(username)) {
      diagnostics.push({
        code: 'INVALID_USERNAME',
        message:
          'Username must be 3-25 characters long and contain only letters, numbers, underscores, or hyphens',
        severity: 'error',
      });
    }
  }

  // 2. Dates
  let dateFrom: string | undefined = undefined;
  let dateTo: string | undefined = undefined;

  if (obj['dateFrom'] !== undefined) {
    if (typeof obj['dateFrom'] !== 'string' || !isValidUtcDateString(obj['dateFrom'])) {
      diagnostics.push({
        code: 'INVALID_DATE_FROM',
        message: 'dateFrom must be a valid YYYY-MM-DD UTC date string',
        severity: 'error',
      });
    } else {
      dateFrom = obj['dateFrom'];
    }
  }

  if (obj['dateTo'] !== undefined) {
    if (typeof obj['dateTo'] !== 'string' || !isValidUtcDateString(obj['dateTo'])) {
      diagnostics.push({
        code: 'INVALID_DATE_TO',
        message: 'dateTo must be a valid YYYY-MM-DD UTC date string',
        severity: 'error',
      });
    } else {
      dateTo = obj['dateTo'];
    }
  }

  if (dateFrom !== undefined && dateTo !== undefined && dateFrom > dateTo) {
    diagnostics.push({
      code: 'INVERTED_DATE_RANGE',
      message: `dateFrom (${dateFrom}) cannot be after dateTo (${dateTo})`,
      severity: 'error',
    });
  }

  // 3. maxGames
  let maxGames = 500;
  if (obj['maxGames'] !== undefined) {
    if (
      typeof obj['maxGames'] !== 'number' ||
      !Number.isInteger(obj['maxGames']) ||
      obj['maxGames'] < 1 ||
      obj['maxGames'] > 5000
    ) {
      diagnostics.push({
        code: 'INVALID_MAX_GAMES',
        message: 'maxGames must be an integer between 1 and 5000',
        severity: 'error',
      });
    } else {
      maxGames = obj['maxGames'];
    }
  }

  // 4. timeClasses
  const timeClasses: TimeClass[] = [];
  if (!Array.isArray(obj['timeClasses']) || obj['timeClasses'].length === 0) {
    diagnostics.push({
      code: 'INVALID_TIME_CLASSES',
      message: 'timeClasses must be a non-empty array of supported time classes',
      severity: 'error',
    });
  } else {
    for (const tc of obj['timeClasses']) {
      if (typeof tc === 'string' && VALID_TIME_CLASSES.has(tc)) {
        timeClasses.push(tc as TimeClass);
      } else {
        diagnostics.push({
          code: 'INVALID_TIME_CLASSES',
          message: `Unsupported time class: ${String(tc)}`,
          severity: 'error',
        });
        break;
      }
    }
  }

  // 5. colors
  const colors: PlayerColor[] = [];
  if (!Array.isArray(obj['colors']) || obj['colors'].length === 0) {
    diagnostics.push({
      code: 'INVALID_COLORS',
      message: 'colors must be a non-empty array of supported player colors',
      severity: 'error',
    });
  } else {
    for (const c of obj['colors']) {
      if (typeof c === 'string' && VALID_COLORS.has(c)) {
        colors.push(c as PlayerColor);
      } else {
        diagnostics.push({
          code: 'INVALID_COLORS',
          message: `Unsupported player color: ${String(c)}`,
          severity: 'error',
        });
        break;
      }
    }
  }

  // 6. rated
  let rated: boolean | undefined = undefined;
  if (obj['rated'] !== undefined) {
    if (typeof obj['rated'] !== 'boolean') {
      diagnostics.push({
        code: 'INVALID_RATED_STATUS',
        message: 'rated must be a boolean when specified',
        severity: 'error',
      });
    } else {
      rated = obj['rated'];
    }
  }

  if (diagnostics.length > 0) {
    return { success: false, diagnostics };
  }

  const unique = <T>(values: T[]): T[] => [...new Set(values)];

  const query: GameQuery = {
    username: username.toLowerCase(),
    maxGames,
    timeClasses: unique(timeClasses),
    colors: unique(colors),
  };

  if (dateFrom !== undefined) {
    query.dateFrom = dateFrom;
  }
  if (dateTo !== undefined) {
    query.dateTo = dateTo;
  }
  if (rated !== undefined) {
    query.rated = rated;
  }

  return { success: true, data: query };
}
