'use client';

import type React from 'react';

export interface UnobservedMoveNoticeProps {
  san: string;
  onReturn(): void;
}

export function UnobservedMoveNotice({
  san,
  onReturn,
}: UnobservedMoveNoticeProps): React.JSX.Element {
  return (
    <div className="unobserved-move-notice surface-panel" role="alert">
      <p className="unobserved-move-notice__message">
        The move <strong>{san}</strong> was not played in any imported games.
      </p>
      <button
        type="button"
        className="unobserved-move-notice__return-button"
        onClick={onReturn}
      >
        Return to observed opening tree
      </button>
    </div>
  );
}
