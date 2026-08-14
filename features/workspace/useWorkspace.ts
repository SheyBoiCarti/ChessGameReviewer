'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

import {
  createWorkspaceController,
  type WorkspaceController,
  type WorkspaceServices,
} from './createWorkspaceController';

export interface UseWorkspaceResult {
  controller: WorkspaceController;
  state: ReturnType<WorkspaceController['getState']>;
}

export function useWorkspace(createServices: () => WorkspaceServices): UseWorkspaceResult {
  const [controller] = useState(() => createWorkspaceController(createServices()));
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState
  );

  useEffect(() => {
    return () => {
      controller.dispose();
    };
  }, [controller]);

  return { controller, state };
}
