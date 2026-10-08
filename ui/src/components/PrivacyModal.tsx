import React, { useState, useEffect } from 'react';
import { ShieldCheck, ServerOff, Lock } from 'lucide-react';
import { Button } from './ui/button';
import { useTranslation } from 'react-i18next';

export const PrivacyModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const hasAccepted = localStorage.getItem('vhs_studio_eula_accepted');
    if (!hasAccepted) {
      setIsOpen(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('vhs_studio_eula_accepted', 'true');
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0f1423] border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl flex flex-col animate-in fade-in zoom-in duration-300">
        
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
          <div className="p-2.5 bg-emerald-500/10 rounded-lg">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100">{t('privacy.title')}</h2>
            <p className="text-xs text-slate-400">{t('privacy.subtitle')}</p>
          </div>
        </div>

        <div className="space-y-4 mb-8">
          <div className="flex gap-3">
            <ServerOff className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-slate-200">{t('privacy.local_exec_title')}</h3>
              <p className="text-xs text-slate-400 leading-relaxed mt-1" dangerouslySetInnerHTML={{ __html: t('privacy.local_exec_desc') }} />
            </div>
          </div>

          <div className="flex gap-3">
            <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-slate-200">{t('privacy.cloud_title')}</h3>
              <p className="text-xs text-slate-400 leading-relaxed mt-1" dangerouslySetInnerHTML={{ __html: t('privacy.cloud_desc') }} />
            </div>
          </div>
        </div>

        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 mb-6">
          <p className="text-[11px] text-slate-500 leading-relaxed text-justify">
            {t('privacy.license_disclaimer')}
          </p>
        </div>

        <div className="flex justify-end gap-3 mt-auto">
          <Button 
            onClick={handleAccept}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold tracking-wide"
          >
            {t('privacy.accept_btn')}
          </Button>
        </div>
        
      </div>
    </div>
  );
};