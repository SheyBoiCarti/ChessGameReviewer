import { ClientWorkspaceLoader } from '@/components/workspace/ClientWorkspaceLoader';

export default function Home() {
  return (
    <div className="app-shell">
      <header className="app-topbar" aria-label="Local Chess Game Reviewer">
        <div className="app-topbar__content shell-container">
          <div>
            <p className="app-topbar__eyebrow">Local analysis workspace</p>
            <h1>Local Chess Game Reviewer</h1>
          </div>
          <p className="subtitle">
            Review Chess.com games, explore your openings, and analyse key moments with Stockfish —
            entirely in your browser.
          </p>
        </div>
      </header>

      <main className="workspace-canvas shell-container">
        <ClientWorkspaceLoader />
      </main>
    </div>
  );
}
