import React, { useState } from 'react';
import {
  Settings,
  Folder,
  Sliders,
  Terminal,
  Cpu,
  Palette,
  X,
  RotateCcw,
  Check,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { useTranslation } from 'react-i18next';
import { usePreferencesStore } from '../store/usePreferencesStore';

interface AppPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'directories' | 'performance' | 'console' | 'hardware' | 'interface';

export const AppPreferencesModal: React.FC<AppPreferencesModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>('directories');
  const prefs = usePreferencesStore();

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="preferences-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200"
    >
      <div className="bg-studio-panel border border-studio-border rounded-md max-w-3xl w-full p-5 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden select-none">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4 pb-3 border-b border-studio-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-studio-surface border border-studio-border rounded-sm text-amber-500">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="preferences-modal-title"
                className="text-sm font-bold text-slate-100 flex items-center gap-2 font-mono uppercase tracking-wide"
              >
                {t('preferences.title')}
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                {t('preferences.subtitle')}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 rounded-sm text-slate-400 hover:text-white hover:bg-studio-surface"
            onClick={onClose}
            aria-label={t('preferences.close')}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Tab Navigation Navigation Bar */}
        <div className="flex border-b border-studio-border gap-1 pb-2 shrink-0 overflow-x-auto custom-scrollbar">
          <Button
            variant={activeTab === 'directories' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('directories')}
            className={`h-8 text-xs font-mono rounded-sm flex items-center gap-1.5 ${
              activeTab === 'directories'
                ? 'bg-studio-surface text-amber-400 border border-studio-border'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>{t('preferences.tab_storage')}</span>
          </Button>
          <Button
            variant={activeTab === 'performance' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('performance')}
            className={`h-8 text-xs font-mono rounded-sm flex items-center gap-1.5 ${
              activeTab === 'performance'
                ? 'bg-studio-surface text-amber-400 border border-studio-border'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{t('preferences.tab_performance')}</span>
          </Button>
          <Button
            variant={activeTab === 'console' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('console')}
            className={`h-8 text-xs font-mono rounded-sm flex items-center gap-1.5 ${
              activeTab === 'console'
                ? 'bg-studio-surface text-amber-400 border border-studio-border'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>{t('preferences.tab_console')}</span>
          </Button>
          <Button
            variant={activeTab === 'hardware' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('hardware')}
            className={`h-8 text-xs font-mono rounded-sm flex items-center gap-1.5 ${
              activeTab === 'hardware'
                ? 'bg-studio-surface text-amber-400 border border-studio-border'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>{t('preferences.tab_hardware')}</span>
          </Button>
          <Button
            variant={activeTab === 'interface' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('interface')}
            className={`h-8 text-xs font-mono rounded-sm flex items-center gap-1.5 ${
              activeTab === 'interface'
                ? 'bg-studio-surface text-amber-400 border border-studio-border'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>{t('preferences.tab_interface')}</span>
          </Button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-4">
          {activeTab === 'directories' && (
            <div className="space-y-4">
              <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
                <label className="text-xs font-medium text-slate-200 font-mono block">
                  {t('preferences.raw_dir_label')}
                </label>
                <p className="text-[11px] text-slate-400 font-mono">
                  {t('preferences.raw_dir_desc')}
                </p>
                <Input
                  value={prefs.rawDir}
                  onChange={(e) => prefs.updatePreferences({ rawDir: e.target.value })}
                  placeholder={t('preferences.raw_dir_placeholder')}
                  className="bg-studio-panel border-studio-border rounded-sm font-mono text-xs text-slate-200"
                />
              </div>

              <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
                <label className="text-xs font-medium text-slate-200 font-mono block">
                  {t('preferences.restored_dir_label')}
                </label>
                <p className="text-[11px] text-slate-400 font-mono">
                  {t('preferences.restored_dir_desc')}
                </p>
                <Input
                  value={prefs.restoredDir}
                  onChange={(e) => prefs.updatePreferences({ restoredDir: e.target.value })}
                  placeholder={t('preferences.restored_dir_placeholder')}
                  className="bg-studio-panel border-studio-border rounded-sm font-mono text-xs text-slate-200"
                />
              </div>

              <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
                <label className="text-xs font-medium text-slate-200 font-mono block">
                  {t('preferences.cache_dir_label')}
                </label>
                <p className="text-[11px] text-slate-400 font-mono">
                  {t('preferences.cache_dir_desc')}
                </p>
                <Input
                  value={prefs.cacheDir}
                  onChange={(e) => prefs.updatePreferences({ cacheDir: e.target.value })}
                  placeholder={t('preferences.cache_dir_placeholder')}
                  className="bg-studio-panel border-studio-border rounded-sm font-mono text-xs text-slate-200"
                />
              </div>
            </div>
          )}

          {activeTab === 'performance' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
                <div className="space-y-0.5 pr-2">
                  <label className="text-xs font-medium text-slate-200 font-mono block">
                    {t('preferences.live_preview_label')}
                  </label>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {t('preferences.live_preview_desc')}
                  </p>
                </div>
                <Switch
                  aria-label={t('preferences.live_preview_label')}
                  checked={prefs.livePreviewEnabled}
                  onCheckedChange={prefs.setLivePreviewEnabled}
                />
              </div>

              <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
                <label className="text-xs font-medium text-slate-200 font-mono block">
                  {t('preferences.preview_fps_label')}
                </label>
                <p className="text-[11px] text-slate-400 font-mono">
                  {t('preferences.preview_fps_desc')}
                </p>
                <Select
                  value={String(prefs.previewFps)}
                  onValueChange={(val) => prefs.setPreviewFps(Number(val) as 15 | 30 | 60)}
                >
                  <SelectTrigger className="w-full bg-studio-panel border-studio-border text-white text-xs rounded-sm font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-studio-panel border-studio-border text-slate-200 font-mono">
                    <SelectItem value="15">{t('preferences.fps_15')}</SelectItem>
                    <SelectItem value="30">{t('preferences.fps_30')}</SelectItem>
                    <SelectItem value="60">{t('preferences.fps_60')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {activeTab === 'console' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
                <div className="space-y-0.5 pr-2">
                  <label className="text-xs font-medium text-slate-200 font-mono block">
                    {t('preferences.verbose_console_label')}
                  </label>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {t('preferences.verbose_console_desc')}
                  </p>
                </div>
                <Switch
                  aria-label={t('preferences.verbose_console_label')}
                  checked={prefs.verboseConsole}
                  onCheckedChange={prefs.setVerboseConsole}
                />
              </div>

              <div className="flex items-center justify-between bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
                <div className="space-y-0.5 pr-2">
                  <label className="text-xs font-medium text-slate-200 font-mono block">
                    {t('preferences.auto_scroll_label')}
                  </label>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {t('preferences.auto_scroll_desc')}
                  </p>
                </div>
                <Switch
                  aria-label={t('preferences.auto_scroll_label')}
                  checked={prefs.autoScrollConsole}
                  onCheckedChange={prefs.setAutoScrollConsole}
                />
              </div>

              <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
                <label className="text-xs font-medium text-slate-200 font-mono block">
                  {t('preferences.buffer_limit_label')}
                </label>
                <p className="text-[11px] text-slate-400 font-mono">
                  {t('preferences.buffer_limit_desc')}
                </p>
                <Select
                  value={String(prefs.maxConsoleLines)}
                  onValueChange={(val) => prefs.setMaxConsoleLines(Number(val))}
                >
                  <SelectTrigger className="w-full bg-studio-panel border-studio-border text-white text-xs rounded-sm font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-studio-panel border-studio-border text-slate-200 font-mono">
                    <SelectItem value="500">{t('preferences.lines_500')}</SelectItem>
                    <SelectItem value="1000">{t('preferences.lines_1000')}</SelectItem>
                    <SelectItem value="5000">{t('preferences.lines_5000')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {activeTab === 'hardware' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
                <div className="space-y-0.5 pr-2">
                  <label className="text-xs font-medium text-slate-200 font-mono block">
                    {t('preferences.hotplug_label')}
                  </label>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {t('preferences.hotplug_desc')}
                  </p>
                </div>
                <Switch
                  aria-label={t('preferences.hotplug_label')}
                  checked={prefs.panasonicHotplugEnabled}
                  onCheckedChange={prefs.setPanasonicHotplugEnabled}
                />
              </div>

              <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
                <label className="text-xs font-medium text-slate-200 font-mono block">
                  {t('preferences.poll_interval_label')}
                </label>
                <p className="text-[11px] text-slate-400 font-mono">
                  {t('preferences.poll_interval_desc')}
                </p>
                <Select
                  value={String(prefs.panasonicPollIntervalMs)}
                  onValueChange={(val) => prefs.setPanasonicPollIntervalMs(Number(val))}
                >
                  <SelectTrigger className="w-full bg-studio-panel border-studio-border text-white text-xs rounded-sm font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-studio-panel border-studio-border text-slate-200 font-mono">
                    <SelectItem value="1000">{t('preferences.poll_1s')}</SelectItem>
                    <SelectItem value="3000">{t('preferences.poll_3s')}</SelectItem>
                    <SelectItem value="5000">{t('preferences.poll_5s')}</SelectItem>
                    <SelectItem value="10000">{t('preferences.poll_10s')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
                <label className="text-xs font-medium text-slate-200 font-mono block">
                  {t('preferences.ai_device_label')}
                </label>
                <p className="text-[11px] text-slate-400 font-mono">
                  {t('preferences.ai_device_desc')}
                </p>
                <Select
                  value={prefs.preferredAiDevice}
                  onValueChange={(val) =>
                    prefs.setPreferredAiDevice(
                      val as 'auto' | 'vulkan' | 'cpu' | 'directml',
                    )
                  }
                >
                  <SelectTrigger className="w-full bg-studio-panel border-studio-border text-white text-xs rounded-sm font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-studio-panel border-studio-border text-slate-200 font-mono">
                    <SelectItem value="auto">{t('preferences.device_auto')}</SelectItem>
                    <SelectItem value="vulkan">{t('preferences.device_vulkan')}</SelectItem>
                    <SelectItem value="directml">{t('preferences.device_directml')}</SelectItem>
                    <SelectItem value="cpu">{t('preferences.device_cpu')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
                <label className="text-xs font-medium text-slate-200 font-mono block">
                  {t('preferences.whisper_threads_label')}
                </label>
                <p className="text-[11px] text-slate-400 font-mono">
                  {t('preferences.whisper_threads_desc')}
                </p>
                <Select
                  value={String(prefs.whisperMaxThreads)}
                  onValueChange={(val) => prefs.setWhisperMaxThreads(Number(val))}
                >
                  <SelectTrigger className="w-full bg-studio-panel border-studio-border text-white text-xs rounded-sm font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-studio-panel border-studio-border text-slate-200 font-mono">
                    <SelectItem value="2">{t('preferences.threads_2')}</SelectItem>
                    <SelectItem value="4">{t('preferences.threads_4')}</SelectItem>
                    <SelectItem value="8">{t('preferences.threads_8')}</SelectItem>
                    <SelectItem value="16">{t('preferences.threads_16')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
                <label className="text-xs font-medium text-slate-200 font-mono block">
                  {t('preferences.encoder_label')}
                </label>
                <p className="text-[11px] text-slate-400 font-mono">
                  {t('preferences.encoder_desc')}
                </p>
                <Select
                  value={prefs.hardwareEncoderPreference}
                  onValueChange={(val) =>
                    prefs.setHardwareEncoderPreference(
                      val as 'auto' | 'qsv' | 'nvenc' | 'amf' | 'software',
                    )
                  }
                >
                  <SelectTrigger className="w-full bg-studio-panel border-studio-border text-white text-xs rounded-sm font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-studio-panel border-studio-border text-slate-200 font-mono">
                    <SelectItem value="auto">{t('preferences.enc_auto')}</SelectItem>
                    <SelectItem value="qsv">{t('preferences.enc_qsv')}</SelectItem>
                    <SelectItem value="nvenc">{t('preferences.enc_nvenc')}</SelectItem>
                    <SelectItem value="amf">{t('preferences.enc_amf')}</SelectItem>
                    <SelectItem value="software">{t('preferences.enc_software')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {activeTab === 'interface' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
                <div className="space-y-0.5 pr-2">
                  <label className="text-xs font-medium text-slate-200 font-mono block">
                    {t('preferences.contrast_label')}
                  </label>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {t('preferences.contrast_desc')}
                  </p>
                </div>
                <Switch
                  aria-label={t('preferences.contrast_label')}
                  checked={prefs.highContrast}
                  onCheckedChange={(val) => {
                    prefs.setHighContrast(val);
                    if (val) {
                      document.body.classList.add('high-contrast');
                    } else {
                      document.body.classList.remove('high-contrast');
                    }
                  }}
                />
              </div>

              <div className="flex items-center justify-between bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
                <div className="space-y-0.5 pr-2">
                  <label className="text-xs font-medium text-slate-200 font-mono block">
                    {t('preferences.large_text_label')}
                  </label>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {t('preferences.large_text_desc')}
                  </p>
                </div>
                <Switch
                  aria-label={t('preferences.large_text_label')}
                  checked={prefs.largeText}
                  onCheckedChange={(val) => {
                    prefs.setLargeText(val);
                    if (val) {
                      document.documentElement.classList.add('large-text');
                    } else {
                      document.documentElement.classList.remove('large-text');
                    }
                  }}
                />
              </div>

              <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
                <label className="text-xs font-medium text-slate-200 font-mono block">
                  {t('preferences.theme_label')}
                </label>
                <p className="text-[11px] text-slate-400 font-mono">
                  {t('preferences.theme_desc')}
                </p>
                <Select
                  value={prefs.theme}
                  onValueChange={(val) => prefs.setTheme(val as 'dark' | 'oled_black')}
                >
                  <SelectTrigger className="w-full bg-studio-panel border-studio-border text-white text-xs rounded-sm font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-studio-panel border-studio-border text-slate-200 font-mono">
                    <SelectItem value="dark">{t('preferences.theme_dark')}</SelectItem>
                    <SelectItem value="oled_black">{t('preferences.theme_oled')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-studio-border shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={prefs.resetPreferences}
            className="h-8 text-xs font-mono rounded-sm border-studio-border bg-slate-800 text-slate-300 hover:text-white flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('preferences.reset_defaults')}</span>
          </Button>

          <Button
            size="sm"
            onClick={onClose}
            className="h-8 text-xs font-mono rounded-sm bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{t('preferences.close')}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
