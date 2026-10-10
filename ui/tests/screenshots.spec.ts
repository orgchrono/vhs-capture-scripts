import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('VHS Studio Visual Inspection & Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept API routes with realistic studio data
    await page.route('**/api/status', async route => {
      await route.fulfill({
        json: {
          encoder: 'NVENC (NVIDIA Hardware Accelerated)',
          vapoursynth_available: true,
          obs_connected: true,
          raw_files: [
            { name: 'Fita_Familia_1994_Natal.mkv', path: 'C:/VHS/raw/Fita_Familia_1994_Natal.mkv', size_mb: 4820.5 },
            { name: 'Aniversario_1_Ano_1996.mp4', path: 'C:/VHS/raw/Aniversario_1_Ano_1996.mp4', size_mb: 2150.0 },
            { name: 'Casamento_Tia_Maria_1998.avi', path: 'C:/VHS/raw/Casamento_Tia_Maria_1998.avi', size_mb: 6300.2 }
          ],
          process_running: false,
          process_logs: [
            '[SISTEMA] VHS Studio Pro inicializado.',
            '[HARDWARE] NVIDIA RTX 4070 detectada (Vulkan pronto).',
            '[HAL] Sinal de captura OBS WebSocket conectado em 127.0.0.1:4455.',
            '[ESTÚDIO] Pronto para masterização analógica.'
          ],
          hardware: {
            tier: 4,
            tier_name: 'Supercomputador / Workstation com GPU Dedicada',
            cpu: { cores: 16, arch: 'AMD64', model: 'AMD Ryzen 9 7900X' },
            ram: { total_gb: 32.0, available_gb: 24.5 },
            gpu: { name: 'NVIDIA GeForce RTX 4070 (12GB VRAM)', vulkan_available: true },
            recommendation: 'Hardware de ponta detectado! Todos os módulos neurais (QTGMC, Real-ESRGAN, CodeFormer e RIFE) estão liberados para máxima velocidade.'
          },
          health: { dropped_frames: 0, fps: 59.94, cpu: 12.4 }
        }
      });
    });

    await page.route('**/api/hardware', async route => {
      await route.fulfill({
        json: {
          tier: 4,
          tier_name: 'Supercomputador / Workstation com GPU Dedicada',
          cpu: { cores: 16, arch: 'AMD64', model: 'AMD Ryzen 9 7900X' },
          ram: { total_gb: 32.0, available_gb: 24.5 },
          gpu: { name: 'NVIDIA GeForce RTX 4070 (12GB VRAM)', vulkan_available: true },
          recommendation: 'Hardware de ponta detectado! Todos os módulos neurais estão liberados.'
        }
      });
    });

    await page.route('**/api/obs/stats', async route => {
      await route.fulfill({
        json: {
          connected: true,
          recording: false,
          timecode: '00:00:00',
          duration_sec: 0,
          bytes: 0,
          bitrate_kbps: 18500,
          fps: 59.94,
          cpu_usage: 4.2,
          memory_mb: 450
        }
      });
    });

    await page.route('**/api/storage/config', async route => {
      await route.fulfill({
        json: {
          provider: 'local',
          config: { local_path: 'C:/VHS/Capturas_Finais' },
          status: { ready: true, local_path: 'C:/VHS/Capturas_Finais' },
          available_providers: ['local', 'gdrive', 's3']
        }
      });
    });

    await page.route('**/api/obs/virtualcam', async route => {
      await route.fulfill({ json: { status: 'ok' } });
    });

    await page.route('**/api/token', async route => {
      await route.fulfill({ json: { token: 'mock-session-token' } });
    });
  });

  test('Capture Full Studio Screenshots', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 950 });
    await page.addInitScript(() => window.localStorage.setItem('vhs_studio_eula_accepted', 'true'));
    await page.goto('http://localhost:5173/');

    // Wait for main UI to settle
    await expect(page.locator('h1', { hasText: 'VHS Studio Pro' })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(600);

    const shotsDir = path.resolve('screenshots');

    const sidebarBox = await page.locator('#sidebar-panel').boundingBox();
    const mainBox = await page.locator('#main-panel').boundingBox();
    const topBox = await page.locator('#workspace-top').boundingBox();
    const consoleBox = await page.locator('#console-panel').boundingBox();
    console.log('SIDEBAR BOUNDING BOX:', sidebarBox);
    console.log('MAIN BOUNDING BOX:', mainBox);
    console.log('TOP BOX:', topBox);
    console.log('CONSOLE BOX:', consoleBox);

    // 1. Visão Geral do Workspace Studio
    await page.screenshot({ path: path.join(shotsDir, '01_main_workspace.png'), fullPage: true });

    // 2. Preset Selection com foco no AI Master
    const aiPreset = page.getByTestId('preset-ai_master');
    if (await aiPreset.isVisible()) {
      await aiPreset.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(shotsDir, '02_presets_selection.png') });
    }

    // 3. Aba de Inteligência Artificial
    const aiTab = page.getByTestId('tab-ai');
    await aiTab.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(shotsDir, '03_ai_tab_diagnostics.png') });

    // 4. Aba de Vídeo
    const videoTab = page.getByTestId('tab-video');
    await videoTab.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(shotsDir, '04_video_settings_tab.png') });

    // 5. Aba de Nuvem / Armazenamento
    const cloudTab = page.getByTestId('tab-storage');
    await cloudTab.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(shotsDir, '05_cloud_storage_tab.png') });

    // 6. Teste de Ação & Sonner Toast Notificação
    // Clicar em "Iniciar Restauração" sem selecionar arquivo para acionar o Toast Sonner
    const startProcessBtn = page.getByTestId('start-restore-btn');
    if (await startProcessBtn.isVisible()) {
      await startProcessBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(shotsDir, '06_sonner_toast.png') });
    }
  });
});
