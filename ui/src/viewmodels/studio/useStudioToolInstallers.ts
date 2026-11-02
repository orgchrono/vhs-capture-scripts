import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { logger } from '../../lib/logger';
import { getErrorMessage } from '../../lib/errors';
import { useInstallQtgmcMutation, useInstallObsMutation } from '../../api/studioRtkApi';
import type { useStudioStore } from '../../store/useStudioStore';

export interface UseStudioToolInstallersOptions {
  store: ReturnType<typeof useStudioStore>;
  refetchStatus: () => void;
  resetLogPollingIndex: () => void;
}

export function useStudioToolInstallers({
  store,
  refetchStatus,
  resetLogPollingIndex,
}: UseStudioToolInstallersOptions) {
  const { t } = useTranslation();
  const [isInstallingQtgmc, setIsInstallingQtgmc] = useState(false);
  const [isInstallingObs, setIsInstallingObs] = useState(false);

  const [installQtgmcTrigger] = useInstallQtgmcMutation();
  const [installObsTrigger] = useInstallObsMutation();

  const handleInstallObs = async () => {
    resetLogPollingIndex();
    setIsInstallingObs(true);
    store.setActiveTask({
      type: 'install_obs',
      labelKey: 'telemetry.task_install_obs',
      progressPercent: 5,
    });
    store.addLog(t('logs.obs_installing'));
    try {
      const res = await installObsTrigger().unwrap();
      if ((res as { status: string; message?: string })?.message === 'obs_already_installed') {
        store.setActiveTask({
          type: 'install_obs',
          labelKey: 'telemetry.task_install_obs',
          progressPercent: 100,
        });
        store.addLog(t('logs.obs_installer_started'));
        refetchStatus();
        setTimeout(() => {
          setIsInstallingObs(false);
          store.setActiveTask(null);
        }, 300);
      } else {
        store.addLog(t('logs.obs_installer_started'));
        refetchStatus();
      }
    } catch (e: unknown) {
      logger.error('Failed to install OBS:', getErrorMessage(e));
      setIsInstallingObs(false);
      store.setActiveTask(null);
    }
  };

  const handleInstallQtgmc = async () => {
    resetLogPollingIndex();
    setIsInstallingQtgmc(true);
    store.setActiveTask({
      type: 'install_qtgmc',
      labelKey: 'telemetry.task_install_qtgmc',
      progressPercent: 5,
    });
    store.addLog(t('logs.qtgmc_installing'));
    try {
      const res = await installQtgmcTrigger().unwrap();
      if ((res as { status: string; message?: string })?.message === 'vapoursynth_already_available') {
        store.setActiveTask({
          type: 'install_qtgmc',
          labelKey: 'telemetry.task_install_qtgmc',
          progressPercent: 100,
        });
        store.addLog(t('logs.qtgmc_installer_started'));
        refetchStatus();
        setTimeout(() => {
          setIsInstallingQtgmc(false);
          store.setActiveTask(null);
        }, 300);
      } else {
        store.addLog(t('logs.qtgmc_installer_started'));
      }
    } catch (e: unknown) {
      store.addLog(t('logs.qtgmc_install_error', { error: getErrorMessage(e) }));
      setIsInstallingQtgmc(false);
      store.setActiveTask(null);
    }
  };

  return {
    isInstallingObs,
    setIsInstallingObs,
    isInstallingQtgmc,
    setIsInstallingQtgmc,
    handleInstallObs,
    handleInstallQtgmc,
  };
}
