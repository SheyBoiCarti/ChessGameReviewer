'use client';

import type { JSX } from 'react';

import type { OpeningScope } from '@/features/opening-tree/graphIdentity';

export interface OpeningScopeControlProps {
  value: OpeningScope;
  onChange(scope: OpeningScope): void;
  whiteCount: number;
  blackCount: number;
  importColors: readonly ('white' | 'black')[];
  /** Explicit load action for a color excluded from the loaded dataset. */
  onRequestLoad(): void;
  disabled?: boolean | undefined;
}

const scopeOptions: Array<{ value: OpeningScope; label: string }> = [
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black' },
];

export function OpeningScopeControl({
  value,
  onChange,
  whiteCount,
  blackCount,
  importColors,
  onRequestLoad,
  disabled = false,
}: OpeningScopeControlProps): JSX.Element {
  const counts: Record<OpeningScope, number> = {
    white: whiteCount,
    black: blackCount,
    both: whiteCount + blackCount,
  };
  const excludedColors = (value === 'both' ? (['white', 'black'] as const) : [value]).filter(
    (color) => !importColors.includes(color)
  );
  const missingColor = excludedColors.length > 0;
  const missingLabel = excludedColors
    .map((color) => (color === 'white' ? 'White' : 'Black'))
    .join(' and ');
  return (
    <section className="opening-scope surface-panel" aria-label="Opening scope">
      <fieldset className="opening-scope__fieldset" disabled={disabled}>
        <legend className="sr-only">Opening scope</legend>
        <span aria-hidden="true" className="opening-scope__label">
          Scope
        </span>
        {scopeOptions.map(({ value: option, label }) => (
          <label key={option} className="opening-scope__option">
            <input
              type="radio"
              name="opening-scope"
              value={option}
              checked={value === option}
              disabled={disabled}
              onChange={() => onChange(option)}
            />
            {label}
            <span aria-hidden="true" className="opening-scope__count tabular-nums">
              {counts[option]}
            </span>
          </label>
        ))}
      </fieldset>
      {missingColor ? (
        <div className="opening-scope__missing" role="status">
          <p>
            {missingLabel} games were excluded from this import. Load them to see the complete
            scope. Your current opening stays available until the new games load.
          </p>
          <button
            type="button"
            className="button-secondary"
            onClick={onRequestLoad}
            disabled={disabled}
          >
            Load {missingLabel} games
          </button>
        </div>
      ) : null}
    </section>
  );
}
