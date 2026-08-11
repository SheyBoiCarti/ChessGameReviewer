import { IsolationStatus } from '@/components/IsolationStatus';

export default function Home() {
  return (
    <div className="shell-container">
      <header className="header">
        <h1>Chess.com Game Analyzer</h1>
        <p className="subtitle">
          Browser-based direct Chess.com game ingestion, opening tree explorer, and local Stockfish
          analysis.
        </p>
      </header>

      <section className="notice-banner" data-testid="unaffiliated-notice">
        <span className="notice-title">Unaffiliated Product Notice</span>
        <p className="notice-content">
          This application is completely unaffiliated with Chess.com. All public chess game archives
          are fetched directly from the official Chess.com Published Data API via browser CORS
          requests.
        </p>
      </section>

      <section className="privacy-card" data-testid="privacy-summary">
        <h2 className="privacy-title">Local Storage & Privacy</h2>
        <p className="privacy-text">
          Your requested games, opening tree structures, and engine evaluations are stored locally
          on your device in browser IndexedDB. No game data, raw PGNs, or Stockfish evaluations are
          ever uploaded to any server. You can inspect or clear your data locally at any time.
        </p>
      </section>

      <IsolationStatus />

      <main className="main-content">
        <p>Phase 1 Foundation Shell Initialized</p>
      </main>
    </div>
  );
}
