"""
VHS Studio - Monitor Inteligente de Captura (OBS WebSocket 5.x)
Monitoramento em tempo real de ÁUDIO e VÍDEO da Blackmagic Intensity Shuttle:
- AUTO-START IMEDIATO (< 100ms): Dispara assim que a fita começa (áudio detectado OU imagem ativa). Zero quadros perdidos!  # noqa: E501
- AUTO-STOP INTELIGENTE (~1.0s): Detecta parada real combinando silêncio + tela azul/preta/sem sinal. Sem 5s de sobra vazia!  # noqa: E501
- PROTEÇÃO DE CENA: Cenas silenciosas com vídeo em movimento NÃO são cortadas.
- 100% thread-safe, nativo, fora do processo do OBS (à prova de crash).
"""

import json
import base64
import os
import platform
import time
from vhs_studio.core.logger import log
import math
from vhs_studio.config.advanced import AdvancedConfig
from vhs_studio.core.constants import OBS_WEBSOCKET_HOST, OBS_WEBSOCKET_PORT
from vhs_studio.core.queue_manager import enqueue_job
import subprocess
from vhs_studio.core.system_process import run_silent
import io

try:
    from PIL import Image

    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# Limiares de áudio
THRESHOLD_DB = AdvancedConfig.get("capture", "audio_threshold_db", -50.0)
# Multiplicador correspondente a -50 dB: 10^(-50/20) ≈ 0.00316
THRESHOLD_MUL = 10.0 ** (THRESHOLD_DB / 20.0)

# Tempos de confirmação ultrarrápidos e inteligentes
START_CONFIRM_SEC = AdvancedConfig.get(
    "capture", "start_confirm_sec", 0.10
)  # 100ms (apenas 2 pacotes de áudio): disparo imediato ao dar play!
STOP_BLANK_CONFIRM_SEC = AdvancedConfig.get(
    "capture", "stop_blank_confirm_sec", 3.5
)  # 3.5s quando confirmada tela de parada (silêncio + azul/preto) para evitar corte em pausas entre takes
STOP_QUIET_SCENE_SEC = AdvancedConfig.get(
    "capture", "stop_quiet_scene_sec", 25.0
)  # Tolerância estendida se o áudio estiver quieto mas a imagem estiver ativa!
SCREENSHOT_INTERVAL_SEC = AdvancedConfig.get(
    "capture", "screenshot_interval_sec", 0.25
)  # Captura miniatura a cada 250ms (4x/seg) para análise visual instantânea


def mul_to_db(mul):
    """Documentation for mul_to_db."""
    if mul <= 0.000001:
        return -100.0
    return 20.0 * math.log10(mul)


def is_obs_running() -> bool:
    """Check if OBS Studio process is running across Windows, Linux, and macOS."""
    sys_name = platform.system()
    try:
        if sys_name == "Windows":
            r = run_silent(
                ["tasklist", "/fi", "imagename eq obs64.exe"],
                capture_output=True,
                text=True,
                errors="replace",
            )
            return "obs64.exe" in r.stdout.lower()
        else:
            r = run_silent(
                ["pgrep", "-i", "obs"],
                capture_output=True,
                text=True,
                errors="replace",
            )
            return r.returncode == 0
    except Exception:
        return False


