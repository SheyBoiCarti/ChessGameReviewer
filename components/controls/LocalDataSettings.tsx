'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { WorkspaceState } from '@/features/workspace/types';

interface StoredUserSummary {
  username: string;
  approximateBytes?: number;
}

type Confirmation = { kind: 'user'; username: string } | { kind: 'all' };

export function LocalDataSettings({
  users,
  maintenance,
  onDeleteUsername,
  onClearAll,
}: {
  users: readonly StoredUserSummary[];
  maintenance: WorkspaceState['dataMaintenance'];
  onDeleteUsername(username: string): Promise<{ gamesDeleted: number }>;
  onClearAll(): Promise<unknown>;
}) {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [message, setMessage] = useState<{ kind: 'status' | 'alert'; text: string } | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (confirmation) dialogRef.current?.focus();
  }, [confirmation]);

  useEffect(() => {
    if (maintenance.status !== 'idle') setConfirmation(null);
  }, [maintenance.status]);

  const maintenanceActive = maintenance.status !== 'idle';

  const closeConfirmation = () => {
    setConfirmation(null);
    queueMicrotask(() => triggerRef.current?.focus());
  };

  const dialogKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeConfirmation();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button')];
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
  };

  const confirm = async () => {
    if (!confirmation) return;
    const target = confirmation;
    setConfirmation(null);
    try {
      if (target.kind === 'user') {
        const result = await onDeleteUsername(target.username);
        setMessage({
          kind: 'status',
          text: `Deleted ${result.gamesDeleted} games for ${target.username}.`,
        });
      } else {
        await onClearAll();
        setMessage({ kind: 'status', text: 'All local games and analysis were deleted.' });
      }
    } catch (error) {
      setMessage({
        kind: 'alert',
        text: error instanceof Error ? error.message : 'Local data could not be deleted.',
      });
    }
  };

  return (
    <section className="settings-card surface-panel" aria-labelledby="local-data-heading">
      <h3 id="local-data-heading">Local data</h3>
      <p>Games, opening graphs, and engine analysis stay on this device until you delete them.</p>
      {users.length > 0 ? (
        <ul>
          {users.map((user) => (
            <li key={user.username}>
              <span>
                {user.username}
                {user.approximateBytes === undefined
                  ? ''
                  : ` — approximately ${formatBytes(user.approximateBytes)}`}
              </span>
              <button
                type="button"
                disabled={maintenanceActive}
                onClick={(event) => {
                  triggerRef.current = event.currentTarget;
                  setConfirmation({ kind: 'user', username: user.username });
                }}
              >
                Delete {user.username} data
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No stored usernames were found.</p>
      )}
      <button
        type="button"
        disabled={maintenanceActive}
        onClick={(event) => {
          triggerRef.current = event.currentTarget;
          setConfirmation({ kind: 'all' });
        }}
      >
        Clear all local data
      </button>
      {maintenance.status === 'deleting-user' ? <p role="status">Deleting local data…</p> : null}
      {maintenance.status === 'clearing-all' ? <p role="status">Clearing all local data…</p> : null}
      {maintenance.error ? <p role="alert">{maintenance.error}</p> : null}
      {message ? <p role={message.kind}>{message.text}</p> : null}
      {confirmation ? (
        <div
          className="modal local-data-confirmation"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-data-title"
          ref={dialogRef}
          tabIndex={-1}
          onKeyDown={dialogKeyDown}
        >
          <h4 id="delete-data-title">Delete local data?</h4>
          <p>This removes games and analysis from this device and cannot be undone.</p>
          <button type="button" disabled={maintenanceActive} onClick={() => void confirm()}>
            {confirmation.kind === 'all' ? 'Confirm clear all' : 'Confirm delete'}
          </button>
          <button type="button" onClick={closeConfirmation}>
            Keep data
          </button>
        </div>
      ) : null}
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
