import type { EngineCapability } from '@/lib/engine/capabilities';

export function EngineStatus({
  capability,
  engineBuild,
  limitLabel,
  multiPv,
  heuristicVersion,
  jobStatus,
}: {
  capability: EngineCapability | null;
  engineBuild: string;
  limitLabel: string;
  multiPv: number;
  heuristicVersion: string;
  jobStatus: string;
}) {
  if (!capability) return <p role="status">Checking engine capability…</p>;
  if (capability.mode === 'unavailable') {
    return (
      <div className="engine-status engine-unavailable" role="alert">
        <strong>Engine unavailable.</strong> {capability.reason ?? 'Stockfish could not start.'} The
        opening tree remains available.
      </div>
    );
  }
  return (
    <dl className="engine-status">
      <div>
        <dt>Engine version</dt>
        <dd>{engineBuild}</dd>
      </div>
      <div>
        <dt>Performance mode</dt>
        <dd>{capability.mode}</dd>
      </div>
      <div>
        <dt>Threads</dt>
        <dd>{capability.threads}</dd>
      </div>
      <div>
        <dt>Review limit</dt>
        <dd>{limitLabel}</dd>
      </div>
      <div>
        <dt>Lines compared</dt>
        <dd>{multiPv}</dd>
      </div>
      <div>
        <dt>Scoring model</dt>
        <dd>{heuristicVersion}</dd>
      </div>
      <div>
        <dt>Current job</dt>
        <dd>{jobStatus}</dd>
      </div>
    </dl>
  );
}