def analyze_visual_frame(img_b64, prev_pixels=None):
    """
    Analisa uma miniatura JPEG (16x12) capturada via OBS WebSocket:
    - Retorna se é tela preta, tela azul, vídeo ativo e nível de variação/movimento.
    """
    if not HAS_PIL or not img_b64:
        return None

    try:
        raw_b64 = img_b64.split(",")[-1]
        raw_bytes = base64.b64decode(raw_b64)
        im = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
        pixels = list(im.getdata())
        n = len(pixels)
        if n == 0:
            return None

        r_sum = sum(p[0] for p in pixels)
        g_sum = sum(p[1] for p in pixels)
        b_sum = sum(p[2] for p in pixels)
        r_avg = r_sum / n
        g_avg = g_sum / n
        b_avg = b_sum / n

        # Detecção de Tela Preta (brilho abaixo do piso de sinal)
        is_black = r_avg < 25 and g_avg < 25 and b_avg < 25

        # Detecção de Tela Azul (filmadora/VCR em standby ou stop)
        is_blue = b_avg > 90 and b_avg > (r_avg + g_avg) * 1.4

        # Variância interna da imagem (mede se é tela lisa ou se contém texturas/conteúdo)
        variance = sum(
            (p[0] - r_avg) ** 2 + (p[1] - g_avg) ** 2 + (p[2] - b_avg) ** 2
            for p in pixels
        ) / (n * 3)
        is_solid = variance < 15.0

        # Diferença entre quadros consecutivos (mede movimento / ruído analógico de fita)
        diff = 0.0
        if prev_pixels and len(prev_pixels) == n:
            diff = sum(
                abs(p1[0] - p2[0]) + abs(p1[1] - p2[1]) + abs(p1[2] - p2[2])
                for p1, p2 in zip(pixels, prev_pixels)
            ) / (n * 3)

        is_blank = is_black or is_blue or (is_solid and (r_avg < 35 or b_avg > 80))
        # Vídeo ativo: não é tela lisa e possui textura/movimento de fita
        is_active = not is_blank and (variance >= 20.0 or diff >= 2.0)

        return {
            "r": r_avg,
            "g": g_avg,
            "b": b_avg,
            "is_black": is_black,
            "is_blue": is_blue,
            "is_blank": is_blank,
            "is_active": is_active,
            "diff": diff,
            "variance": variance,
            "pixels": pixels,
        }
    except Exception:
        return None


