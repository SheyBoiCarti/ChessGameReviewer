'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';

import type { PromotionPiece } from '@/features/board/moves';
import type { PlayerColor } from '@/lib/engine/evaluation';

export interface PromotionDialogProps {
  isOpen: boolean;
  color: PlayerColor;
  onSelect(piece: PromotionPiece): void;
  onCancel(): void;
}

const pieceOptions: Array<{ piece: PromotionPiece; label: string; codeSuffix: string }> = [
  { piece: 'q', label: 'Queen', codeSuffix: 'q' },
  { piece: 'r', label: 'Rook', codeSuffix: 'r' },
  { piece: 'b', label: 'Bishop', codeSuffix: 'b' },
  { piece: 'n', label: 'Knight', codeSuffix: 'n' },
];

export function PromotionDialog({
  isOpen,
  color,
  onSelect,
  onCancel,
}: PromotionDialogProps): React.JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      firstButtonRef.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  const prefix = color === 'white' ? 'w' : 'b';

  return (
    <div className="modal-backdrop" onKeyDown={handleKeyDown}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Promote pawn"
        className="modal promotion-dialog surface-panel"
      >
        <h3 className="promotion-dialog__title">Promote pawn</h3>
        <div className="promotion-dialog__choices">
          {pieceOptions.map((opt, index) => (
            <button
              key={opt.piece}
              ref={index === 0 ? firstButtonRef : undefined}
              type="button"
              className="promotion-dialog__button"
              onClick={() => onSelect(opt.piece)}
              aria-label={opt.label}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/chess-pieces/${prefix}${opt.codeSuffix}.svg`}
                alt=""
                className="promotion-dialog__piece-icon"
                draggable={false}
              />
              <span className="promotion-dialog__piece-name">{opt.label}</span>
            </button>
          ))}
        </div>
        <button type="button" className="promotion-dialog__cancel-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
