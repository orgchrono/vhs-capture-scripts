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
import { GenericSelect } from './settings/SettingsPrimitives';
import { useTranslation } from 'react-i18next';
import { usePreferencesViewModel, type PreferencesTabType } from '../viewmodels/usePreferencesViewModel';
import { DirectoryPickerModal } from './DirectoryPickerModal';

const DEPTH_OPTIONS = [
  { value: '1', labelKey: 'folders.depth_1' },
  { value: '2', labelKey: 'folders.depth_2' },
  { value: '3', labelKey: 'folders.depth_3' },
  { value: '4', labelKey: 'folders.depth_4' },
  { value: '5', labelKey: 'folders.depth_5' },
];

const PREVIEW_FPS_OPTIONS = [
  { value: '15', labelKey: 'preferences.fps_15' },
  { value: '30', labelKey: 'preferences.fps_30' },
  { value: '60', labelKey: 'preferences.fps_60' },
];

const BUFFER_LINES_OPTIONS = [
  { value: '500', labelKey: 'preferences.lines_500' },
  { value: '1000', labelKey: 'preferences.lines_1000' },
  { value: '5000', labelKey: 'preferences.lines_5000' },
];

const POLL_INTERVAL_OPTIONS = [
  { value: '1000', labelKey: 'preferences.poll_1s' },
  { value: '3000', labelKey: 'preferences.poll_3s' },
  { value: '5000', labelKey: 'preferences.poll_5s' },
  { value: '10000', labelKey: 'preferences.poll_10s' },
];

const AI_DEVICE_OPTIONS = [
  { value: 'auto', labelKey: 'preferences.device_auto' },
  { value: 'vulkan', labelKey: 'preferences.device_vulkan' },
  { value: 'directml', labelKey: 'preferences.device_directml' },
  { value: 'cpu', labelKey: 'preferences.device_cpu' },
];

const THREADS_OPTIONS = [
  { value: '2', labelKey: 'preferences.threads_2' },
  { value: '4', labelKey: 'preferences.threads_4' },
  { value: '8', labelKey: 'preferences.threads_8' },
  { value: '16', labelKey: 'preferences.threads_16' },
];

const HARDWARE_ENCODER_OPTIONS = [
  { value: 'auto', labelKey: 'preferences.enc_auto' },
  { value: 'qsv', labelKey: 'preferences.enc_qsv' },
  { value: 'nvenc', labelKey: 'preferences.enc_nvenc' },
  { value: 'amf', labelKey: 'preferences.enc_amf' },
  { value: 'software', labelKey: 'preferences.enc_software' },
];

const THEME_OPTIONS = [
  { value: 'dark', labelKey: 'preferences.theme_dark' },
  { value: 'oled_black', labelKey: 'preferences.theme_oled' },
];

interface AppPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPrivacy?: () => void;
}

export type { PreferencesTabType as TabType };

interface DirectoryFieldProps {
  label: string;
  description: string;
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  onBrowse: () => void;
  browseTitle: string;
}

const DirectoryField: React.FC<DirectoryFieldProps> = ({
  label,
  description,
  value,
  onChange,
  placeholder,
  onBrowse,
  browseTitle,
}) => (
  <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
    <label className="text-xs font-medium text-slate-200 font-mono block">
      {label}
    </label>
    <p className="text-[11px] text-slate-400 font-mono">
      {description}
    </p>
    <div className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-studio-panel border-studio-border rounded-sm font-mono text-xs text-slate-200 flex-1"
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={onBrowse}
        className="h-8 px-3 font-mono text-xs text-slate-300 hover:text-white shrink-0 cursor-pointer"
        title={browseTitle}
      >
        <Folder className="w-3.5 h-3.5 mr-1 text-amber-400" />
        <span>{browseTitle}</span>
      </Button>
    </div>
  </div>
);

