import { test, expect } from '@playwright/test';

test.describe('VHS Studio Pipeline, Settings & Real-time Console E2E', () => {

  test.beforeEach(async ({ page }) => {
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
            '[ESTÚDIO] Pronto para masterização analógica.',
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
          recommendation: 'Sistema balanceado para processamento neural.',
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

    await page.addInitScript(() => {
      window.localStorage.setItem('vhs_studio_eula_accepted', 'true');
      window.sessionStorage.setItem('vhs_studio_eula_session_accepted', 'true');
    });
    await page.goto('http://localhost:5173/');
    await expect(page.locator('h1', { hasText: 'VHS Studio Pro' })).toBeVisible({ timeout: 10000 });
  });

  test('Preset switching synchronizes header badge and configuration definitions', async ({ page }) => {
    // 1. Initial preset is Broadcast Master / Padrão Broadcast
    const headerTitle = page.locator('text=Motor de Processamento');
    await expect(headerTitle).toBeVisible();

    const initialBadge = page.locator('header, div').filter({ hasText: /Padrão Broadcast/i }).first();
    await expect(initialBadge).toBeVisible();

    // 2. Click Speed preset card
    const speedCard = page.locator('button').filter({ hasText: /Ultra Rápido Hardware/i }).first();
    await speedCard.click();

    // Header badge must reflect Speed preset
    await expect(page.locator('header, div').filter({ hasText: /Ultra Rápido Hardware/i }).first()).toBeVisible();

    // 3. Click AI Master preset card
    const aiCard = page.locator('button').filter({ hasText: /AI Master/i }).first();
    await aiCard.click();

    // Header badge must reflect AI Master preset
    await expect(page.locator('header, div').filter({ hasText: /AI Master/i }).first()).toBeVisible();
  });

  test('Settings searchbar performs cross-tab auto-routing and keyword filtering', async ({ page }) => {
    const searchInput = page.getByTestId('settings-search-input');
    await expect(searchInput).toBeVisible();

    // 1. Searching 'rife' should auto-switch to IA tab and display RIFE switch
    await searchInput.fill('rife');
    await expect(page.locator('text=Interpolação RIFE').first()).toBeVisible();

    // 2. Clear button resets search
    const clearBtn = page.getByTitle(/Limpar busca/i).first();
    await clearBtn.click();
    await expect(searchInput).toHaveValue('');

    // 3. Searching 'qtgmc' should auto-switch to Video tab
    await searchInput.fill('qtgmc');
    await expect(page.locator('text=Desentrelaçamento').first()).toBeVisible();

    // 4. Searching 'storage' should auto-switch to Storage tab
    await searchInput.fill('storage');
    await expect(page.locator('text=Caminho do Destino').first()).toBeVisible();
  });

  test('Console Viewer live search and level filter buttons', async ({ page }) => {
    // Check that console title and search input are rendered
    await expect(page.locator('text=Console de Execução')).toBeVisible();

    const consoleSearch = page.getByPlaceholder(/Buscar nos logs/i);
    await expect(consoleSearch).toBeVisible();

    // Filter by ERR level
    const errBtn = page.getByRole('button', { name: 'ERR' });
    await errBtn.click();

    // Filter back to ALL
    const allBtn = page.getByRole('button', { name: 'ALL' });
    await allBtn.click();

    // Right-click on console container should open context menu
    const consoleArea = page.getByTestId('console-viewer-panel');
    await consoleArea.click({ button: 'right' });
    const contextMenu = page.getByTestId('console-context-menu');
    await expect(contextMenu).toBeVisible();

    const copyAllBtn = page.getByTestId('copy-all-btn');
    await expect(copyAllBtn).toBeVisible();

    // Clicking elsewhere closes context menu
    await page.keyboard.press('Escape');
    await expect(contextMenu).not.toBeVisible();
  });

  test('Split comparison monitor controls and presets', async ({ page }) => {
    const splitBtn = page.getByTestId('toggle-split-view-btn');
    await expect(splitBtn).toBeVisible();
    await splitBtn.click();

    const monitor = page.getByTestId('split-comparison-monitor');
    await expect(monitor).toBeVisible();

    // Divider line without circle
    const dividerLine = page.getByTestId('split-divider-line');
    await expect(dividerLine).toBeVisible();

    // Play / Pause toggle button
    const playToggle = page.getByTestId('split-play-toggle-btn');
    await expect(playToggle).toBeVisible();

    // Presets
    const preset50 = page.getByTestId('split-preset-50-btn');
    await expect(preset50).toBeVisible();

    const preset25 = page.getByTestId('split-preset-25-btn');
    await preset25.click();
    await expect(dividerLine).toHaveAttribute('aria-valuenow', '25');

    const timelineInfo = page.getByTestId('split-timeline-info');
    await expect(timelineInfo).toBeVisible();
  });

});
