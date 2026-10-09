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
      aria-label={t('toast.region_label', { defaultValue: 'Notificações do Sistema' })}
      toastOptions={{
        className: 'border border-white/10 font-sans shadow-2xl backdrop-blur-md',
        style: {
          background: 'rgba(11, 15, 23, 0.95)',
          color: '#f8fafc',
        },
      }}
    />
  )
}
