import os
import subprocess
import csv
from vhs_studio.core.logger import log
from vhs_studio.config.advanced import AdvancedConfig

def generate_chapters(input_video: str, output_video: str) -> bool:
    """
    Roda o PySceneDetect para encontrar cenas no vídeo (sem cortar), 
    gera um arquivo de metadados FFmpeg e embute as marcações de Capítulo
    nativamente no arquivo MKV/MP4 sem re-encode (-c copy).
    """
    threshold = AdvancedConfig.get("ffmpeg", "scene_threshold", 27.0)
    
    # Arquivos temporários
    base_dir = os.path.dirname(input_video)
    base_name = os.path.splitext(os.path.basename(input_video))[0]
    csv_path = os.path.join(base_dir, f"{base_name}-Scenes.csv")
    ffmeta_path = os.path.join(base_dir, f"{base_name}.ffmeta")
    
    log.info(f"[Capítulos] 1/3 - Escaneando cortes de câmera com PySceneDetect (Threshold: {threshold})...")
    
    # 1. Roda SceneDetect e cospe um CSV
    try:
        subprocess.run([
            "scenedetect", 
            "-i", input_video, 
            "detect-content", "-t", str(threshold), 
            "list-scenes", "-f", csv_path
        ], check=True, capture_output=True)
    except subprocess.CalledProcessError as e:
        log.error(f"[Capítulos] Falha ao rodar scenedetect: {e.stderr.decode('utf-8', errors='ignore')}")
        return False
        
    if not os.path.exists(csv_path):
        log.error("[Capítulos] Arquivo CSV de cenas não foi gerado.")
        return False

    # 2. Converte CSV do PySceneDetect para formato de Metadados de Capítulo do FFmpeg
    log.info("[Capítulos] 2/3 - Gerando trilha de metadados FFmpeg...")
    try:
        with open(csv_path, "r", encoding="utf-8") as f:
            lines = f.readlines()
            
        # O SceneDetect tem um cabeçalho nas primeiras linhas. Pula até achar "Scene Number"
        start_idx = 0
        for i, line in enumerate(lines):
            if line.startswith("Scene Number"):
                start_idx = i + 1
                break
                
        scenes = []
        reader = csv.reader(lines[start_idx:])
        for row in reader:
            if len(row) >= 6:
                # row[3] = Start Timecode, row[4] = End Timecode, row[5] = Start Time (seconds), row[6] = End Time (sec)
                # Formato PySceneDetect V0.6+: Start Time (seconds) está na coluna 3 ou 5 dependendo da versão
                # Vamos usar os milissegundos calculando a partir dos frames para precisão se as colunas mudarem, mas o padrão atual:
                # Scene Number, Start Frame, Start Timecode, Start Time (seconds), End Frame, End Timecode, End Time (seconds), Length (frames), Length (timecode), Length (seconds)
                start_sec = float(row[3])
                end_sec = float(row[6])
                scenes.append((int(start_sec * 1000), int(end_sec * 1000))) # Em milissegundos
                
        # Escreve FFMETA
        with open(ffmeta_path, "w", encoding="utf-8") as f:
            f.write(";FFMETADATA1\n")
            f.write(f"title={base_name}\n\n")
            for i, (start_ms, end_ms) in enumerate(scenes):
                f.write("[CHAPTER]\n")
                f.write("TIMEBASE=1/1000\n")
                f.write(f"START={start_ms}\n")
                f.write(f"END={end_ms}\n")
                f.write(f"title=Cena {i+1}\n\n")
                
    except Exception as e:
        log.error(f"[Capítulos] Falha ao processar CSV de cenas: {e}")
        return False
        
    # 3. Mux de Vídeo e Metadados com FFmpeg (-c copy)
    log.info("[Capítulos] 3/3 - Embutindo capítulos no vídeo final (Lossless)...")
    try:
        subprocess.run([
            "ffmpeg", "-y",
            "-i", input_video,
            "-i", ffmeta_path,
            "-map_metadata", "1",
            "-c", "copy",
            output_video
        ], check=True, capture_output=True)
    except subprocess.CalledProcessError as e:
        log.error(f"[Capítulos] Falha no FFmpeg ao embutir metadados: {e.stderr.decode('utf-8', errors='ignore')}")
        return False
        
    # Limpeza dos temporários
    try:
        os.remove(csv_path)
        os.remove(ffmeta_path)
    except:
        pass
        
    log.info(f"[Capítulos] Concluído! Fita mapeada nativamente salva em: {output_video}")
    return True