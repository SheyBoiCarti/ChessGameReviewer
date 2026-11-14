import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chess } from 'chess.js';
import { describe, expect, it, vi } from 'vitest';

import { OpeningTreeTable } from '@/components/tree/OpeningTreeTable';
import {
  createGraphNavigation,
  navigateCandidate,
  navigateToHistoryIndex,
  type GraphNavigationState,
} from '@/features/opening-tree/navigation';
import { openingGraphFixture, fixtureKeyAfter } from '@/tests/helpers/openingGraphFixture';
import { normalizePositionKey } from '@/lib/chess/fen';

function startFenAfter(uci: string): string {
  const chess = new Chess();
  chess.move(uci);
  return chess.fen();
}

describe('OpeningTreeTable', () => {
  it('navigates candidates by target position while preserving the selected path', async () => {
    const user = userEvent.setup();
    const graph = openingGraphFixture();
    const onNavigate = vi.fn();
    render(
      <OpeningTreeTable
        graph={graph}
        navigation={createGraphNavigation(graph)}
        perspective="user"
        onNavigate={onNavigate}
      />
    );

    const candidateResults = screen.getByRole('region', {
      name: 'Opening candidate results',
    });
    expect(candidateResults).toHaveAttribute('tabindex', '0');
    expect(candidateResults).toContainElement(
      screen.getByRole('table', { name: 'Opening candidates' })
    );
    expect(candidateResults).not.toContainElement(screen.getByLabelText(/sort candidate moves/i));
    expect(screen.queryByRole('columnheader', { name: /sample size/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /play e4/i }));

    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ positionKey: fixtureKeyAfter('e4'), pathId: 9 })
    );
  });

  it('keeps a persistent exact resource-limit notice with horizon help', async () => {
    const graph = openingGraphFixture('limited');
    render(
      <OpeningTreeTable
        graph={graph}
        navigation={createGraphNavigation(graph)}
        perspective="board"
        onNavigate={vi.fn()}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(/edge resource limit/i);
    expect(screen.getByRole('status')).toHaveTextContent(/3 included.*2 remaining/i);
    await userEvent.setup().click(screen.getByText('More statistics', { exact: true }));
    expect(screen.getByText(/maximum is 40 plies/i)).toBeInTheDocument();
  });

  it('mounts extended statistics only while expanded', async () => {
    const user = userEvent.setup();
    const graph = openingGraphFixture();
    render(
      <OpeningTreeTable
        graph={graph}
        navigation={createGraphNavigation(graph)}
        perspective="user"
        onNavigate={vi.fn()}
      />
    );
    expect(
      screen.queryByRole('table', { name: 'Detailed opening statistics' })
    ).not.toBeInTheDocument();
    await user.click(screen.getByText('More statistics', { exact: true }));
    expect(screen.getByRole('table', { name: 'Detailed opening statistics' })).toBeVisible();
    await user.click(screen.getByText('More statistics', { exact: true }));
    expect(
      screen.queryByRole('table', { name: 'Detailed opening statistics' })
    ).not.toBeInTheDocument();
  });

  it('uses visited breadcrumbs without duplicating the board playback controls', async () => {
    const graph = openingGraphFixture();
    let navigation = createGraphNavigation(graph);
    for (const uci of ['e2e4', 'e7e5']) {
      navigation = navigateCandidate(
        graph,
        navigation,
        graph.positions.get(navigation.positionKey)!.outgoing.get(uci)!
      );
    }
    const onNavigate = vi.fn();
    render(
      <OpeningTreeTable
        graph={graph}
        navigation={navigation}
        perspective="user"
        onNavigate={onNavigate}
      />
    );
    expect(screen.queryByRole('button', { name: 'Back one move' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /^e4$/ }));
    expect(onNavigate).toHaveBeenCalledWith(navigateToHistoryIndex(navigation, 1));
    expect(onNavigate.mock.calls[0]![0].history).toHaveLength(3);
  });

  it('names the serialized snapshot-size resource limit', () => {
    const graph = { ...openingGraphFixture('limited'), reachedLimit: 'maxSnapshotBytes' as const };
    render(
      <OpeningTreeTable
        graph={graph}
        navigation={createGraphNavigation(graph)}
        perspective="board"
        onNavigate={vi.fn()}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'This graph reached the snapshot size resource limit'
    );
  });

  it('shows defensive graph exclusions without exposing PGN content', () => {
    const graph = openingGraphFixture();
    render(
      <OpeningTreeTable
        graph={graph}
        navigation={createGraphNavigation(graph)}
        perspective="user"
        excludedGameCount={1}
        diagnosticCodes={['ILLEGAL_PGN']}
        onNavigate={vi.fn()}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      '1 game was excluded while building this opening graph'
    );
    expect(screen.getByRole('status')).toHaveTextContent('ILLEGAL_PGN');
  });

  it('shows terminal messaging without an empty fixed-height candidate region', () => {
    const graph = openingGraphFixture();
    let navigation = createGraphNavigation(graph);
    for (const uci of ['e2e4', 'e7e5', 'g1f3']) {
      const edge = graph.positions.get(navigation.positionKey)!.outgoing.get(uci)!;
      navigation = navigateCandidate(graph, navigation, edge);
    }
    render(
      <OpeningTreeTable
        graph={graph}
        navigation={navigation}
        perspective="user"
        onNavigate={vi.fn()}
      />
    );

    expect(screen.getByText(/no candidate moves are available/i)).toBeVisible();
    expect(
      screen.queryByRole('region', { name: 'Opening candidate results' })
    ).not.toBeInTheDocument();
  });

  it('clears candidates and memberships for an unobserved visited entry (T38)', () => {
    const graph = openingGraphFixture();
    const navigation: GraphNavigationState = {
      ...createGraphNavigation(graph),
      positionKey: normalizePositionKey(startFenAfter('a2a3')),
      fen: startFenAfter('a2a3'),
      pathId: null,
      uci: 'a2a3',
      san: 'a3',
      observed: false,
    };
    render(
      <OpeningTreeTable
        graph={graph}
        navigation={navigation}
        perspective="user"
        moveOrdersAction={<button type="button">View move orders</button>}
        onNavigate={vi.fn()}
      />
    );

    // Neither root candidates nor root statistics leak into the unknown position.
    expect(screen.queryByRole('table', { name: 'Opening candidates' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /play e4/i })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/no observed games reach this position/i);
  });
});
