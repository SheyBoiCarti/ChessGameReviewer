import { expect, test } from '@playwright/test';
import { installWorkspaceFixtures, loadFixtureGames } from './helpers/workspaceFixtures';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installWorkspaceFixtures(page);
});

test.describe('Profile Insights Dashboard E2E', () => {
  test('navigates to insights tab, shows empty state, then populates when games are loaded', async ({
    page,
  }) => {
    await page.goto('/');

    // 1. Navigate to Insights tab before games are loaded
    await page.getByRole('button', { name: 'Insights' }).click();
    await expect(page.getByRole('region', { name: 'Insights', exact: true })).toBeVisible();
    await expect(page.getByText('No active player selected')).toBeVisible();

    // 2. Load games from Chess.com
    await page.getByRole('button', { name: 'Go to Games Tab' }).click();
    await loadFixtureGames(page, 2);
    await expect(page.getByRole('button', { name: /opponent-two/i })).toBeVisible();

    // 3. Switch back to Insights tab
    await page.getByRole('button', { name: 'Insights' }).click();
    await expect(page.getByRole('region', { name: 'Insights', exact: true })).toBeVisible();

    // 4. Verify player profile header card
    await expect(page.getByRole('heading', { name: 'Fixture User' })).toBeVisible();
    await expect(page.getByText('@fixture-user')).toBeVisible();
    await expect(page.getByText('NM')).toBeVisible();

    // 5. Verify KPI grid
    const kpiGrid = page.getByRole('region', { name: 'Performance KPIs' });
    await expect(kpiGrid).toBeVisible();
    await expect(page.getByTestId('kpi-total-games')).toContainText('2');
    await expect(page.getByTestId('kpi-win-rate')).toContainText('100%');

    // 6. Verify Rating Trend Chart
    const ratingChart = page.locator('.profile-rating-svg');
    await expect(ratingChart).toBeVisible();

    // 7. Verify Outcome Distribution
    await expect(page.getByRole('heading', { name: 'Outcome Distribution' })).toBeVisible();
    await expect(page.getByText('Overall')).toBeVisible();
    await expect(page.getByText('As White', { exact: true })).toBeVisible();
    await expect(page.getByText('As Black', { exact: true })).toBeVisible();

    // 8. Verify Top Openings
    await expect(page.getByRole('heading', { name: 'Top Openings' })).toBeVisible();

    // 9. Verify Tactics Card
    await expect(page.getByRole('heading', { name: 'Tactical Accuracy & Mistakes' })).toBeVisible();

    // 10. Filter interaction: Rapid (0 games match)
    await page.getByRole('radio', { name: 'Rapid' }).click();
    await expect(page.getByText('No games match the selected filters.')).toBeVisible();

    // Reset filters
    await page.getByRole('button', { name: 'Reset Filters' }).click();
    await expect(page.getByTestId('kpi-total-games')).toContainText('2');

    // Filter by Color: White (1 game matches)
    await page.getByRole('radio', { name: 'White' }).click();
    await expect(page.getByTestId('kpi-total-games')).toContainText('1');
    await expect(page.getByTestId('kpi-win-rate')).toContainText('100%');
  });
});
