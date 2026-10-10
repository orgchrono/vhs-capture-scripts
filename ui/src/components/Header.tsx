import React, { useState, useEffect } from 'react'
import { Cpu, Film, Sparkles, Wrench, Globe, Eye, Video, Type, PanelLeft, PanelBottom, ShieldCheck } from 'lucide-react'
import { Button } from './ui/button'
import type { SystemStatus } from '../types'
import { useTranslation } from 'react-i18next'

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

  const toggleLanguage = () => {
    const nextLang = i18n.language === 'pt-BR' ? 'en-US' : 'pt-BR';
    i18n.changeLanguage(nextLang);
  };

  return (
    <header className="border-b border-white/10 bg-[#080c14]/95 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between shrink-0 h-14 sm:h-16 z-20">
      <div className="flex items-center gap-3">
        <div className="bg-gradient-to-r from-red-600 via-orange-500 to-amber-500 text-white font-extrabold text-xs px-2.5 py-1 rounded-lg tracking-wider uppercase shadow-md shadow-red-900/20 flex items-center gap-1.5 shrink-0 select-none">
          <Film className="w-4 h-4" />
          <span>VHS Studio</span>
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
            <span>VHS Studio Pro</span>
            <span className="text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded-full font-mono font-medium">
              NEXTGEN
            </span>
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {/* UI Controls */}
        <div className="flex items-center gap-1 bg-slate-900/90 border border-white/10 rounded-lg p-0.5">
          <Button variant="ghost" size="icon" className="w-7.5 h-7.5 rounded-md hover:bg-slate-800 text-slate-300" onClick={toggleLanguage} title="Change Language / Mudar Idioma">
            <Globe className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className={`w-7.5 h-7.5 rounded-md hover:bg-slate-800 ${highContrast ? 'text-amber-400' : 'text-slate-300'}`} onClick={() => setHighContrast(!highContrast)} title="Acessibilidade: Alto Contraste">
            <Eye className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className={`w-7.5 h-7.5 rounded-md hover:bg-slate-800 ${largeText ? 'text-indigo-400' : 'text-slate-300'}`} onClick={() => {
            const next = !largeText;
            setLargeText(next);
            if (next) {
              document.documentElement.classList.add('large-text');
            } else {
              document.documentElement.classList.remove('large-text');
            }
          }} title="Acessibilidade: Aumentar Texto">
            <Type className="w-4 h-4" />
          </Button>
          {onOpenPrivacy && (
            <Button
              variant="ghost"
              size="icon"
              className="w-7.5 h-7.5 rounded-md hover:bg-slate-800 text-slate-300 hover:text-emerald-400"
              onClick={onOpenPrivacy}
              title="Termos de Licença & Conformidade (EULA)"
            >
              <ShieldCheck className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Workspace Layout Controls */}
        <div className="flex items-center gap-1 bg-slate-900/90 border border-white/10 rounded-lg p-0.5">
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="icon"
              className={`w-7.5 h-7.5 rounded-md hover:bg-slate-800 ${sidebarCollapsed ? 'text-slate-500' : 'text-sky-400'}`}
              onClick={onToggleSidebar}
              title={sidebarCollapsed ? "Expandir Painel Lateral" : "Recolher Painel Lateral"}
            >
              <PanelLeft className="w-4 h-4" />
            </Button>
          )}
          {onToggleConsole && (
            <Button
              variant="ghost"
              size="icon"
              className={`w-7.5 h-7.5 rounded-md hover:bg-slate-800 ${consoleCollapsed ? 'text-slate-500' : 'text-emerald-400'}`}
              onClick={onToggleConsole}
              title={consoleCollapsed ? "Expandir Console de Monitoramento" : "Recolher Console"}
            >
              <PanelBottom className="w-4 h-4" />
            </Button>
          )}
        </div>

        <div className="w-px h-5 bg-white/10 mx-0.5 hidden sm:block"></div>

        {/* Badges */}
        <div className="hidden md:flex items-center gap-2 bg-slate-900/90 border border-white/10 px-2.5 py-1 rounded-lg text-xs h-8">
          <Cpu className="w-3.5 h-3.5 text-sky-400" />
          <strong className="text-white font-mono uppercase text-[11px]">
            {status?.encoder || t('status.detecting')}
          </strong>
        </div>

        <div className="hidden sm:flex items-center gap-2 bg-slate-900/90 border border-white/10 px-2.5 py-1 rounded-lg text-xs h-8">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          {status?.vapoursynth_available ? (
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              QTGMC
            </span>
          ) : (
            <Button variant="outline" size="sm" onClick={onInstallQtgmc} disabled={isInstallingQtgmc} className="h-6 px-2 text-[10px] bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border-sky-500/40">
              <Wrench className="w-3 h-3 mr-1" />
              {isInstallingQtgmc ? "Instalando..." : "Instalar QTGMC"}
            </Button>
          )}
        </div>
      
        <div className="hidden sm:flex items-center gap-2 bg-slate-900/90 border border-white/10 px-2.5 py-1 rounded-lg text-xs h-8">
          <Video className="w-3.5 h-3.5 text-indigo-400" />
          {status?.obs_connected ? (
            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              OBS
            </span>
          ) : (
            <Button variant="outline" size="sm" onClick={onInstallObs} disabled={isInstallingObs} className="h-6 px-2 text-[10px] bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border-indigo-500/40">
              <Wrench className="w-3 h-3 mr-1" />
              {isInstallingObs ? "Instalando..." : "Instalar OBS"}
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
