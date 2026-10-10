import React, { useState } from 'react'
import {
  Folder,
  HardDrive,
  RefreshCw,
  Film,
  Plus,
  Minus,
  CheckCircle2,
  UploadCloud,
  Disc,
  Search,
  Download,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useStudioStore } from '../store/useStudioStore'
import { useLazyInspectPanasonicQuery, useExtractPanasonicMutation } from '../api/studioRtkApi'
import type { RawFile, PanasonicInspection } from '../types'

interface FileSelectorProps {
  files: RawFile[]
  onRefresh: () => void
  isRefetching: boolean
}

export const FileSelector: React.FC<FileSelectorProps> = ({ files, onRefresh, isRefetching }) => {
  const { t } = useTranslation()
  const { selectedFile, setSelectedFile, addLog } = useStudioStore()
  const [isLibraryExpanded, setIsLibraryExpanded] = useState(true)
  const [isPanasonicExpanded, setIsPanasonicExpanded] = useState(false)
  const [panasonicPath, setPanasonicPath] = useState('')
  const [inspectionResult, setInspectionResult] = useState<PanasonicInspection | null>(null)

  const [triggerInspect, { isFetching: isInspecting }] = useLazyInspectPanasonicQuery()
  const [extractMutation, { isLoading: isExtracting }] = useExtractPanasonicMutation()

  const handleInspect = async () => {
    if (!panasonicPath.trim()) return
    try {
      addLog(`[PANASONIC INGEST] ${t('files.inspect', 'Inspecionar')}: ${panasonicPath}`)
      const res = await triggerInspect(panasonicPath.trim()).unwrap()
      setInspectionResult(res)
      if (res.is_panasonic) {
        const method = res.toolchain_available
          ? t('files.binary_native', 'Binário Nativo')
          : t('files.carver_python', 'Carver Pure-Python')
        toast.success(t('toast.panasonic_found_title', 'Panasonic DVR Detectado'), {
          description: `${res.format} (${method})`,
        })
      } else {
        toast.error(t('toast.panasonic_not_found', 'Nenhuma assinatura Panasonic encontrada'))
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('toast.inspect_error', 'Falha ao inspecionar caminho')
      addLog(`[PANASONIC INGEST] ${t('toast.inspect_error', 'Erro na inspeção')}: ${msg}`)
      toast.error(msg)
    }
  }

  const handleExtract = async () => {
    if (!panasonicPath.trim()) return
    try {
      addLog(`[PANASONIC INGEST] ${t('files.extracting', 'Extraindo')}: ${panasonicPath}`)
      const res = await extractMutation({ source_path: panasonicPath.trim() }).unwrap()
      toast.success(t('toast.panasonic_extracted', 'Extração Concluída'), {
        description: res.message,
      })
      addLog(`[PANASONIC INGEST] ${t('toast.panasonic_extracted', 'Extração Concluída')}: ${res.extracted_files.length} (media/raw/)`)
      onRefresh()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('toast.extract_error', 'Falha na extração')
      addLog(`[PANASONIC INGEST] ${t('toast.extract_error', 'Erro durante extração')}: ${msg}`)
      toast.error(msg)
    }
  }

  const handleSelectTape = (file: RawFile) => {
    setSelectedFile(file.path)
    addLog(`[INGESTÃO] ${t('toast.file_loaded_title', 'Fita Carregada')}: ${file.name}`)
    toast.success(t('toast.file_loaded_title', 'Fita Carregada'), {
      description: `${file.name} (${file.size_mb} MB)`,
    })
  }

  const formatFileSize = (sizeMb: number) => {
    if (sizeMb >= 1024) {
      return `${(sizeMb / 1024).toFixed(1)} GB`
    }
    return `${sizeMb.toFixed(1)} MB`
  }

  return (
    <div className="bg-slate-900/60 border border-white/10 rounded-xl p-3.5 mb-4 shadow-lg flex flex-col gap-3">
      {/* Top Header: Input Label & Refresh Button */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
          <Folder className="w-3.5 h-3.5 text-sky-400" />
          {t('files.input_file_label', 'Fita Selecionada')}
        </label>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefetching}
          className="text-slate-400 hover:text-sky-400 transition text-xs flex items-center gap-1 cursor-pointer hover:bg-white/5 px-2 py-0.5 rounded font-mono"
          title={t('files.refresh_list', 'Atualizar biblioteca de fitas')}
        >
          <RefreshCw className={`w-3 h-3 ${isRefetching ? 'animate-spin' : ''}`} />
          <span>{t('files.refresh', 'Atualizar')}</span>
        </button>
      </div>

      {/* Primary Dropdown Selector (with fixed non-selectable placeholder) */}
      <div className="relative">
        <select
          value={selectedFile}
          onChange={(e) => {
            const val = e.target.value
            if (val) {
              const matched = files.find((f) => f.path === val)
              if (matched) {
                handleSelectTape(matched)
              } else {
                setSelectedFile(val)
              }
            }
          }}
          className="w-full bg-slate-950/80 border border-white/10 rounded-lg px-3.5 py-2 text-xs font-mono text-slate-100 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition appearance-none cursor-pointer"
        >
          <option value="" disabled hidden>
            {t('files.select_placeholder', 'Selecione uma fita capturada...')}
          </option>
          {files.map((f) => (
            <option key={f.path} value={f.path}>
              {f.name} ({formatFileSize(f.size_mb)})
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
          <HardDrive className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* Visual Tape Library Explorer (VS Code Style Expandable Cards) */}
      <div className="border-t border-white/10 pt-2.5 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300 font-bold uppercase tracking-wider">
            <Film className="w-3.5 h-3.5 text-sky-400" />
            <span>{t('files.library_explorer_title', 'Acervo de Fitas')}</span>
            <span className="text-[10px] bg-studio-surface px-1.5 py-0.2 rounded text-slate-400 border border-studio-border">
              {files.length}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsLibraryExpanded(!isLibraryExpanded)}
            className="flex items-center gap-1 text-[10px] font-mono text-slate-400 hover:text-slate-100 bg-studio-surface hover:bg-studio-surface-hover px-1.5 py-0.5 rounded border border-studio-border cursor-pointer transition"
            title={isLibraryExpanded ? t('files.collapse', 'Recolher') : t('files.expand', 'Expandir')}
            data-testid="toggle-tape-library-btn"
          >
            {isLibraryExpanded ? (
              <>
                <Minus className="w-3 h-3" />
                <span>{t('files.collapse', 'Recolher')}</span>
              </>
            ) : (
              <>
                <Plus className="w-3 h-3" />
                <span>{t('files.expand', 'Expandir')}</span>
              </>
            )}
          </button>
        </div>

        {isLibraryExpanded && (
          <div className="space-y-2 max-h-[380px] overflow-y-auto custom-scrollbar pr-0.5">
            {files.length === 0 ? (
              <div className="p-4 border border-dashed border-white/10 rounded-xl bg-slate-950/40 flex flex-col items-center justify-center text-center text-slate-400 gap-2">
                <UploadCloud className="w-8 h-8 text-slate-600 mb-1" />
                <p className="text-xs font-mono font-medium text-slate-300">
                  {t('files.no_files_found', 'Nenhuma fita encontrada em media/raw/')}
                </p>
                <p className="text-[10px] text-slate-500 font-mono">
                  {t('files.empty_hint', 'Grave uma nova fita no OBS Studio ou arraste um arquivo de vídeo para cá.')}
                </p>
              </div>
            ) : (
              files.map((file) => {
                const isSelected = selectedFile === file.path
                const ext = file.name.split('.').pop()?.toUpperCase() || 'RAW'

                return (
                  <div
                    key={file.path}
                    onClick={() => handleSelectTape(file)}
                    className={`group relative p-2.5 rounded-xl border transition-all cursor-pointer flex items-center gap-3 select-none ${
                      isSelected
                        ? 'bg-sky-950/40 border-sky-500/80 shadow-[0_0_12px_rgba(14,165,233,0.15)] ring-1 ring-sky-500/40'
                        : 'bg-slate-950/70 border-white/5 hover:border-white/20 hover:bg-slate-900/80'
                    }`}
                  >
                    {/* VHS Tape Miniature or Smart Thumbnail */}
                    {file.thumbnail_url ? (
                      <div className="w-12 h-10 rounded-lg bg-[#070b12] border border-[#1e273a] shrink-0 relative overflow-hidden group-hover:border-sky-500/40 transition">
                        <img
                          src={file.thumbnail_url}
                          alt={file.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none'
                          }}
                        />
                      </div>
                    ) : (
                      <div className="w-12 h-10 rounded-lg bg-[#070b12] border border-[#1e273a] flex flex-col items-center justify-center shrink-0 relative overflow-hidden group-hover:border-sky-500/40 transition">
                        <div className="flex items-center gap-1.5 opacity-60">
                          <span className="w-2.5 h-2.5 rounded-full border border-slate-500 bg-slate-900 flex items-center justify-center">
                            <span className="w-1 h-1 rounded-full bg-slate-400"></span>
                          </span>
                          <span className="w-2.5 h-2.5 rounded-full border border-slate-500 bg-slate-900 flex items-center justify-center">
                            <span className="w-1 h-1 rounded-full bg-slate-400"></span>
                          </span>
                        </div>
                        <span className="text-[8px] font-mono font-bold text-sky-400/90 mt-0.5 uppercase tracking-tighter">
                          {ext}
                        </span>
                      </div>
                    )}

                    {/* Tape Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <h4
                          className={`text-xs font-mono font-medium truncate ${
                            isSelected ? 'text-sky-300 font-bold' : 'text-slate-200 group-hover:text-white'
                          }`}
                          title={file.name}
                        >
                          {file.name}
                        </h4>
                        {isSelected && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                        <span className="text-slate-500">{formatFileSize(file.size_mb)}</span>
                        <span>•</span>
                        <span className="text-slate-500 truncate">{file.date || t('files.analog_recording', 'Gravação Analógica')}</span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Panasonic DVR / HDD Ingestion Section */}
      <div className="border-t border-white/10 pt-2.5 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-300 font-bold uppercase tracking-wider">
            <Disc className="w-3.5 h-3.5 text-amber-400" />
            <span>{t('files.panasonic_ingest_title', 'Ingestão Panasonic DVR')}</span>
          </div>

          <button
            type="button"
            onClick={() => setIsPanasonicExpanded(!isPanasonicExpanded)}
            className="flex items-center justify-center w-5 h-5 text-slate-400 hover:text-slate-100 bg-studio-surface hover:bg-studio-surface-hover rounded border border-studio-border cursor-pointer transition"
            title={isPanasonicExpanded ? t('files.panasonic_collapse', 'Recolher ingestão') : t('files.panasonic_expand', 'Expandir ingestão Panasonic')}
            aria-label={isPanasonicExpanded ? t('files.panasonic_collapse', 'Recolher ingestão') : t('files.panasonic_expand', 'Expandir ingestão Panasonic')}
            data-testid="toggle-panasonic-ingest-btn"
          >
            {isPanasonicExpanded ? (
              <Minus className="w-3 h-3" />
            ) : (
              <Plus className="w-3 h-3" />
            )}
          </button>
        </div>

        {isPanasonicExpanded && (
          <div className="p-2.5 rounded-xl border border-white/10 bg-slate-950/60 flex flex-col gap-2 text-xs font-mono">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-slate-400 uppercase font-semibold">
                {t('files.source_path_label', 'Arquivo ou Imagem de Disco (MEIHDFS/DVD-VR):')}
              </label>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={panasonicPath}
                  onChange={(e) => setPanasonicPath(e.target.value)}
                  placeholder={t('files.source_path_placeholder', 'Caminho da imagem (.img, .bin, .raw, .iso)...')}
                  className="flex-1 bg-slate-900 border border-white/10 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-amber-400"
                  data-testid="panasonic-path-input"
                />
                <button
                  type="button"
                  disabled={!panasonicPath.trim() || isInspecting}
                  onClick={handleInspect}
                  className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-2 py-1 rounded text-[10px] font-bold transition disabled:opacity-40 cursor-pointer flex items-center gap-1 shrink-0"
                  data-testid="inspect-panasonic-btn"
                >
                  {isInspecting ? (
                    <RefreshCw className="w-3 h-3 animate-spin" />
                  ) : (
                    <Search className="w-3 h-3" />
                  )}
                  <span>{t('files.inspect', 'Inspecionar')}</span>
                </button>
              </div>
            </div>

            {inspectionResult && (
              <div
                className={`p-2 rounded border text-[11px] ${
                  inspectionResult.is_panasonic
                    ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
                    : 'bg-red-950/30 border-red-500/30 text-red-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold">
                    {t('files.format_label', 'Formato:')} {inspectionResult.format}
                  </span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-white/10">
                    {inspectionResult.toolchain_available
                      ? t('files.binary_native', 'Binário Nativo')
                      : t('files.carver_python', 'Carver Pure-Python')}
                  </span>
                </div>
                <p className="text-[10px] text-slate-300 mb-2 leading-relaxed">
                  {inspectionResult.details}
                </p>
                {inspectionResult.can_extract && (
                  <button
                    type="button"
                    disabled={isExtracting}
                    onClick={handleExtract}
                    className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-1.5 rounded text-xs transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 shadow"
                    data-testid="extract-panasonic-btn"
                  >
                    {isExtracting ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>{t('files.extracting', 'Extraindo títulos para media/raw/...')}</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3 h-3" />
                        <span>{t('files.extract_btn', 'Extrair para media/raw/')}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
