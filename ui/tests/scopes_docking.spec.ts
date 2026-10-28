import { test, expect, type Page } from '@playwright/test';

const insideFrame = (el: Element) => el.closest('[data-testid="live-monitor-container"]') !== null;

async function boot(page: Page) {
  await page.setViewportSize({ width: 1600, height: 950 });
  await page.addInitScript(() => {
    sessionStorage.setItem('vhs_studio_eula_session_accepted', 'true');
    localStorage.setItem('vhs_studio_eula_accepted', 'true');
  });
  // Anchored to the API root so Vite module paths such as /src/api/*.ts are never intercepted.
  await page.route(/localhost:\d+\/api\//, (route) => route.fulfill({ json: {} }));
  await page.route('http://localhost:5173/api/token', (route) => route.fulfill({ json: { token: 'mock' } }));
  await page.route('http://localhost:5173/api/status', (route) =>
    route.fulfill({
      json: {
        vapoursynth_available: true,
        obs_connected: false,
        obs_installed: true,
        raw_files: [{ name: 'Fita.mkv', path: 'C:/VHS/raw/Fita.mkv', size_mb: 100 }],
        process_running: false,
        process_logs: [],
        health: { dropped_frames: 0, fps: 59.94, cpu: 12.4 },
      },
    })
  );
  await page.goto('http://localhost:5173');
  await expect(page.getByTestId('live-monitor-container')).toBeVisible();
}

test.describe('Oscilloscope docking & workspace panels', () => {
  test('floating by default: outside the preview frame and draggable within the window', async ({ page }) => {
    await boot(page);
    await page.getByTestId('toggle-scopes-btn').click();
    const panel = page.getByTestId('broadcast-scopes-panel');
    await expect(panel).toBeVisible();
    expect(await panel.evaluate(insideFrame)).toBe(false);

    const before = (await panel.boundingBox())!;
    const header = (await panel.locator('div').first().boundingBox())!;
    await page.mouse.move(header.x + 30, header.y + 10);
    await page.mouse.down();
    await page.mouse.move(header.x - 400, header.y + 120, { steps: 8 });
    await page.mouse.up();
    const after = (await panel.boundingBox())!;
    expect(after.x).toBeLessThan(before.x - 200);
    expect(after.x).toBeGreaterThanOrEqual(0);
  });

  test('docked: video and scopes side by side, and the dock button round-trips', async ({ page }) => {
    await boot(page);
    const container = page.getByTestId('live-monitor-container');
    const fullWidth = (await container.boundingBox())!.width;

    await page.getByTestId('toggle-scopes-btn').click();
    await page.getByTestId('toggle-dock-scopes-btn').click();

    const panel = page.getByTestId('broadcast-scopes-panel');
    const cb = (await container.boundingBox())!;
    const pb = (await panel.boundingBox())!;
    expect(cb.width).toBeLessThan(fullWidth - 150);
    expect(pb.x).toBeGreaterThanOrEqual(cb.x + cb.width - 2);

    await page.getByTestId('toggle-dock-scopes-btn').click();
    expect(await page.getByTestId('broadcast-scopes-panel').evaluate(insideFrame)).toBe(false);
    const widened = (await container.boundingBox())!.width;
    expect(widened).toBeGreaterThan(cb.width + 150);
  });

  test('maximized floating scopes cover the preview but never the transport controls', async ({ page }) => {
    await boot(page);
    await page.getByTestId('toggle-scopes-btn').click();
    const panel = page.getByTestId('broadcast-scopes-panel');
    await panel.getByRole('button', { name: /maxim/i }).click();

    const play = page.getByTestId('live-play-toggle-btn');
    const pb = (await panel.boundingBox())!;
    const playBox = (await play.boundingBox())!;
    expect(pb.y + pb.height).toBeLessThanOrEqual(playBox.y + 1);

    const topTestId = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid'),
      [playBox.x + playBox.width / 2, playBox.y + playBox.height / 2]
    );
    expect(topTestId).toBe('live-play-toggle-btn');
  });

  test('hiding the right panel gives the monitor the full width, and scopes then open docked', async ({ page }) => {
    await boot(page);
    const container = page.getByTestId('live-monitor-container');
    const narrow = (await container.boundingBox())!.width;

    await page.getByTestId('toggle-right-panel-btn').click();
    await expect.poll(async () => (await container.boundingBox())!.width).toBeGreaterThan(narrow + 200);

    await page.getByTestId('toggle-scopes-btn').click();
    const panel = page.getByTestId('broadcast-scopes-panel');
    const cb = (await container.boundingBox())!;
    const pb = (await panel.boundingBox())!;
    expect(pb.x).toBeGreaterThanOrEqual(cb.x + cb.width - 2);
  });

  test('A/B dual layout shows RAW and RESTAURADO side by side with an explanatory tooltip', async ({ page }) => {
    await boot(page);
    await page.getByTestId('toggle-split-view-btn').click();
    const dual = page.getByTestId('split-layout-dual-btn');
    await expect(dual).toHaveAttribute('title', /.+/);
    await dual.click();
    await expect(page.getByTestId('split-divider-line')).toHaveCount(0);
    await expect(page.getByTestId('split-comparison-monitor')).toBeVisible();
  });
});
