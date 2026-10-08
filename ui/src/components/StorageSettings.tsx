import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { HardDrive, Cloud, Database } from "lucide-react";
import { Button } from "./ui/button";

export function StorageSettings() {
  const { t } = useTranslation();
  const [provider, setProvider] = useState("local_nas_usb");
  const [config, setConfig] = useState({ path: "", SUPABASE_URL: "", SUPABASE_KEY: "", SUPABASE_BUCKET: "" });
  const [status, setStatus] = useState<any>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/storage/config")
      .then(r => r.json())
      .then(data => {
        if(data.provider) setProvider(data.provider);
        if(data.config) setConfig(prev => ({...prev, ...data.config}));
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
        // recarrega status
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
        Armazenamento & Nuvem
      </h2>

      <div className="flex gap-4 mb-6">
        <button onClick={() => setProvider("local_nas_usb")} className={`flex-1 py-3 px-4 rounded-lg flex flex-col items-center gap-2 border-2 transition-all ${provider === "local_nas_usb" ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20" : "border-slate-200 text-slate-500 hover:border-emerald-200"}`}>
          <HardDrive size={24} />
          <span className="font-semibold">Local / NAS / USB</span>
        </button>
        <button onClick={() => setProvider("supabase")} className={`flex-1 py-3 px-4 rounded-lg flex flex-col items-center gap-2 border-2 transition-all ${provider === "supabase" ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20" : "border-slate-200 text-slate-500 hover:border-emerald-200"}`}>
          <Database size={24} />
          <span className="font-semibold">Supabase Storage</span>
        </button>
        <button onClick={() => setProvider("gdrive")} className={`flex-1 py-3 px-4 rounded-lg flex flex-col items-center gap-2 border-2 transition-all ${provider === "gdrive" ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20" : "border-slate-200 text-slate-500 hover:border-emerald-200"}`}>
          <Cloud size={24} />
          <span className="font-semibold">Google Drive</span>
        </button>
      </div>

      <div className="space-y-4">
        {provider === "local_nas_usb" && (
          <div>
            <label className="block text-sm font-medium mb-1">Caminho do Destino (ex: Z:\Archive ou /mnt/usb)</label>
            <input type="text" value={config.path || ""} onChange={e => setConfig({...config, path: e.target.value})} className="w-full p-2 border rounded-lg dark:bg-slate-900 dark:border-slate-700" placeholder="C:\VHS_Archive" />
            {status.ready && <p className="text-sm text-emerald-600 mt-2">Pronto! Espaço livre: {status.free_space_gb} GB</p>}
          </div>
        )}

        {provider === "supabase" && (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Supabase Project URL</label>
              <input type="text" value={config.SUPABASE_URL || ""} onChange={e => setConfig({...config, SUPABASE_URL: e.target.value})} className="w-full p-2 border rounded-lg dark:bg-slate-900 dark:border-slate-700" placeholder="https://xyz.supabase.co" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Anon / Service Role Key</label>
              <input type="password" value={config.SUPABASE_KEY || ""} onChange={e => setConfig({...config, SUPABASE_KEY: e.target.value})} className="w-full p-2 border rounded-lg dark:bg-slate-900 dark:border-slate-700" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Nome do Bucket</label>
              <input type="text" value={config.SUPABASE_BUCKET || ""} onChange={e => setConfig({...config, SUPABASE_BUCKET: e.target.value})} className="w-full p-2 border rounded-lg dark:bg-slate-900 dark:border-slate-700" placeholder="vhs-archive" />
            </div>
          </>
        )}

        {provider === "gdrive" && (
          <div>
            <p className="text-sm text-slate-600 mb-2">A integração com Google Drive usa as credenciais armazenadas no Windows Vault.</p>
            {status.ready ? (
              <p className="text-sm text-emerald-600">Autenticado e Pronto!</p>
            ) : (
              <p className="text-sm text-amber-600">Configure o token OAuth localmente usando o script de autenticação.</p>
            )}
          </div>
        )}

        <Button onClick={handleSave} disabled={loading} className="w-full mt-4">
          {loading ? "Validando..." : "Salvar Configuração de Armazenamento"}
        </Button>
      </div>
    </div>
  );
}