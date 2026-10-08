"""Module documentation pending."""
import time
import os
from vhs_studio.core.logger import log
from vhs_studio.core.queue_manager import get_next_job, complete_job, fail_job
from vhs_studio.video.chapter_marker import generate_chapters
from vhs_studio.storage.manager import StorageManager
from vhs_studio.config.storage_config import load_storage_config


def process_job(job: dict):
    """Documentation for process_job."""
    raw_path = job["raw_path"]
    job_id = job["id"]

    if not os.path.exists(raw_path):
        fail_job(job_id, f"Arquivo não encontrado: {raw_path}")
        return

    log.info(f"========== INICIANDO PIPELINE (Job #{job_id}) ==========")
    log.info(f"Fita original: {raw_path}")

    base_dir = os.path.dirname(raw_path)
    base_name = os.path.splitext(os.path.basename(raw_path))[0]

    restored_path = raw_path

    final_output_path = os.path.join(base_dir, f"{base_name}_final.mkv")
    success = generate_chapters(restored_path, final_output_path)

    if not success:
        log.warning("[Pipeline] Marcação de capítulos falhou. Usando arquivo original para upload.")
        final_output_path = restored_path

    config = load_storage_config()
    provider_id = config.get("provider", "local_nas_usb")

    if provider_id != "local_nas_usb":
        log.info(f"[Pipeline] Iniciando sincronização com {provider_id}...")
        try:
            provider = StorageManager.get_provider(provider_id)
            if provider:
                url = provider.upload_video(final_output_path, os.path.basename(final_output_path))
                log.info(f"[Pipeline] Upload concluído! URL: {url}")
            else:
                log.error(f"[Pipeline] Provedor {provider_id} não encontrado.")
        except Exception as e:
            log.error(f"[Pipeline] Erro fatal no upload: {e}")
            fail_job(job_id, f"Falha no upload: {e}")
            return

    complete_job(job_id)
    log.info(f"========== FIM DO PIPELINE (Job #{job_id}) ==========\n")


def pipeline_loop():
    """Documentation for pipeline_loop."""
    log.info("[Pipeline Daemon] Iniciando monitoramento da fila de gravação...")
    while True:
        try:
            job = get_next_job()
            if job:
                process_job(job)
            else:
                time.sleep(5)
        except KeyboardInterrupt:
            log.info("[Pipeline Daemon] Loop encerrado pelo usuário.")
            break
        except Exception as e:
            log.error(f"[Pipeline Daemon] Erro inesperado no loop: {e}")
            time.sleep(10)


if __name__ == "__main__":
    pipeline_loop()
