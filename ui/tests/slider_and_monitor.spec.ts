import { test, expect } from '@playwright/test';

test.describe('Split Comparison & Timeline Slider E2E Study', () => {
  const pageErrors: string[] = [];

  test.beforeEach(async ({ page }) => {
    pageErrors.length = 0;
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.setViewportSize({ width: 1600, height: 950 });

    await page.route('**/api/token', async (route) => {
      await route.fulfill({ json: { token: 'mock-session-token' } });
    });

    await page.route('**/api/status', async (route) => {
      await route.fulfill({
        json: {
          encoder: 'NVENC (NVIDIA Hardware Accelerated)',
          vapoursynth_available: true,
          obs_connected: true,
          raw_files: [
            { name: 'Fita_Teste_1994.mkv', path: 'C:/VHS/raw/Fita_Teste_1994.mkv', size_mb: 4820.5 },
          ],
          process_running: false,
          process_logs: [
            '[SISTEMA] VHS Studio Pro inicializado.',
          ],
          hardware: {
            tier: 4,
            tier_name: 'GPU Dedicada (Vulkan)',
            cpu: { cores: 16, arch: 'AMD64', model: 'AMD Ryzen 9' },
            ram: { total_gb: 32.0, available_gb: 24.5 },
            gpu: { name: 'NVIDIA RTX 4080 (Vulkan)', vulkan_available: true },
            recommendation: 'Sistema balanceado para processamento neural.',
          },
          health: { dropped_frames: 0, fps: 59.94, cpu: 12.4 },
        },
      });
    });

    await page.route('**/api/hardware', async (route) => {
      await route.fulfill({
        json: {
          tier: 4,
          tier_name: 'GPU Dedicada (Vulkan)',
          cpu: { cores: 16, arch: 'AMD64', model: 'AMD Ryzen 9' },
          ram: { total_gb: 32.0, available_gb: 24.5 },
          gpu: { name: 'NVIDIA RTX 4080 (Vulkan)', vulkan_available: true },
          recommendation: 'Sistema balanceado.',
        },
      });
    });

    await page.route('**/api/storage/config', async (route) => {
      await route.fulfill({
        json: {
          provider: 'local',
          config: { local_path: 'C:/VHS_Archive' },
          status: { ready: true, local_path: 'C:/VHS_Archive' },
          available_providers: ['local', 'gdrive', 's3'],
        },
      });
    });

    await page.route('**/api/jobs/incomplete', async (route) => {
      await route.fulfill({ json: { incomplete_jobs: [] } });
    });

    await page.route('**/api/obs/virtualcam', async (route) => {
      await route.fulfill({ json: { status: 'ok' } });
    });

    await page.route('**/api/obs/stats', async (route) => {
      await route.fulfill({ json: { connected: false, recording: false, streaming: false } });
    });

    await page.route('**/api/media/thumbnail**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
      });
    });

    await page.route('**/api/monitor/comparison-frame**', async (route) => {
      await route.fulfill({
        json: {
          status: 'ok',
          timestamp: 5.0,
          duration: 120.0,
          raw_image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          processed_image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        },
      });
    });

    await page.addInitScript(() => {
      window.localStorage.setItem('vhs_studio_eula_accepted', 'true');
      window.sessionStorage.setItem('vhs_studio_eula_session_accepted', 'true');
    });
    await page.goto('http://localhost:5173/');
    await expect(page.locator('h1', { hasText: 'VHS Studio Pro' })).toBeVisible({ timeout: 10000 });
  });

  test('Split slider dragging, aspect alignment and keyboard interaction', async ({ page }) => {
    // 0. Select media file by clicking the tape card
    const tapeCard = page.locator('h4', { hasText: 'Fita_Teste_1994.mkv' });
    await expect(tapeCard).toBeVisible();
    await tapeCard.click();

    // 1. Open Split View
    const splitBtn = page.getByTestId('toggle-split-view-btn');
    await expect(splitBtn).toBeVisible();
    await splitBtn.click();

    const monitor = page.getByTestId('split-comparison-monitor');
    await expect(monitor).toBeVisible();

    const dividerLine = page.getByTestId('split-divider-line');
    await expect(dividerLine).toBeVisible();

    // Initial split should be 50%
    await expect(dividerLine).toHaveAttribute('aria-valuenow', '50');

    // 2. Drag divider line with pointer/mouse
    const lineBox = await dividerLine.boundingBox();
    expect(lineBox).not.toBeNull();
    if (!lineBox) return;

    // Start drag at divider center
    await page.mouse.move(lineBox.x + lineBox.width / 2, lineBox.y + lineBox.height / 2);
    await page.mouse.down();

    // Drag 100px to the left smoothly
    await page.mouse.move(lineBox.x + lineBox.width / 2 - 100, lineBox.y + lineBox.height / 2, { steps: 5 });

    // Verify aria-valuenow decreased below 50
    const valAfterLeftDrag = Number(await dividerLine.getAttribute('aria-valuenow'));
    expect(valAfterLeftDrag).toBeLessThan(50);

    // Release mouse
    await page.mouse.up();

    // Move mouse elsewhere to ensure divider is not stuck/dragging
    await page.mouse.move(100, 100);
    const valAfterRelease = Number(await dividerLine.getAttribute('aria-valuenow'));
    expect(valAfterRelease).toBe(valAfterLeftDrag);

    // 3. Test Presets
    const preset25 = page.getByTestId('split-preset-25-btn');
    await preset25.click();
    await expect(dividerLine).toHaveAttribute('aria-valuenow', '25');

    const preset75 = page.getByTestId('split-preset-75-btn');
    await preset75.click();
    await expect(dividerLine).toHaveAttribute('aria-valuenow', '75');

    const preset100 = page.getByTestId('split-preset-100-btn');
    await preset100.click();
    await expect(dividerLine).toHaveAttribute('aria-valuenow', '100');

    const preset0 = page.getByTestId('split-preset-0-btn');
    await preset0.click();
    await expect(dividerLine).toHaveAttribute('aria-valuenow', '0');

    // Restore to 50
    const preset50 = page.getByTestId('split-preset-50-btn');
    await preset50.click();
    await expect(dividerLine).toHaveAttribute('aria-valuenow', '50');

    // 4. Test Keyboard Navigation (ArrowLeft / ArrowRight)
    await monitor.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(dividerLine).toHaveAttribute('aria-valuenow', '45');

    await page.keyboard.press('ArrowRight');
    await expect(dividerLine).toHaveAttribute('aria-valuenow', '50');

    // 5. Verify Timeline Scrubber
    const timelineInput = page.getByTestId('timeline-scrubber-input');
    await expect(timelineInput).toBeVisible();

    // Fill timestamp
    await timelineInput.fill('45');
    await timelineInput.dispatchEvent('mouseup');

    const timelineInfo = page.getByTestId('split-timeline-info');
    await expect(timelineInfo).toBeVisible();
    await expect(timelineInfo).toContainText('00:00:45');

    // Take screenshot of split comparison monitor for visual inspection
    await monitor.screenshot({ path: 'test-results/split-comparison-refined.png' });

    // 6. Test Close Split Monitor
    const closeBtn = page.getByTestId('split-close-btn');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();

    // Verify back to LiveMonitor
    const liveContainer = page.getByTestId('live-monitor-container');
    await expect(liveContainer).toBeVisible();

    // 7. Assert zero page crashes or uncaught exceptions
    expect(pageErrors).toHaveLength(0);
  });
});