def run_watcher():
    """Documentation for run_watcher."""
    os.system("title VHS Studio - Monitor Inteligente de Gravacao")
    log.info(
        "=============================================================================="
    )
    log.info("       📼 VHS STUDIO - INTELLIGENT CAPTURE SERVICE (AUDIO + VIDEO) 📼")
    log.info(
        "=============================================================================="
    )
    log.info(f"Audio Threshold    : {THRESHOLD_DB:.1f} dB")
    log.info(
        f"Start Trigger      : IMMEDIATE (< {START_CONFIRM_SEC*1000:.0f}ms active audio or video)"
    )
    log.info(
        f"Stop Trigger       : {STOP_BLANK_CONFIRM_SEC:.1f}s (Silence + Blue/Black Stop Screen)"
    )
    log.info(
        "Scene Protection   : Silent scenes with active video keep recording active!"
    )
    log.info(
        f"Visual Analysis    : {'Active (Pillow 16x12)' if HAS_PIL else 'Basic (Audio Only)'}"
    )
    log.info(
        "------------------------------------------------------------------------------"
    )

    while True:
        import websocket

        ws = websocket.WebSocket()
        log.info("\n[Conexão] Aguardando OBS Studio iniciar...")
        retries = 0
        while True:
            try:
                ws.connect(f"ws://{OBS_WEBSOCKET_HOST}:{OBS_WEBSOCKET_PORT}", timeout=2.0)
                break
            except Exception:
                retries += 1
                if retries > 10 and not is_obs_running():
                    log.info(
                        "[VHS Studio] OBS Studio não está em execução. Encerrando monitor."
                    )
                    return
                time.sleep(1.5)

        log.info("[Conexão] OBS Studio conectado via WebSocket nativo!")

        try:
            # 1. Recebe Hello (OpCode 0)
            hello_raw = ws.recv()
            if not hello_raw:
                continue
            json.loads(hello_raw)

            # 2. Envia Identify (OpCode 1)
            # EventSubscription: General (1) + Outputs (4) + InputVolumeMeters (65536)
            sub_mask = 1 | 4 | 65536
            ws.send(
                json.dumps(
                    {"op": 1, "d": {"rpcVersion": 1, "eventSubscriptions": sub_mask}}
                )
            )

            # 3. Receive Identified (OpCode 2)
            ws.recv()
            log.info("[Ready] Smart audio and video capture monitoring active.")

            is_recording = False
            signal_start_time = None
            blank_silence_start_time = None
            quiet_scene_start_time = None
            last_feedback_time: float = 0.0
            last_shot_request_time: float = 0.0
            target_input_name = None

            latest_visual_info = None
            prev_visual_pixels = None

            while True:
                msg_raw = ws.recv()
                if not msg_raw:
                    break
                msg = json.loads(msg_raw)
                op = msg.get("op")
                now = time.time()

                # Resposta de Screenshot (OpCode 7)
                if op == 7:
                    d = msg.get("d", {})
                    req_id = d.get("requestId", "")
                    if req_id == "vshot":
                        resp_data = d.get("responseData", {})
                        img_data = resp_data.get("imageData", "")
                        if img_data:
                            vinfo = analyze_visual_frame(img_data, prev_visual_pixels)
                            if vinfo:
                                latest_visual_info = vinfo
                                prev_visual_pixels = vinfo.get("pixels")

                # Evento recebido (OpCode 5)
                elif op == 5:
                    d = msg.get("d", {})
                    event_type = d.get("eventType")
                    event_data = d.get("eventData", {})

                    # Track recording state
                    if event_type == "RecordStateChanged":
                        is_recording = event_data.get("outputActive", False)

                        if is_recording:
                            log.info("\n[OBS] 🔴 RECORDING IN PROGRESS ({state_str})")
                        else:
                            log.info("\n[OBS] ⏹ RECORDING STOPPED ({state_str})")
                            signal_start_time = None
                            blank_silence_start_time = None
                            quiet_scene_start_time = None

                            # Enqueue captured raw tape to processing queue
                            out_path = event_data.get("outputPath")
                            if out_path and os.path.exists(out_path):
                                log.info(f"[OBS] Raw tape saved at: {out_path}")
                                enqueue_job(out_path)
                            else:
                                log.warning(
                                    f"[OBS] Warning: Recording stopped but 'outputPath' was missing or file not found: {out_path}"  # noqa: E501
                                )

                    # Audio Volume Meters monitor (fires every 50ms)
                    elif event_type == "InputVolumeMeters":
                        inputs = event_data.get("inputs", [])

                        # Locate Blackmagic capture source name if not yet bound
                        if not target_input_name:
                            for inp in inputs:
                                name = inp.get("inputName", "")
                                if any(
                                    k in name.lower()
                                    for k in [
                                        "blackmagic",
                                        "intensity",
                                        "decklink",
                                        "captura",
                                        "video",
                                    ]
                                ):
                                    target_input_name = name
                                    log.info(
                                        f"\n[Source] Successfully bound to capture input: '{target_input_name}'"
                                    )
                                    break
                            if not target_input_name and inputs:
                                target_input_name = inputs[0].get("inputName", "")

                        current_max_mul = 0.0
                        for inp in inputs:
                            if inp.get("inputName") == target_input_name:
                                levels = inp.get("inputLevelsMul", [])
                                for ch in levels:
                                    if len(ch) >= 2:
                                        peak = ch[1]
                                        if peak > current_max_mul:
                                            current_max_mul = peak
                                break

                        mul_to_db(current_max_mul)
                        has_audio = current_max_mul >= THRESHOLD_MUL

                        # Periodically request visual thumbnail for frame analysis
                        if (
                            HAS_PIL
                            and target_input_name
                            and (
                                now - last_shot_request_time >= SCREENSHOT_INTERVAL_SEC
                            )
                        ):
                            last_shot_request_time = now
                            ws.send(
                                json.dumps(
                                    {
                                        "op": 6,
                                        "d": {
                                            "requestType": "GetSourceScreenshot",
                                            "requestId": "vshot",
                                            "requestData": {
                                                "sourceName": target_input_name,
                                                "imageFormat": "jpeg",
                                                "imageWidth": 16,
                                                "imageHeight": 12,
                                                "imageCompressionQuality": 30,
                                            },
                                        },
                                    }
                                )
                            )

                        # Visual state evaluation
                        is_visual_active = False
                        is_visual_blank = True
                        visual_label = "UNKNOWN"

                        if latest_visual_info:
                            if latest_visual_info.get("is_blue"):
                                visual_label = "BLUE SCREEN (Standby)"
                                is_visual_blank = True
                            elif latest_visual_info.get("is_black"):
                                visual_label = "BLACK SCREEN"
                                is_visual_blank = True
                            elif latest_visual_info.get("is_active"):
                                visual_label = "ACTIVE VIDEO"
                                is_visual_active = True
                                is_visual_blank = False
                            else:
                                visual_label = "STATIC NOISE"
                                is_visual_blank = True

                        # Console telemetry feedback every 3 seconds
                        if now - last_feedback_time > 3.0:
                            last_feedback_time = now

                        # =========================================================
                        # 1. INTELLIGENT AUTO-START LOGIC (< 100ms)
                        # =========================================================
                        if not is_recording:
                            # Trigger if audio is present OR visual state transitions from black/blue to active video
                            has_content_signal = has_audio or is_visual_active

                            if has_content_signal:
                                if signal_start_time is None:
                                    signal_start_time = now
                                elif now - signal_start_time >= START_CONFIRM_SEC:
                                    cause = (
                                        "Audio detected"
                                        if has_audio
                                        else "Active video detected"
                                    )
                                    log.info(
                                        f"\n[Auto-Start] ▶ SIGNAL DETECTED ({cause})!"
                                    )
                                    log.info(
                                        "[Auto-Start] Triggering OBS recording immediately..."
                                    )
                                    ws.send(
                                        json.dumps(
                                            {
                                                "op": 6,
                                                "d": {
                                                    "requestType": "StartRecord",
                                                    "requestId": "start-rec-1",
                                                },
                                            }
                                        )
                                    )
                                    signal_start_time = None
                                    blank_silence_start_time = None
                                    is_recording = True
                            else:
                                signal_start_time = None

                        # =========================================================
                        # 2. INTELLIGENT AUTO-STOP LOGIC (~1.0s)
                        # =========================================================
                        else:
                            signal_start_time = None

                            # If active audio is detected, reset all stop counters
                            if has_audio:
                                blank_silence_start_time = None
                                quiet_scene_start_time = None
                            else:
                                # Silence threshold (< -50 dB)
                                # CASE A: Silence + Stop Screen (Blue, Black, or Freeze) -> TAPE END!
                                if is_visual_blank or not HAS_PIL:
                                    quiet_scene_start_time = None
                                    if blank_silence_start_time is None:
                                        blank_silence_start_time = now
                                    elif (
                                        now - blank_silence_start_time
                                        >= STOP_BLANK_CONFIRM_SEC
                                    ):
                                        stop_reason = (
                                            f"Silence + {visual_label}"
                                            if HAS_PIL
                                            else "Continuous silence"
                                        )
                                        log.info(
                                            f"\n[Auto-Stop] ⏹ TAPE END / STOP DETECTED ({stop_reason})!"
                                        )
                                        log.info(
                                            "[Auto-Stop] Stopping OBS recording..."
                                        )
                                        ws.send(
                                            json.dumps(
                                                {
                                                    "op": 6,
                                                    "d": {
                                                        "requestType": "StopRecord",
                                                        "requestId": "stop-rec-1",
                                                    },
                                                }
                                            )
                                        )
                                        blank_silence_start_time = None
                                        is_recording = False

                                # CASE B: Silence BUT video remains ACTIVE -> SILENT MOVIE SCENE!
                                elif is_visual_active:
                                    blank_silence_start_time = None
                                    if quiet_scene_start_time is None:
                                        quiet_scene_start_time = now
                                    elif (
                                        now - quiet_scene_start_time
                                        >= STOP_QUIET_SCENE_SEC
                                    ):
                                        # Only stop if continuous silence exceeds 20s
                                        log.info(
                                            f"\n[Auto-Stop] ⏹ Prolonged silence ({STOP_QUIET_SCENE_SEC}s). Stopping recording..."  # noqa: E501
                                        )
                                        ws.send(
                                            json.dumps(
                                                {
                                                    "op": 6,
                                                    "d": {
                                                        "requestType": "StopRecord",
                                                        "requestId": "stop-rec-1",
                                                    },
                                                }
                                            )
                                        )
                                        quiet_scene_start_time = None
                                        is_recording = False

        except Exception as e:
            log.info(f"\n[Notice] OBS connection interrupted ({e}).")
        finally:
            ws.close()

        time.sleep(1.0)
        if not is_obs_running():
            log.info(
                "[VHS Studio] OBS Studio terminated. Exiting capture monitor."
            )
            return
        time.sleep(1.5)


if __name__ == "__main__":
    try:
        run_watcher()
    except KeyboardInterrupt:
        log.info("\nExiting watcher.")
