import { store, useAppDispatch, useAppSelector } from './index';
import {
  setSelectedFile,
  setPreset,
  applyPreset,
  setMode,
  setDeinterlacer,
  setAudioMode,
  setOutputCodec,
  setResolution,
  setCrf,
  setAudioOffset,
  setChromaFix,
  setDenoise,
  setCombFilter,
  setOverscanBlanking,
  setAudioTreatment,
  setDropoutClean,
  setAiAudioDenoise,
  setAiFaceRestore,
  setAiFaceFidelity,
  setAiRife60fps,
  setAiUpscaler,
  setAiUpscalerModel,
  setIsRestoring,
  setIsCapturing,
  addLog,
  clearLogs,
  toggleSidebar,
  setSidebarCollapsed,
  toggleConsole,
  setConsoleCollapsed,
  setWorkspacePreset,
  setPartialState,
  type StudioState,
  type WorkspacePreset,
} from './studioSlice';
import type {
  RestorationPreset,
  VideoMode,
  DeinterlacerType,
  AudioMode,
  OutputCodec,
  ResolutionMode,
} from '../types';

export type { StudioState };

export function useStudioStore() {
  const dispatch = useAppDispatch();
  const state = useAppSelector((s) => s.studio);

  return {
    ...state,
    setSelectedFile: (file: string) => dispatch(setSelectedFile(file)),
    setPreset: (preset: RestorationPreset) => dispatch(setPreset(preset)),
    applyPreset: (preset: RestorationPreset) => dispatch(applyPreset(preset)),
    setMode: (mode: VideoMode) => dispatch(setMode(mode)),
    setDeinterlacer: (deint: DeinterlacerType) => dispatch(setDeinterlacer(deint)),
    setAudioMode: (audio: AudioMode) => dispatch(setAudioMode(audio)),
    setOutputCodec: (codec: OutputCodec) => dispatch(setOutputCodec(codec)),
    setResolution: (res: ResolutionMode) => dispatch(setResolution(res)),
    setCrf: (crf: number) => dispatch(setCrf(crf)),
    setAudioOffset: (offset: number) => dispatch(setAudioOffset(offset)),
    setChromaFix: (val: boolean) => dispatch(setChromaFix(val)),
    setDenoise: (val: boolean) => dispatch(setDenoise(val)),
    setCombFilter: (val: boolean) => dispatch(setCombFilter(val)),
    setOverscanBlanking: (val: boolean) => dispatch(setOverscanBlanking(val)),
    setAudioTreatment: (val: boolean) => dispatch(setAudioTreatment(val)),
    setDropoutClean: (val: boolean) => dispatch(setDropoutClean(val)),
    setAiAudioDenoise: (val: boolean) => dispatch(setAiAudioDenoise(val)),
    setAiFaceRestore: (val: boolean) => dispatch(setAiFaceRestore(val)),
    setAiFaceFidelity: (val: number) => dispatch(setAiFaceFidelity(val)),
    setAiRife60fps: (val: boolean) => dispatch(setAiRife60fps(val)),
    setAiUpscaler: (val: boolean) => dispatch(setAiUpscaler(val)),
    setAiUpscalerModel: (val: string) => dispatch(setAiUpscalerModel(val)),
    setIsRestoring: (val: boolean) => dispatch(setIsRestoring(val)),
    setIsCapturing: (val: boolean) => dispatch(setIsCapturing(val)),
    addLog: (line: string) => dispatch(addLog(line)),
    clearLogs: () => dispatch(clearLogs()),
    toggleSidebar: () => dispatch(toggleSidebar()),
    setSidebarCollapsed: (val: boolean) => dispatch(setSidebarCollapsed(val)),
    toggleConsole: () => dispatch(toggleConsole()),
    setConsoleCollapsed: (val: boolean) => dispatch(setConsoleCollapsed(val)),
    setWorkspacePreset: (preset: WorkspacePreset) => dispatch(setWorkspacePreset(preset)),
  };
}

useStudioStore.getState = () => store.getState().studio;
useStudioStore.setState = (partial: Partial<StudioState>) => {
  store.dispatch(setPartialState(partial));
};
