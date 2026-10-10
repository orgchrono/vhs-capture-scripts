import React, { useState, useEffect } from 'react'
import { Cpu, Film, Sparkles, Wrench, Globe, Eye, Video, Type, PanelLeft, PanelBottom, ShieldCheck } from 'lucide-react'
import { Button } from './ui/button'
import type { SystemStatus } from '../types'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES } from '../i18n'

interface HeaderProps {
  status?: SystemStatus
  onInstallQtgmc: () => void
  isInstallingQtgmc: boolean
  isInstallingObs?: boolean
  onInstallObs?: () => void
  sidebarCollapsed?: boolean
  onToggleSidebar?: () => void
  consoleCollapsed?: boolean
  onToggleConsole?: () => void
  onOpenPrivacy?: () => void
}

export const Header: React.FC<HeaderProps> = ({
  status,
  onInstallQtgmc,
  isInstallingQtgmc,
  isInstallingObs,
  onInstallObs,
  sidebarCollapsed,
  onToggleSidebar,
  consoleCollapsed,
  onToggleConsole,
  onOpenPrivacy,
}) => {
  const { t, i18n } = useTranslation();
  const [highContrast, setHighContrast] = useState(false)
  const [largeText, setLargeText] = useState(false);

  useEffect(() => {
    if (highContrast) {
      document.body.classList.add('high-contrast');
    } else {
      document.body.classList.remove('high-contrast');
    }
  }, [highContrast]);

  return (
    <header className="border-b border-studio-border bg-studio-panel px-4 sm:px-6 flex items-center justify-between shrink-0 h-14 sm:h-15 z-20 select-none">
      <div className="flex items-center gap-3">
        <div className="bg-studio-surface border border-studio-border text-slate-100 text-xs px-2.5 py-1.5 rounded-sm tracking-wider uppercase font-mono font-bold flex items-center gap-2 select-none shadow-sm">
          <Film className="w-3.5 h-3.5 text-amber-500" />
          <span>VHS STUDIO</span>
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-sm sm:text-base font-bold tracking-tight text-white flex items-center gap-2 font-mono">
            <span>VHS Studio Pro</span>
            <span className="text-[9px] bg-studio-surface text-slate-300 border border-studio-border px-2 py-0.5 rounded-sm font-mono font-semibold">
              NEXTGEN
            </span>
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Language Selector (10 Global Archival Languages) */}
        <div
          className="flex items-center bg-studio-surface border border-studio-border rounded-sm px-2 py-0.5 text-xs text-slate-300 h-8"
        >
          <Globe className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
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
        <div className="flex items-center gap-1 bg-studio-surface border border-studio-border rounded-sm p-0.5 h-8">
          <Button
            variant="ghost"
            size="icon"
            className={`w-7 h-7 rounded-sm hover:bg-studio-surface-hover ${highContrast ? 'text-amber-400' : 'text-slate-400'}`}
            onClick={() => setHighContrast(!highContrast)}
            title={t('header.accessibility_contrast')}
          >
            <Eye className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`w-7 h-7 rounded-sm hover:bg-studio-surface-hover ${largeText ? 'text-slate-200' : 'text-slate-400'}`}
            onClick={() => {
              const next = !largeText;
              setLargeText(next);
              if (next) {
                document.documentElement.classList.add('large-text');
              } else {
                document.documentElement.classList.remove('large-text');
              }
            }}
            title={t('header.accessibility_text_size')}
          >
            <Type className="w-3.5 h-3.5" />
          </Button>
          {onOpenPrivacy && (
            <Button
              variant="ghost"
              size="icon"
              className="w-7 h-7 rounded-sm hover:bg-studio-surface-hover text-slate-400 hover:text-emerald-400"
              onClick={onOpenPrivacy}
              title={t('header.eula_terms')}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        {/* Workspace Layout Controls */}
        <div className="flex items-center gap-1 bg-studio-surface border border-studio-border rounded-sm p-0.5 h-8">
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="icon"
              className={`w-7 h-7 rounded-sm hover:bg-studio-surface-hover ${sidebarCollapsed ? 'text-slate-600' : 'text-slate-200'}`}
              onClick={onToggleSidebar}
              title={sidebarCollapsed ? t('header.expand_sidebar') : t('header.collapse_sidebar')}
            >
              <PanelLeft className="w-3.5 h-3.5" />
            </Button>
          )}
          {onToggleConsole && (
            <Button
              variant="ghost"
              size="icon"
              className={`w-7 h-7 rounded-sm hover:bg-studio-surface-hover ${consoleCollapsed ? 'text-slate-600' : 'text-emerald-400'}`}
              onClick={onToggleConsole}
              title={consoleCollapsed ? t('header.expand_console') : t('header.collapse_console')}
            >
              <PanelBottom className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        <div className="w-px h-5 bg-studio-border mx-0.5 hidden sm:block" />

        {/* Hardware Status Tally Indicators */}
        <div className="hidden md:flex items-center gap-2 bg-studio-surface border border-studio-border px-2.5 py-1 rounded-sm text-xs h-8">
          <Cpu className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400 text-[10px] font-mono uppercase">ENC:</span>
          <strong className="text-white font-mono uppercase text-[11px]">
            {status?.encoder || t('status.detecting')}
          </strong>
        </div>

        <div className="hidden sm:flex items-center gap-2 bg-studio-surface border border-studio-border px-2.5 py-1 rounded-sm text-xs h-8">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          {status?.vapoursynth_available ? (
            <span className="flex items-center gap-1.5 text-slate-200 font-semibold text-[11px] bg-studio-panel border border-studio-border px-2 py-0.5 rounded-sm font-mono">
              <span className="led-lamp led-live" />
              {t('header.qtgmc_installed')}
            </span>
          ) : (
            <Button variant="outline" size="sm" onClick={onInstallQtgmc} disabled={isInstallingQtgmc} className="h-6 px-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-200 border-studio-border font-mono rounded-sm">
              <Wrench className="w-3 h-3 mr-1" />
              {isInstallingQtgmc ? t('header.installing') : t('header.install_qtgmc')}
            </Button>
          )}
        </div>
      
        <div className="hidden sm:flex items-center gap-2 bg-studio-surface border border-studio-border px-2.5 py-1 rounded-sm text-xs h-8">
          <Video className="w-3.5 h-3.5 text-slate-400" />
          {status?.obs_connected ? (
            <span className="flex items-center gap-1.5 text-slate-200 font-semibold text-[11px] bg-studio-panel border border-studio-border px-2 py-0.5 rounded-sm font-mono">
              <span className="led-lamp led-live" />
              {t('header.obs_installed')}
            </span>
          ) : (
            <Button variant="outline" size="sm" onClick={onInstallObs} disabled={isInstallingObs} className="h-6 px-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-200 border-studio-border font-mono rounded-sm">
              <Wrench className="w-3 h-3 mr-1" />
              {isInstallingObs ? t('header.installing') : t('header.install_obs')}
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
