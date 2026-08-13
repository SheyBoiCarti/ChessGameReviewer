'use client';

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry(): void;
}) {
  return (
    <main className="error-page" role="alert">
      <h1>The workspace encountered an error</h1>
      <p>{error.message || 'The application could not continue.'}</p>
      <button type="button" onClick={retry}>
        Reset workspace
      </button>
    </main>
  );
}
