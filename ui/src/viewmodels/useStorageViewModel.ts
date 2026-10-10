import { useState, useMemo } from "react";
import {
  useGetStorageConfigQuery,
  useUpdateStorageConfigMutation,
} from "../api/studioRtkApi";
import { getErrorMessage } from "../lib/errors";

// ============================================================================
// VIEWMODEL: Strict MVVM, SoC & Functional Purity (RTK Query Powered)
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
  const { data: storageData, isLoading } = useGetStorageConfigQuery();
  const [updateStorageTrigger, { isLoading: isSaving }] = useUpdateStorageConfigMutation();

  const [userSelectedProvider, setUserSelectedProvider] = useState<string | null>(null);
  const [userConfigOverrides, setUserConfigOverrides] = useState<Partial<StorageConfigModel>>({});

  const provider = userSelectedProvider ?? storageData?.provider ?? "local_nas_usb";

  const config = useMemo<StorageConfigModel>(() => {
    return {
      ...DEFAULT_CONFIG,
      ...(storageData?.config as Partial<StorageConfigModel> | undefined),
      ...userConfigOverrides,
    };
  }, [storageData?.config, userConfigOverrides]);

  const setProvider = (newProvider: string) => {
    setUserSelectedProvider(newProvider);
  };

  const updateConfig = (key: keyof StorageConfigModel, value: string) => {
    setUserConfigOverrides((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (onSuccess?: () => void, onError?: (msg: string) => void) => {
    try {
      const res = await updateStorageTrigger({
        provider,
        config: config as Record<string, unknown>,
      }).unwrap();

      if (res.status === "ok") {
        if (onSuccess) onSuccess();
      } else {
        if (onError) onError(res.message || "Erro ao salvar");
      }
    } catch (e: unknown) {
      if (onError) onError(getErrorMessage(e, "Erro de rede ao salvar configurações."));
    }
  };

  const initiateOAuth = (providerId: string) => {
    window.open(`/api/oauth/login/${providerId}`, '_blank');
  };

  return {
    provider,
    setProvider,
    config,
    updateConfig,
    status: storageData?.status || {},
    loading: isLoading || isSaving,
    handleSave,
    initiateOAuth,
  };
}