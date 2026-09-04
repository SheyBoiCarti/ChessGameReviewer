import type { AnalysisStrength } from '@/features/workspace/types';

export function AnalysisSettings({
  strength,
  disabled,
  onChange,
}: {
  strength: AnalysisStrength;
  disabled: boolean;
  onChange(value: AnalysisStrength): void;
}) {
  return (
    <label>
      Analysis strength
      <select
        value={strength}
        onChange={(event) => onChange(event.currentTarget.value as AnalysisStrength)}
        disabled={disabled}
      >
        <option value="quick">Quick — a fast overview</option>
        <option value="balanced">Balanced — recommended</option>
        <option value="deep">Deep — more thorough</option>
      </select>
    </label>
  );
}
