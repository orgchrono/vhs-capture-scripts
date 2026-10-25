import React from 'react'
import { useTranslation } from 'react-i18next'
import { TabsContent } from '../ui/tabs'
import { GenericSelect, TabTransition } from './SettingsPrimitives'
import {
  DEINTERLACER_OPTIONS,
  VIDEO_MODE_OPTIONS,
  RESOLUTION_OPTIONS,
  OUTPUT_CODEC_OPTIONS,
} from '../../lib/constants'
import type { DeinterlacerType, VideoMode, ResolutionMode, OutputCodec } from '../../types'

interface VideoTabProps {
  deinterlacer: DeinterlacerType
  setDeinterlacer: (val: DeinterlacerType) => void
  mode: VideoMode
  setMode: (val: VideoMode) => void
  resolution: ResolutionMode
  setResolution: (val: ResolutionMode) => void
  outputCodec: OutputCodec
  setOutputCodec: (val: OutputCodec) => void
  isLocked: boolean
  matches: (keywords: string[]) => boolean
}

export const VideoTab: React.FC<VideoTabProps> = ({
  deinterlacer,
  setDeinterlacer,
  mode,
  setMode,
  resolution,
  setResolution,
  outputCodec,
  setOutputCodec,
  isLocked,
  matches,
}) => {
  const { t } = useTranslation()

  return (
    <TabsContent value="video" className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-4">
      <TabTransition>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-3.5">
          {matches(['desentrelaçamento', 'deinterlacer', 'bwdif', 'qtgmc', 'video']) && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 block font-mono">{t('settings.deinterlacing_label')}</label>
              <GenericSelect value={deinterlacer} onChange={setDeinterlacer} options={DEINTERLACER_OPTIONS} disabled={isLocked} />
              <p className="text-[10px] text-slate-500 font-mono">{t('settings.qtgmc_hint')}</p>
            </div>
          )}

          {matches(['modo', 'fps', 'video', 'interlaced']) && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 block font-mono">{t('settings.fps_mode')}</label>
              <GenericSelect value={mode} onChange={setMode} options={VIDEO_MODE_OPTIONS} disabled={isLocked} />
            </div>
          )}

          {matches(['resolução', 'upscale', '1080p', 'video']) && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 block font-mono">{t('settings.resolution_label')}</label>
              <GenericSelect value={resolution} onChange={setResolution} options={RESOLUTION_OPTIONS} disabled={isLocked} />
            </div>
          )}

          {matches(['codec', 'h264', 'h265', 'hevc', 'video']) && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 block font-mono">{t('settings.output_codec_label')}</label>
              <GenericSelect value={outputCodec} onChange={setOutputCodec} options={OUTPUT_CODEC_OPTIONS} disabled={isLocked} />
            </div>
          )}
        </div>
      </TabTransition>
    </TabsContent>
  )
}
