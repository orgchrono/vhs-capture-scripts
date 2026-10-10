import { useState } from 'react'
import { useTranslation } from "react-i18next";
import { HardDrive, Cloud, Database, Box, Server, Globe, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
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
        const msg = t("toast.storage_saved", { defaultValue: "Configuração salva com sucesso!" });
        setSaveFeedback({ type: 'success', message: msg });
        toast.success(msg);
        setTimeout(() => setSaveFeedback(null), 4000);
      },
      (err) => {
        const errMsg = String(err);
        setSaveFeedback({ type: 'error', message: errMsg });
        toast.error(errMsg);
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
    <div className="bg-studio-surface border border-studio-border p-4 rounded-sm space-y-4">
      <div className="flex items-center justify-between border-b border-studio-border/60 pb-3">
        <h2 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2 font-mono">
          <Cloud className="w-4 h-4 text-emerald-400" />
          {t("Destino de Armazenamento & Nuvem")}
        </h2>
        {vm.status.ready && (
          <span className="text-[11px] font-mono text-emerald-400 bg-studio-panel border border-emerald-500/30 px-2 py-0.5 rounded-sm flex items-center gap-1.5">
            <span className="led-lamp led-live shrink-0" aria-hidden="true" />
            {t("Conectado")}
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
              className={`py-2 px-1.5 rounded-sm flex flex-col items-center gap-1.5 border transition-all text-center cursor-pointer font-mono text-xs ${
                isSelected
                  ? "border-emerald-500/80 bg-studio-surface-hover text-emerald-400 shadow-xs"
                  : "border-studio-border bg-studio-panel text-slate-400 hover:border-slate-500 hover:text-slate-200 hover:bg-studio-surface-hover"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="font-medium text-[11px] leading-tight line-clamp-1">{p.name}</span>
            </button>
          );
        })}
      </div>

      {/* Formulário Modular do Provedor Selecionado */}
      <div className="bg-studio-panel border border-studio-border rounded-sm p-4 space-y-3.5">
        {vm.provider === "local_nas_usb" && (
          <div className="space-y-1.5">
            <label className="text-[11px] font-mono font-medium text-slate-400 block">
              {t("Caminho do Destino (ex: Z:\\Archive ou /mnt/usb)")}
            </label>
            <Input
              type="text"
              value={vm.config.path || ""}
              onChange={(e) => vm.updateConfig("path", e.target.value)}
              className="bg-studio-surface border-studio-border text-white text-xs rounded-sm font-mono"
              placeholder={t("storage.path_placeholder")}
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
              <label className="text-[11px] font-mono font-medium text-slate-400 block">{t("Supabase Project URL")}</label>
              <Input
                type="text"
                value={vm.config.SUPABASE_URL || ""}
                onChange={(e) => vm.updateConfig("SUPABASE_URL", e.target.value)}
                className="bg-studio-surface border-studio-border text-white text-xs rounded-sm font-mono"
                placeholder={t("storage.supabase_url_placeholder")}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-mono font-medium text-slate-400 block">{t("Anon / Service Role Key")}</label>
              <Input
                type="password"
                value={vm.config.SUPABASE_KEY || ""}
                onChange={(e) => vm.updateConfig("SUPABASE_KEY", e.target.value)}
                className="bg-studio-surface border-studio-border text-white text-xs rounded-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-mono font-medium text-slate-400 block">{t("Nome do Bucket")}</label>
              <Input
                type="text"
                value={vm.config.SUPABASE_BUCKET || ""}
                onChange={(e) => vm.updateConfig("SUPABASE_BUCKET", e.target.value)}
                className="bg-studio-surface border-studio-border text-white text-xs rounded-sm font-mono"
                placeholder={t("storage.bucket_placeholder")}
              />
            </div>
          </div>
        )}

        {vm.provider === "s3_generic" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[11px] font-mono font-medium text-slate-400 block">{t("S3 Endpoint URL (Opcional)")}</label>
              <Input
                type="text"
                value={vm.config.S3_ENDPOINT_URL || ""}
                onChange={(e) => vm.updateConfig("S3_ENDPOINT_URL", e.target.value)}
                className="bg-studio-surface border-studio-border text-white text-xs rounded-sm font-mono"
                placeholder={t("storage.s3_endpoint_placeholder")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-mono font-medium text-slate-400 block">{t("S3 Access Key ID")}</label>
                <Input
                  type="text"
                  value={vm.config.S3_ACCESS_KEY || ""}
                  onChange={(e) => vm.updateConfig("S3_ACCESS_KEY", e.target.value)}
                  className="bg-studio-surface border-studio-border text-white text-xs rounded-sm font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-mono font-medium text-slate-400 block">{t("S3 Secret Access Key")}</label>
                <Input
                  type="password"
                  value={vm.config.S3_SECRET_KEY || ""}
                  onChange={(e) => vm.updateConfig("S3_SECRET_KEY", e.target.value)}
                  className="bg-studio-surface border-studio-border text-white text-xs rounded-sm font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-mono font-medium text-slate-400 block">{t("Nome do Bucket")}</label>
                <Input
                  type="text"
                  value={vm.config.S3_BUCKET || ""}
                  onChange={(e) => vm.updateConfig("S3_BUCKET", e.target.value)}
                  className="bg-studio-surface border-studio-border text-white text-xs rounded-sm font-mono"
                  placeholder={t("storage.bucket_placeholder")}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-mono font-medium text-slate-400 block">{t("S3 Region")}</label>
                <Input
                  type="text"
                  value={vm.config.S3_REGION || "us-east-1"}
                  onChange={(e) => vm.updateConfig("S3_REGION", e.target.value)}
                  className="bg-studio-surface border-studio-border text-white text-xs rounded-sm font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {vm.provider === "gdrive" && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400 font-mono">
              {t("A integração com Google Drive usa as credenciais armazenadas no cofre do sistema.")}
            </p>
            <div className="space-y-1">
              <label className="text-[11px] font-mono font-medium text-slate-400 block">{t("Google Client ID")}</label>
              <Input
                type="text"
                value={vm.config.GDRIVE_CLIENT_ID || ""}
                onChange={(e) => vm.updateConfig("GDRIVE_CLIENT_ID", e.target.value)}
                className="bg-studio-surface border-studio-border text-white text-xs rounded-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-mono font-medium text-slate-400 block">{t("Google Client Secret")}</label>
              <Input
                type="password"
                value={vm.config.GDRIVE_CLIENT_SECRET || ""}
                onChange={(e) => vm.updateConfig("GDRIVE_CLIENT_SECRET", e.target.value)}
                className="bg-studio-surface border-studio-border text-white text-xs rounded-sm font-mono"
              />
            </div>
            {!vm.status.ready && (
              <Button
                type="button"
                onClick={() => vm.initiateOAuth("gdrive")}
                className="w-full mt-2 bg-studio-surface hover:bg-studio-surface-hover border border-studio-border text-sky-400 font-mono text-xs rounded-sm h-8 cursor-pointer"
              >
                {t("Conectar via Google OAuth")}
              </Button>
            )}
          </div>
        )}

        {vm.provider === "dropbox" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[11px] font-mono font-medium text-slate-400 block">{t("Dropbox App Key")}</label>
              <Input
                type="text"
                value={vm.config.DROPBOX_APP_KEY || ""}
                onChange={(e) => vm.updateConfig("DROPBOX_APP_KEY", e.target.value)}
                className="bg-studio-surface border-studio-border text-white text-xs rounded-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-mono font-medium text-slate-400 block">{t("Dropbox App Secret")}</label>
              <Input
                type="password"
                value={vm.config.DROPBOX_APP_SECRET || ""}
                onChange={(e) => vm.updateConfig("DROPBOX_APP_SECRET", e.target.value)}
                className="bg-studio-surface border-studio-border text-white text-xs rounded-sm font-mono"
              />
            </div>
            {!vm.status.ready && (
              <Button
                type="button"
                onClick={() => vm.initiateOAuth("dropbox")}
                className="w-full mt-2 bg-studio-surface hover:bg-studio-surface-hover border border-studio-border text-sky-400 font-mono text-xs rounded-sm h-8 cursor-pointer"
              >
                {t("Autorizar Dropbox no Navegador")}
              </Button>
            )}
          </div>
        )}

        {vm.provider === "onedrive" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[11px] font-mono font-medium text-slate-400 block">{t("OneDrive Client ID")}</label>
              <Input
                type="text"
                value={vm.config.ONEDRIVE_CLIENT_ID || ""}
                onChange={(e) => vm.updateConfig("ONEDRIVE_CLIENT_ID", e.target.value)}
                className="bg-studio-surface border-studio-border text-white text-xs rounded-sm font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-mono font-medium text-slate-400 block">{t("OneDrive Client Secret")}</label>
              <Input
                type="password"
                value={vm.config.ONEDRIVE_CLIENT_SECRET || ""}
                onChange={(e) => vm.updateConfig("ONEDRIVE_CLIENT_SECRET", e.target.value)}
                className="bg-studio-surface border-studio-border text-white text-xs rounded-sm font-mono"
              />
            </div>
            {!vm.status.ready && (
              <Button
                type="button"
                onClick={() => vm.initiateOAuth("onedrive")}
                className="w-full mt-2 bg-studio-surface hover:bg-studio-surface-hover border border-studio-border text-sky-400 font-mono text-xs rounded-sm h-8 cursor-pointer"
              >
                {t("Autorizar Conta Microsoft")}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Mensagem de Feedback Não-Bloqueante */}
      {saveFeedback && (
        <div
          className={`p-2.5 rounded-sm border text-xs font-mono flex items-center gap-2 ${
            saveFeedback.type === 'success'
              ? 'bg-studio-panel border-emerald-500/40 text-emerald-300'
              : 'bg-studio-panel border-rose-500/40 text-rose-300'
          }`}
        >
          {saveFeedback.type === 'success' ? (
            <span className="led-lamp led-live shrink-0" aria-hidden="true" />
          ) : (
            <span className="led-lamp led-rec shrink-0" aria-hidden="true" />
          )}
          <span>{saveFeedback.message}</span>
        </div>
      )}

      {/* Botão de Salvar Harmonizado */}
      <Button
        onClick={onSaveClick}
        disabled={vm.loading}
        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-mono font-semibold text-xs py-2 rounded-sm border border-emerald-500/50 shadow-xs transition cursor-pointer"
      >
        {vm.loading ? t("Validando...") : t("Salvar Configuração de Armazenamento")}
      </Button>
    </div>
  );
}