import { selectEngineResources, type EngineResourceInput } from './resourcePolicy';

export interface EngineCapability {
  mode: 'threaded' | 'single-thread' | 'unavailable';
  crossOriginIsolated: boolean;
  sharedArrayBuffer: boolean;
  simd: boolean;
  engineInitialized: boolean;
  reason?: string;
  threads: number;
  hashMb: number;
}

export interface EngineCapabilityProbe extends EngineResourceInput {
  crossOriginIsolated: boolean;
  sharedArrayBuffer: boolean;
  simd: boolean;
  threadedInitialized: boolean;
  singleThreadInitialized: boolean;
}

/** Validates a tiny module containing a SIMD instruction instead of feature-sniffing. */
export function supportsWasmSimd(): boolean {
  try {
    return WebAssembly.validate(
      new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 23, 1, 21, 0, 253, 12, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 26, 11,
      ])
    );
  } catch {
    return false;
  }
}

export function detectEngineCapability(probe: EngineCapabilityProbe): EngineCapability {
  const resources = selectEngineResources(probe);
  const threadedEligible = probe.crossOriginIsolated && probe.sharedArrayBuffer && probe.simd;
  if (threadedEligible && probe.threadedInitialized)
    return {
      ...resources,
      mode: 'threaded',
      engineInitialized: true,
      crossOriginIsolated: true,
      sharedArrayBuffer: true,
      simd: true,
    };
  if (probe.singleThreadInitialized)
    return {
      ...resources,
      mode: 'single-thread',
      threads: 1,
      engineInitialized: true,
      crossOriginIsolated: probe.crossOriginIsolated,
      sharedArrayBuffer: probe.sharedArrayBuffer,
      simd: probe.simd,
      ...(threadedEligible
        ? { reason: 'Threaded engine initialization failed; using the single-thread engine.' }
        : { reason: threadedReason(probe) }),
    };
  return {
    ...resources,
    mode: 'unavailable',
    threads: 0,
    engineInitialized: false,
    crossOriginIsolated: probe.crossOriginIsolated,
    sharedArrayBuffer: probe.sharedArrayBuffer,
    simd: probe.simd,
    reason: 'Neither the threaded nor single-thread Stockfish engine could be initialized.',
  };
}

export async function probeEngineCapability(
  environment: Omit<EngineCapabilityProbe, 'threadedInitialized' | 'singleThreadInitialized'>,
  initialize: (mode: 'threaded' | 'single-thread') => Promise<void>
): Promise<EngineCapability> {
  const eligible =
    environment.crossOriginIsolated && environment.sharedArrayBuffer && environment.simd;
  let threadedInitialized = false;
  if (eligible) {
    try {
      await initialize('threaded');
      threadedInitialized = true;
    } catch {
      // A single attempt is intentional: failed pthread startup is expensive and should fall back.
    }
  }
  if (threadedInitialized)
    return detectEngineCapability({
      ...environment,
      threadedInitialized: true,
      singleThreadInitialized: false,
    });
  try {
    await initialize('single-thread');
    return detectEngineCapability({
      ...environment,
      threadedInitialized: false,
      singleThreadInitialized: true,
    });
  } catch {
    return detectEngineCapability({
      ...environment,
      threadedInitialized: false,
      singleThreadInitialized: false,
    });
  }
}

function threadedReason(
  probe: Pick<EngineCapabilityProbe, 'crossOriginIsolated' | 'sharedArrayBuffer' | 'simd'>
): string {
  if (!probe.crossOriginIsolated)
    return 'Cross-origin isolation is unavailable; using the single-thread engine.';
  if (!probe.sharedArrayBuffer)
    return 'SharedArrayBuffer is unavailable; using the single-thread engine.';
  return 'WebAssembly SIMD is unavailable; using the single-thread engine.';
}
