import { test, expect } from '@playwright/test';

test.describe('VHS Studio Pro E2E', () => {

  test.beforeEach(async ({ page }) => {
    // Intercept API calls robustly for any /api/* route to avoid console spam
    await page.route('**/api/token', async route => {
      await route.fulfill({ json: { token: 'mock-test-token' } });
    });

    await page.route('**/api/hardware', async route => {
      await route.fulfill({
        json: {
          cpu: { model: 'AMD Ryzen / Intel Core', cores: 8, arch: 'x64' },
          ram: { total_gb: 16, available_gb: 8 },
          gpu: { name: 'Vulkan Dedicated GPU', vulkan_available: true },
          tier: 'pro'
        }
      });
    });

    await page.route('**/api/obs/stats', async route => {
      await route.fulfill({ json: { connected: false, recording: false, streaming: false } });
    });

    await page.route('**/api/status', async route => {
      await route.fulfill({ json: { health: { dropped_frames: 0, fps: 29.97, cpu: 10 } } });
    });
    
    await page.route('**/api/obs/virtualcam', async route => {
      await route.fulfill({ json: { status: 'ok' } });
    });

    await page.route('**/api/storage/config', async route => {
      await route.fulfill({ json: { config: {} } });
    });
    
    await page.route('**/api/obs/start', async route => {
      await route.fulfill({ json: { status: 'started' } });
    });

    await page.route('**/api/obs/stop', async route => {
      await route.fulfill({ json: { status: 'stopped', path: 'C:/VHS/teste.mkv' } });
    });
  });

  test('Complete Capture Flow E2E', async ({ page }) => {
    // Clear localStorage to force EULA modal
    await page.addInitScript(() => window.localStorage.clear());
    await page.goto('http://localhost:5173/');

    // 1. Accept EULA
    const eulaTitle = page.locator('text=Privacidade');
    await expect(eulaTitle).toBeVisible({ timeout: 10000 });
    await page.click('button:has-text("EU CONCORDO")');

    // 2. Main Interface visible
    await expect(page.locator('h1', { hasText: 'VHS Studio Pro' })).toBeVisible();

    // 3. Click Start Recording
    const startBtn = page.getByTestId('start-capture-btn');
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // 4. Verify the Stop Button appears (meaning state transitioned)
    const stopBtn = page.getByTestId('stop-capture-btn');
    await expect(stopBtn).toBeVisible({ timeout: 5000 });

    // 5. Click Stop
    await stopBtn.click();

    // 6. Should revert to Start Button
    await expect(startBtn).toBeVisible({ timeout: 5000 });
  });

});
