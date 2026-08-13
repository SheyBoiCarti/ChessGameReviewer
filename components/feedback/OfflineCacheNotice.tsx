export function OfflineCacheNotice() {
  return (
    <section className="status-card status-offline" role="status">
      <span className="status-label status-label--offline">Offline cache</span>
      <p>You are viewing games saved on this device. They could not be refreshed while offline.</p>
    </section>
  );
}
