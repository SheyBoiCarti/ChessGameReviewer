import type { JSX, ReactNode } from 'react';

export interface WorkspaceLayoutProps {
  board?: ReactNode;
  tabs?: ReactNode;
  panel: ReactNode;
}

export function WorkspaceLayout({ board, tabs, panel }: WorkspaceLayoutProps): JSX.Element {
  return (
    <div className={`workspace-layout${!board ? ' workspace-layout--no-board' : ''}`}>
      {board ? (
        <section className="workspace-layout__board" aria-label="Board focal region">
          {board}
        </section>
      ) : null}
      <section className="workspace-layout__context" aria-label="Contextual workspace">
        {tabs}
        {panel}
      </section>
    </div>
  );
}
