'use client';

import { useState, type FormEvent } from 'react';

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
}

export function GameQueryForm({
  onSubmit,
  disabled = false,
  openingHorizon = 30,
  onOpeningHorizonChange,
}: GameQueryFormProps) {
  const [username, setUsername] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [maxGames, setMaxGames] = useState('500');
  const [timeClasses, setTimeClasses] = useState<TimeClass[]>([...timeClassOptions]);
  const [colors, setColors] = useState<PlayerColor[]>(['white', 'black']);
  const [rated, setRated] = useState<'any' | 'rated' | 'unrated'>('any');
  const [horizonDraft, setHorizonDraft] = useState(String(openingHorizon));
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

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
      return;
    }
    setDiagnostics([]);
    void onSubmit(validation.data);
  };

  const diagnostic = (code: string) => diagnostics.find((item) => item.code === code);
  const maxGamesError = diagnostic('INVALID_MAX_GAMES');
  const timeClassError = diagnostic('INVALID_TIME_CLASSES');
  const colorError = diagnostic('INVALID_COLORS');
  const ratedStatusError = diagnostic('INVALID_RATED_STATUS');

  return (
    <form className="query-form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="game-query-username">Username</label>
        <input
          id="game-query-username"
          name="username"
          autoComplete="off"
          value={username}
          onChange={(event) => setUsername(event.currentTarget.value)}
          aria-describedby={diagnostic('INVALID_USERNAME') ? 'username-error' : undefined}
          disabled={disabled}
        />
        {diagnostic('INVALID_USERNAME') ? (
          <p id="username-error" className="field-error">
            {diagnostic('INVALID_USERNAME')?.message}
          </p>
        ) : null}
      </div>

      <div className="date-fields">
        <div className="field">
          <label htmlFor="game-query-from">From date</label>
          <input
            id="game-query-from"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.currentTarget.value)}
            aria-describedby="date-help"
            disabled={disabled}
          />
        </div>
        <div className="field">
          <label htmlFor="game-query-to">To date</label>
          <input
            id="game-query-to"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.currentTarget.value)}
            aria-describedby="date-help"
            disabled={disabled}
          />
        </div>
      </div>
      <p id="date-help" className="field-help">
        Dates are inclusive in UTC.
      </p>

      <div className="query-filter-summary" aria-live="polite">
        {filterSummary(timeClasses, colors, rated, maxGames, horizonDraft)}
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
              onChange={(event) => setMaxGames(event.currentTarget.value)}
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
                  onOpeningHorizonChange?.(value);
                }
              }}
              disabled={disabled}
            />
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
                  onChange={() => setTimeClasses(toggle(timeClasses, timeClass))}
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
                  onChange={() => setColors(toggle(colors, value))}
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
            onChange={(event) => setRated(event.currentTarget.value as typeof rated)}
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

      <button type="submit" disabled={disabled}>
        Load games
      </button>
    </form>
  );
}

function filterSummary(
  timeClasses: readonly TimeClass[],
  colors: readonly PlayerColor[],
  rated: 'any' | 'rated' | 'unrated',
  maxGames: string,
  horizon: string
): string {
  const timeLabel =
    timeClasses.length === timeClassOptions.length
      ? 'All time classes'
      : timeClasses.map(titleCase).join(', ') || 'No time classes';
  const colorLabel =
    colors.length === colorOptions.length ? 'both colours' : colors.join(', ') || 'no colours';
  const ratedLabel =
    rated === 'any' ? 'rated and unrated' : rated === 'rated' ? 'rated only' : 'unrated only';
  return `${timeLabel}; ${colorLabel}; ${ratedLabel}; up to ${maxGames || '0'} games; ${horizon || '—'} ply horizon.`;
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
