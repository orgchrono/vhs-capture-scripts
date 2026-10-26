import React, { useEffect } from 'react'
import { Cpu, Film, Sparkles, Wrench, Globe, Eye, Video, Type, PanelLeft, PanelBottom, ShieldCheck, Settings } from 'lucide-react'
import { Button } from './ui/button'
import type { OutputCodec, SystemStatus } from '../types'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '../i18n'
import { usePreferencesStore } from '../store/usePreferencesStore'
import { useAppDispatch, useAppSelector } from '../store'
import { setOutputCodec } from '../store/studioSlice'

interface HeaderProps {
  status?: SystemStatus
  outputCodec?: OutputCodec
  onSelectOutputCodec?: (codec: OutputCodec) => void
  onInstallQtgmc: () => void
  isInstallingQtgmc: boolean
  isInstallingObs?: boolean
  onInstallObs?: () => void
  sidebarCollapsed?: boolean
  onToggleSidebar?: () => void
  consoleCollapsed?: boolean
  onToggleConsole?: () => void
  onOpenPrivacy?: () => void
  onOpenPreferences?: () => void
}

export const Header: React.FC<HeaderProps> = ({
  status,
  outputCodec,
  onSelectOutputCodec,
  onInstallQtgmc,
  isInstallingQtgmc,
  isInstallingObs,
  onInstallObs,
  sidebarCollapsed,
  onToggleSidebar,
  consoleCollapsed,
  onToggleConsole,
  onOpenPrivacy,
  onOpenPreferences,
}) => {
  const { t, i18n } = useTranslation();
  const prefs = usePreferencesStore();
  const dispatch = useAppDispatch();
  const reduxCodec = useAppSelector((state) => state.studio.outputCodec);
  const activeCodec = outputCodec ?? reduxCodec;

  const handleCodecChange = (newCodec: OutputCodec) => {
    if (onSelectOutputCodec) {
      onSelectOutputCodec(newCodec);
    } else {
      dispatch(setOutputCodec(newCodec));
    }
  };

  useEffect(() => {
    if (prefs.highContrast) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }
  }, [prefs.highContrast]);

  useEffect(() => {
    if (prefs.largeText) {
      document.documentElement.classList.add('large-text');
      document.body.classList.add('large-text');
    } else {
      document.documentElement.classList.remove('large-text');
      document.body.classList.remove('large-text');
    }
  }, [prefs.largeText]);

  useEffect(() => {
    if (prefs.theme === 'oled_black') {
      document.documentElement.classList.add('oled-theme');
      document.body.classList.add('oled-theme');
    } else {
      document.documentElement.classList.remove('oled-theme');
      document.body.classList.remove('oled-theme');
    }
  }, [prefs.theme]);

  return (
    <header className="border-b border-studio-border bg-studio-panel px-3 sm:px-5 flex items-center justify-between shrink-0 h-13 sm:h-14 z-20 select-none overflow-x-auto custom-scrollbar gap-2">
      <div className="flex items-center gap-2.5 shrink-0 min-w-0">
        <h1
          className="bg-studio-surface border border-studio-border text-slate-100 text-xs px-2.5 py-1.5 rounded-sm tracking-wider font-mono font-bold flex items-center gap-2 select-none shadow-sm cursor-default shrink-0 whitespace-nowrap"
          title={t('app.title')}
          aria-label={t('app.title')}
        >
          <span className="sr-only">{t('app.title')}</span>
          <Film className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
          <span className="text-white tracking-wider shrink-0 whitespace-nowrap">{t('app.brand_name')}</span>
          <span className="hidden sm:inline-block bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0 whitespace-nowrap">
            {t('app.brand_badge')}
          </span>
        </h1>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Language Selector (10 Global Archival Languages) */}
        <div
          className="flex items-center bg-studio-surface border border-studio-border rounded-sm px-2 py-0.5 text-xs text-slate-300 h-8 shrink-0 whitespace-nowrap"
        >
          <Globe className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" aria-hidden="true" />
          <select
            value={i18n.language}
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            aria-label={t('header.change_language')}
            title={t('header.change_language')}
            className="bg-transparent text-slate-200 text-xs font-mono focus:outline-none cursor-pointer pr-1"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code} className="bg-studio-panel text-slate-200">
                {lang.name} ({lang.region})
              </option>
            ))}
          </select>
        </div>

        {/* UI Accessibility & Compliance Controls */}
        <div className="flex items-center gap-1 bg-studio-surface border border-studio-border rounded-sm p-0.5 h-8 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className={`w-7 h-7 rounded-sm hover:bg-studio-surface-hover shrink-0 ${prefs.highContrast ? 'text-amber-400' : 'text-slate-400'}`}
            onClick={() => prefs.setHighContrast(!prefs.highContrast)}
            title={t('header.accessibility_contrast')}
            aria-label={t('header.accessibility_contrast')}
            aria-pressed={prefs.highContrast}
          >
            <Eye className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`w-7 h-7 rounded-sm hover:bg-studio-surface-hover shrink-0 ${prefs.largeText ? 'text-amber-400' : 'text-slate-400'}`}
            onClick={() => prefs.setLargeText(!prefs.largeText)}
            title={t('header.accessibility_text_size')}
            aria-label={t('header.accessibility_text_size')}
            aria-pressed={prefs.largeText}
          >
            <Type className="w-3.5 h-3.5" />
          </Button>
          {onOpenPrivacy && (
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 rounded-sm hover:bg-studio-surface-hover text-slate-400 hover:text-emerald-400 shrink-0"
              onClick={onOpenPrivacy}
              title={t('header.eula_terms')}
              aria-label={t('header.eula_terms')}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
            </Button>
          )}
          {onOpenPreferences && (
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 rounded-sm hover:bg-studio-surface-hover text-slate-400 hover:text-amber-400 shrink-0"
              onClick={onOpenPreferences}
              title={t('header.preferences_title')}
              aria-label={t('header.preferences_title')}
              data-testid="open-preferences-btn"
            >
              <Settings className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        {/* Workspace Layout Controls */}
        <div className="flex items-center gap-1 bg-studio-surface border border-studio-border rounded-sm p-0.5 h-8 shrink-0">
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="icon"
              className={`w-7 h-7 rounded-sm hover:bg-studio-surface-hover shrink-0 ${sidebarCollapsed ? 'text-slate-600' : 'text-slate-200'}`}
              onClick={onToggleSidebar}
              title={sidebarCollapsed ? t('header.expand_sidebar') : t('header.collapse_sidebar')}
              aria-label={sidebarCollapsed ? t('header.expand_sidebar') : t('header.collapse_sidebar')}
              aria-expanded={!sidebarCollapsed}
            >
              <PanelLeft className="w-3.5 h-3.5" />
            </Button>
          )}
          {onToggleConsole && (
            <Button
              variant="ghost"
              size="icon"
              className={`w-7 h-7 rounded-sm hover:bg-studio-surface-hover shrink-0 ${consoleCollapsed ? 'text-slate-600' : 'text-emerald-400'}`}
              onClick={onToggleConsole}
              title={consoleCollapsed ? t('header.expand_console') : t('header.collapse_console')}
              aria-label={consoleCollapsed ? t('header.expand_console') : t('header.collapse_console')}
              aria-expanded={!consoleCollapsed}
            >
              <PanelBottom className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        <div className="w-px h-5 bg-studio-border mx-0.5 hidden sm:block shrink-0" />

        {/* Hardware Status & Encoder Selector Tally */}
        <div className="hidden md:flex items-center gap-1.5 bg-studio-surface border border-studio-border px-2.5 py-1 rounded-sm text-xs h-8 shrink-0 whitespace-nowrap">
          <Cpu className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          <span className="text-slate-400 text-[10px] font-mono uppercase shrink-0 whitespace-nowrap">{t('header.encoder_prefix')}</span>
          <select
            value={activeCodec}
            onChange={(e) => handleCodecChange(e.target.value as OutputCodec)}
            aria-label={t('settings.output_codec_label')}
            title={t('settings.output_codec_label')}
            data-testid="header-codec-select"
            className="bg-transparent text-amber-400 text-[11px] font-mono font-bold uppercase focus:outline-none cursor-pointer pr-1"
          >
            <option value="h264" className="bg-studio-panel text-slate-200">{t('header.codec_h264')}</option>
            <option value="hevc" className="bg-studio-panel text-slate-200">{t('header.codec_hevc')}</option>
            <option value="prores" className="bg-studio-panel text-slate-200">{t('header.codec_prores')}</option>
            <option value="ffv1" className="bg-studio-panel text-slate-200">{t('header.codec_ffv1')}</option>
          </select>
          {status?.hardware?.ram?.total_gb !== undefined && (
            <span className="text-slate-500 font-mono text-[10px] shrink-0">
              • {status.hardware.ram.total_gb.toFixed(1)}GB
            </span>
          )}
        </div>

        <div className="hidden md:flex items-center gap-1.5 bg-studio-surface border border-studio-border px-2 py-1 rounded-sm text-xs h-8 shrink-0 whitespace-nowrap">
          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          {status?.vapoursynth_available ? (
            <span className="flex items-center gap-1.5 text-slate-200 font-semibold text-[11px] bg-studio-panel border border-studio-border px-2 py-0.5 rounded-sm font-mono shrink-0 whitespace-nowrap">
              <span className="led-lamp led-live shrink-0" />
              <span className="shrink-0 whitespace-nowrap">{t('header.qtgmc_installed')}</span>
            </span>
          ) : (
            <Button variant="outline" size="sm" onClick={onInstallQtgmc} disabled={isInstallingQtgmc} className="h-6 px-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-200 border-studio-border font-mono rounded-sm shrink-0 whitespace-nowrap">
              <Wrench className="w-3 h-3 mr-1 shrink-0" />
              <span className="shrink-0 whitespace-nowrap">{isInstallingQtgmc ? t('header.installing') : t('header.install_qtgmc')}</span>
            </Button>
          )}
        </div>
      
        <div className="hidden xl:flex items-center gap-1.5 bg-studio-surface border border-studio-border px-2 py-1 rounded-sm text-xs h-8 shrink-0 whitespace-nowrap">
          <Video className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {status?.obs_installed ? (
            <span className="flex items-center gap-1.5 text-slate-200 font-semibold text-[11px] bg-studio-panel border border-studio-border px-2 py-0.5 rounded-sm font-mono shrink-0 whitespace-nowrap">
              <span className={`led-lamp ${status?.obs_connected ? 'led-live' : 'led-idle'} shrink-0`} />
              <span className="shrink-0 whitespace-nowrap">{t('header.obs_installed')}</span>
            </span>
          ) : (
            <Button variant="outline" size="sm" onClick={onInstallObs} disabled={isInstallingObs} className="h-6 px-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-200 border-studio-border font-mono rounded-sm shrink-0 whitespace-nowrap">
              <Wrench className="w-3 h-3 mr-1 shrink-0" />
              <span className="shrink-0 whitespace-nowrap">{isInstallingObs ? t('header.installing') : t('header.install_obs')}</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
