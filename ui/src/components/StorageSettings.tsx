import { useState } from 'react'
import { useTranslation } from "react-i18next";
import { HardDrive, Cloud, Database, Box, Server, Globe, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useStorageViewModel } from "../viewmodels/useStorageViewModel";

// ============================================================================
// VIEW: Strict MVVM (Dumb Component)
// Harmonizado com a paleta Pro Dark Studio & Glassmorphism (SoC + SSOT).
// ============================================================================

export function StorageSettings() {
  const { t } = useTranslation();
  const vm = useStorageViewModel();
  const [saveFeedback, setSaveFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const onSaveClick = () => {
    setSaveFeedback(null);
    vm.handleSave(
      () => {
        setSaveFeedback({ type: 'success', message: t("Configuração salva com sucesso!") });
        setTimeout(() => setSaveFeedback(null), 4000);
      },
      (err) => {
        setSaveFeedback({ type: 'error', message: String(err) });
      }
    );
  };

  const providers = [
    { id: "local_nas_usb", name: t("Local / NAS / USB"), icon: HardDrive },
    { id: "supabase", name: t("Supabase Storage"), icon: Database },
    { id: "s3_generic", name: t("AWS S3 Compatível"), icon: Globe },
    { id: "gdrive", name: t("Google Drive"), icon: Cloud },
    { id: "dropbox", name: t("Dropbox"), icon: Box },
    { id: "onedrive", name: t("OneDrive / SharePoint"), icon: Server },
  ];

  return (
    <div className="bg-slate-900/50 border border-white/5 p-5 rounded-xl mb-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
          <Cloud className="w-4 h-4 text-emerald-400" />
          {t("Destino de Armazenamento & Nuvem")}
        </h2>
        {vm.status.ready && (
          <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Conectado
          </span>
        )}
      </div>

      {/* Grid de Seleção de Provedor */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {providers.map((p) => {
          const Icon = p.icon;
          const isSelected = vm.provider === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => vm.setProvider(p.id)}
              className={`py-2.5 px-2 rounded-lg flex flex-col items-center gap-1.5 border transition-all text-center cursor-pointer ${
                isSelected
                  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30 shadow-sm"
                  : "border-white/5 bg-slate-950/50 text-slate-400 hover:border-emerald-500/30 hover:text-slate-200 hover:bg-slate-900/70"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="font-medium text-[11px] leading-tight line-clamp-1">{p.name}</span>
            </button>
          );
        })}
      </div>

      {/* Formulário Modular do Provedor Selecionado */}
      <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-4 space-y-3.5">
        {vm.provider === "local_nas_usb" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 block">
              {t("Caminho do Destino (ex: Z:\\Archive ou /mnt/usb)")}
            </label>
            <Input
              type="text"
              value={vm.config.path || ""}
              onChange={(e) => vm.updateConfig("path", e.target.value)}
              className="bg-slate-900/80 border-slate-800 text-white text-xs"
              placeholder="C:\VHS_Archive"
            />
            {vm.status.ready && (
              <p className="text-xs text-emerald-400 flex items-center gap-1 pt-1 font-mono">
                <CheckCircle2 className="w-3.5 h-3.5" /> {t("Pronto! Espaço livre:")} {vm.status.free_space_gb} GB
              </p>
            )}
          </div>
        )}

        {vm.provider === "supabase" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300 block">{t("Supabase Project URL")}</label>
              <Input
                type="text"
                value={vm.config.SUPABASE_URL || ""}
                onChange={(e) => vm.updateConfig("SUPABASE_URL", e.target.value)}
                className="bg-slate-900/80 border-slate-800 text-white text-xs"
                placeholder="https://xyz.supabase.co"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300 block">{t("Anon / Service Role Key")}</label>
              <Input
                type="password"
                value={vm.config.SUPABASE_KEY || ""}
                onChange={(e) => vm.updateConfig("SUPABASE_KEY", e.target.value)}
                className="bg-slate-900/80 border-slate-800 text-white text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300 block">{t("Nome do Bucket")}</label>
              <Input
                type="text"
                value={vm.config.SUPABASE_BUCKET || ""}
                onChange={(e) => vm.updateConfig("SUPABASE_BUCKET", e.target.value)}
                className="bg-slate-900/80 border-slate-800 text-white text-xs"
                placeholder="vhs-archive"
              />
            </div>
          </div>
        )}

        {vm.provider === "s3_generic" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300 block">{t("S3 Endpoint URL (Opcional)")}</label>
              <Input
                type="text"
                value={vm.config.S3_ENDPOINT_URL || ""}
                onChange={(e) => vm.updateConfig("S3_ENDPOINT_URL", e.target.value)}
                className="bg-slate-900/80 border-slate-800 text-white text-xs"
                placeholder="https://<account>.r2.cloudflarestorage.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300 block">{t("S3 Access Key ID")}</label>
                <Input
                  type="text"
                  value={vm.config.S3_ACCESS_KEY || ""}
                  onChange={(e) => vm.updateConfig("S3_ACCESS_KEY", e.target.value)}
                  className="bg-slate-900/80 border-slate-800 text-white text-xs"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300 block">{t("S3 Secret Access Key")}</label>
                <Input
                  type="password"
                  value={vm.config.S3_SECRET_KEY || ""}
                  onChange={(e) => vm.updateConfig("S3_SECRET_KEY", e.target.value)}
                  className="bg-slate-900/80 border-slate-800 text-white text-xs"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300 block">{t("Nome do Bucket")}</label>
                <Input
                  type="text"
                  value={vm.config.S3_BUCKET || ""}
                  onChange={(e) => vm.updateConfig("S3_BUCKET", e.target.value)}
                  className="bg-slate-900/80 border-slate-800 text-white text-xs"
                  placeholder="vhs-archive"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300 block">{t("S3 Region")}</label>
                <Input
                  type="text"
                  value={vm.config.S3_REGION || "us-east-1"}
                  onChange={(e) => vm.updateConfig("S3_REGION", e.target.value)}
                  className="bg-slate-900/80 border-slate-800 text-white text-xs"
                />
              </div>
            </div>
          </div>
        )}

        {vm.provider === "gdrive" && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              {t("A integração com Google Drive usa as credenciais armazenadas no cofre do sistema.")}
            </p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300 block">{t("Google Client ID")}</label>
              <Input
                type="text"
                value={vm.config.GDRIVE_CLIENT_ID || ""}
                onChange={(e) => vm.updateConfig("GDRIVE_CLIENT_ID", e.target.value)}
                className="bg-slate-900/80 border-slate-800 text-white text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300 block">{t("Google Client Secret")}</label>
              <Input
                type="password"
                value={vm.config.GDRIVE_CLIENT_SECRET || ""}
                onChange={(e) => vm.updateConfig("GDRIVE_CLIENT_SECRET", e.target.value)}
                className="bg-slate-900/80 border-slate-800 text-white text-xs"
              />
            </div>
            {!vm.status.ready && (
              <Button
                type="button"
                onClick={() => vm.initiateOAuth("gdrive")}
                className="w-full mt-2 bg-blue-600/20 border border-blue-500/40 hover:bg-blue-600/30 text-blue-300 text-xs"
              >
                Conectar via Google OAuth
              </Button>
            )}
          </div>
        )}

        {vm.provider === "dropbox" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300 block">{t("Dropbox App Key")}</label>
              <Input
                type="text"
                value={vm.config.DROPBOX_APP_KEY || ""}
                onChange={(e) => vm.updateConfig("DROPBOX_APP_KEY", e.target.value)}
                className="bg-slate-900/80 border-slate-800 text-white text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300 block">{t("Dropbox App Secret")}</label>
              <Input
                type="password"
                value={vm.config.DROPBOX_APP_SECRET || ""}
                onChange={(e) => vm.updateConfig("DROPBOX_APP_SECRET", e.target.value)}
                className="bg-slate-900/80 border-slate-800 text-white text-xs"
              />
            </div>
            {!vm.status.ready && (
              <Button
                type="button"
                onClick={() => vm.initiateOAuth("dropbox")}
                className="w-full mt-2 bg-sky-600/20 border border-sky-500/40 hover:bg-sky-600/30 text-sky-300 text-xs"
              >
                Autorizar Dropbox no Navegador
              </Button>
            )}
          </div>
        )}

        {vm.provider === "onedrive" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300 block">{t("OneDrive Client ID")}</label>
              <Input
                type="text"
                value={vm.config.ONEDRIVE_CLIENT_ID || ""}
                onChange={(e) => vm.updateConfig("ONEDRIVE_CLIENT_ID", e.target.value)}
                className="bg-slate-900/80 border-slate-800 text-white text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300 block">{t("OneDrive Client Secret")}</label>
              <Input
                type="password"
                value={vm.config.ONEDRIVE_CLIENT_SECRET || ""}
                onChange={(e) => vm.updateConfig("ONEDRIVE_CLIENT_SECRET", e.target.value)}
                className="bg-slate-900/80 border-slate-800 text-white text-xs"
              />
            </div>
            {!vm.status.ready && (
              <Button
                type="button"
                onClick={() => vm.initiateOAuth("onedrive")}
                className="w-full mt-2 bg-indigo-600/20 border border-indigo-500/40 hover:bg-indigo-600/30 text-indigo-300 text-xs"
              >
                Autorizar Conta Microsoft
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Mensagem de Feedback Não-Bloqueante */}
      {saveFeedback && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
            saveFeedback.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
          }`}
        >
          {saveFeedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{saveFeedback.message}</span>
        </div>
      )}

      {/* Botão de Salvar Harmonizado */}
      <Button
        onClick={onSaveClick}
        disabled={vm.loading}
        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2.5 rounded-lg shadow-md shadow-emerald-600/20 transition cursor-pointer"
      >
        {vm.loading ? t("Validando...") : t("Salvar Configuração de Armazenamento")}
      </Button>
    </div>
  );
}