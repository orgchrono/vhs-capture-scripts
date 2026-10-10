import { useMemo } from 'react';
import { store, useAppDispatch, useAppSelector } from './index';
import { studioSlice, type StudioState, type WorkspacePreset } from './studioSlice';
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

  const boundActions = useMemo(() => {
    const actions = studioSlice.actions;
    return {
      setSelectedFile: (file: string) => dispatch(actions.setSelectedFile(file)),
      setPreset: (preset: RestorationPreset) => dispatch(actions.setPreset(preset)),
      applyPreset: (preset: RestorationPreset) => dispatch(actions.applyPreset(preset)),
      setMode: (mode: VideoMode) => dispatch(actions.setMode(mode)),
      setDeinterlacer: (deint: DeinterlacerType) => dispatch(actions.setDeinterlacer(deint)),
      setAudioMode: (audio: AudioMode) => dispatch(actions.setAudioMode(audio)),
      setOutputCodec: (codec: OutputCodec) => dispatch(actions.setOutputCodec(codec)),
      setResolution: (res: ResolutionMode) => dispatch(actions.setResolution(res)),
      setCrf: (crf: number) => dispatch(actions.setCrf(crf)),
      setAudioOffset: (offset: number) => dispatch(actions.setAudioOffset(offset)),
      setChromaFix: (val: boolean) => dispatch(actions.setChromaFix(val)),
      setDenoise: (val: boolean) => dispatch(actions.setDenoise(val)),
      setCombFilter: (val: boolean) => dispatch(actions.setCombFilter(val)),
      setOverscanBlanking: (val: boolean) => dispatch(actions.setOverscanBlanking(val)),
      setAudioTreatment: (val: boolean) => dispatch(actions.setAudioTreatment(val)),
      setDropoutClean: (val: boolean) => dispatch(actions.setDropoutClean(val)),
      setAiAudioDenoise: (val: boolean) => dispatch(actions.setAiAudioDenoise(val)),
      setAiFaceRestore: (val: boolean) => dispatch(actions.setAiFaceRestore(val)),
      setAiFaceFidelity: (val: number) => dispatch(actions.setAiFaceFidelity(val)),
      setAiRife60fps: (val: boolean) => dispatch(actions.setAiRife60fps(val)),
      setAiUpscaler: (val: boolean) => dispatch(actions.setAiUpscaler(val)),
      setAiUpscalerModel: (val: string) => dispatch(actions.setAiUpscalerModel(val)),
      setIsRestoring: (val: boolean) => dispatch(actions.setIsRestoring(val)),
      setIsPaused: (val: boolean) => dispatch(actions.setIsPaused(val)),
      setIsCapturing: (val: boolean) => dispatch(actions.setIsCapturing(val)),

      addLog: (line: string) => dispatch(actions.addLog(line)),
      clearLogs: () => dispatch(actions.clearLogs()),
      toggleSidebar: () => dispatch(actions.toggleSidebar()),
      setSidebarCollapsed: (val: boolean) => dispatch(actions.setSidebarCollapsed(val)),
      toggleConsole: () => dispatch(actions.toggleConsole()),
      setConsoleCollapsed: (val: boolean) => dispatch(actions.setConsoleCollapsed(val)),
      setWorkspacePreset: (preset: WorkspacePreset) => dispatch(actions.setWorkspacePreset(preset)),
    };
  }, [dispatch]);

  return {
    ...state,
    ...boundActions,
  };
}

useStudioStore.getState = () => store.getState().studio;
useStudioStore.setState = (partial: Partial<StudioState>) => {
  store.dispatch(studioSlice.actions.setPartialState(partial));
};
