'use client';

import type { JSX, RefObject } from 'react';

import { AppIcon, type AppIconName } from '@/components/ui/AppIcon';
import type { WorkspaceTab } from './WorkspaceTabs';

export interface WorkspaceNavigationProps {
  selected: WorkspaceTab;
  onSelect(tab: WorkspaceTab): void;
  onOpenAbout(): void;
  isDrawer?: boolean;
  onCloseDrawer?: () => void;
  titleHeadingRef?: RefObject<HTMLHeadingElement | null>;
}

interface NavItem {
  tab: WorkspaceTab;
  label: string;
  icon: AppIconName;
}

const PRIMARY_ITEMS: readonly NavItem[] = [
  { tab: 'games', label: 'Games', icon: 'games' },
  { tab: 'analysis', label: 'Review', icon: 'review' },
  { tab: 'opening', label: 'Openings', icon: 'openings' },
];

export function WorkspaceNavigation({
  selected,
  onSelect,
  onOpenAbout,
  isDrawer = false,
  onCloseDrawer,
  titleHeadingRef,
}: WorkspaceNavigationProps): JSX.Element {
  const handleItemClick = (tab: WorkspaceTab) => {
    onSelect(tab);
    if (isDrawer && onCloseDrawer) {
      onCloseDrawer();
    }
    if (titleHeadingRef?.current) {
      titleHeadingRef.current.focus();
    }
  };

  const handleAboutClick = () => {
    if (isDrawer && onCloseDrawer) {
      onCloseDrawer();
    }
    onOpenAbout();
  };

  return (
    <nav
      className={isDrawer ? 'workspace-drawer-nav' : 'workspace-rail-nav'}
      aria-label="Workspace navigation"
    >
      <div className="workspace-nav__brand">
        <div className="workspace-nav__brand-mark" aria-hidden="true">
          <AppIcon name="review" className="workspace-nav__brand-icon" />
        </div>
        <span className="workspace-nav__brand-text">Chess Reviewer</span>
      </div>

      <div className="workspace-nav__primary-items">
        {PRIMARY_ITEMS.map(({ tab, label, icon }) => {
          const isActive = selected === tab;
          return (
            <button
              key={tab}
              type="button"
              className={`workspace-nav__item ${isActive ? 'workspace-nav__item--active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              title={label}
              onClick={() => handleItemClick(tab)}
            >
              <AppIcon name={icon} className="workspace-nav__icon" />
              <span className="workspace-nav__label">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="workspace-nav__bottom-items">
        <button
          type="button"
          className={`workspace-nav__item ${selected === 'settings' ? 'workspace-nav__item--active' : ''}`}
          aria-current={selected === 'settings' ? 'page' : undefined}
          title="Settings"
          onClick={() => handleItemClick('settings')}
        >
          <AppIcon name="settings" className="workspace-nav__icon" />
          <span className="workspace-nav__label">Settings</span>
        </button>

        <button
          type="button"
          className="workspace-nav__item"
          title="About local data and affiliation"
          onClick={handleAboutClick}
        >
          <AppIcon name="info" className="workspace-nav__icon" />
          <span className="workspace-nav__label">About</span>
        </button>
      </div>
    </nav>
  );
}
