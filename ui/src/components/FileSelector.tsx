import React from 'react'
import { Folder, HardDrive, RefreshCw } from 'lucide-react'
import { useStudioStore } from '../store/useStudioStore'
import type { RawFile } from '../api/studioApi'

interface FileSelectorProps {
  files: RawFile[]
  onRefresh: () => void
  isRefetching: boolean
}

export const FileSelector: React.FC<FileSelectorProps> = ({ files, onRefresh, isRefetching }) => {
  const { selectedFile, setSelectedFile } = useStudioStore()

  return (
    <div className="bg-slate-900/50 border border-white/5 rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <Folder className="w-3.5 h-3.5 text-sky-400" />
          Arquivo de Entrada (media/raw/)
        </label>
        <button
          onClick={onRefresh}
          disabled={isRefetching}
          className="text-slate-400 hover:text-sky-400 transition text-xs flex items-center gap-1 cursor-pointer"
          title="Atualizar lista de arquivos"
        >
          <RefreshCw className={`w-3 h-3 ${isRefetching ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <div className="relative">
        <select
          value={selectedFile}
          onChange={(e) => setSelectedFile(e.target.value)}
          className="w-full bg-slate-950/80 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition appearance-none cursor-pointer"
        >
          <option value="">Selecione uma fita capturada...</option>
          {files.map((f) => (
            <option key={f.path} value={f.path}>
              {f.name} ({f.size_mb} MB)
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
          <HardDrive className="w-4 h-4" />
        </div>
      </div>

      {files.length === 0 && (
        <p className="text-[11px] text-amber-400/90 mt-2">
          Nenhum vídeo analógico encontrado em <code className="bg-slate-950 px-1 py-0.5 rounded text-slate-300 font-mono">media/raw/</code>. Capture com o OBS ou salve seu arquivo lá.
        </p>
      )}
    </div>
  )
}
