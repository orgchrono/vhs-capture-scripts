import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { HardDrive, Cloud, Database, Box, Server } from "lucide-react";
import { Button } from "./ui/button";

export function StorageSettings() {
  const { t } = useTranslation();
  const [provider, setProvider] = useState("local_nas_usb");
  const [config, setConfig] = useState<any>({ path: "", SUPABASE_URL: "", SUPABASE_KEY: "", SUPABASE_BUCKET: "", DROPBOX_ACCESS_TOKEN: "", ONEDRIVE_CLIENT_ID: "", ONEDRIVE_CLIENT_SECRET: "", ONEDRIVE_TENANT_ID: "common" });
  const [status, setStatus] = useState<any>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/storage/config")
      .then(r => r.json())
      .then(data => {
        if(data.provider) setProvider(data.provider);
        if(data.config) setConfig((prev: any) => ({...prev, ...data.config}));
        setStatus(data.status || {});
      })
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/storage/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, config })
      });
      const data = await res.json();
      if(data.status === "ok") {
        alert(t("Configuração salva com sucesso!"));
        const sRes = await fetch("/api/storage/config");
        const sData = await sRes.json();
        setStatus(sData.status || {});
      } else {
        alert(data.error);
      }
    } catch(e) {
      console.error(e);
      alert("Erro de rede.");
    }
    setLoading(false);
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 mt-6">
      <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
        <span className="bg-emerald-500 w-2 h-6 rounded-full"></span>
        {t("Armazenamento & Nuvem")}
      </h2>

      <div className="flex flex-wrap gap-2 mb-6">
        <button onClick={() => setProvider("local_nas_usb")} className={`flex-1 min-w-[120px] py-2 px-3 rounded-lg flex flex-col items-center gap-1 border-2 transition-all ${provider === "local_nas_usb" ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20" : "border-slate-200 text-slate-500 hover:border-emerald-200"}`}>
          <HardDrive size={20} />
          <span className="font-semibold text-xs text-center">{t("Local / NAS / USB")}</span>
        </button>
        <button onClick={() => setProvider("supabase")} className={`flex-1 min-w-[120px] py-2 px-3 rounded-lg flex flex-col items-center gap-1 border-2 transition-all ${provider === "supabase" ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20" : "border-slate-200 text-slate-500 hover:border-emerald-200"}`}>
          <Database size={20} />
          <span className="font-semibold text-xs text-center">{t("Supabase Storage")}</span>
        </button>
        <button onClick={() => setProvider("gdrive")} className={`flex-1 min-w-[120px] py-2 px-3 rounded-lg flex flex-col items-center gap-1 border-2 transition-all ${provider === "gdrive" ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20" : "border-slate-200 text-slate-500 hover:border-emerald-200"}`}>
          <Cloud size={20} />
          <span className="font-semibold text-xs text-center">{t("Google Drive")}</span>
        </button>
        <button onClick={() => setProvider("dropbox")} className={`flex-1 min-w-[120px] py-2 px-3 rounded-lg flex flex-col items-center gap-1 border-2 transition-all ${provider === "dropbox" ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20" : "border-slate-200 text-slate-500 hover:border-emerald-200"}`}>
          <Box size={20} />
          <span className="font-semibold text-xs text-center">{t("Dropbox")}</span>
        </button>
        <button onClick={() => setProvider("onedrive")} className={`flex-1 min-w-[120px] py-2 px-3 rounded-lg flex flex-col items-center gap-1 border-2 transition-all ${provider === "onedrive" ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20" : "border-slate-200 text-slate-500 hover:border-emerald-200"}`}>
          <Server size={20} />
          <span className="font-semibold text-xs text-center">{t("OneDrive / SharePoint")}</span>
        </button>
      </div>

      <div className="space-y-4">
        {provider === "local_nas_usb" && (
          <div>
            <label className="block text-sm font-medium mb-1">{t("Caminho do Destino (ex: Z:\\Archive ou /mnt/usb)")}</label>
            <input type="text" value={config.path || ""} onChange={e => setConfig({...config, path: e.target.value})} className="w-full p-2 border rounded-lg dark:bg-slate-900 dark:border-slate-700" placeholder="C:\VHS_Archive" />
            {status.ready && <p className="text-sm text-emerald-600 mt-2">{t("Pronto! Espaço livre:")} {status.free_space_gb} GB</p>}
          </div>
        )}

        {provider === "supabase" && (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">{t("Supabase Project URL")}</label>
              <input type="text" value={config.SUPABASE_URL || ""} onChange={e => setConfig({...config, SUPABASE_URL: e.target.value})} className="w-full p-2 border rounded-lg dark:bg-slate-900 dark:border-slate-700" placeholder="https://xyz.supabase.co" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("Anon / Service Role Key")}</label>
              <input type="password" value={config.SUPABASE_KEY || ""} onChange={e => setConfig({...config, SUPABASE_KEY: e.target.value})} className="w-full p-2 border rounded-lg dark:bg-slate-900 dark:border-slate-700" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("Nome do Bucket")}</label>
              <input type="text" value={config.SUPABASE_BUCKET || ""} onChange={e => setConfig({...config, SUPABASE_BUCKET: e.target.value})} className="w-full p-2 border rounded-lg dark:bg-slate-900 dark:border-slate-700" placeholder="vhs-archive" />
            </div>
          </>
        )}

        {provider === "gdrive" && (
          <div>
            <p className="text-sm text-slate-600 mb-2">{t("A integração com Google Drive usa as credenciais armazenadas no Windows Vault.")}</p>
            {status.ready ? (
              <p className="text-sm text-emerald-600">{t("Autenticado e Pronto!")}</p>
            ) : (
              <p className="text-sm text-amber-600">{t("Configure o token OAuth localmente usando o script de autenticação.")}</p>
            )}
          </div>
        )}

        {provider === "dropbox" && (
          <div>
            <label className="block text-sm font-medium mb-1">{t("Dropbox Access Token")}</label>
            <input type="password" value={config.DROPBOX_ACCESS_TOKEN || ""} onChange={e => setConfig({...config, DROPBOX_ACCESS_TOKEN: e.target.value})} className="w-full p-2 border rounded-lg dark:bg-slate-900 dark:border-slate-700" />
            {status.ready && <p className="text-sm text-emerald-600 mt-2">{t("Autenticado e Pronto!")}</p>}
          </div>
        )}

        {provider === "onedrive" && (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">{t("OneDrive Client ID")}</label>
              <input type="text" value={config.ONEDRIVE_CLIENT_ID || ""} onChange={e => setConfig({...config, ONEDRIVE_CLIENT_ID: e.target.value})} className="w-full p-2 border rounded-lg dark:bg-slate-900 dark:border-slate-700" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("OneDrive Client Secret")}</label>
              <input type="password" value={config.ONEDRIVE_CLIENT_SECRET || ""} onChange={e => setConfig({...config, ONEDRIVE_CLIENT_SECRET: e.target.value})} className="w-full p-2 border rounded-lg dark:bg-slate-900 dark:border-slate-700" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t("OneDrive Tenant ID")}</label>
              <input type="text" value={config.ONEDRIVE_TENANT_ID || "common"} onChange={e => setConfig({...config, ONEDRIVE_TENANT_ID: e.target.value})} className="w-full p-2 border rounded-lg dark:bg-slate-900 dark:border-slate-700" placeholder="common" />
            </div>
            {status.ready && <p className="text-sm text-emerald-600 mt-2">{t("Autenticado e Pronto!")}</p>}
          </>
        )}

        <Button onClick={handleSave} disabled={loading} className="w-full mt-4">
          {loading ? t("Validando...") : t("Salvar Configuração de Armazenamento")}
        </Button>
      </div>
    </div>
  );
}