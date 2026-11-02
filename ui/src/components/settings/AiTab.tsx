import React from 'react'
import { TabsContent } from '../ui/tabs'
import { TabTransition } from './SettingsPrimitives'
import { SystemTelemetryCard } from '../SystemTelemetryCard'
import { AiDiagnosticCard } from './ai/AiDiagnosticCard'
import { AiModulesGrid, type AiModulesGridProps } from './ai/AiModulesGrid'
import { AiCodeFormerCard } from './ai/AiCodeFormerCard'
import { AiWhisperCard } from './ai/AiWhisperCard'

interface AiTabProps extends AiModulesGridProps {
  isLoadingHardware: boolean
  aiFaceRestore: boolean
  setAiFaceRestore: (val: boolean) => void
  aiFaceFidelity: number
  setAiFaceFidelity: (val: number) => void
  whisperModel: string
  setWhisperModel: (val: string) => void
  whisperLanguage: string
  setWhisperLanguage: (val: string) => void
  isGeneratingSubtitles: boolean
  handleGenerateSubtitles: () => void
}

export const AiTab: React.FC<AiTabProps> = (props) => {
  const {
    hardwareProfile,
    isLoadingHardware,
    aiFaceRestore,
    setAiFaceRestore,
    aiFaceFidelity,
    setAiFaceFidelity,
    whisperModel,
    setWhisperModel,
    whisperLanguage,
    setWhisperLanguage,
    isGeneratingSubtitles,
    handleGenerateSubtitles,
    isLocked,
    matches,
  } = props

  return (
    <TabsContent value="ai" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 pb-4">
      <TabTransition>
        {/* Diagnóstico de Aceleração por Hardware */}
        <AiDiagnosticCard
          hardwareProfile={hardwareProfile}
          isLoadingHardware={isLoadingHardware}
          matches={matches}
        />

        {/* Telemetria Dinâmica de Hardware em Tempo Real */}
        {matches(['hardware', 'cpu', 'gpu', 'ram', 'telemetria', 'telemetry', 'ai', 'ia']) && (
          <SystemTelemetryCard />
        )}

        {/* Módulos Modulares de Restauração por IA */}
        <AiModulesGrid {...props} />

        {/* Restauração Facial CodeFormer */}
        <AiCodeFormerCard
          matches={matches}
          isLocked={isLocked}
          hardwareProfile={hardwareProfile}
          aiFaceRestore={aiFaceRestore}
          setAiFaceRestore={setAiFaceRestore}
          aiFaceFidelity={aiFaceFidelity}
          setAiFaceFidelity={setAiFaceFidelity}
        />

        {/* Legendas Offline Whisper */}
        <AiWhisperCard
          matches={matches}
          isLocked={isLocked}
          whisperModel={whisperModel}
          setWhisperModel={setWhisperModel}
          whisperLanguage={whisperLanguage}
          setWhisperLanguage={setWhisperLanguage}
          isGeneratingSubtitles={isGeneratingSubtitles}
          handleGenerateSubtitles={handleGenerateSubtitles}
        />
      </TabTransition>
    </TabsContent>
  )
}
