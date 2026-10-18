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

  it('evaluates preflight readiness and disk thresholds', async () => {
    const ready = await tauriBridge.evaluatePreflight(100 * 1073741824, 50.0, true, true);
    expect(ready.status).toBe('pass');
    expect(ready.is_ready).toBe(true);
    expect(ready.has_sufficient_disk).toBe(true);

    const failed = await tauriBridge.evaluatePreflight(10 * 1073741824, 50.0, false, true);
    expect(failed.status).toBe('fail');
    expect(failed.is_ready).toBe(false);
    expect(failed.issues).toHaveLength(2);
  });

  it('scores frame candidates rejecting blanks and flashes', async () => {
    const black = await tauriBridge.scoreFrameCandidate(10.0, 5.0, 50.0);
    expect(black.is_valid).toBe(false);
    expect(black.is_blank_or_flash).toBe(true);
    expect(black.score).toBe(-1000.0);

    const good = await tauriBridge.scoreFrameCandidate(128.0, 40.0, 250.0);
    expect(good.is_valid).toBe(true);
    expect(good.score).toBe(250.0);

    const thumbArgs = await tauriBridge.buildThumbnailExtractArgs('in.mp4', 10.5, 'out.jpg');
    expect(thumbArgs).toEqual(['ffmpeg', '-y', '-ss', '10.500', '-i', 'in.mp4', '-frames:v', '1', '-q:v', '2', 'out.jpg']);
  });

  it('probes media and parses ffprobe JSON in fallback mode', async () => {
    const sampleJson = JSON.stringify({
      streams: [
        { codec_type: 'video', codec_name: 'ffv1', width: 720, height: 480, r_frame_rate: '30000/1001', field_order: 'tt' },
        { codec_type: 'audio', codec_name: 'pcm_s16le', channels: 2, sample_rate: '48000' }
      ],
      format: { format_name: 'matroska', duration: '120.0' }
    });
    const probe = await tauriBridge.parseFfprobeJson(sampleJson, 'tape.mkv');
    expect(probe.width).toBe(720);
    expect(probe.height).toBe(480);
    expect(probe.video_codec).toBe('ffv1');
    expect(probe.audio_codec).toBe('pcm_s16le');
    expect(probe.audio_channels).toBe(2);
    expect(probe.is_interlaced).toBe(true);
    expect(probe.standard).toBe('NTSC');
  });

  it('formats broadcast timecodes, part paths, and validates extensions', async () => {
    const tcMs = await tauriBridge.secondsToTimecode(90.5, true);
    expect(tcMs).toBe('00:01:30.500');

    const tcNoMs = await tauriBridge.secondsToTimecode(90.5, false);
    expect(tcNoMs).toBe('00:01:30');

    const part = await tauriBridge.getPartPath('C:/media/tape.mkv');
    expect(part).toBe('C:/media/tape.mkv.part');

    expect(await tauriBridge.isMediaExtensionValid('.mkv')).toBe(true);
    expect(await tauriBridge.isMediaExtensionValid('mp4')).toBe(true);
    expect(await tauriBridge.isMediaExtensionValid('.txt')).toBe(false);

    const wingetCmd = await tauriBridge.getFfmpegInstallCommand('winget');
    expect(wingetCmd).toContain('winget');
    expect(wingetCmd).toContain('Gyan.FFmpeg');

    const brewCmd = await tauriBridge.getFfmpegInstallCommand('brew');
    expect(brewCmd).toEqual(['brew', 'install', 'ffmpeg']);
  });

  it('computes OBS WebSocket auth response and parses preferences', async () => {
    const auth = await tauriBridge.computeObsAuthResponse('pass', 'salt', 'challenge');
    expect(typeof auth).toBe('string');
    expect(auth.length).toBeGreaterThan(0);

    const json = JSON.stringify({ rawDir: 'D:/dumps', previewFps: 50, theme: 'light' });
    const prefs = await tauriBridge.parsePreferences(json);
    expect(prefs.raw_dir).toBe('D:/dumps');
    expect(prefs.preview_fps).toBe(50);
    expect(prefs.theme).toBe('light');
  });

  it('formats VTT and SRT subtitles and disambiguates speech language', async () => {
    const segments = [
      { start_seconds: 1.0, end_seconds: 4.5, text: 'Audio test' },
    ];
    const vtt = await tauriBridge.formatVttSubtitles(segments);
    expect(vtt).toContain('WEBVTT');
    expect(vtt).toContain('00:00:01.000 --> 00:00:04.500');
    expect(vtt).toContain('Audio test');

    const srt = await tauriBridge.formatSrtSubtitles(segments);
    expect(srt).toContain('1\n00:00:01,000 --> 00:00:04,500\nAudio test');

    const [highLang, highAmbig] = await tauriBridge.disambiguateSpeechLanguage('en', 0.95, true);
    expect(highLang).toBe('en');
    expect(highAmbig).toBe(false);

    const [lowLang, lowAmbig] = await tauriBridge.disambiguateSpeechLanguage('ru', 0.40, true);
    expect(lowLang).toBe('pt');
    expect(lowAmbig).toBe(true);
  });

  it('evaluates lock decisions and constructs OAuth URLs', async () => {
    expect(await tauriBridge.evaluateLockDecision(null, false, 100)).toBe('acquired');
    expect(await tauriBridge.evaluateLockDecision(100, true, 100)).toBe('alreadyowned');
    expect(await tauriBridge.evaluateLockDecision(200, true, 100)).toBe('blocked');
    expect(await tauriBridge.evaluateLockDecision(200, false, 100)).toBe('acquired');

    const gdriveUrl = await tauriBridge.buildOAuthUrl('gdrive', 'cid', 'http://localhost/cb', 'state1');
    expect(gdriveUrl).toContain('accounts.google.com');
    expect(gdriveUrl).toContain('client_id=cid');
    expect(gdriveUrl).toContain('access_type=offline');

    const dropboxUrl = await tauriBridge.buildOAuthUrl('dropbox', 'cid', 'http://localhost/cb', 'state2');
    expect(dropboxUrl).toContain('dropbox.com');
    expect(dropboxUrl).toContain('token_access_type=offline');

    const tomlConf = await tauriBridge.parseAdvancedToml('');
    expect(tomlConf.capture.audio_threshold_db).toBe(-50.0);
    expect(tomlConf.vapoursynth.qtgmc_preset_gold).toBe('Slower');
    expect(tomlConf.ffmpeg.crf_gold).toBe(18);

    const binName = await tauriBridge.formatBinaryName('ffmpeg');
    expect(binName).toBeDefined();

    const [verified] = await tauriBridge.verifyBinaryIntegrity('test.exe', 'sha', 'win', '{}');
    expect(verified).toBe(true);

    const hasLibx264 = await tauriBridge.checkFfmpegCapability('encoders: V..... libx264', 'libx264', false);
    expect(hasLibx264).toBe(true);

    const hasFilter = await tauriBridge.checkFfmpegCapability('filters: T.. bwdif', 'bwdif', true);
    expect(hasFilter).toBe(true);

    const outPath = await tauriBridge.resolveFinalOutputPath('media/raw/test.avi', 'media/restored', 'gold', 'h264', true);
    expect(outPath).toContain('test_gold_1080p.mp4');

    const planned = await tauriBridge.planRestorationJob({ input_path: 'tape.avi', output_dir: 'out' }, {});
    expect(planned.input_path).toBe('tape.avi');
    expect(planned.part_output_path).toContain('.part');
  });
});

