'use client';

import type { JSX, KeyboardEvent } from 'react';

export type ReviewMode = 'review' | 'analysis';
export type WorkspaceTab = 'games' | 'opening' | 'analysis' | 'settings';

const reviewTabs: ReadonlyArray<{ id: ReviewMode; label: string }> = [
  { id: 'review', label: 'Review' },
  { id: 'analysis', label: 'Analysis' },
];

export interface WorkspaceTabsProps {
  selected: ReviewMode;
  onSelect(mode: ReviewMode): void;
}

export function WorkspaceTabs({ selected, onSelect }: WorkspaceTabsProps): JSX.Element {
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % reviewTabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + reviewTabs.length) % reviewTabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = reviewTabs.length - 1;
    else return;

    event.preventDefault();
    const nextTab = reviewTabs[next]!;
    onSelect(nextTab.id);
    requestAnimationFrame(() => {
      document.getElementById(`review-tab-${nextTab.id}`)?.focus();
    });
  };

  return (
    <div className="workspace-tabs" role="tablist" aria-label="Review modes">
      {reviewTabs.map((tab, index) => {
        const isSelected = selected === tab.id;
        return (
          <button
            key={tab.id}
            id={`review-tab-${tab.id}`}
            type="button"
            role="tab"
            className={`workspace-tab ${isSelected ? 'workspace-tab--active' : ''}`}
            aria-selected={isSelected}
            aria-controls={`review-panel-${tab.id}`}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => keyDown(event, index)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
