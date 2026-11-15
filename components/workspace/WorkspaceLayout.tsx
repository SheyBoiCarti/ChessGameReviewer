import type { JSX, ReactNode } from 'react';

export interface WorkspaceLayoutProps {
  board?: ReactNode;
  header?: ReactNode;
  feedback?: ReactNode;
  review?: boolean;
  opening?: boolean;
  tabs?: ReactNode;
  panel: ReactNode;
}

export function WorkspaceLayout({
  board,
  header,
  feedback,
  review = false,
  opening = false,
  tabs,
  panel,
}: WorkspaceLayoutProps): JSX.Element {
  return (
    <div
      className={`workspace-layout${!board ? ' workspace-layout--no-board' : ''}${review && board ? ' workspace-layout--review' : ''}${opening && board ? ' workspace-layout--opening' : ''}`}
    >
      <div className="workspace-layout__header">{header}</div>
      {board ? (
        <section className="workspace-layout__board" aria-label="Board focal region">
          {board}
        </section>
      ) : null}
      <div className="workspace-layout__sidebar">
        <div className="workspace-layout__feedback">{feedback}</div>
        <section className="workspace-layout__context" aria-label="Contextual workspace">
          {tabs}
          {panel}
        </section>
      </div>
    </div>
  );
}
