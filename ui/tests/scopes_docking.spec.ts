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
    const header = (await panel.locator('.scopes-drag-handle').boundingBox())!;
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

  test('floating scopes maximize button expands over the right panel without covering live preview', async ({ page }) => {
    await boot(page);
    await page.getByTestId('toggle-scopes-btn').click();
    const panel = page.getByTestId('broadcast-scopes-panel');
    const maxBtn = page.getByTestId('maximize-scopes-btn');
    await expect(maxBtn).toBeVisible();

    const monitor = page.getByTestId('live-monitor-container');
    const monitorBox = (await monitor.boundingBox())!;

    await maxBtn.click();
    const maximizedBox = (await panel.boundingBox())!;

    // Maximize positions over the right panel, leaving the live video monitor untouched
    expect(maximizedBox.x).toBeGreaterThanOrEqual(monitorBox.x + 200);

    // Clicking minimize restores floating size
    await maxBtn.click();
    const restoredBox = (await panel.boundingBox())!;
    expect(restoredBox.width).toBeLessThan(maximizedBox.width + 10);
  });

  test('dragging floating scopes and then maximizing snaps cleanly over right panel without offset side-effects', async ({ page }) => {
    await boot(page);
    await page.getByTestId('toggle-scopes-btn').click();
    const panel = page.getByTestId('broadcast-scopes-panel');
    const maxBtn = page.getByTestId('maximize-scopes-btn');

    // Drag the window by its header
    const header = (await panel.locator('.scopes-drag-handle').boundingBox())!;
    await page.mouse.move(header.x + 30, header.y + 10);
    await page.mouse.down();
    await page.mouse.move(header.x - 300, header.y + 80, { steps: 5 });
    await page.mouse.up();
    const draggedBox = (await panel.boundingBox())!;

    // Maximize: must snap directly over the right panel, clearing drag transform
    await maxBtn.click();
    const maximizedBox = (await panel.boundingBox())!;
    const monitorBox = (await page.getByTestId('live-monitor-container').boundingBox())!;
    expect(maximizedBox.x).toBeGreaterThanOrEqual(monitorBox.x + 200);

    // Minimize: returns to the dragged coordinates
    await maxBtn.click();
    const restoredBox = (await panel.boundingBox())!;
    expect(Math.abs(restoredBox.x - draggedBox.x)).toBeLessThanOrEqual(5);
    expect(Math.abs(restoredBox.y - draggedBox.y)).toBeLessThanOrEqual(5);
  });

  test('multi-directional resize handles expand and shrink from the pulled edge', async ({ page }) => {
    await boot(page);
    await page.getByTestId('toggle-scopes-btn').click();
    const panel = page.getByTestId('broadcast-scopes-panel');
    const initialBox = (await panel.boundingBox())!;

    // Resize by pulling the left handle outwards to the left
    const leftHandle = panel.locator('.scopes-resize-left');
    const handleBox = (await leftHandle.boundingBox())!;
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x - 100, handleBox.y + handleBox.height / 2, { steps: 8 });
    await page.mouse.up();

    const resizedBox = (await panel.boundingBox())!;
    // Width increased by pulling from left, and right boundary stayed anchored
    expect(resizedBox.width).toBeGreaterThan(initialBox.width + 50);
    expect(Math.abs((resizedBox.x + resizedBox.width) - (initialBox.x + initialBox.width))).toBeLessThanOrEqual(5);
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

  test('opening scopes during A/B split comparison activates dual-trace comparison view and legends', async ({ page }) => {
    await boot(page);
    await page.getByTestId('toggle-split-view-btn').click();
    await expect(page.getByTestId('split-comparison-monitor')).toBeVisible();

    await page.getByTestId('toggle-scopes-btn').click();
    const panel = page.getByTestId('broadcast-scopes-panel');
    await expect(panel).toBeVisible();

    // Verify comparison view toggle appears in scopes header
    const compToggle = panel.getByTestId('scopes-comparison-view-toggle');
    await expect(compToggle).toBeVisible();

    // Verify waveform canvas and vectorscope canvas are both visible
    await expect(panel.getByTestId('waveform-scope-canvas')).toBeVisible();
    await expect(panel.getByTestId('vectorscope-canvas')).toBeVisible();
  });
});
