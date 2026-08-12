import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { WorkspaceServices } from '@/features/workspace/createWorkspaceController';
import { useWorkspace } from '@/features/workspace/useWorkspace';

describe('useWorkspace', () => {
  it('creates domain services once across React rerenders and disposes them on unmount', () => {
    const dispose = vi.fn();
    const services: WorkspaceServices = {
      ingestion: { start: vi.fn(), cancel: vi.fn() },
      graph: { build: vi.fn(), cancel: vi.fn(), dispose },
      engine: { initialize: vi.fn(), dispose: vi.fn() },
    };
    const createServices = vi.fn(() => services);

    const { rerender, unmount } = renderHook(() => useWorkspace(createServices));
    rerender();
    rerender();

    expect(createServices).toHaveBeenCalledTimes(1);
    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
