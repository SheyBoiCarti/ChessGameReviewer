'use client';

export default function GlobalError({ retry }: { retry(): void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#0b1220',
          color: '#f8fafc',
          fontFamily: 'system-ui, sans-serif',
          padding: '1.5rem',
        }}
      >
        <main style={{ maxWidth: '34rem' }}>
          <p style={{ color: '#f2c14e', fontWeight: 700, letterSpacing: '0.08em' }}>
            CHESS GAME REVIEWER
          </p>
          <h1>Something interrupted the application.</h1>
          <p>Try again to reopen your private, local review workspace.</p>
          <button
            type="button"
            onClick={retry}
            style={{ padding: '0.75rem 1rem', cursor: 'pointer' }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
