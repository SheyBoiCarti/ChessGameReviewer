import type { JSX, ReactNode } from 'react';

export interface WorkspaceLayoutProps {
  board?: ReactNode;
  header?: ReactNode;
  feedback?: ReactNode;
  review?: boolean;
  tabs?: ReactNode;
  panel: ReactNode;
}

export function WorkspaceLayout({
  board,
  header,
  feedback,
  review = false,
  tabs,
  panel,
}: WorkspaceLayoutProps): JSX.Element {
  return (
    <div
      className={`workspace-layout${!board ? ' workspace-layout--no-board' : ''}${review && board ? ' workspace-layout--review' : ''}`}
    >
      <div className="workspace-layout__header">{header}</div>
      <div className="workspace-layout__feedback">{feedback}</div>
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
