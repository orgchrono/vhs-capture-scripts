"""Module documentation pending."""

import os
import sys
import subprocess
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from vhs_studio.core.logger import log
import json


class PipelineOrchestrator:
    """Documentation for PipelineOrchestrator."""

    def __init__(self, raw_file, output_path, opts, params):
        """Documentation for __init__."""
        self.raw_file = os.path.abspath(raw_file)
        self.output_path = os.path.abspath(output_path)
        self.opts = opts
        self.params = params
        self.executor = ThreadPoolExecutor(max_workers=3)
        self.results = {}

    def start(self):
        """Documentation for start."""
        log.info("============================================================")
        log.info("[PIPELINE ORQUESTRADA] Iniciando M????ltiplos Motores (DAG)")
        log.info(f"  Fonte: {self.raw_file}")

        f_restoration = self.executor.submit(self._task_restoration)
        f_whisper = self.executor.submit(self._task_whisper)

        futures = {f_restoration: "Restoration", f_whisper: "Whisper"}

        for future in as_completed(futures):
            task_name = futures[future]
            try:
                self.results[task_name] = future.result()
                log.info(f"[{task_name.upper()}] Conclu????do.")
            except Exception as exc:
                log.error(f"[{task_name.upper()} ERRO] Falha na tarefa: {exc}")

        self._task_scenedetect_and_split()
        log.info("[PIPELINE ORQUESTRADA] Sucesso Absoluto!")

        # FASE 4.3 - Cloud Upload
        if self.params.get("auto_upload"):
            from vhs_studio.cloud.drive_uploader import upload_project_folder

            upload_project_folder(os.path.dirname(self.output_path))

    def _task_restoration(self):
        """Documentation for _task_restoration."""
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

        if self.params.get("deinterlacer"):
            cmd.extend(["--opts.deinterlacer", self.params["deinterlacer"]])
        if self.params.get("audio_mode"):
            cmd.extend(["--audio-opts.mode", self.params["audio_mode"]])
        if self.params.get("output_codec"):
            cmd.extend(["--output-codec", self.params["output_codec"]])

        subprocess.run(cmd, check=True)
        return self.output_path

    def _task_whisper(self):
        """Documentation for _task_whisper."""
        try:
            from vhs_studio.ai.whisper_engine import transcribe_and_generate_vtt

            base_dir = os.path.dirname(self.output_path)
            os.makedirs(base_dir, exist_ok=True)
            # Patching transcribe_and_generate_vtt to accept target_dir if we can, or just move it.
            vtt = transcribe_and_generate_vtt(self.raw_file, model_size="tiny")

            # Move vtt to output_path directory
            vtt_name = os.path.basename(vtt)
            new_vtt = os.path.join(base_dir, vtt_name)
            if vtt != new_vtt:
                import shutil

                shutil.move(vtt, new_vtt)
            return new_vtt
        except ImportError:
            log.warning("[WHISPER] faster-whisper n????o est???? instalado. Pulei.")
            return None
        except Exception as e:
            log.warning(f"[WHISPER ERRO] {e}")
            return None

    def _task_scenedetect_and_split(self):
        """Documentation for _task_scenedetect_and_split."""
        master_file = self.results.get("Restoration")
        if not master_file or not os.path.exists(master_file):
            return

        try:
            from scenedetect import detect, ContentDetector
        except ImportError:
            log.warning(
                "[SCENE DETECT] scenedetect n????o est???? instalado. Pulei os cortes m????gicos."
            )
            return

        log.info(
            "[SCENE DETECT] Procurando cortes secos (Flash/Camera Cuts) no V????deo Master..."
        )
        scene_list = detect(master_file, ContentDetector(threshold=27.0))

        if len(scene_list) <= 1:
            log.info(
                "[SCENE DETECT] Nenhum corte abrupto detectado. Arquivo mantido ????ntegro."
            )
            return

        log.info(
            f"[SCENE DETECT] {len(scene_list)} Cenas Detectadas! Fatiando arquivo mestre..."
        )

        base_dir = os.path.dirname(master_file)
        base_name, ext = os.path.splitext(os.path.basename(master_file))

        for i, scene in enumerate(scene_list, 1):
            start_time = scene[0].get_timecode()
            end_time = scene[1].get_timecode()

            out_clip = os.path.join(base_dir, f"{base_name}_Cena_{i:03d}{ext}")
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
            log.info(f"  -> Gerado: Cena_{i:03d}{ext} ({start_time} at???? {end_time})")


def main(unknown_args):
    """Documentation for main."""
    parser = argparse.ArgumentParser()
    parser.add_argument("input", help="Arquivo raw")
    parser.add_argument("--params-json", required=True, help="JSON de parametros")
    args, _ = parser.parse_known_args(unknown_args)

    params = json.loads(args.params_json)

    from vhs_studio.core.paths import RESTORED_MEDIA_DIR

    base_name = os.path.splitext(os.path.basename(args.input))[0]

    # Criar pasta pro projeto!
    output_dir = os.path.join(RESTORED_MEDIA_DIR, base_name)
    os.makedirs(output_dir, exist_ok=True)

    suffix = "1080p" if not params.get("no_1080p") else "480p"
    codec = params.get("output_codec", "h264")
    ext = "mkv" if codec == "ffv1" else "mov" if codec == "prores" else "mp4"
    output_path = os.path.join(output_dir, f"{base_name}_restored_{suffix}.{ext}")

    orch = PipelineOrchestrator(args.input, output_path, args, params)
    orch.start()
