import time
import os
from vhs_studio.core.logger import log
from vhs_studio.core.queue_manager import get_next_job, complete_job, fail_job
from vhs_studio.video.chapter_marker import generate_chapters
from vhs_studio.storage.manager import StorageManager
from vhs_studio.config.storage_config import load_storage_config

# Aqui importaríamos a restauração do VapourSynth.
# Para evitar erros se o VS não estiver instalado nativamente, colocaremos como um step isolado no pipeline
# from vhs_studio.video.vapoursynth_qtgmc import run_restoration 

def process_job(job: dict):
    raw_path = job["raw_path"]
    job_id = job["id"]
    
    if not os.path.exists(raw_path):
        fail_job(job_id, f"Arquivo não encontrado: {raw_path}")
        return
        
    log.info(f"========== INICIANDO PIPELINE (Job #{job_id}) ==========")
    log.info(f"Fita original: {raw_path}")
    
    base_dir = os.path.dirname(raw_path)
    base_name = os.path.splitext(os.path.basename(raw_path))[0]
    
    # --- PASSO 1: RESTAURAÇÃO (VAPOURSYNTH) ---
    # Nota: Em um ambiente real de estúdio, QTGMC demoraria 2x a duração do vídeo.
    # Vamos considerar que o arquivo 'restored' passará direto para o passo 2 se a flag de pular não for definida.
    # restored_path = os.path.join(base_dir, f"{base_name}_restored.mkv")
    # run_restoration(raw_path, restored_path)
    
    # Simulando output do VapourSynth (utilizando o Raw diretamente por agora para o pipeline continuar intacto)
    restored_path = raw_path  
    
    # --- PASSO 2: MARCAÇÃO DE CAPÍTULOS (SCENEDETECT + FFMPEG) ---
    final_output_path = os.path.join(base_dir, f"{base_name}_final.mkv")
    success = generate_chapters(restored_path, final_output_path)
    
    if not success:
        log.warning("[Pipeline] Marcação de capítulos falhou. Usando arquivo original para upload.")
        final_output_path = restored_path
        
    # --- PASSO 3: UPLOAD PARA NUVEM ---
    config = load_storage_config()
    provider_id = config.get("provider", "local_nas_usb")
    
    # Se o provider for local_nas_usb, a pasta final já deve ser a "destination".
    # StorageManager cuida do upload transparente para S3, Google, Dropbox, OneDrive.
    if provider_id != "local_nas_usb":
        log.info(f"[Pipeline] Iniciando sincronização com {provider_id}...")
        try:
            url = StorageManager.upload_file(provider_id, final_output_path)
            log.info(f"[Pipeline] Upload concluído! URL: {url}")
        except Exception as e:
            log.error(f"[Pipeline] Erro fatal no upload: {e}")
            fail_job(job_id, f"Falha no upload: {e}")
            return
            
    complete_job(job_id)
    log.info(f"========== FIM DO PIPELINE (Job #{job_id}) ==========\n")


def pipeline_loop():
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