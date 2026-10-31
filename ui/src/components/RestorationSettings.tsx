import React from 'react'
import {
  Sliders,
  Search,
  Video,
  Music,
  Settings2,
  Image as ImageIcon,
  Sparkles,
  Cpu,
  Cloud,
  X,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'
import { Input } from './ui/input'
import { useTranslation } from 'react-i18next'
import { useRestorationViewModel } from '../viewmodels/useRestorationViewModel'
import {
  useSettingsSearchViewModel,
  PresetsTab,
  VideoTab,
  AudioTab,
  FiltersTab,
  AdvancedTab,
  AiTab,
  StorageTab,
} from './settings'

export const RestorationSettings: React.FC = () => {
  const { t } = useTranslation()
  const {
    store,
    hardwareProfile,
    isLoadingHardware,
    whisperModel,
    setWhisperModel,
    whisperLanguage,
    setWhisperLanguage,
    isGeneratingSubtitles,
    handleGenerateSubtitles,
  } = useRestorationViewModel()

  const {
    mode, setMode,
    deinterlacer, setDeinterlacer,
    audioMode, setAudioMode,
    resolution, setResolution,
    crf, setCrf,
    audioOffset, setAudioOffset,
    chromaFix, setChromaFix,
    denoise, setDenoise,
    combFilter, setCombFilter,
    outputCodec, setOutputCodec,
    overscanBlanking, setOverscanBlanking,
    audioTreatment, setAudioTreatment,
    dropoutClean, setDropoutClean,
    aiAudioDenoise, setAiAudioDenoise,
    aiFaceRestore, setAiFaceRestore,
    aiFaceFidelity, setAiFaceFidelity,
    aiRife60fps, setAiRife60fps,
    aiUpscaler, setAiUpscaler,
    aiUpscalerModel, setAiUpscalerModel,
  } = store

  const isLocked = store.isRestoring || store.isPaused
  const {
    search,
    activeTab,
    setActiveTab,
    handleSearchChange,
    matches,
    isTabMatching,
  } = useSettingsSearchViewModel()

  return (
    <div className="bg-studio-panel border border-studio-border rounded-md p-3 shadow-sm flex-1 min-h-0 flex flex-col h-full">
      <div className="flex items-center justify-between gap-2.5 mb-2.5 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Sliders className="w-4 h-4 text-slate-400 shrink-0" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono shrink-0">
            {t('settings.technical_title')}
          </h3>
        </div>
        <div className="relative w-44 sm:w-56 shrink-0">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-500 pointer-events-none" />
          <Input
            placeholder={t('settings.search_placeholder')}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-8 pr-7 h-8 text-xs bg-studio-surface border border-studio-border text-white placeholder:text-slate-500 focus:border-studio-border-focus rounded-sm font-mono w-full"
            data-testid="settings-search-input"
          />
          {search && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              className="absolute right-2 top-2 text-slate-400 hover:text-white cursor-pointer"
              title={t('settings.clear_search')}
              aria-label={t('settings.clear_search')}
              data-testid="settings-search-clear"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 min-h-0 flex flex-col" aria-label={t('settings.tabs_aria_label')}>
        <TabsList className="flex items-center overflow-x-auto overflow-y-hidden custom-scrollbar gap-1 mb-2.5 bg-studio-surface p-1 border border-studio-border rounded-sm shrink-0">
          <TabsTrigger value="presets" data-testid="tab-presets" className={`flex items-center justify-center gap-1.5 text-xs py-1.5 px-2.5 font-medium font-mono rounded-sm shrink-0 whitespace-nowrap ${isTabMatching('presets') ? 'text-amber-400' : ''}`}><Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />{t('settings.tab_presets')}</TabsTrigger>
          <TabsTrigger value="video" data-testid="tab-video" className={`flex items-center justify-center gap-1.5 text-xs py-1.5 px-2.5 font-medium font-mono rounded-sm shrink-0 whitespace-nowrap ${isTabMatching('video') ? 'text-amber-400' : ''}`}><Video className="w-3.5 h-3.5 text-slate-300 shrink-0" />{t('settings.tab_video')}</TabsTrigger>
          <TabsTrigger value="audio" data-testid="tab-audio" className={`flex items-center justify-center gap-1.5 text-xs py-1.5 px-2.5 font-medium font-mono rounded-sm shrink-0 whitespace-nowrap ${isTabMatching('audio') ? 'text-amber-400' : ''}`}><Music className="w-3.5 h-3.5 text-slate-300 shrink-0" />{t('settings.tab_audio')}</TabsTrigger>
          <TabsTrigger value="filters" data-testid="tab-filters" className={`flex items-center justify-center gap-1.5 text-xs py-1.5 px-2.5 font-medium font-mono rounded-sm shrink-0 whitespace-nowrap ${isTabMatching('filters') ? 'text-amber-400' : ''}`}><ImageIcon className="w-3.5 h-3.5 text-slate-300 shrink-0" />{t('settings.tab_filters')}</TabsTrigger>
          <TabsTrigger value="advanced" data-testid="tab-advanced" className={`flex items-center justify-center gap-1.5 text-xs py-1.5 px-2.5 font-medium font-mono rounded-sm shrink-0 whitespace-nowrap ${isTabMatching('advanced') ? 'text-amber-400' : ''}`}><Settings2 className="w-3.5 h-3.5 text-slate-300 shrink-0" />{t('settings.tab_advanced')}</TabsTrigger>
          <TabsTrigger value="ai" data-testid="tab-ai" className={`flex items-center justify-center gap-1.5 text-xs py-1.5 px-2.5 font-medium font-mono rounded-sm shrink-0 whitespace-nowrap ${isTabMatching('ai') ? 'text-amber-400' : ''}`}><Cpu className="w-3.5 h-3.5 text-slate-300 shrink-0" />{t('settings.tab_ai')}</TabsTrigger>
          <TabsTrigger value="storage" data-testid="tab-storage" className={`flex items-center justify-center gap-1.5 text-xs py-1.5 px-2.5 font-medium font-mono rounded-sm shrink-0 whitespace-nowrap ${isTabMatching('storage') ? 'text-amber-400' : ''}`}><Cloud className="w-3.5 h-3.5 text-slate-300 shrink-0" />{t('settings.tab_storage')}</TabsTrigger>
        </TabsList>

        <PresetsTab
          outputCodec={outputCodec}
          setOutputCodec={setOutputCodec}
          isLocked={isLocked}
          matches={matches}
        />

        <VideoTab
          deinterlacer={deinterlacer}
          setDeinterlacer={setDeinterlacer}
          mode={mode}
          setMode={setMode}
          resolution={resolution}
          setResolution={setResolution}
          outputCodec={outputCodec}
          setOutputCodec={setOutputCodec}
          isLocked={isLocked}
          matches={matches}
        />

        <AudioTab
          audioMode={audioMode}
          setAudioMode={setAudioMode}
          audioOffset={audioOffset}
          setAudioOffset={setAudioOffset}
          audioTreatment={audioTreatment}
          setAudioTreatment={setAudioTreatment}
          isLocked={isLocked}
          matches={matches}
        />

        <FiltersTab
          chromaFix={chromaFix}
          setChromaFix={setChromaFix}
          denoise={denoise}
          setDenoise={setDenoise}
          combFilter={combFilter}
          setCombFilter={setCombFilter}
          overscanBlanking={overscanBlanking}
          setOverscanBlanking={setOverscanBlanking}
          isLocked={isLocked}
          matches={matches}
        />

        <AdvancedTab
          crf={crf}
          setCrf={setCrf}
          isLocked={isLocked}
          matches={matches}
        />

        <AiTab
          hardwareProfile={hardwareProfile}
          isLoadingHardware={isLoadingHardware}
          aiAudioDenoise={aiAudioDenoise}
          setAiAudioDenoise={setAiAudioDenoise}
          dropoutClean={dropoutClean}
          setDropoutClean={setDropoutClean}
          aiRife60fps={aiRife60fps}
          setAiRife60fps={setAiRife60fps}
          aiUpscaler={aiUpscaler}
          setAiUpscaler={setAiUpscaler}
          aiUpscalerModel={aiUpscalerModel}
          setAiUpscalerModel={setAiUpscalerModel}
          aiFaceRestore={aiFaceRestore}
          setAiFaceRestore={setAiFaceRestore}
          aiFaceFidelity={aiFaceFidelity}
          setAiFaceFidelity={setAiFaceFidelity}
          whisperModel={whisperModel}
          setWhisperModel={setWhisperModel}
          whisperLanguage={whisperLanguage}
          setWhisperLanguage={setWhisperLanguage}
          isGeneratingSubtitles={isGeneratingSubtitles}
          handleGenerateSubtitles={handleGenerateSubtitles}
          isLocked={isLocked}
          matches={matches}
        />

        <StorageTab matches={matches} />
      </Tabs>
    </div>
  )
}
