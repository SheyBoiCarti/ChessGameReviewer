'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react';

import type { PathStore } from '@/lib/chess/graph/pathStore';
import type { PositionNode } from '@/lib/chess/graph/types';
import { selectArrivalOrders, type OutcomePerspective } from '@/features/opening-tree/selectors';

export function MoveOrderDialog({
  node,
  paths,
  perspective,
  returnFocusRef,
  onClose,
}: {
  node: PositionNode;
  paths: PathStore;
  perspective: OutcomePerspective;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose(): void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [sort, setSort] = useState<'frequency' | 'outcome'>('frequency');
  const rows = useMemo(() => {
    const arrivals = selectArrivalOrders(node, paths);
    return sort === 'frequency'
      ? arrivals
      : [...arrivals].sort((left, right) => {
          const leftScore =
            perspective === 'user' ? left.metrics.userScore : left.metrics.whiteScore;
          const rightScore =
            perspective === 'user' ? right.metrics.userScore : right.metrics.whiteScore;
          return (rightScore ?? -1) - (leftScore ?? -1);
        });
  }, [node, paths, perspective, sort]);

  useEffect(() => {
    dialogRef.current?.focus();
    const backdrop = dialogRef.current?.closest('.modal-backdrop');
    const siblings = backdrop?.parentElement
      ? [...backdrop.parentElement.children].filter((element) => element !== backdrop)
      : [];
    for (const sibling of siblings) sibling.setAttribute('inert', '');
    return () => {
      for (const sibling of siblings) sibling.removeAttribute('inert');
    };
  }, []);

  const close = () => {
    onClose();
    returnFocusRef.current?.focus();
  };

  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button, select')].filter(
      (element) => !element.hasAttribute('disabled')
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-orders-title"
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={keyDown}
      >
        <h3 id="move-orders-title">Move orders to this position</h3>
        <label>
          Sort move orders
          <select
            value={sort}
            onChange={(event) => setSort(event.currentTarget.value as typeof sort)}
            disabled={!rows.some((row) => row.metrics.sampleSize > 0)}
          >
            <option value="frequency">Frequency</option>
            <option value="outcome">Outcome</option>
          </select>
        </label>
        <table>
          <thead>
            <tr>
              <th>Move order</th>
              <th>Frequency and outcomes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.moves.map(({ uci }) => uci).join(' ')}>
                <td>{row.moves.map(({ san }) => san).join(' ') || 'Root position'}</td>
                <td>{arrivalSummary(row.metrics, perspective)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" onClick={close}>
          Close move orders
        </button>
      </div>
    </div>
  );
}

function arrivalSummary(
  metrics: ReturnType<typeof selectArrivalOrders>[number]['metrics'],
  perspective: OutcomePerspective
): string {
  const winRate = perspective === 'user' ? metrics.userWinRate : metrics.whiteWinRate;
  const lossRate = perspective === 'user' ? metrics.userLossRate : metrics.blackWinRate;
  const winLabel = perspective === 'user' ? 'user wins' : 'White wins';
  const lossLabel = perspective === 'user' ? 'user losses' : 'Black wins';
  return `${metrics.sampleSize} games; ${winLabel} ${percent(winRate)}, draws ${percent(metrics.drawRate)}, ${lossLabel} ${percent(lossRate)}`;
}

function percent(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(0)}%`;
}
