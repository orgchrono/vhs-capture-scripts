import React from 'react'
import { Radio, Square, HelpCircle } from 'lucide-react'
import { useStudioStore } from '../store/useStudioStore'
import { studioApi } from '../api/studioApi'

export const CaptureBar: React.FC = () => {
  const { isCapturing, setIsCapturing, addLog } = useStudioStore()

  const handleStartCapture = async () => {
    setIsCapturing(true)
    addLog('[OBS CAPTURA] Enviando comando de início de gravação para o OBS Studio...')
    try {
      const res = await studioApi.startObsCapture()
      if (res.status === 'started') {
        addLog('[OBS CAPTURA] Gravação DeckLink Lossless iniciada com sucesso!')
      } else {
        addLog(`[OBS AVISO] ${res.message || 'OBS não respondeu no WebSocket'}`)
      }
    } catch {
      addLog('[OBS AVISO] OBS Studio não está aberto ou WebSocket não está ativo na porta 4455.')
      addLog('[OBS DICA] Abra o OBS Studio com o perfil VHS_Archive.')
    }
  }

  const handleStopCapture = async () => {
    addLog('[OBS CAPTURA] Finalizando gravação no OBS Studio...')
    try {
      const res = await studioApi.stopObsCapture()
      setIsCapturing(false)
      if (res.path) {
        addLog(`[OBS CAPTURA] Arquivo finalizado com sucesso: ${res.path}`)
      }
    } catch (e) {
      setIsCapturing(false)
      addLog(`[OBS ERRO] Falha ao finalizar: ${e}`)
    }
  }

  return (
    <div className="bg-gradient-to-r from-slate-900/80 via-slate-900/50 to-slate-900/80 border border-white/10 rounded-xl p-4 mb-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${isCapturing ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-slate-800 text-slate-400'}`}>
          <Radio className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">Captura Automatizada OBS Studio</span>
            <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
              DeckLink SDK
            </span>
          </div>
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            Gravação sem perdas (ProRes 422 HQ / x264 CRF 0) direto para <code className="text-sky-300 font-mono">media/raw/</code>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!isCapturing ? (
          <button
            onClick={handleStartCapture}
            className="bg-red-600/90 hover:bg-red-500 text-white font-semibold text-xs px-3.5 py-2 rounded-lg shadow-md shadow-red-600/20 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            Iniciar Gravação OBS
          </button>
        ) : (
          <button
            onClick={handleStopCapture}
            className="bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs px-3.5 py-2 rounded-lg shadow-md shadow-amber-600/20 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Square className="w-3.5 h-3.5" />
            Parar & Processar Fita
          </button>
        )}

        <div className="relative group">
          <HelpCircle className="w-4 h-4 text-slate-500 hover:text-slate-300 cursor-help" />
          <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-72 p-3 bg-slate-950 border border-white/10 rounded-lg text-xs text-slate-300 shadow-xl z-50 leading-relaxed">
            <strong className="text-white block mb-1">Padrão Ouro Multiplataforma:</strong>
            O OBS Studio grava via DeckLink SDK nativo no Windows, Mac e Linux sem perdas. Se você preferir usar o <strong>VirtualDub2</strong> ou <strong>AmaRecTV</strong> no Windows, basta salvar os arquivos na pasta <code className="text-sky-300 font-mono">media/raw/</code> que o app reconhece na hora!
          </div>
        </div>
      </div>
    </div>
  )
}
