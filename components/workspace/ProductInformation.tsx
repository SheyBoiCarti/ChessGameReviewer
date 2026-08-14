'use client';

import { useLayoutEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ProductInformation({
  open,
  onClose,
  returnFocusRef,
}: {
  open: boolean;
  onClose(): void;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !backdropRef.current || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const focusable = dialog.querySelector<HTMLElement>(focusableSelector);
    (focusable ?? dialog).focus();

    return makeBackgroundInert(backdropRef.current);
  }, [open]);

  const close = () => {
    onClose();
    queueMicrotask(() => returnFocusRef.current?.focus());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    trapFocus(event, dialogRef.current);
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop product-information-backdrop" ref={backdropRef}>
      <div
        ref={dialogRef}
        className="modal product-information"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-information-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="product-information__heading">
          <h2 id="product-information-title">About this app</h2>
          <button
            type="button"
            className="button-ghost"
            onClick={close}
            aria-label="Close product information"
          >
            Close
          </button>
        </div>
        <section className="notice-banner" data-testid="unaffiliated-notice">
          <span className="notice-title">Unaffiliated Product Notice</span>
          <p className="notice-content">
            This application is completely unaffiliated with Chess.com. All public chess game
            archives are fetched directly from the official Chess.com Published Data API via browser
            CORS requests.
          </p>
        </section>
        <section className="privacy-card" data-testid="privacy-summary">
          <h3 className="privacy-title">Local Storage &amp; Privacy</h3>
          <p className="privacy-text">
            Your requested games, opening tree structures, and engine evaluations are stored locally
            on your device in browser IndexedDB. No game data, raw PGNs, or Stockfish evaluations
            are ever uploaded to any server. You can inspect or clear your data locally at any time.
          </p>
        </section>
      </div>
    </div>
  );
}

export function trapFocus(event: KeyboardEvent<HTMLElement>, dialog: HTMLElement) {
  const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)];
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function makeBackgroundInert(backdrop: HTMLElement) {
  const modalRoot = backdrop.closest<HTMLElement>('[data-modal-root]') ?? backdrop.parentElement;
  if (!modalRoot) return undefined;
  const targets: Element[] = [];
  let current: HTMLElement | null = backdrop;
  while (current?.parentElement) {
    const container: HTMLElement = current.parentElement;
    targets.push(...[...container.children].filter((child) => child !== current));
    if (container === modalRoot) break;
    current = container;
  }
  const uniqueTargets = [...new Set(targets)];
  const alreadyInert = new Map(
    uniqueTargets.map((target) => [target, target.hasAttribute('inert')])
  );
  for (const target of uniqueTargets) target.setAttribute('inert', '');
  return () => {
    for (const target of uniqueTargets) {
      if (!alreadyInert.get(target)) target.removeAttribute('inert');
    }
  };
}
