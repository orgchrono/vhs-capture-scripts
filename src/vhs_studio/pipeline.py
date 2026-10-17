"""Main processing and restoration pipeline orchestrator (Imperative Shell).

Coordinates DAG-based parallel execution of modular restoration, neural enhancement,
transcription, and packaging steps (SoC, SRP, MVVM & FP Core / Imperative Shell).
"""

import os
import sys
import argparse
import json
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Dict, Mapping, Callable, Tuple

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


def make_step_runner(step_name: str, fn: Callable[[], Optional[str]]) -> Callable[[], Optional[str]]:
    """Closure capturing pipeline step execution with uniform logging and error boundaries."""
    def run() -> Optional[str]:
        try:
            res = fn()
            log.info(f"[{step_name.upper()}] Step completed successfully.")
            return res
        except Exception as exc:
            log.error(f"[{step_name.upper()} ERROR] Step failed: {exc}")
            return None
    return run


class PipelineOrchestrator:
    """Imperative Shell coordinating multi-stage restoration and enhancement DAG."""

    def __init__(
        self,
        raw_file: str,
        output_path: str,
        opts: Optional[object] = None,
        params: Optional[Mapping[str, object]] = None,
    ):
        self.raw_file = os.path.abspath(raw_file)
        self.output_path = os.path.abspath(output_path)
        self.opts = opts if opts is not None else {}
        self.params = params if params is not None else {}
        self.executor = ThreadPoolExecutor(max_workers=3)
        self.results: Dict[str, Optional[str]] = {}

    def _is_upscaler_enabled(self) -> bool:
        """Helper to determine whether AI upscaling is requested."""
        if isinstance(self.opts, dict):
            if self.opts.get("esrgan") or self.opts.get("ai_upscaler"):
                return True
        elif hasattr(self.opts, "esrgan"):
            if getattr(self.opts, "esrgan", False) or getattr(self.opts, "ai_upscaler", False):
                return True
        if isinstance(self.params, (dict, Mapping)):
            return bool(self.params.get("esrgan") or self.params.get("ai_upscaler"))
        return False

    def start(self) -> Dict[str, Optional[str]]:
        """Execute the DAG of concurrent restoration and AI enhancement tasks."""
        log.info("============================================================")
        log.info("[PIPELINE ORCHESTRATOR] Starting Multi-Engine DAG Processing")
        log.info(f"  Source: {self.raw_file}")
        log.info(f"  Destination: {self.output_path}")

        # Dispatch primary restoration and audio transcription concurrently
        f_restoration = self.executor.submit(self._task_restoration)
        f_whisper = self.executor.submit(self._task_whisper)

        # Primary restoration must succeed before post-processing video enhancements
        try:
            restoration_result: Optional[str] = f_restoration.result()
            log.info("[RESTORATION] Base restoration finished successfully.")
        except Exception as exc:
            log.error(f"[RESTORATION ERROR] Primary restoration failed: {exc}")
            self.executor.shutdown(wait=False, cancel_futures=True)
            raise exc

        # Sequential Pipelined Chain for post-restoration neural stages:
        # BaseOutput -> FaceRestoration(current_video) -> RIFE(current_video) -> Upscaler(current_video)
        current_video: Optional[str] = restoration_result or self.output_path
        intermediate_files: list[str] = []

        post_step_specs: Tuple[Tuple[str, bool, Callable[..., Optional[str]]], ...] = (
            ("FaceRestoration", bool(self.params.get("ai_face_restore")), self._task_face_restore),
            ("RIFE", bool(self.params.get("ai_rife_60fps")), self._task_rife),
            ("Upscaler", self._is_upscaler_enabled(), self._task_upscaler),
        )

        post_results: Dict[str, Optional[str]] = {}
        for step_name, enabled, step_fn in post_step_specs:
            if not enabled:
                continue
            try:
                try:
                    step_out = step_fn(current_video)
                except TypeError:
                    step_out = step_fn()
                if step_out:
                    log.info(f"[{step_name.upper()}] Step completed successfully: {step_out}")
                    if (
                        current_video
                        and current_video != self.output_path
                        and current_video != step_out
                    ):
                        intermediate_files.append(current_video)
                    current_video = step_out
                    post_results[step_name] = step_out
                else:
                    log.warning(
                        f"[{step_name.upper()} WARNING] Step returned no output; "
                        f"degrading gracefully with previous video: {current_video}"
                    )
                    post_results[step_name] = None
            except Exception as exc:
                log.warning(
                    f"[{step_name.upper()} WARNING] Step failed ({exc}); "
                    f"degrading gracefully with previous video: {current_video}"
                )
                post_results[step_name] = None

        # Atomic commit of the final chained video to self.output_path when file exists on disk
        final_master: Optional[str] = current_video
        if (
            current_video
            and current_video != self.output_path
            and os.path.exists(current_video)
            and os.path.getsize(current_video) > 0
        ):
            try:
                os.replace(current_video, self.output_path)
                final_master = self.output_path
                log.info(f"[PIPELINE ORCHESTRATOR] Committed chained master video to: {self.output_path}")
                for inter_file in intermediate_files:
                    if os.path.exists(inter_file) and inter_file != self.output_path:
                        try:
                            os.remove(inter_file)
                        except OSError:
                            pass
            except OSError as exc:
                log.warning(
                    f"[PIPELINE ORCHESTRATOR] Could not replace master output ({exc}); keeping {current_video}"
                )
                final_master = current_video

        try:
            whisper_result = f_whisper.result()
            log.info("[WHISPER] Audio transcription completed.")
        except Exception as exc:
            log.warning(f"[WHISPER WARNING] Audio transcription failed: {exc}")
            whisper_result = None
        finally:
            self.executor.shutdown(wait=False)

        self.results = {
            "Restoration": final_master or restoration_result,
            "Master": final_master,
            "Whisper": whisper_result,
            **post_results,
        }

        try:
            self._task_scenedetect_and_split(final_master)
        except TypeError:
            self._task_scenedetect_and_split()
        log.info("[PIPELINE ORCHESTRATOR] All pipeline stages finished successfully.")

        CloudOffloadStep.execute(final_master or self.output_path, self.params)

        return self.results

    def _task_restoration(self) -> str:
        """Delegate primary restoration execution."""
        return BaseRestorationStep.execute(
            self.raw_file, self.output_path, self.params, sys.executable
        )

    def _task_whisper(self) -> Optional[str]:
        """Delegate whisper transcription step."""
        return WhisperStep.execute(self.raw_file, self.output_path)

    def _task_face_restore(self, input_video: Optional[str] = None) -> Optional[str]:
        """Delegate CodeFormer face restoration step."""
        return FaceRestorationStep.execute(input_video or self.output_path, self.params)

    def _task_rife(self, input_video: Optional[str] = None) -> Optional[str]:
        """Delegate RIFE motion interpolation step."""
        return RifeInterpolationStep.execute(input_video or self.output_path)

    def _task_upscaler(self, input_video: Optional[str] = None) -> Optional[str]:
        """Delegate super-resolution step."""
        return AIUpscalerStep.execute(input_video or self.output_path, self.params)

    def _task_esrgan(self, input_video: Optional[str] = None) -> Optional[str]:
        """Backwards compatibility alias for _task_upscaler."""
        return self._task_upscaler(input_video)

    def _task_scenedetect_and_split(self, master_file: Optional[str] = None) -> None:
        """Delegate scene segmentation step."""
        target = master_file or self.results.get("Master") or self.results.get("Restoration")
        if target and os.path.exists(target):
            SceneSegmentationStep.execute(target)


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
    try:
        os.makedirs(output_dir, exist_ok=True)
        test_file = os.path.join(output_dir, ".write_test")
        with open(test_file, "w") as f:
            f.write("ok")
        os.remove(test_file)
    except PermissionError:
        log.error(
            f"[WINDOWS DEFENDER / PERMISSÃO] Acesso de escrita negado no diretório: {output_dir}\n"
            "O recurso 'Acesso a Pastas Controladas' do Windows Defender bloqueou a gravação.\n"
            "Solução: Permita o processo nas exceções do Defender ou use outro diretório."
        )
        sys.exit(1)

    output_path, _ = resolve_output_spec(args.input, output_dir, params)

    from vhs_studio.core.jobs import JobManager

    try:
        orch = PipelineOrchestrator(args.input, output_path, args, params)
        orch.start()
    finally:
        JobManager.release_lock()
