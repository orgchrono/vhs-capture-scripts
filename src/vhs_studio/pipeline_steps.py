"""Specialized execution steps for the processing and restoration DAG.

Each step encapsulates a single domain responsibility (SRP) with isolated
error handling and toolchain binding.
"""

import os
import shutil
import subprocess
from typing import Optional, Dict, Any
from vhs_studio.core.logger import log
from vhs_studio.core.constants import (
    DEFAULT_CODEFORMER_FIDELITY,
    DEFAULT_RIFE_TARGET_FPS,
    DEFAULT_SCENE_THRESHOLD,
)
from vhs_studio.core.toolchain import Toolchain
from vhs_studio.pipeline_planner import (
    build_restore_command_args,
    build_scene_split_command,
    resolve_upscaler_model,
)


class BaseRestorationStep:
    """Executes the primary hardware/software video restoration pipeline via CLI subprocess."""

    @staticmethod
    def execute(raw_file: str, output_path: str, params: Dict[str, Any], python_exe: str) -> str:
        log.info(f"[RESTORATION STEP] Executing primary restoration on: {raw_file}")
        cmd = build_restore_command_args(raw_file, output_path, params, python_exe)
        subprocess.run(cmd, check=True)
        return output_path


class WhisperStep:
    """Extracts speech and generates synchronized WebVTT subtitles."""

    @staticmethod
    def execute(raw_file: str, output_path: str) -> Optional[str]:
        try:
            from vhs_studio.ai.whisper_engine import transcribe_and_generate_vtt

            base_dir = os.path.dirname(output_path)
            os.makedirs(base_dir, exist_ok=True)
            vtt = transcribe_and_generate_vtt(raw_file, model_size="tiny")

            vtt_name = os.path.basename(vtt)
            new_vtt = os.path.join(base_dir, vtt_name)
            if vtt != new_vtt and os.path.exists(vtt):
                shutil.move(vtt, new_vtt)
            return new_vtt
        except ImportError:
            log.warning(
                "[WHISPER] faster-whisper package is not installed. Skipping transcription."
            )
            return None
        except Exception as e:
            log.warning(f"[WHISPER ERROR] Transcription failed: {e}")
            return None


class FaceRestorationStep:
    """Executes facial region detection and restoration using CodeFormer."""

    @staticmethod
    def execute(output_path: str, params: Dict[str, Any]) -> Optional[str]:
        log.info("[FACE RESTORER] Inicializando restauração facial CodeFormer...")
        from vhs_studio.ai.face_restorer import FaceRestorer

        fidelity = float(params.get("ai_face_fidelity", DEFAULT_CODEFORMER_FIDELITY))
        restorer = FaceRestorer(fidelity_weight=fidelity)
        if restorer.is_available() and os.path.exists(output_path):
            base_dir, filename = os.path.split(output_path)
            name, ext = os.path.splitext(filename)
            faced_path = os.path.join(base_dir, f"{name}_codeformer{ext}")
            if restorer.process_video(output_path, faced_path):
                return faced_path
        return None


class RifeInterpolationStep:
    """Executes motion frame interpolation to 60fps via RIFE-NCNN."""

    @staticmethod
    def execute(output_path: str) -> Optional[str]:
        log.info("[RIFE] Inicializando interpolação 60fps via RIFE-NCNN...")
        from vhs_studio.video.rife_interpolator import RifeInterpolator

        interpolator = RifeInterpolator(target_fps=DEFAULT_RIFE_TARGET_FPS)
        if interpolator.is_available() and os.path.exists(output_path):
            base_dir, filename = os.path.split(output_path)
            name, ext = os.path.splitext(filename)
            rife_path = os.path.join(base_dir, f"{name}_60fps{ext}")
            if interpolator.interpolate_video(output_path, rife_path):
                return rife_path
        return None


class AIUpscalerStep:
    """Executes AI super-resolution via Real-ESRGAN or Real-CUGAN."""

    @staticmethod
    def execute(output_path: str, params: Dict[str, Any]) -> Optional[str]:
        model = resolve_upscaler_model(params)
        log.info(f"[AI UPSCALER] Initializing super-resolution engine with model {model}...")
        from vhs_studio.video.ai_upscaler import AIUpscaler

        upscaler = AIUpscaler(model_name=model, gpu_id="auto")
        if upscaler.ncnn_path and os.path.exists(output_path):
            base_dir, filename = os.path.split(output_path)
            name, ext = os.path.splitext(filename)
            upscaled_path = os.path.join(base_dir, f"{name}_ai_upscale{ext}")
            upscaler.process_video(output_path, upscaled_path)
            return upscaled_path
        return output_path


class SceneSegmentationStep:
    """Detects camera cuts and slices master video into scene clips."""

    @staticmethod
    def execute(master_file: Optional[str]) -> None:
        if not master_file or not os.path.exists(master_file):
            return

        try:
            from scenedetect import detect, ContentDetector
        except ImportError:
            log.warning(
                "[SCENE DETECT] scenedetect package is not installed. Skipping scene splits."
            )
            return

        log.info("[SCENE DETECT] Scanning for camera cuts in master video...")
        scene_list = detect(
            master_file, ContentDetector(threshold=DEFAULT_SCENE_THRESHOLD)
        )

        if len(scene_list) <= 1:
            log.info(
                "[SCENE DETECT] No scene cuts detected. Retaining intact master file."
            )
            return

        log.info(
            f"[SCENE DETECT] {len(scene_list)} scene cuts detected. Slicing video into scenes..."
        )

        base_dir = os.path.dirname(master_file)
        base_name, ext = os.path.splitext(os.path.basename(master_file))

        try:
            ffmpeg_bin = Toolchain.get_ffmpeg_path()
        except Exception:
            ffmpeg_bin = "ffmpeg"

        for i, scene in enumerate(scene_list, 1):
            start_time = scene[0].get_timecode()
            end_time = scene[1].get_timecode()
            out_clip = os.path.join(base_dir, f"{base_name}_Scene_{i:03d}{ext}")
            cmd = build_scene_split_command(master_file, start_time, end_time, out_clip, ffmpeg_bin)
            subprocess.run(cmd)
            log.info(f"  -> Generated: Scene_{i:03d}{ext} ({start_time} to {end_time})")


class CloudOffloadStep:
    """Uploads restored master video to configured cloud storage destination."""

    @staticmethod
    def execute(output_path: str, params: Dict[str, Any]) -> None:
        if not params.get("auto_upload"):
            return
        try:
            from vhs_studio.config.storage_config import load_storage_config
            from vhs_studio.storage.manager import StorageManager

            storage_cfg = load_storage_config()
            provider_id = params.get("storage_provider") or storage_cfg.get(
                "provider", "gdrive"
            )
            provider = StorageManager.get_provider(provider_id)
            if provider:
                log.info(
                    f"[CLOUD UPLOAD] Uploading master file to {provider_id}..."
                )
                provider.upload_video(
                    output_path, os.path.basename(output_path)
                )
            else:
                log.warning(
                    f"[CLOUD UPLOAD] Provider '{provider_id}' is not configured or unavailable."
                )
        except Exception as e:
            log.error(f"[CLOUD UPLOAD ERROR] Failed to upload to cloud: {e}")
