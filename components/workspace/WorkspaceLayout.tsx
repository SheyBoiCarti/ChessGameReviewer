import type { ReactNode } from 'react';

export function WorkspaceLayout({
  utility,
  board,
  tabs,
  panel,
}: {
  utility: ReactNode;
  board: ReactNode;
  tabs: ReactNode;
  panel: ReactNode;
}) {
  return (
    <div className={`workspace-layout${!board ? ' workspace-layout--no-board' : ''}`}>
      <div className="workspace-layout__utility">{utility}</div>
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
