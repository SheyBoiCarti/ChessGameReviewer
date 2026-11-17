import type { OpeningGraphSnapshot } from '@/lib/chess/graph/openingGraph';
import {
  navigateToHistoryIndex,
  navigationBreadcrumbs,
  type GraphNavigationState,
} from '@/features/opening-tree/navigation';

export function PathBreadcrumbs({
  graph,
  navigation,
  onNavigate,
}: {
  graph: OpeningGraphSnapshot;
  navigation: GraphNavigationState;
  onNavigate(value: GraphNavigationState): void;
}) {
  // T37: notation derives from the visited sequence, never from a stored path.
  const moves = navigationBreadcrumbs(graph, navigation);
  return (
    <nav className="path-breadcrumbs" aria-label="Opening move history">
      <p className="opening-notation" aria-hidden="true">
        {moves.length === 0 ? 'Start' : moves.join(' ')}
      </p>
      <div className="breadcrumb-controls">
        <button
          type="button"
          className="breadcrumb-btn"
          aria-current={navigation.cursor === 0 ? 'location' : undefined}
          onClick={() => onNavigate(navigateToHistoryIndex(navigation, 0))}
        >
          Starting position
        </button>
        {moves.map((move, index) => (
          <span key={`${move}-${index}`}>
            <span aria-hidden="true"> / </span>
            <button
              type="button"
              onClick={() => onNavigate(navigateToHistoryIndex(navigation, index + 1))}
              aria-current={index === moves.length - 1 ? 'location' : undefined}
            >
              {move}
            </button>
          </span>
        ))}
      </div>
    </nav>
  );
}
