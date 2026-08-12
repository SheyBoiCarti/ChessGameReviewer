import { describe, expect, it } from 'vitest';

import {
  detectEngineCapability,
  probeEngineCapability,
  supportsWasmSimd,
} from '../../../lib/engine/capabilities';
import { selectEngineResources } from '../../../lib/engine/resourcePolicy';

describe('engine capability and resource policy', () => {
  it('does not choose threads merely because SharedArrayBuffer exists', () => {
    expect(
      detectEngineCapability({
        crossOriginIsolated: false,
        sharedArrayBuffer: true,
        simd: true,
        threadedInitialized: true,
        singleThreadInitialized: true,
        hardwareConcurrency: 8,
      }).mode
    ).toBe('single-thread');
  });

  it('uses one successful single-thread fallback when threaded initialization fails', () => {
    expect(
      detectEngineCapability({
        crossOriginIsolated: true,
        sharedArrayBuffer: true,
        simd: true,
        threadedInitialized: false,
        singleThreadInitialized: true,
        hardwareConcurrency: 8,
      })
    ).toMatchObject({ mode: 'single-thread', engineInitialized: true, threads: 1 });
  });

  it('reports an actionable unavailable state when both variants fail', () => {
    expect(
      detectEngineCapability({
        crossOriginIsolated: true,
        sharedArrayBuffer: true,
        simd: true,
        threadedInitialized: false,
        singleThreadInitialized: false,
        hardwareConcurrency: 8,
      })
    ).toMatchObject({ mode: 'unavailable', engineInitialized: false, reason: expect.any(String) });
  });

  it('clamps threaded resources and applies the mobile hash budget', () => {
    expect(
      selectEngineResources({ hardwareConcurrency: 99, deviceMemoryGb: 2, mobile: true })
    ).toEqual({
      threads: 4,
      hashMb: 16,
    });
    expect(selectEngineResources({})).toEqual({
      threads: 1,
      hashMb: 32,
    });
  });

  it('uses WebAssembly validation for SIMD capability rather than feature presence', () => {
    expect(typeof supportsWasmSimd()).toBe('boolean');
  });

  it('probes threaded initialization before accepting a threaded engine', async () => {
    const attempts: string[] = [];
    await expect(
      probeEngineCapability(
        { crossOriginIsolated: true, sharedArrayBuffer: true, simd: true },
        async (mode) => void attempts.push(mode)
      )
    ).resolves.toMatchObject({ mode: 'threaded' });
    expect(attempts).toEqual(['threaded']);
  });

  it('falls back after a failed threaded probe and reports total startup failure', async () => {
    const modes: string[] = [];
    await expect(
      probeEngineCapability(
        { crossOriginIsolated: true, sharedArrayBuffer: true, simd: true },
        async (mode) => {
          modes.push(mode);
          if (mode === 'threaded') throw new Error('pthread unavailable');
        }
      )
    ).resolves.toMatchObject({ mode: 'single-thread' });
    expect(modes).toEqual(['threaded', 'single-thread']);
    await expect(
      probeEngineCapability(
        { crossOriginIsolated: false, sharedArrayBuffer: false, simd: false },
        async () => {
          throw new Error('unavailable');
        }
      )
    ).resolves.toMatchObject({ mode: 'unavailable' });
  });
});
