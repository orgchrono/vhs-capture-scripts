"""Main processing and restoration pipeline orchestrator (Imperative Shell).

Coordinates DAG-based parallel execution of modular restoration, neural enhancement,
transcription, and packaging steps (SoC, SRP, MVVM & FP Core / Imperative Shell).
"""

import os
import sys
import argparse
import json
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Dict, Any

from vhs_studio.core.logger import log
from vhs_studio.pipeline_planner import resolve_output_spec
from vhs_studio.pipeline_steps import (
    BaseRestorationStep,
    WhisperStep,
    FaceRestorationStep,
    RifeInterpolationStep,
    AIUpscalerStep,
    SceneSegmentationStep,
    CloudOffloadStep,
)


class PipelineOrchestrator:
    """Imperative Shell coordinating multi-stage restoration and enhancement DAG."""

    def __init__(
        self,
        raw_file: str,
        output_path: str,
        opts: Optional[Any] = None,
        params: Optional[Dict[str, Any]] = None,
    ):
        self.raw_file = os.path.abspath(raw_file)
        self.output_path = os.path.abspath(output_path)
        self.opts = opts or {}
        self.params = params or {}
        self.executor = ThreadPoolExecutor(max_workers=3)
        self.results: Dict[str, Any] = {}

    def _is_upscaler_enabled(self) -> bool:
        """Helper to determine whether AI upscaling is requested."""
        if isinstance(self.opts, dict):
            if self.opts.get("esrgan") or self.opts.get("ai_upscaler"):
                return True
        elif hasattr(self.opts, "esrgan"):
            if getattr(self.opts, "esrgan", False) or getattr(self.opts, "ai_upscaler", False):
                return True
        if isinstance(self.params, dict):
            return bool(self.params.get("esrgan") or self.params.get("ai_upscaler"))
        return False

    def start(self) -> Dict[str, Any]:
        """Execute the DAG of concurrent restoration and AI enhancement tasks."""
        log.info("============================================================")
        log.info("[PIPELINE ORCHESTRATOR] Starting Multi-Engine DAG Processing")
        log.info(f"  Source: {self.raw_file}")
        log.info(f"  Destination: {self.output_path}")

        # Dispatch primary restoration and audio transcription in parallel
        f_restoration = self.executor.submit(self._task_restoration)
        f_whisper = self.executor.submit(self._task_whisper)

        # Wait for base restoration to complete before post-processing video enhancements
        try:
            self.results["Restoration"] = f_restoration.result()
            log.info("[RESTORATION] Base restoration finished successfully.")
        except Exception as exc:
            log.error(f"[RESTORATION ERROR] Primary restoration failed: {exc}")
            raise exc

        # Sequential post-restoration neural pipelines
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

        if self._is_upscaler_enabled():
            try:
                self.results["Upscaler"] = self._task_upscaler()
            except Exception as exc:
                log.error(f"[UPSCALER ERROR] {exc}")

        try:
            self.results["Whisper"] = f_whisper.result()
            log.info("[WHISPER] Audio transcription completed.")
        except Exception as exc:
            log.warning(f"[WHISPER WARNING] Audio transcription failed: {exc}")

        # Scene cut segmentation
        self._task_scenedetect_and_split()
        log.info("[PIPELINE ORCHESTRATOR] All pipeline stages finished successfully.")

        # Optional cloud synchronization
        CloudOffloadStep.execute(self.output_path, self.params)

        return self.results

    def _task_restoration(self) -> str:
        """Delegate primary restoration execution."""
        return BaseRestorationStep.execute(
            self.raw_file, self.output_path, self.params, sys.executable
        )

    def _task_whisper(self) -> Optional[str]:
        """Delegate whisper transcription step."""
        return WhisperStep.execute(self.raw_file, self.output_path)

    def _task_face_restore(self) -> Optional[str]:
        """Delegate CodeFormer face restoration step."""
        return FaceRestorationStep.execute(self.output_path, self.params)

    def _task_rife(self) -> Optional[str]:
        """Delegate RIFE motion interpolation step."""
        return RifeInterpolationStep.execute(self.output_path)

    def _task_upscaler(self) -> Optional[str]:
        """Delegate super-resolution step."""
        return AIUpscalerStep.execute(self.output_path, self.params)

    def _task_esrgan(self) -> Optional[str]:
        """Backwards compatibility alias for _task_upscaler."""
        return self._task_upscaler()

    def _task_scenedetect_and_split(self) -> None:
        """Delegate scene segmentation step."""
        SceneSegmentationStep.execute(self.results.get("Restoration"))


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

    output_path, _ = resolve_output_spec(args.input, output_dir, params)

    orch = PipelineOrchestrator(args.input, output_path, args, params)
    orch.start()
