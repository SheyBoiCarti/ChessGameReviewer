'use client';

import type { KeyboardEvent } from 'react';

export type WorkspaceTab = 'games' | 'opening' | 'analysis' | 'settings';

const tabs: ReadonlyArray<{ id: WorkspaceTab; label: string }> = [
  { id: 'games', label: 'Games and board' },
  { id: 'opening', label: 'Opening tree' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'settings', label: 'Settings' },
];

export function WorkspaceTabs({
  selected,
  onSelect,
}: {
  selected: WorkspaceTab;
  onSelect(value: WorkspaceTab): void;
}) {
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    onSelect(tabs[next]!.id);
    requestAnimationFrame(() =>
      document.getElementById(`workspace-tab-${tabs[next]!.id}`)?.focus()
    );
  };

  return (
    <div className="workspace-tabs" role="tablist" aria-label="Analysis workspaces">
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          id={`workspace-tab-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={selected === tab.id}
          aria-controls={`workspace-panel-${tab.id}`}
          tabIndex={selected === tab.id ? 0 : -1}
          onClick={() => onSelect(tab.id)}
          onKeyDown={(event) => keyDown(event, index)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
