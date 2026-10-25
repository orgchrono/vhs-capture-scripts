import React from 'react'
import { Toaster as SonnerToaster } from 'sonner'
import { useTranslation } from 'react-i18next'

export const Toaster: React.FC = () => {
  const { t } = useTranslation()

  return (
    <SonnerToaster
      theme="dark"
      richColors
      closeButton
      position="bottom-right"
      aria-label={t('toast.region_label')}
      toastOptions={{
        className: 'font-mono text-xs border border-studio-border bg-studio-panel text-slate-200 shadow-2xl backdrop-blur-md rounded-sm',
        style: {
          background: '#18191d',
          borderColor: '#2c3038',
          color: '#f3f4f6',
          fontFamily: 'monospace',
        },
        classNames: {
          toast: 'bg-studio-panel border-studio-border text-slate-200 font-mono text-xs rounded-sm',
          title: 'text-slate-100 font-bold font-mono text-xs',
          description: 'text-slate-400 font-mono text-[11px]',
          actionButton: 'bg-studio-surface text-slate-200 border border-studio-border font-mono text-xs hover:bg-studio-surface-hover',
          cancelButton: 'bg-studio-surface text-slate-400 font-mono text-xs hover:bg-studio-surface-hover',
          closeButton: 'bg-studio-panel border border-studio-border text-slate-400 hover:text-slate-200',
        },
      }}
    />
  )
}