export const AppPreferencesModal: React.FC<AppPreferencesModalProps> = ({
  isOpen,
  onClose,
  onOpenPrivacy,
}) => {
  const { t } = useTranslation();
  const [pickerTarget, setPickerTarget] = useState<'rawDir' | 'restoredDir' | 'cacheDir' | null>(null);
  const {
    prefs,
    activeTab,
    setActiveTab,
    handleSaveAndClose,
    handleReset,
  } = usePreferencesViewModel(onClose, isOpen);

  if (!isOpen) return null;

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="preferences-modal-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200"
      >
      <div className="bg-studio-panel border border-studio-border rounded-md max-w-3xl w-full h-[600px] max-h-[92vh] p-5 shadow-2xl flex flex-col overflow-hidden select-none">
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
        <div className="flex border-b border-studio-border gap-1 pb-2 shrink-0 overflow-x-auto custom-scrollbar" role="tablist">
          <Button
            role="tab"
            aria-selected={activeTab === 'directories'}
            variant={activeTab === 'directories' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('directories')}
            className={`h-8 text-xs font-mono rounded-sm flex items-center gap-1.5 ${activeTab === 'directories'
                ? 'bg-studio-surface text-amber-400 border border-studio-border'
                : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <Folder className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('preferences.tab_storage')}</span>
          </Button>
          <Button
            role="tab"
            aria-selected={activeTab === 'performance'}
            variant={activeTab === 'performance' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('performance')}
            className={`h-8 text-xs font-mono rounded-sm flex items-center gap-1.5 ${activeTab === 'performance'
                ? 'bg-studio-surface text-amber-400 border border-studio-border'
                : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <Sliders className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('preferences.tab_performance')}</span>
          </Button>
          <Button
            role="tab"
            aria-selected={activeTab === 'console'}
            variant={activeTab === 'console' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('console')}
            className={`h-8 text-xs font-mono rounded-sm flex items-center gap-1.5 ${activeTab === 'console'
                ? 'bg-studio-surface text-amber-400 border border-studio-border'
                : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('preferences.tab_console')}</span>
          </Button>
          <Button
            role="tab"
            aria-selected={activeTab === 'hardware'}
            variant={activeTab === 'hardware' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('hardware')}
            className={`h-8 text-xs font-mono rounded-sm flex items-center gap-1.5 ${activeTab === 'hardware'
                ? 'bg-studio-surface text-amber-400 border border-studio-border'
                : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <Cpu className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('preferences.tab_hardware')}</span>
          </Button>
          <Button
            role="tab"
            aria-selected={activeTab === 'interface'}
            variant={activeTab === 'interface' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('interface')}
            className={`h-8 text-xs font-mono rounded-sm flex items-center gap-1.5 ${activeTab === 'interface'
                ? 'bg-studio-surface text-amber-400 border border-studio-border'
                : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            <Palette className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{t('preferences.tab_interface')}</span>
          </Button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-4">
          {activeTab === 'directories' && (
            <div className="space-y-4">
              <DirectoryField
                label={t('preferences.raw_dir_label')}
                description={t('preferences.raw_dir_desc')}
                value={prefs.rawDir}
                onChange={(val) => prefs.updatePreferences({ rawDir: val })}
                placeholder={t('preferences.raw_dir_placeholder')}
                onBrowse={() => setPickerTarget('rawDir')}
                browseTitle={t('preferences.browse')}
              />

              <DirectoryField
                label={t('preferences.restored_dir_label')}
                description={t('preferences.restored_dir_desc')}
                value={prefs.restoredDir}
                onChange={(val) => prefs.updatePreferences({ restoredDir: val })}
                placeholder={t('preferences.restored_dir_placeholder')}
                onBrowse={() => setPickerTarget('restoredDir')}
                browseTitle={t('preferences.browse')}
              />

              <DirectoryField
                label={t('preferences.cache_dir_label')}
                description={t('preferences.cache_dir_desc')}
                value={prefs.cacheDir}
                onChange={(val) => prefs.updatePreferences({ cacheDir: val })}
                placeholder={t('preferences.cache_dir_placeholder')}
                onBrowse={() => setPickerTarget('cacheDir')}
                browseTitle={t('preferences.browse')}
              />

              <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
                <label className="text-xs font-medium text-slate-200 font-mono block">
                  {t('preferences.scan_max_depth_label')}
                </label>
                <p className="text-[11px] text-slate-400 font-mono">
                  {t('preferences.scan_max_depth_desc')}
                </p>
                <GenericSelect
                  value={String(prefs.scanMaxDepth || 3)}
                  onChange={(val) => prefs.setScanMaxDepth(Number(val))}
                  options={DEPTH_OPTIONS}
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
                <GenericSelect
                  value={String(prefs.previewFps)}
                  onChange={(val) => prefs.setPreviewFps(Number(val) as 15 | 30 | 60)}
                  options={PREVIEW_FPS_OPTIONS}
                />
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
                <GenericSelect
                  value={String(prefs.maxConsoleLines)}
                  onChange={(val) => prefs.setMaxConsoleLines(Number(val))}
                  options={BUFFER_LINES_OPTIONS}
                />
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
                <GenericSelect
                  value={String(prefs.panasonicPollIntervalMs)}
                  onChange={(val) => prefs.setPanasonicPollIntervalMs(Number(val))}
                  options={POLL_INTERVAL_OPTIONS}
                />
              </div>

              <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
                <label className="text-xs font-medium text-slate-200 font-mono block">
                  {t('preferences.ai_device_label')}
                </label>
                <p className="text-[11px] text-slate-400 font-mono">
                  {t('preferences.ai_device_desc')}
                </p>
                <GenericSelect
                  value={prefs.preferredAiDevice}
                  onChange={(val) =>
                    prefs.setPreferredAiDevice(
                      val as 'auto' | 'vulkan' | 'cpu' | 'directml',
                    )
                  }
                  options={AI_DEVICE_OPTIONS}
                />
              </div>

              <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
                <label className="text-xs font-medium text-slate-200 font-mono block">
                  {t('preferences.whisper_threads_label')}
                </label>
                <p className="text-[11px] text-slate-400 font-mono">
                  {t('preferences.whisper_threads_desc')}
                </p>
                <GenericSelect
                  value={String(prefs.whisperMaxThreads)}
                  onChange={(val) => prefs.setWhisperMaxThreads(Number(val))}
                  options={THREADS_OPTIONS}
                />
              </div>

              <div className="space-y-1.5 bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
                <label className="text-xs font-medium text-slate-200 font-mono block">
                  {t('preferences.encoder_label')}
                </label>
                <p className="text-[11px] text-slate-400 font-mono">
                  {t('preferences.encoder_desc')}
                </p>
                <GenericSelect
                  value={prefs.hardwareEncoderPreference}
                  onChange={(val) =>
                    prefs.setHardwareEncoderPreference(
                      val as 'auto' | 'qsv' | 'nvenc' | 'amf' | 'software',
                    )
                  }
                  options={HARDWARE_ENCODER_OPTIONS}
                />
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
                <GenericSelect
                  value={prefs.theme}
                  onChange={(val) => prefs.setTheme(val as 'dark' | 'oled_black')}
                  options={THEME_OPTIONS}
                />
              </div>

              {onOpenPrivacy && (
                <div className="flex items-center justify-between bg-studio-surface/50 p-3 rounded-sm border border-studio-border">
                  <div className="space-y-0.5 pr-2">
                    <label className="text-xs font-medium text-slate-200 font-mono block">
                      {t('privacy.title')}
                    </label>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {t('privacy.subtitle')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onClose();
                      onOpenPrivacy();
                    }}
                    className="h-7 text-xs font-mono shrink-0 whitespace-nowrap bg-studio-panel border-studio-border text-slate-200 hover:text-white"
                  >
                    {t('privacy.grant_title')}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-studio-border shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="h-8 text-xs font-mono rounded-sm border-studio-border bg-slate-800 text-slate-300 hover:text-white flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{t('preferences.reset_defaults')}</span>
          </Button>

          <Button
            size="sm"
            onClick={handleSaveAndClose}
            className="h-8 text-xs font-mono rounded-sm bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{t('preferences.close')}</span>
          </Button>
        </div>
      </div>
    </div>

    <DirectoryPickerModal
      isOpen={pickerTarget !== null}
      onClose={() => setPickerTarget(null)}
      initialPath={pickerTarget ? prefs[pickerTarget] : ''}
      onSelect={(selectedPath) => {
        if (pickerTarget) {
          prefs.updatePreferences({ [pickerTarget]: selectedPath });
        }
      }}
    />
  </>
);
};
