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
  setIsRestoring,
  setIsCapturing,
  addLog,
  clearLogs,
  setPartialState,
  type StudioState,
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
    setIsRestoring: (val: boolean) => dispatch(setIsRestoring(val)),
    setIsCapturing: (val: boolean) => dispatch(setIsCapturing(val)),
    addLog: (line: string) => dispatch(addLog(line)),
    clearLogs: () => dispatch(clearLogs()),
  };
}

useStudioStore.getState = () => store.getState().studio;
useStudioStore.setState = (partial: Partial<StudioState>) => {
  store.dispatch(setPartialState(partial));
};
