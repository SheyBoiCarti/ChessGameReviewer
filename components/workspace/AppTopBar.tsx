'use client';

import { useRef, useState, type JSX, type ReactNode, type RefObject } from 'react';

import { AppIcon } from '@/components/ui/AppIcon';
import { ProductInformation } from './ProductInformation';

export interface AppTopBarProps {
  viewTitle?: string;
  onOpenMenu?: () => void;
  menuTriggerRef?: RefObject<HTMLButtonElement | null>;
  onOpenImport?: () => void;
  importTriggerRef?: RefObject<HTMLButtonElement | null>;
  titleHeadingRef?: RefObject<HTMLHeadingElement | null>;
  aboutOpen?: boolean;
  onCloseAbout?: () => void;
  aboutTriggerRef?: RefObject<HTMLButtonElement | null>;
  // Backwards compatibility / optional props
  onOpenFilters?: () => void;
  filtersOpen?: boolean;
  filterControlsId?: string;
  filterTriggerRef?: RefObject<HTMLButtonElement | null>;
  children?: ReactNode;
}

export function AppTopBar({
  viewTitle = 'Games',
  onOpenMenu,
  menuTriggerRef,
  onOpenImport,
  importTriggerRef,
  titleHeadingRef,
  aboutOpen,
  onCloseAbout,
  aboutTriggerRef,
  onOpenFilters,
  children,
}: AppTopBarProps): JSX.Element {
  const [internalAboutOpen, setInternalAboutOpen] = useState(false);
  const fallbackAboutTrigger = useRef<HTMLButtonElement>(null);

  const isAboutOpen = aboutOpen !== undefined ? aboutOpen : internalAboutOpen;
  const handleCloseAbout = () => {
    if (onCloseAbout) {
      onCloseAbout();
    } else {
      setInternalAboutOpen(false);
    }
  };

  const effectiveAboutTrigger = aboutTriggerRef ?? fallbackAboutTrigger;

  return (
    <header className="app-topbar" role="banner" aria-label="Local Chess Game Reviewer">
      <div className="app-topbar__content">
        <div className="app-topbar__left">
          {onOpenMenu ? (
            <button
              ref={menuTriggerRef}
              type="button"
              className="app-topbar__menu-btn"
              aria-label="Open menu"
              onClick={onOpenMenu}
            >
              <AppIcon name="menu" className="app-topbar__icon" />
              <span className="app-topbar__menu-label">Menu</span>
            </button>
          ) : null}
          <h1 ref={titleHeadingRef} tabIndex={-1} className="app-topbar__view-title">
            {viewTitle}
          </h1>
        </div>

        <div className="app-topbar__actions">
          {onOpenImport ? (
            <button
              ref={importTriggerRef}
              type="button"
              className="app-topbar__import-btn"
              aria-label="Import games"
              onClick={onOpenImport}
            >
              <AppIcon name="import" className="app-topbar__icon" />
              <span className="app-topbar__import-label">Import games</span>
            </button>
          ) : onOpenFilters ? (
            <button
              ref={importTriggerRef}
              type="button"
              className="app-topbar__import-btn"
              aria-label="Import games"
              onClick={onOpenFilters}
            >
              <AppIcon name="import" className="app-topbar__icon" />
              <span className="app-topbar__import-label">Import games</span>
            </button>
          ) : null}
        </div>
      </div>

      {children}

      <ProductInformation
        open={isAboutOpen}
        onClose={handleCloseAbout}
        returnFocusRef={effectiveAboutTrigger}
      />
    </header>
  );
}
