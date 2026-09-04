'use client';

export default function ErrorPage({ retry }: { retry(): void }) {
  return (
    <main className="error-page" role="alert">
      <p className="app-topbar__eyebrow">Workspace interrupted</p>
      <h1>We couldn’t finish loading this review.</h1>
      <p>Your locally stored games are still on this device. Try loading the workspace again.</p>
      <button type="button" className="button-primary" onClick={retry}>
        Try again
      </button>
    </main>
  );
}
