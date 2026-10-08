import React, { useState, useEffect } from 'react'
import { Cpu, Film, Sparkles, Wrench, Globe, Eye, Video, Type } from 'lucide-react'
import { Button } from './ui/button'
import type { SystemStatus } from '../types'
import { useTranslation } from 'react-i18next'

interface HeaderProps {
  status?: SystemStatus
  onInstallQtgmc: () => void
  isInstallingQtgmc: boolean
  isInstallingObs?: boolean
  onInstallObs?: () => void
}

export const Header: React.FC<HeaderProps> = ({ status, onInstallQtgmc, isInstallingQtgmc , isInstallingObs, onInstallObs }) => {
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
    <header className="border-b border-white/10 bg-[#0b0f17] px-6 py-4 flex items-center justify-between shrink-0 h-[72px]">
      <div className="flex items-center gap-3">
        <div className="bg-gradient-to-br from-red-600 via-orange-500 to-amber-500 text-white font-extrabold text-xs px-2.5 py-1 rounded-md tracking-wider uppercase shadow-md flex items-center gap-1.5">
          <Film className="w-4 h-4" />
          VHS Studio
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
            VHS Studio Pro
            <span className="text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded-full font-mono font-medium">
              NEXTGEN
            </span>
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* UI Controls */}
        <div className="flex items-center gap-1 bg-slate-900/80 border border-white/10 rounded-lg p-1">
          <Button variant="ghost" size="icon" className="w-8 h-8 rounded-md hover:bg-slate-800 text-slate-300" onClick={toggleLanguage} title="Change Language / Mudar Idioma">
            <Globe className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className={`w-8 h-8 rounded-md hover:bg-slate-800 ${highContrast ? 'text-amber-400' : 'text-slate-300'}`} onClick={() => setHighContrast(!highContrast)} title="Acessibilidade: Alto Contraste">
            <Eye className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className={`w-8 h-8 rounded-md hover:bg-slate-800 ${largeText ? 'text-indigo-400' : 'text-slate-300'}`} onClick={() => {
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
        </div>

        <div className="w-px h-6 bg-white/10 mx-1"></div>

        {/* Badges */}
        <div className="flex items-center gap-2 bg-slate-900/80 border border-white/10 px-3 py-1.5 rounded-lg text-xs">
          <Cpu className="w-3.5 h-3.5 text-sky-400" />
          <strong className="text-white font-mono uppercase">
            {status?.encoder || t('status.detecting')}
          </strong>
        </div>

        <div className="flex items-center gap-2 bg-slate-900/80 border border-white/10 px-3 py-1.5 rounded-lg text-xs">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          {status?.vapoursynth_available ? (
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
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
      
        <div className="flex items-center gap-2 bg-slate-900/80 border border-white/10 px-3 py-1.5 rounded-lg text-xs">
          <Video className="w-3.5 h-3.5 text-indigo-400" />
          {status?.obs_connected ? (
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
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
