import { useState, useEffect, useCallback } from "react";

// ============================================================================
// VIEWMODEL: Strict MVVM & SOC
// Centraliza a lógica de negócios e as mutações de estado (SSOT) fora da View.
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

export function useStorageViewModel() {
    const [provider, setProvider] = useState<string>("local_nas_usb");
    const [config, setConfig] = useState<StorageConfigModel>({
        path: "", SUPABASE_URL: "", SUPABASE_KEY: "", SUPABASE_BUCKET: "",
        DROPBOX_ACCESS_TOKEN: "", DROPBOX_APP_KEY: "", DROPBOX_APP_SECRET: "",
        ONEDRIVE_CLIENT_ID: "", ONEDRIVE_CLIENT_SECRET: "", ONEDRIVE_TENANT_ID: "common",
        S3_ENDPOINT_URL: "", S3_ACCESS_KEY: "", S3_SECRET_KEY: "", S3_REGION: "us-east-1", S3_BUCKET: "",
        GDRIVE_CLIENT_ID: "", GDRIVE_CLIENT_SECRET: ""
    });
    const [status, setStatus] = useState<any>({});
    const [loading, setLoading] = useState(false);

    // [SSOT] Carrega dados do modelo apenas aqui.
    const loadData = useCallback(async () => {
        try {
            const res = await fetch("/api/storage/config");
            const data = await res.json();
            if (data.provider) setProvider(data.provider);
            if (data.config) setConfig(prev => ({ ...prev, ...data.config }));
            setStatus(data.status || {});
        } catch (e) {
            console.error("Erro ao carregar Storage Model:", e);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const updateConfig = (key: keyof StorageConfigModel, value: string) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async (onSuccess?: () => void, onError?: (msg: string) => void) => {
        setLoading(true);
        try {
            const res = await fetch("/api/storage/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider, config })
            });
            const data = await res.json();
            if (data.status === "ok") {
                await loadData(); // Revalida do SSOT
                if (onSuccess) onSuccess();
            } else {
                if (onError) onError(data.error);
            }
        } catch (e) {
            console.error(e);
            if (onError) onError("Erro de rede ao salvar configurações.");
        }
        setLoading(false);
    };

    const initiateOAuth = (providerId: string) => {
        window.open(`/api/oauth/login/${providerId}`, '_blank');
    };

    return {
        provider,
        setProvider,
        config,
        updateConfig,
        status,
        loading,
        handleSave,
        initiateOAuth
    };
}