import type { JSX } from 'react';

export type AppIconName =
  | 'games'
  | 'review'
  | 'openings'
  | 'settings'
  | 'info'
  | 'menu'
  | 'close'
  | 'import'
  | 'first'
  | 'previous'
  | 'next'
  | 'last'
  | 'flip';

export interface AppIconProps {
  name: AppIconName;
  className?: string;
}

export function AppIcon({ name, className }: AppIconProps): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
    >
      {renderIconPaths(name)}
    </svg>
  );
}

function renderIconPaths(name: AppIconName): JSX.Element {
  switch (name) {
    case 'games':
      return (
        <>
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </>
      );
    case 'review':
      return (
        <>
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </>
      );
    case 'openings':
      return (
        <>
          <circle cx="6" cy="18" r="3" />
          <circle cx="6" cy="6" r="3" />
          <circle cx="18" cy="6" r="3" />
          <path d="M6 9v3a3 3 0 0 0 3 3h6" />
          <line x1="6" y1="9" x2="6" y2="15" />
        </>
      );
    case 'settings':
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </>
      );
    case 'info':
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </>
      );
    case 'menu':
      return (
        <>
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </>
      );
    case 'close':
      return (
        <>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </>
      );
    case 'import':
      return (
        <>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </>
      );
    case 'first':
      return (
        <>
          <line x1="5" y1="5" x2="5" y2="19" />
          <polyline points="19 19 11 12 19 5" />
        </>
      );
    case 'previous':
      return <polyline points="15 18 9 12 15 6" />;
    case 'next':
      return <polyline points="9 18 15 12 9 6" />;
    case 'last':
      return (
        <>
          <polyline points="5 19 13 12 5 5" />
          <line x1="19" y1="5" x2="19" y2="19" />
        </>
      );
    case 'flip':
      return (
        <>
          <path d="M7 20V4M7 4L3 8M7 4L11 8" />
          <path d="M17 4V20M17 20L21 16M17 20L13 16" />
        </>
      );
  }
}
