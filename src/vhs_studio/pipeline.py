"""Main processing and restoration pipeline orchestrator (Imperative Shell).

Coordinates DAG-based execution of modular restoration, neural enhancement,
transcription, and packaging steps using lexical closures (FP Core / Imperative Shell)
while synchronizing per-tool records into the museum archival defect report.
"""

import argparse
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Dict, List, Mapping, Optional, Tuple

from vhs_studio.capture.qc import make_archival_report_session
from vhs_studio.core.logger import log
from vhs_studio.pipeline_planner import resolve_output_spec
from vhs_studio.pipeline_steps import (
    AIUpscalerStep,
    BaseRestorationStep,
    CloudOffloadStep,
    FaceRestorationStep,
    RifeInterpolationStep,
    SceneSegmentationStep,
    WhisperStep,
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


def make_pipeline_chain_closure(
    initial_video: str,
    master_output_path: str,
    report_session: Optional[Mapping[str, Callable[..., Any]]] = None,
) -> Dict[str, Callable[..., Any]]:
    """Create a lexical closure encapsulating sequential neural stage chaining and tool reporting."""
    state: Dict[str, Any] = {
        "current_video": initial_video,
        "intermediate_files": [],
        "post_results": {},
    }

    def execute_stage(
        step_name: str,
        tool_id: str,
        enabled: bool,
        step_fn: Callable[..., Optional[str]],
    ) -> Optional[str]:
        if not enabled:
            if report_session:
                report_session["record_tool_execution"](tool_id, enabled=False, status="skipped")
            return None

        cur_vid = state["current_video"]
        try:
            try:
                step_out = step_fn(cur_vid)
            except TypeError:
                step_out = step_fn()

            if step_out:
                log.info(f"[{step_name.upper()}] Step completed successfully: {step_out}")
                if cur_vid and cur_vid != master_output_path and cur_vid != step_out:
                    state["intermediate_files"].append(cur_vid)
                state["current_video"] = step_out
                state["post_results"][step_name] = step_out
                if report_session:
                    report_session["record_tool_execution"](
                        tool_id,
                        enabled=True,
                        status="applied",
                        parameters={"input_video": cur_vid, "output_video": step_out},
                    )
                    try:
                        report_session["sync_to_disk"](status="in_progress")
                    except Exception:
                        pass
                return step_out

            log.warning(
                f"[{step_name.upper()} WARNING] Step returned no output; "
                f"degrading gracefully with previous video: {cur_vid}"
            )
            state["post_results"][step_name] = None
            if report_session:
                report_session["record_tool_execution"](
                    tool_id,
                    enabled=True,
                    status="degraded_fallback",
                )
            return None
        except Exception as exc:
            log.warning(
                f"[{step_name.upper()} WARNING] Step failed ({exc}); "
                f"degrading gracefully with previous video: {cur_vid}"
            )
            state["post_results"][step_name] = None
            if report_session:
                report_session["record_tool_execution"](
                    tool_id,
                    enabled=True,
                    status="degraded_fallback",
                    parameters={"error": str(exc)},
                )
            return None

    def commit_master() -> str:
        cur_vid = str(state["current_video"] or master_output_path)
        final_master = cur_vid
        if (
            cur_vid
            and cur_vid != master_output_path
            and os.path.exists(cur_vid)
            and os.path.getsize(cur_vid) > 0
        ):
            try:
                os.replace(cur_vid, master_output_path)
                final_master = master_output_path
                log.info(f"[PIPELINE ORCHESTRATOR] Committed chained master video to: {master_output_path}")
                for inter_file in state["intermediate_files"]:
                    if os.path.exists(inter_file) and inter_file != master_output_path:
                        try:
                            os.remove(inter_file)
                        except OSError:
                            pass
            except OSError as exc:
                log.warning(
                    f"[PIPELINE ORCHESTRATOR] Could not replace master output ({exc}); keeping {cur_vid}"
                )
                final_master = cur_vid
        state["current_video"] = final_master
        return final_master

    def get_post_results() -> Dict[str, Optional[str]]:
        return dict(state["post_results"])

    return {
        "execute_stage": execute_stage,
        "commit_master": commit_master,
        "get_post_results": get_post_results,
    }


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

    def _init_report_session(self) -> Dict[str, Callable[..., Any]]:
        """Load or initialize the closure-backed archival report session for this pipeline."""
        report_json_path = f"{self.output_path}_qc_report.json"
        existing_report = None
        if os.path.exists(report_json_path):
            try:
                with open(report_json_path, "r", encoding="utf-8") as f:
                    existing_report = json.load(f)
            except Exception:
                existing_report = None
        return make_archival_report_session(
            source_path=self.raw_file,
            output_path=self.output_path,
            initial_report=existing_report,
            pipeline_params=self.params,
        )

    def start(self) -> Dict[str, Optional[str]]:
        """Execute the DAG of concurrent restoration and AI enhancement tasks."""
        log.info("============================================================")
        log.info("[PIPELINE ORCHESTRATOR] Starting Multi-Engine DAG Processing")
        log.info(f"  Source: {self.raw_file}")
        log.info(f"  Destination: {self.output_path}")

        f_restoration = self.executor.submit(self._task_restoration)
        f_whisper = self.executor.submit(self._task_whisper)

        try:
            restoration_result: Optional[str] = f_restoration.result()
            log.info("[RESTORATION] Base restoration finished successfully.")
        except Exception as exc:
            log.error(f"[RESTORATION ERROR] Primary restoration failed: {exc}")
            self.executor.shutdown(wait=False, cancel_futures=True)
            raise exc

        report_session = self._init_report_session()
        chain = make_pipeline_chain_closure(
            initial_video=restoration_result or self.output_path,
            master_output_path=self.output_path,
            report_session=report_session,
        )

        post_step_specs: Tuple[Tuple[str, str, bool, Callable[..., Optional[str]]], ...] = (
            (
                "FaceRestoration",
                "ai_face_restoration",
                bool(self.params.get("ai_face_restore")),
                self._task_face_restore,
            ),
            (
                "RIFE",
                "ai_rife_interpolation",
                bool(self.params.get("ai_rife_60fps")),
                self._task_rife,
            ),
            (
                "Upscaler",
                "ai_super_resolution",
                self._is_upscaler_enabled(),
                self._task_upscaler,
            ),
        )

        for step_name, tool_id, enabled, step_fn in post_step_specs:
            chain["execute_stage"](step_name, tool_id, enabled, step_fn)

        final_master: str = chain["commit_master"]()
        post_results: Dict[str, Optional[str]] = chain["get_post_results"]()

        try:
            whisper_result = f_whisper.result()
            log.info("[WHISPER] Audio transcription completed.")
            report_session["record_tool_execution"](
                "ai_whisper_transcription",
                enabled=True,
                status="applied" if whisper_result else "skipped",
                parameters={"vtt_file": whisper_result or ""},
            )
        except Exception as exc:
            log.warning(f"[WHISPER WARNING] Audio transcription failed: {exc}")
            whisper_result = None
            report_session["record_tool_execution"](
                "ai_whisper_transcription",
                enabled=True,
                status="degraded_fallback",
            )
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
            report_session["record_tool_execution"](
                "scene_segmentation",
                enabled=True,
                status="applied",
            )
        except TypeError:
            self._task_scenedetect_and_split()
            report_session["record_tool_execution"](
                "scene_segmentation",
                enabled=True,
                status="applied",
            )

        try:
            report_session["sync_to_disk"](status="completed")
        except Exception:
            pass

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
        return WhisperStep.execute(
            self.raw_file,
            self.output_path,
            model_size=str(self.params.get("whisper_model", "tiny")),
            language=str(self.params.get("language", "pt")),
        )

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


def main(unknown_args: List[str]) -> None:
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
