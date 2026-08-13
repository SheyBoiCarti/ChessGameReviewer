'use client';

import type { KeyboardEvent } from 'react';

export type WorkspaceTab = 'games' | 'opening' | 'analysis' | 'settings';

const tabs: ReadonlyArray<{ id: WorkspaceTab; label: string; icon: string }> = [
  { id: 'games', label: 'Games and board', icon: '♟' },
  { id: 'opening', label: 'Opening tree', icon: '⌘' },
  { id: 'analysis', label: 'Analysis', icon: '◈' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
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
          <span className="workspace-tabs__icon" aria-hidden="true">
            {tab.icon}
          </span>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
