import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tauriBridge, isTauriEnvironment } from './tauriBridge';

describe('Tauri v2 IPC Bridge & Fallback (tauriBridge)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('detects standard non-tauri web environment by default', () => {
    expect(isTauriEnvironment()).toBe(false);
    expect(tauriBridge.isNative()).toBe(false);
  });

  it('falls back to fetch for getPresetConfig when not in Tauri', async () => {
    const mockJson = { crf: 18, deinterlacer: 'qtgmc', target_1080p: true, chroma_fix: true, denoise: true };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockJson,
    });
    vi.stubGlobal('fetch', fetchMock);

    const config = await tauriBridge.getPresetConfig('gold');
    expect(fetchMock).toHaveBeenCalledWith('/api/restoration/preset-config?preset=gold');
    expect(config.crf).toBe(18);
    expect(config.deinterlacer).toBe('qtgmc');
  });

  it('computes sha256 via Web Crypto API in fallback mode', async () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const hex = await tauriBridge.computeSha256(payload);
    expect(typeof hex).toBe('string');
    expect(hex.length).toBe(64);
  });

  it('dispatches directly through Tauri IPC when __TAURI_INTERNALS__ is present', async () => {
    const mockInvoke = vi.fn().mockResolvedValue({
      crf: 16,
      deinterlacer: 'qtgmc',
      target_1080p: true,
      chroma_fix: true,
      denoise: true,
    });

    // Mock Tauri window object
    (window as unknown as { __TAURI_INTERNALS__: { invoke: typeof mockInvoke } }).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
    };

    try {
      expect(isTauriEnvironment()).toBe(true);
      expect(tauriBridge.isNative()).toBe(true);

      const config = await tauriBridge.getPresetConfig('ai_master');
      expect(mockInvoke).toHaveBeenCalledWith('ipc_get_preset_config', { preset: 'ai_master' });
      expect(config.crf).toBe(16);
    } finally {
      delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    }
  });

  it('invokes ipc_parse_chapters when in Tauri environment', async () => {
    const mockIntervals = [{ start_ms: 0, end_ms: 1000, scene_index: 1 }];
    const mockInvoke = vi.fn().mockResolvedValue([mockIntervals, ';FFMETADATA1\n', 'WEBVTT\n']);

    (window as unknown as { __TAURI_INTERNALS__: { invoke: typeof mockInvoke } }).__TAURI_INTERNALS__ = {
      invoke: mockInvoke,
    };

    try {
      const res = await tauriBridge.parseChapters('Scene Number,0,1', 'Tape 1', 'Scene');
      expect(mockInvoke).toHaveBeenCalledWith('ipc_parse_chapters', {
        csvContent: 'Scene Number,0,1',
        title: 'Tape 1',
        chapterPrefix: 'Scene',
      });
      expect(res.intervals).toHaveLength(1);
      expect(res.ffmetadata).toBe(';FFMETADATA1\n');
    } finally {
      delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    }
  });

  it('computes hardware tier and tile size in fallback mode', async () => {
    const tier4 = await tauriBridge.assessHardware({
      cpu_cores: 16,
      ram_total_gb: 32,
      ram_available_gb: 24,
      gpu_type: 'Dedicated',
      gpu_name: 'RTX 4080',
      vram_gb: 16,
      vulkan_available: true,
    });
    expect(tier4.tier).toBe(4);
    expect(tier4.recommended_encoder).toBe('nvenc');

    const tileSize16 = await tauriBridge.calculateOptimalTileSize(16);
    expect(tileSize16).toBe(0);

    const tileSize4 = await tauriBridge.calculateOptimalTileSize(4);
    expect(tileSize4).toBe(256);

    const cmd = await tauriBridge.buildRealEsrganCommand({
      input_path: 'in.png',
      output_path: 'out.png',
      model_name: 'realesrgan-x4plus',
      scale: 4,
      tile_size: 256,
      gpu_id: 0,
    });
    expect(cmd).toEqual(['-i', 'in.png', '-o', 'out.png', '-n', 'realesrgan-x4plus', '-s', '4', '-t', '256', '-g', '0']);
  });

  it('generates panasonic chapters and formats timecodes', async () => {
    const chapters = await tauriBridge.generatePanasonicChapters(3600, 900);
    expect(chapters).toHaveLength(4);
    expect(chapters[0].start_timecode).toBe('00:00:00');
    expect(chapters[1].start_timecode).toBe('00:15:00');
    expect(chapters[2].start_timecode).toBe('00:30:00');
    expect(chapters[3].start_timecode).toBe('00:45:00');
  });

  it('orders queue by priority DESC and ID ASC', async () => {
    const jobs = [
      { id: 1, raw_path: 'a.avi', status: 'pending' as const, priority: 0, params: {}, created_at: '', updated_at: '' },
      { id: 2, raw_path: 'b.avi', status: 'pending' as const, priority: 10, params: {}, created_at: '', updated_at: '' },
      { id: 3, raw_path: 'c.avi', status: 'pending' as const, priority: 5, params: {}, created_at: '', updated_at: '' },
    ];
    const ordered = await tauriBridge.orderQueue(jobs);
    expect(ordered[0].id).toBe(2);
    expect(ordered[1].id).toBe(3);
    expect(ordered[2].id).toBe(1);

    const stats = await tauriBridge.calculateQueueStats(jobs);
    expect(stats.total).toBe(3);
    expect(stats.pending).toBe(3);
    expect(stats.completed).toBe(0);
  });

  it('formats destination keys cleanly', async () => {
    const key = await tauriBridge.formatDestinationKey('/captures/2026/', '\\tapes\\family.mkv');
    expect(key).toBe('captures/2026/tapes/family.mkv');
  });

  it('generates BagIt manifests and PREMIS v3 XML', async () => {
    const manifest = await tauriBridge.generateBagitManifest([
      { relative_path: 'tape.mkv', sha256_hex: 'abc123', size_bytes: 1024 },
    ]);
    expect(manifest).toBe('abc123 data/tape.mkv\n');

    const xml = await tauriBridge.generatePremisXml('tape.mkv', 1024, 'abc123');
    expect(xml).toContain('<objectIdentifierValue>tape.mkv</objectIdentifierValue>');
    expect(xml).toContain('<messageDigest>abc123</messageDigest>');
  });

  it('builds VapourSynth QTGMC script and vspipe args', async () => {
    const script = await tauriBridge.buildQtgmcScript({
      input_path: 'C:\\media\\tape.avi',
      preset: 'Slower',
      field_order: 'tff',
      fps_mode: 2,
      apply_comb_filter: false,
    });
    expect(script).toContain('clip = core.ffms2.Source(source=r"C:/media/tape.avi")');
    expect(script).toContain('Preset="Slower"');
    expect(script).toContain('EdiMode="NNEDI3"');

    const vspipeArgs = await tauriBridge.buildVspipeArgs('vspipe', 'test.vpy');
    expect(vspipeArgs).toEqual(['vspipe', '-c', 'y4m', 'test.vpy', '-']);
  });
});

