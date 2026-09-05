'use client';

import {
  useLayoutEffect,
  useRef,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import { AppIcon } from '@/components/ui/AppIcon';
import { makeBackgroundInert, trapFocus } from './ProductInformation';

export interface UtilityRailProps {
  title?: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  id?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
  resultFocusVersion?: number;
  children: ReactNode;
}

export function UtilityRail({
  title = 'Import games',
  open,
  onOpenChange,
  id = 'utility-rail-drawer',
  returnFocusRef,
  resultFocusVersion,
  children,
}: UtilityRailProps): JSX.Element | null {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const inertCleanupRef = useRef<(() => void) | undefined>(undefined);
  const previousResultFocusVersion = useRef(resultFocusVersion);
  const previouslyOpen = useRef(open);

  useLayoutEffect(() => {
    if (!open || !backdropRef.current || !dialogRef.current) return;

    const focusable = dialogRef.current.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    (closeButtonRef.current ?? focusable ?? dialogRef.current).focus();

    const restoreBackground = makeBackgroundInert(backdropRef.current);
    inertCleanupRef.current = restoreBackground;
    return () => {
      if (inertCleanupRef.current === restoreBackground) inertCleanupRef.current = undefined;
      restoreBackground?.();
    };
  }, [open]);

  useLayoutEffect(() => {
    const previous = previousResultFocusVersion.current;
    previousResultFocusVersion.current = resultFocusVersion;
    if (previous === resultFocusVersion || !open || !dialogRef.current) return;
    if (document.activeElement?.getAttribute('aria-label')?.toLowerCase().includes('close')) return;
    dialogRef.current.querySelector<HTMLElement>('[data-utility-rail-result]')?.focus();
  }, [open, resultFocusVersion]);

  useLayoutEffect(() => {
    const wasOpen = previouslyOpen.current;
    previouslyOpen.current = open;
    if (!wasOpen || open) return;
    returnFocusRef?.current?.focus();
  }, [open, returnFocusRef]);

  if (!open) return null;

  const close = () => {
    inertCleanupRef.current?.();
    inertCleanupRef.current = undefined;
    onOpenChange(false);
    returnFocusRef?.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Tab' && dialogRef.current) {
      trapFocus(event, dialogRef.current);
    }
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === backdropRef.current) {
      close();
    }
  };

  return (
    <div className="utility-rail__backdrop" ref={backdropRef} onClick={handleBackdropClick}>
      <aside
        id={id}
        ref={dialogRef}
        className="query-panel utility-rail__drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="utility-rail-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="utility-rail__heading">
          <h2 id="utility-rail-title" className="utility-rail__title">
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="button-ghost utility-rail__close-btn"
            onClick={close}
            aria-label={`Close ${title}`}
          >
            <AppIcon name="close" className="utility-rail__close-icon" />
          </button>
        </div>
        <div className="utility-rail__content">{children}</div>
      </aside>
    </div>
  );
}
