import { ClientWorkspaceLoader } from '@/components/workspace/ClientWorkspaceLoader';

export default function Home() {
  return (
    <div className="workspace-root">
      <ClientWorkspaceLoader />
    </div>
  );
}
