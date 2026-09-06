'use client';

import { type FormEvent, useEffect, useState } from 'react';

import { DatePreset, resolveDatePreset } from '@/features/ingestion/datePresets';
import type { Diagnostic, GameQuery, PlayerColor, TimeClass } from '@/lib/api/contracts';
import { validateGameQuery } from '@/lib/validation/gameQuery';

const timeClassOptions: readonly TimeClass[] = ['bullet', 'blitz', 'rapid', 'daily'];
const colorOptions: ReadonlyArray<{ value: PlayerColor; label: string }> = [
  { value: 'white', label: 'White games' },
  { value: 'black', label: 'Black games' },
];

export interface GameQueryFormProps {
  onSubmit(query: GameQuery): void | Promise<void>;
  disabled?: boolean;
  openingHorizon?: number;
  onOpeningHorizonChange?(value: number): void;
  initialQuery?: Partial<GameQuery>;
  onDraftChange?(query: Partial<GameQuery>): void;
  recentQuery?: GameQuery | null;
  onResume?(query: GameQuery): void | Promise<void>;
}

export function GameQueryForm({
  onSubmit,
  disabled = false,
  openingHorizon = 30,
  onOpeningHorizonChange,
  initialQuery,
  onDraftChange,
  recentQuery = null,
  onResume,
}: GameQueryFormProps) {
  const [username, setUsername] = useState(initialQuery?.username ?? '');
  const [datePreset, setDatePreset] = useState<DatePreset>(() => {
    const now = new Date();
    const last30 = resolveDatePreset('last30', now);
    const thisMonth = resolveDatePreset('thisMonth', now);
    if (recentQuery && initialQuery?.dateFrom === undefined && initialQuery?.dateTo === undefined) {
      return recentQuery.dateFrom || recentQuery.dateTo ? 'custom' : 'all';
    }
    if (initialQuery?.dateFrom !== undefined || initialQuery?.dateTo !== undefined) {
      const df = initialQuery.dateFrom ?? '';
      const dt = initialQuery.dateTo ?? '';
      if (df === last30.dateFrom && dt === last30.dateTo) return 'last30';
      if (df === thisMonth.dateFrom && dt === thisMonth.dateTo) return 'thisMonth';
      if (df === '' && dt === '') return 'all';
      return 'custom';
    }
    return 'last30';
  });
  const [dateFrom, setDateFrom] = useState(() => {
    if (recentQuery && initialQuery?.dateFrom === undefined && initialQuery?.dateTo === undefined) {
      return recentQuery.dateFrom ?? '';
    }
    if (initialQuery?.dateFrom !== undefined || initialQuery?.dateTo !== undefined) {
      return initialQuery.dateFrom ?? '';
    }
    return resolveDatePreset('last30', new Date()).dateFrom;
  });
  const [dateTo, setDateTo] = useState(() => {
    if (recentQuery && initialQuery?.dateFrom === undefined && initialQuery?.dateTo === undefined) {
      return recentQuery.dateTo ?? '';
    }
    if (initialQuery?.dateFrom !== undefined || initialQuery?.dateTo !== undefined) {
      return initialQuery.dateTo ?? '';
    }
    return resolveDatePreset('last30', new Date()).dateTo;
  });
  const [maxGames, setMaxGames] = useState(String(initialQuery?.maxGames ?? 500));
  const [timeClasses, setTimeClasses] = useState<TimeClass[]>(
    initialQuery?.timeClasses ? [...initialQuery.timeClasses] : [...timeClassOptions]
  );
  const [colors, setColors] = useState<PlayerColor[]>(
    initialQuery?.colors ? [...initialQuery.colors] : ['white', 'black']
  );
  const [rated, setRated] = useState<'any' | 'rated' | 'unrated'>(
    initialQuery?.rated === true ? 'rated' : initialQuery?.rated === false ? 'unrated' : 'any'
  );
  const [horizonDraft, setHorizonDraft] = useState(String(openingHorizon));
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [horizonError, setHorizonError] = useState<string | null>(null);

  useEffect(() => {
    setHorizonDraft(String(openingHorizon));
  }, [openingHorizon]);

  const handleSelectPreset = (preset: DatePreset) => {
    setDatePreset(preset);
    if (preset === 'custom') {
      return;
    }
    const resolved = resolveDatePreset(preset, new Date());
    setDateFrom(resolved.dateFrom);
    setDateTo(resolved.dateTo);
    onDraftChange?.({
      username,
      dateFrom: resolved.dateFrom,
      dateTo: resolved.dateTo,
      maxGames: Number(maxGames) || 500,
      timeClasses,
      colors,
      rated: rated === 'any' ? undefined : rated === 'rated',
    });
  };

  const loadDraft = (query: GameQuery) => {
    setUsername(query.username);
    const df = query.dateFrom ?? '';
    const dt = query.dateTo ?? '';
    setDateFrom(df);
    setDateTo(dt);
    setDatePreset(df || dt ? 'custom' : 'all');
    setMaxGames(String(query.maxGames));
    setTimeClasses([...query.timeClasses]);
    setColors([...query.colors]);
    setRated(query.rated === true ? 'rated' : query.rated === false ? 'unrated' : 'any');
    setDiagnostics([]);
    setHorizonError(null);
  };

  const updateDraft = (changes: Partial<GameQuery>) => {
    onDraftChange?.({
      username,
      dateFrom,
      dateTo,
      maxGames: Number(maxGames) || 500,
      timeClasses,
      colors,
      rated: rated === 'any' ? undefined : rated === 'rated',
      ...changes,
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = {
      username,
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
      maxGames: Number(maxGames),
      timeClasses,
      colors,
      ...(rated === 'any' ? {} : { rated: rated === 'rated' }),
    };
    const validation = validateGameQuery(candidate);
    if (!validation.success) {
      setDiagnostics(validation.diagnostics);
      if (validation.diagnostics.some(isAdvancedFilterDiagnostic)) {
        setFiltersOpen(true);
      }
      const hasDateDiag = validation.diagnostics.some((d) =>
        ['INVALID_DATE_FROM', 'INVALID_DATE_TO', 'INVERTED_DATE_RANGE'].includes(d.code)
      );
      if (hasDateDiag) {
        setDatePreset('custom');
      }
      return;
    }
    const horizon = Number(horizonDraft);
    if (!Number.isInteger(horizon) || horizon < 2 || horizon > 40) {
      setHorizonError('Choose a whole number from 2 to 40 plies.');
      setFiltersOpen(true);
      return;
    }
    setDiagnostics([]);
    setHorizonError(null);
    onOpeningHorizonChange?.(horizon);
    void onSubmit(validation.data);
  };

  const diagnostic = (code: string) => diagnostics.find((item) => item.code === code);
  const maxGamesError = diagnostic('INVALID_MAX_GAMES');
  const timeClassError = diagnostic('INVALID_TIME_CLASSES');
  const colorError = diagnostic('INVALID_COLORS');
  const ratedStatusError = diagnostic('INVALID_RATED_STATUS');
  const dateError =
    diagnostic('INVALID_DATE_FROM') ??
    diagnostic('INVALID_DATE_TO') ??
    diagnostic('INVERTED_DATE_RANGE');

  return (
    <form className="query-form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="game-query-username">Username</label>
        <input
          id="game-query-username"
          name="username"
          autoComplete="off"
          value={username}
          onChange={(event) => {
            const next = event.currentTarget.value;
            setUsername(next);
            updateDraft({ username: next });
          }}
          aria-describedby={diagnostic('INVALID_USERNAME') ? 'username-error' : undefined}
          disabled={disabled}
        />
        {diagnostic('INVALID_USERNAME') ? (
          <p id="username-error" className="field-error">
            {diagnostic('INVALID_USERNAME')?.message}
          </p>
        ) : null}
      </div>

      <fieldset className="field date-range-fieldset">
        <legend>Date range</legend>
        <div className="date-preset-grid">
          <label className="choice-chip">
            <input
              type="radio"
              name="date-preset"
              value="last30"
              checked={datePreset === 'last30'}
              onChange={() => handleSelectPreset('last30')}
              disabled={disabled}
            />
            Last 30 days
          </label>
          <label className="choice-chip">
            <input
              type="radio"
              name="date-preset"
              value="thisMonth"
              checked={datePreset === 'thisMonth'}
              onChange={() => handleSelectPreset('thisMonth')}
              disabled={disabled}
            />
            This month
          </label>
          <label className="choice-chip">
            <input
              type="radio"
              name="date-preset"
              value="all"
              checked={datePreset === 'all'}
              onChange={() => handleSelectPreset('all')}
              disabled={disabled}
            />
            All available
          </label>
          <label className="choice-chip">
            <input
              type="radio"
              name="date-preset"
              value="custom"
              checked={datePreset === 'custom'}
              onChange={() => handleSelectPreset('custom')}
              disabled={disabled}
            />
            Custom
          </label>
        </div>
      </fieldset>

      {datePreset === 'custom' ? (
        <div className="date-fields">
          <div className="field">
            <label htmlFor="game-query-from">From date</label>
            <input
              id="game-query-from"
              type="date"
              value={dateFrom}
              onChange={(event) => {
                const next = event.currentTarget.value;
                setDatePreset('custom');
                setDateFrom(next);
                updateDraft({ dateFrom: next });
              }}
              aria-describedby={dateError ? 'date-error' : 'date-help'}
              disabled={disabled}
            />
          </div>
          <div className="field">
            <label htmlFor="game-query-to">To date</label>
            <input
              id="game-query-to"
              type="date"
              value={dateTo}
              onChange={(event) => {
                const next = event.currentTarget.value;
                setDatePreset('custom');
                setDateTo(next);
                updateDraft({ dateTo: next });
              }}
              aria-describedby={dateError ? 'date-error' : 'date-help'}
              disabled={disabled}
            />
          </div>
          <p id="date-help" className="field-help">
            Dates are inclusive in UTC.
          </p>
        </div>
      ) : null}

      {dateError ? (
        <p id="date-error" className="field-error" role="alert">
          {dateError.message}
        </p>
      ) : null}

      <div className="query-filter-summary" aria-live="polite">
        {filterSummary(timeClasses, colors, rated, maxGames, openingHorizon)}
      </div>
      <button
        className="button-secondary query-filter-toggle"
        type="button"
        aria-expanded={filtersOpen}
        aria-controls="game-query-filters"
        onClick={() => setFiltersOpen((open) => !open)}
      >
        Game filters
      </button>

      <div id="game-query-filters" className="query-filter-fields" hidden={!filtersOpen}>
        <div className="number-fields">
          <div className="field">
            <label htmlFor="game-query-maximum">Maximum games</label>
            <input
              id="game-query-maximum"
              type="number"
              min="1"
              max="5000"
              value={maxGames}
              onChange={(event) => {
                const next = event.currentTarget.value;
                setMaxGames(next);
                updateDraft({ maxGames: Number(next) || 500 });
              }}
              aria-describedby={maxGamesError ? 'maximum-games-error' : undefined}
              disabled={disabled}
            />
            {maxGamesError ? (
              <p id="maximum-games-error" className="field-error">
                {maxGamesError.message}
              </p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="opening-horizon">Opening horizon (plies)</label>
            <input
              id="opening-horizon"
              type="number"
              min="2"
              max="40"
              value={horizonDraft}
              onChange={(event) => {
                setHorizonDraft(event.currentTarget.value);
                const value = event.currentTarget.valueAsNumber;
                if (Number.isInteger(value) && value >= 2 && value <= 40) {
                  setHorizonError(null);
                  onOpeningHorizonChange?.(value);
                }
              }}
              aria-describedby={horizonError ? 'opening-horizon-error' : undefined}
              disabled={disabled}
            />
            {horizonError ? (
              <p id="opening-horizon-error" className="field-error">
                {horizonError}
              </p>
            ) : null}
          </div>
        </div>

        <fieldset aria-describedby={timeClassError ? 'time-classes-error' : undefined}>
          <legend>Time classes</legend>
          <div className="choice-row">
            {timeClassOptions.map((timeClass) => (
              <label key={timeClass} className="choice-chip">
                <input
                  type="checkbox"
                  checked={timeClasses.includes(timeClass)}
                  onChange={() => {
                    const next = toggle(timeClasses, timeClass);
                    setTimeClasses(next);
                    updateDraft({ timeClasses: next });
                  }}
                  disabled={disabled}
                />
                {titleCase(timeClass)}
              </label>
            ))}
          </div>
          {timeClassError ? (
            <p id="time-classes-error" className="field-error">
              Select at least one time class.
            </p>
          ) : null}
        </fieldset>

        <fieldset aria-describedby={colorError ? 'colors-error' : undefined}>
          <legend>Player colour</legend>
          <div className="choice-row">
            {colorOptions.map(({ value, label }) => (
              <label key={value} className="choice-chip">
                <input
                  type="checkbox"
                  checked={colors.includes(value)}
                  onChange={() => {
                    const next = toggle(colors, value);
                    setColors(next);
                    updateDraft({ colors: next });
                  }}
                  disabled={disabled}
                />
                {label}
              </label>
            ))}
          </div>
          {colorError ? (
            <p id="colors-error" className="field-error">
              Select at least one player colour.
            </p>
          ) : null}
        </fieldset>

        <div className="field">
          <label htmlFor="game-query-rated">Rated status</label>
          <select
            id="game-query-rated"
            value={rated}
            onChange={(event) => {
              const next = event.currentTarget.value as typeof rated;
              setRated(next);
              updateDraft({ rated: next === 'any' ? undefined : next === 'rated' });
            }}
            aria-describedby={ratedStatusError ? 'rated-status-error' : undefined}
            disabled={disabled}
          >
            <option value="any">Rated and unrated</option>
            <option value="rated">Rated only</option>
            <option value="unrated">Unrated only</option>
          </select>
          {ratedStatusError ? (
            <p id="rated-status-error" className="field-error">
              {ratedStatusError.message}
            </p>
          ) : null}
        </div>
      </div>

      <button type="submit" className="button-primary" disabled={disabled}>
        Load games
      </button>
      {recentQuery && onResume ? (
        <button
          type="button"
          className="button-secondary query-resume"
          disabled={disabled}
          onClick={() => {
            loadDraft(recentQuery);
            void onResume(recentQuery);
          }}
        >
          Load saved search for {recentQuery.username}
        </button>
      ) : null}
    </form>
  );
}

function filterSummary(
  timeClasses: readonly TimeClass[],
  colors: readonly PlayerColor[],
  rated: 'any' | 'rated' | 'unrated',
  maxGames: string,
  horizon: number
): string {
  const timeLabel =
    timeClasses.length === timeClassOptions.length
      ? 'All time classes'
      : timeClasses.map(titleCase).join(', ') || 'No time classes';
  const colorLabel =
    colors.length === colorOptions.length ? 'both colours' : colors.join(', ') || 'no colours';
  const ratedLabel =
    rated === 'any' ? 'rated and unrated' : rated === 'rated' ? 'rated only' : 'unrated only';
  return `${timeLabel}; ${colorLabel}; ${ratedLabel}; up to ${maxGames || '0'} games; ${horizon} ply horizon.`;
}

function toggle<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function titleCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function isAdvancedFilterDiagnostic(diagnostic: Diagnostic): boolean {
  return [
    'INVALID_MAX_GAMES',
    'INVALID_TIME_CLASSES',
    'INVALID_COLORS',
    'INVALID_RATED_STATUS',
  ].includes(diagnostic.code);
}
