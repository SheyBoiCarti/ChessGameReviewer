'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';

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
  const servicesRef = useRef<WorkspaceServices | null>(null);
  const controllerRef = useRef<WorkspaceController | null>(null);

  if (servicesRef.current === null) servicesRef.current = createServices();
  if (controllerRef.current === null) {
    controllerRef.current = createWorkspaceController(servicesRef.current);
  }
  const controller = controllerRef.current;
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getState,
    controller.getState
  );

  useEffect(() => () => controller.dispose(), [controller]);

  return { controller, state };
}
