'use client';

import { useRef, useState, type ReactNode, type RefObject } from 'react';

import { ProductInformation } from './ProductInformation';

export function AppTopBar({
  onOpenFilters,
  filtersOpen,
  filterControlsId,
  filterTriggerRef,
  children,
}: {
  onOpenFilters(): void;
  filtersOpen?: boolean;
  filterControlsId?: string;
  filterTriggerRef?: RefObject<HTMLButtonElement | null>;
  children?: ReactNode;
}) {
  const [productInformationOpen, setProductInformationOpen] = useState(false);
  const informationTrigger = useRef<HTMLButtonElement>(null);

  return (
    <div className="workspace-topbar" data-modal-root>
      <header className="workspace-topbar__content" aria-label="Workspace actions">
        <p className="workspace-topbar__status">Local-first workspace</p>
        <div className="workspace-topbar__actions">
          <button
            ref={filterTriggerRef}
            type="button"
            className="button-ghost utility-rail-trigger"
            onClick={onOpenFilters}
            aria-controls={filterControlsId}
            aria-expanded={filterControlsId ? filtersOpen : undefined}
          >
            <span aria-hidden="true">☰</span>
            Filters
          </button>
          <button
            ref={informationTrigger}
            type="button"
            className="button-ghost"
            onClick={() => setProductInformationOpen(true)}
          >
            About local data and affiliation
          </button>
        </div>
      </header>
      {children}
      <ProductInformation
        open={productInformationOpen}
        onClose={() => setProductInformationOpen(false)}
        returnFocusRef={informationTrigger}
      />
    </div>
  );
}
