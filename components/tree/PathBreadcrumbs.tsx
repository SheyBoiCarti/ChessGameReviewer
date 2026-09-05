import type { OpeningGraphSnapshot } from '@/lib/chess/graph/openingGraph';
import {
  navigateBack,
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
  const moves = navigationBreadcrumbs(graph, navigation);
  return (
    <nav className="path-breadcrumbs" aria-label="Selected move path">
      <button
        type="button"
        className="breadcrumb-btn"
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
      <button
        type="button"
        onClick={() => onNavigate(navigateBack(navigation))}
        disabled={navigation.history.length <= 1}
      >
        Back one move
      </button>
    </nav>
  );
}
