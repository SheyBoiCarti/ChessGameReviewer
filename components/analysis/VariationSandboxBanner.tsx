'use client';

import type React from 'react';

import type { AnalysisVariationState } from '@/features/board/variation';

export interface VariationSandboxBannerProps {
  state: AnalysisVariationState;
  onCursorChange(cursor: number): void;
  onClose(): void;
}

export function VariationSandboxBanner({
  state,
  onCursorChange,
  onClose,
}: VariationSandboxBannerProps): React.JSX.Element {
  const isAtStart = state.cursor === 0;
  const isAtEnd = state.cursor >= state.moves.length;

  return (
    <aside
      className="variation-sandbox-banner surface-panel"
      aria-label="Analysis variation sandbox"
    >
      <div className="variation-sandbox-banner__header">
        <h4 className="variation-sandbox-banner__title">
          Exploration from ply {state.basePly}
        </h4>
        <button
          type="button"
          className="variation-sandbox-banner__close-button"
          onClick={onClose}
        >
          Return to main game
        </button>
      </div>
      <div className="variation-sandbox-banner__body">
        <nav
          className="variation-sandbox-banner__breadcrumbs"
          aria-label="Variation move sequence"
        >
          <button
            type="button"
            className={`variation-sandbox-banner__breadcrumb-node ${isAtStart ? 'is-active' : ''}`}
            onClick={() => onCursorChange(0)}
            aria-current={isAtStart ? 'step' : undefined}
          >
            Start
          </button>
          {state.moves.map((move, index) => {
            const step = index + 1;
            const isActive = state.cursor === step;
            return (
              <button
                key={`${step}-${move.uci}`}
                type="button"
                className={`variation-sandbox-banner__breadcrumb-node ${isActive ? 'is-active' : ''}`}
                onClick={() => onCursorChange(step)}
                aria-current={isActive ? 'step' : undefined}
              >
                {move.san}
              </button>
            );
          })}
        </nav>
        <div className="variation-sandbox-banner__controls">
          <button
            type="button"
            className="variation-sandbox-banner__step-button"
            disabled={isAtStart}
            onClick={() => onCursorChange(state.cursor - 1)}
            aria-label="Previous variation move"
          >
            ‹ Previous
          </button>
          <button
            type="button"
            className="variation-sandbox-banner__step-button"
            disabled={isAtEnd}
            onClick={() => onCursorChange(state.cursor + 1)}
            aria-label="Next variation move"
          >
            Next ›
          </button>
        </div>
      </div>
    </aside>
  );
}
