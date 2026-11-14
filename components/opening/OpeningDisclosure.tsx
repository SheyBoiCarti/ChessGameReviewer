'use client';

import { useState, type ReactNode } from 'react';

/**
 * T41: expensive secondary contents mount only while expanded; a closed
 * details element alone must not mount its children.
 */
export function OpeningDisclosure({
  label,
  children,
  className = 'opening-disclosure',
}: {
  label: string;
  children: ReactNode;
  className?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={className}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>{label}</summary>
      {open ? children : null}
    </details>
  );
}
