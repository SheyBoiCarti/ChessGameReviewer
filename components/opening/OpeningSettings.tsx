'use client';

import { useEffect, useId, useState } from 'react';

/** Preference remains available before import and in Openings. */
export function OpeningSettings({
  value,
  onChange,
  disabled = false,
  draft,
  onDraftChange,
  error,
}: {
  value: number;
  onChange?: ((value: number) => void) | undefined;
  disabled?: boolean;
  draft?: string;
  onDraftChange?(draft: string): void;
  error?: string | null;
}) {
  const id = useId();
  const [localDraft, setLocalDraft] = useState(String(value));
  const [localError, setLocalError] = useState<string | null>(null);
  useEffect(() => {
    setLocalDraft(String(value));
  }, [value]);
  const message = error || localError;
  return (
    <details className="opening-settings" open={message ? true : undefined}>
      <summary>Advanced opening settings</summary>
      <div className="field">
        <label htmlFor={id}>Opening horizon (plies)</label>
        <input
          id={id}
          type="number"
          min="2"
          max="40"
          value={draft ?? localDraft}
          disabled={disabled}
          aria-describedby={message ? `${id}-error` : undefined}
          onChange={(event) => {
            const text = event.currentTarget.value;
            setLocalDraft(text);
            onDraftChange?.(text);
            const number = Number(text);
            if (Number.isInteger(number) && number >= 2 && number <= 40) {
              setLocalError(null);
              onChange?.(number);
            }
          }}
          onBlur={(event) => {
            const number = Number(event.currentTarget.value);
            setLocalError(
              Number.isInteger(number) && number >= 2 && number <= 40
                ? null
                : 'Choose a whole number from 2 to 40 plies.'
            );
          }}
        />
        {message ? (
          <p id={`${id}-error`} className="field-error">
            {message}
          </p>
        ) : null}
      </div>
    </details>
  );
}
