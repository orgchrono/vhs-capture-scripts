import { test, expect } from '@playwright/test';

test.describe('VHS Studio Config & Monitoring', () => {

  test.beforeEach(async ({ page }) => {
    await page.route('**/api/status', async route => {
      await route.fulfill({ json: { health: { dropped_frames: 0, fps: 29.97, cpu: 10 } } });
    });
    await page.route('**/api/storage/config', async route => {
      await route.fulfill({ json: { config: { provider: 'local', local_path: 'C:/VHS' } } });
    });
    await page.route('**/api/obs/virtualcam', async route => {
      await route.fulfill({ json: { status: 'ok' } });
    });
  });

  test('Verify all configuration modules load', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('vhs_studio_eula_accepted', 'true'));
    await page.goto('http://localhost:5173/');

    await expect(page.locator('text=Caminho do Destino')).toBeVisible();
    await expect(page.locator('text=Motor de Processamento')).toBeVisible();
    
    // Test tabs by clicking the raw elements
    const tabs = page.locator('button[role="tab"]');
    await tabs.nth(0).click();
    await expect(page.locator('text=Base').first()).toBeVisible(); 

    await tabs.nth(1).click();
    // In audio tab, we look for "Modo", "Sincroniza" or similar
    await expect(page.locator('text=Modo').first()).toBeVisible(); 
  });
});
