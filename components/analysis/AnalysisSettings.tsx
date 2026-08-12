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
        <option value="quick">Quick — depth 10, one PV</option>
        <option value="balanced">Balanced — depth 14, two PVs</option>
        <option value="deep">Deep — 3 seconds, three PVs</option>
      </select>
    </label>
  );
}
