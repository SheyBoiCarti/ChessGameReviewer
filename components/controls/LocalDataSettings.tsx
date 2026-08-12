'use client';

import { useState } from 'react';

interface StoredUserSummary {
  username: string;
  approximateBytes?: number;
}

type Confirmation = { kind: 'user'; username: string } | { kind: 'all' };

export function LocalDataSettings({
  users,
  onDeleteUsername,
  onClearAll,
}: {
  users: readonly StoredUserSummary[];
  onDeleteUsername(username: string): Promise<{ gamesDeleted: number }>;
  onClearAll(): Promise<unknown>;
}) {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [message, setMessage] = useState<{ kind: 'status' | 'alert'; text: string } | null>(null);

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
    <section className="settings-card" aria-labelledby="local-data-heading">
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
                onClick={() => setConfirmation({ kind: 'user', username: user.username })}
              >
                Delete {user.username} data
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No stored usernames were found.</p>
      )}
      <button type="button" onClick={() => setConfirmation({ kind: 'all' })}>
        Clear all local data
      </button>
      {message ? <p role={message.kind}>{message.text}</p> : null}
      {confirmation ? (
        <div role="dialog" aria-modal="true" aria-labelledby="delete-data-title">
          <h4 id="delete-data-title">Delete local data?</h4>
          <p>This removes games and analysis from this device and cannot be undone.</p>
          <button type="button" onClick={() => void confirm()}>
            {confirmation.kind === 'all' ? 'Confirm clear all' : 'Confirm delete'}
          </button>
          <button type="button" onClick={() => setConfirmation(null)}>
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
