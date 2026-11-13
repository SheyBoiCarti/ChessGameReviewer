import type { JSX, ReactNode } from 'react';

export interface WorkspaceLayoutProps {
  board?: ReactNode;
  header?: ReactNode;
  tabs?: ReactNode;
  panel: ReactNode;
}

export function WorkspaceLayout({ board, header, tabs, panel }: WorkspaceLayoutProps): JSX.Element {
  return (
    <div className={`workspace-layout${!board ? ' workspace-layout--no-board' : ''}`}>
      <div className="workspace-layout__header">{header}</div>
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
