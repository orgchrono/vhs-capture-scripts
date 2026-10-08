import { test, expect } from '@playwright/test';

test('App starts and displays EULA modal', async ({ page }) => {
  // Mocking the backend API to prevent fetch errors during E2E
  await page.route('http://127.0.0.1:8765/api/status', async route => {
    const json = {
      is_recording: false,
      is_paused: false,
      dropped_frames: 0,
      total_frames: 0,
      space_free_gb: 100,
      current_file: null,
      jobs: {}
    };
    await route.fulfill({ json });
  });

  await page.goto('http://localhost:5173/');

  // Check if EULA/Privacy Modal is visible initially (since local storage is empty)
  const eulaTitle = page.locator('text=Privacidade & Termos de Uso');
  // Might need to wait for translation to load
  await expect(eulaTitle).toBeVisible({ timeout: 10000 });

  // Click Accept
  await page.click('button:has-text("EU CONCORDO E COMPREENDO")');

  // Verify the main screen is visible
  const header = page.locator('h1', { hasText: 'VHS Studio Pro' });
  await expect(header).toBeVisible();
});
