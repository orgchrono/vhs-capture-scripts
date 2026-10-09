"""Main processing and restoration pipeline orchestrator."""

import os
import sys
import subprocess
import argparse
from concurrent.futures import ThreadPoolExecutor
from vhs_studio.core.logger import log
import json
from vhs_studio.core.constants import DEFAULT_SCENE_THRESHOLD


class PipelineOrchestrator:
    """Manages parallel DAG execution for restoration, AI enhancement, and packaging."""

    def __init__(self, raw_file, output_path, opts=None, params=None):
        self.raw_file = os.path.abspath(raw_file)
        self.output_path = os.path.abspath(output_path)
        self.opts = opts or {}
        self.params = params or {}
        self.executor = ThreadPoolExecutor(max_workers=3)
        self.results = {}

    def start(self):
        """Execute the DAG of concurrent restoration and AI processing tasks."""
        log.info("============================================================")
        log.info("[PIPELINE ORCHESTRATOR] Starting Multi-Engine DAG Processing")
        log.info(f"  Source: {self.raw_file}")

        esrgan_enabled = False
        if isinstance(self.opts, dict):
            esrgan_enabled = self.opts.get("esrgan", False) or self.opts.get("ai_upscaler", False)
        elif hasattr(self.opts, "esrgan"):
            esrgan_enabled = getattr(self.opts, "esrgan", False) or getattr(self.opts, "ai_upscaler", False)
        if not esrgan_enabled and isinstance(self.params, dict):
            esrgan_enabled = self.params.get("esrgan", False) or self.params.get("ai_upscaler", False)

        f_restoration = self.executor.submit(self._task_restoration)
        f_whisper = self.executor.submit(self._task_whisper)

        # Wait for base restoration to finish before post-processing video enhancements
        try:
            self.results["Restoration"] = f_restoration.result()
            log.info("[RESTORATION] Base restoration finished successfully.")
        except Exception as exc:
            log.error(f"[RESTORATION ERROR] Primary restoration failed: {exc}")
            raise exc

        # Post-restoration AI enhancements (CodeFormer, RIFE 60fps, Super-Resolution)
        if self.params.get("ai_face_restore"):
            try:
                self.results["FaceRestoration"] = self._task_face_restore()
            except Exception as exc:
                log.error(f"[FACE RESTORATION ERROR] {exc}")

        if self.params.get("ai_rife_60fps"):
            try:
                self.results["RIFE"] = self._task_rife()
            except Exception as exc:
                log.error(f"[RIFE ERROR] {exc}")

        if esrgan_enabled:
            try:
                self.results["Upscaler"] = self._task_upscaler()
            except Exception as exc:
                log.error(f"[UPSCALER ERROR] {exc}")

        try:
            self.results["Whisper"] = f_whisper.result()
            log.info("[WHISPER] Audio transcription completed.")
        except Exception as exc:
            log.warning(f"[WHISPER WARNING] Audio transcription failed: {exc}")

        self._task_scenedetect_and_split()
        log.info("[PIPELINE ORCHESTRATOR] All pipeline stages finished successfully.")

        # Stage: Cloud Offload
        if self.params.get("auto_upload"):
            try:
                from vhs_studio.config.storage_config import load_storage_config
                from vhs_studio.storage.manager import StorageManager

                storage_cfg = load_storage_config()
                provider_id = self.params.get("storage_provider") or storage_cfg.get(
                    "provider", "gdrive"
                )
                provider = StorageManager.get_provider(provider_id)
                if provider:
                    log.info(
                        f"[CLOUD UPLOAD] Uploading master file to {provider_id}..."
                    )
                    provider.upload_video(
                        self.output_path, os.path.basename(self.output_path)
                    )
                else:
                    log.warning(
                        f"[CLOUD UPLOAD] Provider '{provider_id}' is not configured or unavailable."
                    )
            except Exception as e:
                log.error(f"[CLOUD UPLOAD ERROR] Failed to upload to cloud: {e}")

    def _task_face_restore(self):
        """Execute face restoration task via CodeFormer."""
        log.info("[FACE RESTORER] Inicializando restauração facial CodeFormer...")
        from vhs_studio.ai.face_restorer import FaceRestorer

        fidelity = float(self.params.get("ai_face_fidelity", 0.7))
        restorer = FaceRestorer(fidelity_weight=fidelity)
        if restorer.is_available() and os.path.exists(self.output_path):
            base_dir, filename = os.path.split(self.output_path)
            name, ext = os.path.splitext(filename)
            faced_path = os.path.join(base_dir, f"{name}_codeformer{ext}")
            if restorer.process_video(self.output_path, faced_path):
                return faced_path
        return None

    def _task_rife(self):
        """Execute motion interpolation task via RIFE-NCNN."""
        log.info("[RIFE] Inicializando interpolação 60fps via RIFE-NCNN...")
        from vhs_studio.video.rife_interpolator import RifeInterpolator

        interpolator = RifeInterpolator(target_fps=60.0)
        if interpolator.is_available() and os.path.exists(self.output_path):
            base_dir, filename = os.path.split(self.output_path)
            name, ext = os.path.splitext(filename)
            rife_path = os.path.join(base_dir, f"{name}_60fps{ext}")
            if interpolator.interpolate_video(self.output_path, rife_path):
                return rife_path
        return None

    def _task_upscaler(self):
        """Execute AI super-resolution task via Real-ESRGAN / Real-CUGAN."""
        model = self.params.get("ai_upscaler_model") or (
            "models-se" if self.params.get("realcugan") else "realesrgan-x4plus"
        )
        log.info(f"[AI UPSCALER] Initializing super-resolution engine with model {model}...")
        from vhs_studio.video.ai_upscaler import AIUpscaler

        upscaler = AIUpscaler(model_name=model, gpu_id="auto")
        if upscaler.ncnn_path and os.path.exists(self.output_path):
            base_dir, filename = os.path.split(self.output_path)
            name, ext = os.path.splitext(filename)
            upscaled_path = os.path.join(base_dir, f"{name}_ai_upscale{ext}")
            upscaler.process_video(self.output_path, upscaled_path)
            return upscaled_path
        return True

    def _task_esrgan(self):
        """Backwards compatibility alias for _task_upscaler."""
        return self._task_upscaler()

    def _task_restoration(self):
        """Invoke primary restoration CLI subprocess."""
        cmd = [
            sys.executable,
            "-m",
            "vhs_studio.cli.main",
            "restore",
            self.raw_file,
            "--output",
            self.output_path,
        ]

        if self.params.get("denoise"):
            cmd.append("--denoise")
        if self.params.get("chroma_fix"):
            cmd.append("--chroma-fix")
        if self.params.get("comb_filter"):
            cmd.append("--comb-filter")
        if self.params.get("overscan_blanking"):
            cmd.append("--overscan-blanking")
        if self.params.get("audio_treatment"):
            cmd.append("--audio-treatment")
        if self.params.get("dropout_clean"):
            cmd.append("--dropout-clean")
        if self.params.get("ai_audio_denoise"):
            cmd.append("--ai-audio-denoise")

        if self.params.get("deinterlacer"):
            cmd.extend(["--deinterlacer", str(self.params["deinterlacer"])])
        if self.params.get("audio_mode"):
            cmd.extend(["--audio-mode", str(self.params["audio_mode"])])
        if self.params.get("mode"):
            cmd.extend(["--mode", str(self.params["mode"])])
        if self.params.get("crf"):
            cmd.extend(["--crf", str(self.params["crf"])])
        if self.params.get("output_codec"):
            cmd.extend(["--output-codec", str(self.params["output_codec"])])
        if self.params.get("no_1080p"):
            cmd.append("--no-1080p")

        subprocess.run(cmd, check=True)
        return self.output_path

    def _task_whisper(self):
        """Transcribe speech track to WebVTT format using Whisper."""
        try:
            from vhs_studio.ai.whisper_engine import transcribe_and_generate_vtt

            base_dir = os.path.dirname(self.output_path)
            os.makedirs(base_dir, exist_ok=True)
            vtt = transcribe_and_generate_vtt(self.raw_file, model_size="tiny")

            vtt_name = os.path.basename(vtt)
            new_vtt = os.path.join(base_dir, vtt_name)
            if vtt != new_vtt and os.path.exists(vtt):
                import shutil

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

    def _task_scenedetect_and_split(self):
        """Segment video into chapters based on camera scene cut transitions."""
        master_file = self.results.get("Restoration")
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

        for i, scene in enumerate(scene_list, 1):
            start_time = scene[0].get_timecode()
            end_time = scene[1].get_timecode()

            out_clip = os.path.join(base_dir, f"{base_name}_Scene_{i:03d}{ext}")
            cmd = [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-i",
                master_file,
                "-ss",
                start_time,
                "-to",
                end_time,
                "-c",
                "copy",
                out_clip,
            ]
            subprocess.run(cmd)
            log.info(f"  -> Generated: Scene_{i:03d}{ext} ({start_time} to {end_time})")


def main(unknown_args):
    """CLI entrypoint for orchestrated pipeline execution."""
    parser = argparse.ArgumentParser(description="VHS Studio Pipeline Orchestrator")
    parser.add_argument("input", help="Path to raw captured file")
    parser.add_argument(
        "--params-json", required=True, help="Serialized parameters JSON"
    )
    args, _ = parser.parse_known_args(unknown_args)

    params = json.loads(args.params_json)

    from vhs_studio.core.paths import RESTORED_MEDIA_DIR

    base_name = os.path.splitext(os.path.basename(args.input))[0]

    output_dir = os.path.join(RESTORED_MEDIA_DIR, base_name)
    os.makedirs(output_dir, exist_ok=True)

    suffix = "1080p" if not params.get("no_1080p") else "480p"
    codec = params.get("output_codec", "h264")
    ext = "mkv" if codec == "ffv1" else "mov" if codec == "prores" else "mp4"
    output_path = os.path.join(output_dir, f"{base_name}_restored_{suffix}.{ext}")

    orch = PipelineOrchestrator(args.input, output_path, args, params)
    orch.start()
