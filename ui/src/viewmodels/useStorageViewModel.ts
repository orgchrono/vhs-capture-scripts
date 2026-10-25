import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  useGetStorageConfigQuery,
  useUpdateStorageConfigMutation,
} from "../api/studioRtkApi";
import {
  tauriBridge,
  isTauriEnvironment,
  type TauriStorageEnvelope,
} from "../api/tauriBridge";
import { getErrorMessage } from "../lib/errors";
import { TIMING } from "../lib/constants";

// ============================================================================
// VIEWMODEL: Strict MVVM, SoC & Functional Purity (RTK Query / Tauri Dual Bridge)
// Pure state derivation without cascading effect loops.
// ============================================================================

export interface StorageConfigModel {
  path?: string;
  SUPABASE_URL?: string;
  SUPABASE_KEY?: string;
  SUPABASE_BUCKET?: string;
  DROPBOX_ACCESS_TOKEN?: string;
  DROPBOX_APP_KEY?: string;
  DROPBOX_APP_SECRET?: string;
  ONEDRIVE_CLIENT_ID?: string;
  ONEDRIVE_CLIENT_SECRET?: string;
  ONEDRIVE_TENANT_ID?: string;
  S3_ENDPOINT_URL?: string;
  S3_ACCESS_KEY?: string;
  S3_SECRET_KEY?: string;
  S3_REGION?: string;
  S3_BUCKET?: string;
  GDRIVE_CLIENT_ID?: string;
  GDRIVE_CLIENT_SECRET?: string;
}

const DEFAULT_CONFIG: StorageConfigModel = {
  path: "",
  SUPABASE_URL: "",
  SUPABASE_KEY: "",
  SUPABASE_BUCKET: "",
  DROPBOX_ACCESS_TOKEN: "",
  DROPBOX_APP_KEY: "",
  DROPBOX_APP_SECRET: "",
  ONEDRIVE_CLIENT_ID: "",
  ONEDRIVE_CLIENT_SECRET: "",
  ONEDRIVE_TENANT_ID: "common",
  S3_ENDPOINT_URL: "",
  S3_ACCESS_KEY: "",
  S3_SECRET_KEY: "",
  S3_REGION: "us-east-1",
  S3_BUCKET: "",
  GDRIVE_CLIENT_ID: "",
  GDRIVE_CLIENT_SECRET: "",
};

export function useStorageViewModel() {
  const { t } = useTranslation();
  const isTauri = isTauriEnvironment();
  const { data: storageData, isLoading } = useGetStorageConfigQuery(undefined, {
    skip: isTauri,
  });
  const [updateStorageTrigger, { isLoading: isSaving }] = useUpdateStorageConfigMutation();

  const [nativeData, setNativeData] = useState<TauriStorageEnvelope | null>(null);
  const [isNativeSaving, setIsNativeSaving] = useState(false);
  const [userSelectedProvider, setUserSelectedProvider] = useState<string | null>(null);
  const [userConfigOverrides, setUserConfigOverrides] = useState<Partial<StorageConfigModel>>({});
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!isTauri) return;
    let isMounted = true;
    tauriBridge.getStorageConfig().then((envelope) => {
      if (isMounted) {
        setNativeData(envelope);
      }
    }).catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [isTauri]);

  const effectiveData = isTauri ? nativeData : storageData;
  const provider = userSelectedProvider ?? effectiveData?.provider ?? "local_nas_usb";

  const config = useMemo<StorageConfigModel>(() => {
    return {
      ...DEFAULT_CONFIG,
      ...(effectiveData?.config as Partial<StorageConfigModel> | undefined),
      ...userConfigOverrides,
    };
  }, [effectiveData?.config, userConfigOverrides]);

  const setProvider = (newProvider: string) => {
    setUserSelectedProvider(newProvider);
  };

  const updateConfig = (key: keyof StorageConfigModel, value: string) => {
    setUserConfigOverrides((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (onSuccess?: () => void, onError?: (msg: string) => void) => {
    try {
      if (isTauri) {
        setIsNativeSaving(true);
        const updatedStatus = await tauriBridge.saveStorageConfig(provider, config as Record<string, unknown>);
        setNativeData((prev) =>
          prev ? { ...prev, provider, config: config as Record<string, unknown>, status: updatedStatus } : null
        );
        setIsNativeSaving(false);
        if (onSuccess) onSuccess();
        return;
      }

      const res = await updateStorageTrigger({
        provider,
        config: config as Record<string, unknown>,
      }).unwrap();

      if (res.status === "ok") {
        if (onSuccess) onSuccess();
      } else {
        if (onError) onError(res.message || t("storage.save_error"));
      }
    } catch (e: unknown) {
      setIsNativeSaving(false);
      if (onError) onError(getErrorMessage(e, t("storage.save_error")));
    }
  };

  const onSaveClick = () => {
    setSaveFeedback(null);
    void handleSave(
      () => {
        const msg = t("storage.saved_success");
        setSaveFeedback({ type: 'success', message: msg });
        toast.success(msg);
        setTimeout(() => setSaveFeedback(null), TIMING.NOTIFICATION_AUTO_DISMISS_MS);
      },
      (err) => {
        const errMsg = String(err);
        setSaveFeedback({ type: 'error', message: errMsg });
        toast.error(errMsg);
      }
    );
  };

  const initiateOAuth = (providerId: string) => {
    window.open(`/api/oauth/login/${providerId}`, '_blank');
  };

  const status = isTauri ? (nativeData?.status ?? {}) : (storageData?.status ?? {});

  return {
    provider,
    setProvider,
    config,
    updateConfig,
    status,
    loading: isTauri ? isNativeSaving : (isLoading || isSaving),
    saveFeedback,
    handleSave,
    onSaveClick,
    initiateOAuth,
  };
}