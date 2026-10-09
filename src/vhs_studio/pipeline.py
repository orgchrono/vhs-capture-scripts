"""Orquestrador principal de pipeline de processamento e restauração."""

import os
import sys
import subprocess
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from vhs_studio.core.logger import log
import json


class PipelineOrchestrator:
    """Gerencia a execução paralela (DAG) das tarefas de restauração, IA e empacotamento."""

    def __init__(self, raw_file, output_path, opts=None, params=None):
        self.raw_file = os.path.abspath(raw_file)
        self.output_path = os.path.abspath(output_path)
        self.opts = opts or {}
        self.params = params or {}
        self.executor = ThreadPoolExecutor(max_workers=3)
        self.results = {}

    def start(self):
        """Inicia a DAG de tarefas concorrentes."""
        log.info("============================================================")
        log.info("[PIPELINE ORQUESTRADA] Iniciando Múltiplos Motores (DAG)")
        log.info(f"  Fonte: {self.raw_file}")

        esrgan_enabled = False
        if isinstance(self.opts, dict):
            esrgan_enabled = self.opts.get("esrgan", False)
        elif hasattr(self.opts, "esrgan"):
            esrgan_enabled = getattr(self.opts, "esrgan", False)
        if not esrgan_enabled and isinstance(self.params, dict):
            esrgan_enabled = self.params.get("esrgan", False)

        f_restoration = self.executor.submit(self._task_restoration)
        f_whisper = self.executor.submit(self._task_whisper)
        f_esrgan = self.executor.submit(self._task_esrgan) if esrgan_enabled else None

        futures = {f_restoration: "Restoration", f_whisper: "Whisper"}
        if f_esrgan:
            futures[f_esrgan] = "ESRGAN"

        for future in as_completed(futures):
            task_name = futures[future]
            try:
                self.results[task_name] = future.result()
                log.info(f"[{task_name.upper()}] Concluído.")
            except Exception as exc:
                log.error(f"[{task_name.upper()} ERRO] Falha na tarefa: {exc}")

        self._task_scenedetect_and_split()
        log.info("[PIPELINE ORQUESTRADA] Sucesso Absoluto!")

        # FASE 4.3 - Cloud Upload
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
                    log.info(f"[CLOUD UPLOAD] Fazendo upload para {provider_id}...")
                    provider.upload_video(
                        self.output_path, os.path.basename(self.output_path)
                    )
                else:
                    log.warning(
                        f"[CLOUD UPLOAD] Provedor '{provider_id}' não configurado ou indisponível."
                    )
            except Exception as e:
                log.error(f"[CLOUD UPLOAD ERRO] Falha no upload para nuvem: {e}")

    def _task_esrgan(self):
        """Executa upscale de IA via Real-ESRGAN."""
        log.info("[ESRGAN] Iniciando AI Upscaling via ai_upscaler...")
        from vhs_studio.video.ai_upscaler import AIUpscaler

        upscaler = AIUpscaler(model_name="realesrgan-x4plus", gpu_id="auto")
        log.info(
            f"[ESRGAN] Processando com modelo {upscaler.model_name} usando GPU {upscaler.gpu_id}"
        )
        if upscaler.ncnn_path and os.path.exists(self.output_path):
            base_dir, filename = os.path.split(self.output_path)
            name, ext = os.path.splitext(filename)
            upscaled_path = os.path.join(base_dir, f"{name}_esrgan{ext}")
            upscaler.process_video(self.output_path, upscaled_path)
            return upscaled_path
        return True

    def _task_restoration(self):
        """Dispara a rotina de restauração base (CLI de direct_restore)."""
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
        """Transcreve o áudio gerando arquivo VTT via Whisper."""
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
            log.warning("[WHISPER] faster-whisper não está instalado. Pulei.")
            return None
        except Exception as e:
            log.warning(f"[WHISPER ERRO] {e}")
            return None

    def _task_scenedetect_and_split(self):
        """Segmenta a fita em cenas usando PySceneDetect."""
        master_file = self.results.get("Restoration")
        if not master_file or not os.path.exists(master_file):
            return

        try:
            from scenedetect import detect, ContentDetector
        except ImportError:
            log.warning(
                "[SCENE DETECT] scenedetect não está instalado. Pulei os cortes mágicos."
            )
            return

        log.info(
            "[SCENE DETECT] Procurando cortes secos (Flash/Camera Cuts) no Vídeo Master..."
        )
        scene_list = detect(master_file, ContentDetector(threshold=27.0))

        if len(scene_list) <= 1:
            log.info(
                "[SCENE DETECT] Nenhum corte abrupto detectado. Arquivo mantido íntegro."
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
            log.info(f"  -> Gerado: Cena_{i:03d}{ext} ({start_time} até {end_time})")


def main(unknown_args):
    """Entrypoint CLI para a pipeline orquestrada."""
    parser = argparse.ArgumentParser()
    parser.add_argument("input", help="Arquivo raw")
    parser.add_argument("--params-json", required=True, help="JSON de parametros")
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
