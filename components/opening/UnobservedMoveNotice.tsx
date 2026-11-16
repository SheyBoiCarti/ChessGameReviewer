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
    <div className="unobserved-move-notice surface-panel" role="status">
      <p className="unobserved-move-notice__message">
        You’re exploring beyond your imported opening tree after <strong>{san}</strong>. Keep
        playing legal moves to analyse this variation.
      </p>
      <button type="button" className="unobserved-move-notice__return-button" onClick={onReturn}>
        Return to observed opening tree
      </button>
    </div>
  );
}
