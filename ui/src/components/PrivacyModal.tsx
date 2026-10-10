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
      <div className="bg-studio-panel border border-studio-border rounded-md max-w-2xl w-full p-5 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden select-none">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-3 pb-3 border-b border-studio-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-sm">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 id="compliance-modal-title" className="text-sm font-bold text-slate-100 flex items-center gap-2 font-mono uppercase tracking-wide">
                <span>{t('privacy.title')}</span>
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                {t('privacy.subtitle')}
              </p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={handleDismiss}
              className="text-slate-400 hover:text-white p-1 rounded-sm hover:bg-studio-surface border border-studio-border transition cursor-pointer"
              aria-label={t('privacy.close_modal')}
              title={t('privacy.close_modal')}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Scrollable Terms Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-2.5 my-2 text-xs font-mono">
          {/* 1. Grant of use */}
          <div className="bg-studio-surface p-3 rounded-sm border border-studio-border flex gap-3 items-start">
            <FileCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
                {t('privacy.grant_title')}
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                {t('privacy.grant_desc')}
              </p>
            </div>
          </div>

          {/* 2. Redistribution */}
          <div className="bg-studio-surface p-3 rounded-sm border border-studio-border flex gap-3 items-start">
            <Share2 className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
                {t('privacy.redist_title')}
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                {t('privacy.redist_desc')}
              </p>
            </div>
          </div>

          {/* 3. No warranty */}
          <div className="bg-studio-surface p-3 rounded-sm border border-studio-border flex gap-3 items-start">
            <AlertOctagon className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
                {t('privacy.warranty_title')}
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                {t('privacy.warranty_desc')}
              </p>
            </div>
          </div>

          {/* 4. Limitation of liability */}
          <div className="bg-red-950/20 p-3 rounded-sm border border-red-500/20 flex gap-3 items-start">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-[11px] font-bold text-red-300 uppercase tracking-wider">
                {t('privacy.liability_title')}
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                {t('privacy.liability_desc')}
              </p>
            </div>
          </div>

          {/* 5. User responsibility */}
          <div className="bg-amber-950/20 p-3 rounded-sm border border-amber-500/20 flex gap-3 items-start">
            <UserCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                {t('privacy.user_resp_title')}
              </h3>
              <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                {t('privacy.user_resp_desc')}
              </p>
            </div>
          </div>

          {/* 6. Local execution & Privacy */}
          <div className="bg-emerald-950/20 p-3 rounded-sm border border-emerald-500/20 flex gap-3 items-start">
            <ServerOff className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">
                {t('privacy.privacy_title')}
              </h3>
              <p
                className="text-[11px] text-slate-400 leading-relaxed font-sans"
                dangerouslySetInnerHTML={{ __html: t('privacy.privacy_desc') }}
              />
            </div>
          </div>
        </div>

        {/* Acceptance Note & Action Button */}
        <div className="pt-3 mt-1 border-t border-studio-border flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <p className="text-[10px] text-slate-400 leading-relaxed max-w-md font-sans">
            {t('privacy.acceptance_note')}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={handleAccept}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-bold uppercase tracking-wider px-5 py-2 rounded-sm shadow-xs transition cursor-pointer"
            >
              {t('privacy.accept_btn')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};