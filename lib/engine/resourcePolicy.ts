export interface EngineResourceInput {
  hardwareConcurrency?: number;
  deviceMemoryGb?: number;
  mobile?: boolean;
}

export interface EngineResources {
  threads: number;
  hashMb: number;
}

/** Chooses conservative, per-engine limits. The scheduler always owns one engine. */
export function selectEngineResources(input: EngineResourceInput): EngineResources {
  const cores = finitePositiveInteger(input.hardwareConcurrency);
  const threads = Math.max(1, Math.min(4, (cores ?? 2) - 1));
  const memory = input.deviceMemoryGb;
  const mobile = input.mobile === true;
  const hashMb = mobile || (memory !== undefined && memory <= 2) ? 16 : memory !== undefined && memory >= 8 ? 64 : 32;
  return { threads, hashMb };
}

function finitePositiveInteger(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value >= 1 ? Math.floor(value) : undefined;
}
