'use client';

import { useEffect, useState } from 'react';

export function IsolationStatus() {
  const [isIsolated, setIsIsolated] = useState<boolean | null>(null);

  useEffect(() => {
    setIsIsolated(window.crossOriginIsolated);
  }, []);

  return (
    <div data-testid="isolation-status" className="isolation-status">
      <span className="isolation-label">Cross-Origin Isolation:</span>{' '}
      {isIsolated === null ? (
        <span data-testid="isolation-state">Checking...</span>
      ) : isIsolated ? (
        <span data-testid="isolation-state" className="status-enabled">
          Enabled (COOP/COEP active)
        </span>
      ) : (
        <span data-testid="isolation-state" className="status-disabled">
          Disabled
        </span>
      )}
    </div>
  );
}
