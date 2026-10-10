import React, { useState } from 'react';
import {
  ShieldCheck,
  ServerOff,
  FileCheck,
  Share2,
  AlertOctagon,
  AlertTriangle,
  UserCheck,
  X,
} from 'lucide-react';
import { Button } from './ui/button';
import { useTranslation } from 'react-i18next';

interface PrivacyModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const PrivacyModal: React.FC<PrivacyModalProps> = ({
  isOpen: propIsOpen = false,
  onClose,
}) => {
  const [internalOpen, setInternalOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return !localStorage.getItem('vhs_studio_eula_accepted');
  });
  const { t } = useTranslation();

  const isModalOpen = propIsOpen || internalOpen;

  const handleAccept = () => {
    localStorage.setItem('vhs_studio_eula_accepted', 'true');
    setInternalOpen(false);
    onClose?.();
  };

  const handleDismiss = () => {
    setInternalOpen(false);
    onClose?.();
  };

  if (!isModalOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="compliance-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200"
    >
      <div className="bg-[#0b0f17] border border-white/10 rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4 pb-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h2 id="compliance-modal-title" className="text-lg font-bold text-slate-100 flex items-center gap-2">
                {t('privacy.title')}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {t('privacy.subtitle')}
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={handleDismiss}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition cursor-pointer"
              aria-label="Fechar modal"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Scrollable Terms Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3.5 my-2">
          
          {/* 1. Grant of use */}
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-white/5 flex gap-3 items-start">
            <FileCheck className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                {t('privacy.grant_title')}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {t('privacy.grant_desc')}
              </p>
            </div>
          </div>

          {/* 2. Redistribution */}
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-white/5 flex gap-3 items-start">
            <Share2 className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                {t('privacy.redist_title')}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {t('privacy.redist_desc')}
              </p>
            </div>
          </div>

          {/* 3. No warranty */}
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-white/5 flex gap-3 items-start">
            <AlertOctagon className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                {t('privacy.warranty_title')}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {t('privacy.warranty_desc')}
              </p>
            </div>
          </div>

          {/* 4. Limitation of liability */}
          <div className="bg-red-950/20 p-3.5 rounded-xl border border-red-500/20 flex gap-3 items-start">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-red-300 uppercase tracking-wider">
                {t('privacy.liability_title')}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {t('privacy.liability_desc')}
              </p>
            </div>
          </div>

          {/* 5. User responsibility */}
          <div className="bg-amber-950/20 p-3.5 rounded-xl border border-amber-500/20 flex gap-3 items-start">
            <UserCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                {t('privacy.user_resp_title')}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {t('privacy.user_resp_desc')}
              </p>
            </div>
          </div>

          {/* 6. Local execution & Privacy */}
          <div className="bg-emerald-950/20 p-3.5 rounded-xl border border-emerald-500/20 flex gap-3 items-start">
            <ServerOff className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                {t('privacy.privacy_title')}
              </h3>
              <p
                className="text-xs text-slate-400 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: t('privacy.privacy_desc') }}
              />
            </div>
          </div>

        </div>

        {/* Acceptance Note & Action Button */}
        <div className="pt-4 mt-2 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
          <p className="text-[11px] text-slate-400 leading-relaxed max-w-md">
            {t('privacy.acceptance_note')}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={handleAccept}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold tracking-wide px-6 py-2 rounded-lg shadow-lg shadow-emerald-500/20 transition cursor-pointer"
            >
              {t('privacy.accept_btn')}
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
};