'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import { makeBackgroundInert, trapFocus } from './ProductInformation';

// A visible rail needs room for its own controls, a useful board, and the contextual panel.
// Below this width the drawer keeps the board and game list from competing for one row.
const mobileQuery = '(max-width: 80rem)';

export function UtilityRail({
  title,
  open,
  onOpenChange,
  id,
  returnFocusRef,
  resultFocusVersion,
  children,
}: {
  title: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  id?: string;
  returnFocusRef?: RefObject<HTMLElement | null>;
  resultFocusVersion?: number;
  children: ReactNode;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const mobileReturnFocusRef = useRef<HTMLElement | null>(null);
  const previousResultFocusVersion = useRef(resultFocusVersion);
  const previouslyOpen = useRef(open);
  const isMobile = useMobileLayout();

  useLayoutEffect(() => {
    if (!open || !isMobile || !backdropRef.current || !dialogRef.current) return;
    mobileReturnFocusRef.current =
      document.activeElement instanceof HTMLElement && document.activeElement !== document.body
        ? document.activeElement
        : null;
    const focusable = dialogRef.current.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    (focusable ?? dialogRef.current).focus();
    return makeBackgroundInert(backdropRef.current);
  }, [isMobile, open]);

  useLayoutEffect(() => {
    const previous = previousResultFocusVersion.current;
    previousResultFocusVersion.current = resultFocusVersion;
    if (previous === resultFocusVersion || !open || !isMobile || !dialogRef.current) return;
    dialogRef.current.querySelector<HTMLElement>('[data-utility-rail-result]')?.focus();
  }, [isMobile, open, resultFocusVersion]);

  useLayoutEffect(() => {
    const wasOpen = previouslyOpen.current;
    previouslyOpen.current = open;
    if (!wasOpen || open) return;
    const target = returnFocusRef?.current ?? (isMobile ? mobileReturnFocusRef.current : null);
    target?.focus();
  }, [isMobile, open, returnFocusRef]);

  const close = () => {
    onOpenChange(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'Tab' && dialogRef.current) trapFocus(event, dialogRef.current);
  };

  if (!isMobile) {
    if (!open) return null;

    return (
      <aside id={id} className="query-panel utility-rail__desktop" aria-label={title}>
        <div className="utility-rail__heading">
          <h2 className="utility-rail__title">{title}</h2>
          <button
            type="button"
            className="button-ghost"
            onClick={close}
            aria-label={`Close ${title}`}
          >
            Close
          </button>
        </div>
        {children}
      </aside>
    );
  }

  if (!open) return null;

  return (
    <div className="utility-rail__backdrop" ref={backdropRef}>
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
            type="button"
            className="button-ghost"
            onClick={close}
            aria-label={`Close ${title}`}
          >
            Close
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

function useMobileLayout() {
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function' ||
      window.matchMedia(mobileQuery).matches
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(mobileQuery);
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [setIsMobile]);
  return isMobile;
}
