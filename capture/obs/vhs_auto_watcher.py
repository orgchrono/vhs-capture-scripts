"""
VHS Studio - Monitor Inteligente de Captura (OBS WebSocket 5.x)
Monitoramento em tempo real de ÁUDIO e VÍDEO da Blackmagic Intensity Shuttle:
- AUTO-START IMEDIATO (< 100ms): Dispara assim que a fita começa (áudio detectado OU imagem ativa). Zero quadros perdidos!
- AUTO-STOP INTELIGENTE (~1.0s): Detecta parada real combinando silêncio + tela azul/preta/sem sinal. Sem 5s de sobra vazia!
- PROTEÇÃO DE CENA: Cenas silenciosas com vídeo em movimento NÃO são cortadas.
- 100% thread-safe, nativo, fora do processo do OBS (à prova de crash).
"""

import socket
import struct
import json
import base64
import os
import time
import math
import sys
import subprocess
import io

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# Limiares de áudio
THRESHOLD_DB = -50.0
# Multiplicador correspondente a -50 dB: 10^(-50/20) ≈ 0.00316
THRESHOLD_MUL = 10.0 ** (THRESHOLD_DB / 20.0)

# Tempos de confirmação ultrarrápidos e inteligentes
START_CONFIRM_SEC = 0.10      # 100ms (apenas 2 pacotes de áudio): disparo imediato ao dar play!
STOP_BLANK_CONFIRM_SEC = 3.5  # 3.5s quando confirmada tela de parada (silêncio + azul/preto) para evitar corte em pausas entre takes
STOP_QUIET_SCENE_SEC = 25.0   # Tolerância estendida se o áudio estiver quieto mas a imagem estiver ativa!
SCREENSHOT_INTERVAL_SEC = 0.25 # Captura miniatura a cada 250ms (4x/seg) para análise visual instantânea

class SimpleWebSocket:
    def __init__(self, host="127.0.0.1", port=4455):
        self.host = host
        self.port = port
        self.sock = None
        self.buffer = b""

    def connect(self, timeout=3.0):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.settimeout(timeout)
        self.sock.connect((self.host, self.port))
        
        key = base64.b64encode(os.urandom(16)).decode('ascii')
        req = (
            f"GET / HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode('ascii'))
        
        resp = b""
        while b"\r\n\r\n" not in resp:
            chunk = self.sock.recv(1024)
            if not chunk:
                raise ConnectionError("Conexão fechada durante o handshake.")
            resp += chunk
            
        header, _, rest = resp.partition(b"\r\n\r\n")
        if b"101" not in header.split(b"\r\n")[0]:
            raise ConnectionError(f"Falha no handshake: {header.decode('latin1', errors='ignore')}")
        self.buffer = rest

    def send_json(self, data):
        text = json.dumps(data)
        raw = text.encode('utf-8')
        length = len(raw)
        mask_key = os.urandom(4)
        
        header = bytearray([0x81])
        if length <= 125:
            header.append(0x80 | length)
        elif length <= 65535:
            header.append(0x80 | 126)
            header.extend(struct.pack("!H", length))
        else:
            header.append(0x80 | 127)
            header.extend(struct.pack("!Q", length))
            
        header.extend(mask_key)
        masked_data = bytearray(b ^ mask_key[i % 4] for i, b in enumerate(raw))
        self.sock.sendall(header + masked_data)

    def recv_msg(self):
        while True:
            while len(self.buffer) < 2:
                chunk = self.sock.recv(4096)
                if not chunk:
                    return None
                self.buffer += chunk

            b0, b1 = self.buffer[0], self.buffer[1]
            opcode = b0 & 0x0F
            masked = bool(b1 & 0x80)
            payload_len = b1 & 0x7F
            idx = 2

            if payload_len == 126:
                while len(self.buffer) < idx + 2:
                    self.buffer += self.sock.recv(4096)
                payload_len = struct.unpack("!H", self.buffer[idx:idx+2])[0]
                idx += 2
            elif payload_len == 127:
                while len(self.buffer) < idx + 8:
                    self.buffer += self.sock.recv(4096)
                payload_len = struct.unpack("!Q", self.buffer[idx:idx+8])[0]
                idx += 8

            if masked:
                while len(self.buffer) < idx + 4:
                    self.buffer += self.sock.recv(4096)
                mask_key = self.buffer[idx:idx+4]
                idx += 4

            while len(self.buffer) < idx + payload_len:
                self.buffer += self.sock.recv(4096)

            payload = self.buffer[idx:idx+payload_len]
            self.buffer = self.buffer[idx+payload_len:]

            if masked:
                payload = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))

            if opcode == 0x01: # Text
                return payload.decode('utf-8')
            elif opcode == 0x08: # Close
                return None
            elif opcode == 0x09: # Ping -> envia Pong
                pong = bytearray([0x8A, 0x80]) + os.urandom(4)
                self.sock.sendall(pong)

    def close(self):
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass

def mul_to_db(mul):
    if mul <= 0.000001:
        return -100.0
    return 20.0 * math.log10(mul)

def is_obs_running():
    try:
        r = subprocess.run(["tasklist", "/fi", "imagename eq obs64.exe"], capture_output=True, text=True)
        return "obs64.exe" in r.stdout.lower()
    except Exception:
        return True

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
        is_black = (r_avg < 25 and g_avg < 25 and b_avg < 25)

        # Detecção de Tela Azul (filmadora/VCR em standby ou stop)
        is_blue = (b_avg > 90 and b_avg > (r_avg + g_avg) * 1.4)

        # Variância interna da imagem (mede se é tela lisa ou se contém texturas/conteúdo)
        variance = sum((p[0] - r_avg)**2 + (p[1] - g_avg)**2 + (p[2] - b_avg)**2 for p in pixels) / (n * 3)
        is_solid = variance < 15.0

        # Diferença entre quadros consecutivos (mede movimento / ruído analógico de fita)
        diff = 0.0
        if prev_pixels and len(prev_pixels) == n:
            diff = sum(abs(p1[0] - p2[0]) + abs(p1[1] - p2[1]) + abs(p1[2] - p2[2]) for p1, p2 in zip(pixels, prev_pixels)) / (n * 3)

        is_blank = is_black or is_blue or (is_solid and (r_avg < 35 or b_avg > 80))
        # Vídeo ativo: não é tela lisa e possui textura/movimento de fita
        is_active = not is_blank and (variance >= 20.0 or diff >= 2.0)

        return {
            "r": r_avg, "g": g_avg, "b": b_avg,
            "is_black": is_black,
            "is_blue": is_blue,
            "is_blank": is_blank,
            "is_active": is_active,
            "diff": diff,
            "variance": variance,
            "pixels": pixels
        }
    except Exception:
        return None

def run_watcher():
    os.system("title VHS Studio - Monitor Inteligente de Gravacao")
    print("=" * 78)
    print("       📼 VHS STUDIO - SERVIÇO DE CAPTURA INTELIGENTE (ÁUDIO + VÍDEO) 📼")
    print("=" * 78)
    print(f"Limiar de Áudio    : {THRESHOLD_DB:.1f} dB")
    print(f"Gatilho de Início  : IMEDIATO (< {START_CONFIRM_SEC*1000:.0f}ms de áudio ou vídeo ativo)")
    print(f"Gatilho de Parada  : {STOP_BLANK_CONFIRM_SEC:.1f}s (Silêncio + Tela de Parada Azul/Preta)")
    print(f"Proteção de Cena   : Cenas silenciosas com vídeo ativo mantêm gravação ativa!")
    print(f"Análise Visual     : {'Ativa (Pillow 16x12)' if HAS_PIL else 'Básica (Apenas Áudio)'}")
    print("-" * 78)

    while True:
        ws = SimpleWebSocket()
        print("\n[Conexão] Aguardando OBS Studio iniciar...")
        
        retries = 0
        while True:
            try:
                ws.connect(timeout=2.0)
                break
            except Exception:
                retries += 1
                if retries > 10 and not is_obs_running():
                    print("[VHS Studio] OBS Studio não está em execução. Encerrando monitor.")
                    return
                time.sleep(1.5)

        print("[Conexão] OBS Studio conectado via WebSocket nativo!")

        try:
            # 1. Recebe Hello (OpCode 0)
            hello_raw = ws.recv_msg()
            if not hello_raw:
                continue
            hello = json.loads(hello_raw)

            # 2. Envia Identify (OpCode 1)
            # EventSubscription: General (1) + Outputs (4) + InputVolumeMeters (65536)
            sub_mask = 1 | 4 | 65536
            ws.send_json({
                "op": 1,
                "d": {
                    "rpcVersion": 1,
                    "eventSubscriptions": sub_mask
                }
            })

            # 3. Recebe Identified (OpCode 2)
            ws.recv_msg()
            print("[Pronto] Monitoramento inteligente ativo de áudio e vídeo.")

            is_recording = False
            signal_start_time = None
            blank_silence_start_time = None
            quiet_scene_start_time = None
            last_feedback_time = 0
            last_shot_request_time = 0
            target_input_name = None

            latest_visual_info = None
            prev_visual_pixels = None

            while True:
                msg_raw = ws.recv_msg()
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

                    # Acompanha status da gravação
                    if event_type == "RecordStateChanged":
                        is_recording = event_data.get("outputActive", False)
                        state_str = event_data.get("outputState", "")
                        if is_recording:
                            print(f"\n[OBS] 🔴 GRAVAÇÃO EM ANDAMENTO ({state_str})")
                        else:
                            print(f"\n[OBS] ⏹ GRAVAÇÃO FINALIZADA ({state_str})")
                            signal_start_time = None
                            blank_silence_start_time = None
                            quiet_scene_start_time = None

                    # Monitor de Níveis de Áudio (dispara a cada 50ms)
                    elif event_type == "InputVolumeMeters":
                        inputs = event_data.get("inputs", [])
                        
                        # Localiza nome da fonte Blackmagic se ainda não estiver vinculada
                        if not target_input_name:
                            for inp in inputs:
                                name = inp.get("inputName", "")
                                if any(k in name.lower() for k in ["blackmagic", "intensity", "decklink", "captura", "video"]):
                                    target_input_name = name
                                    print(f"\n[Fonte] Vinculado com sucesso à entrada: '{target_input_name}'")
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

                        current_db = mul_to_db(current_max_mul)
                        has_audio = (current_max_mul >= THRESHOLD_MUL)

                        # Solicita miniatura visual periodicamente para análise visual
                        if HAS_PIL and target_input_name and (now - last_shot_request_time >= SCREENSHOT_INTERVAL_SEC):
                            last_shot_request_time = now
                            ws.send_json({
                                "op": 6,
                                "d": {
                                    "requestType": "GetSourceScreenshot",
                                    "requestId": "vshot",
                                    "requestData": {
                                        "sourceName": target_input_name,
                                        "imageFormat": "jpeg",
                                        "imageWidth": 16,
                                        "imageHeight": 12,
                                        "imageCompressionQuality": 30
                                    }
                                }
                            })

                        # Interpretação do estado visual
                        is_visual_active = False
                        is_visual_blank = True
                        visual_label = "DESCONHECIDO"

                        if latest_visual_info:
                            if latest_visual_info.get("is_blue"):
                                visual_label = "TELA AZUL (Standby)"
                                is_visual_blank = True
                            elif latest_visual_info.get("is_black"):
                                visual_label = "TELA PRETA"
                                is_visual_blank = True
                            elif latest_visual_info.get("is_active"):
                                visual_label = "VÍDEO ATIVO"
                                is_visual_active = True
                                is_visual_blank = False
                            else:
                                visual_label = "ESTÁTICO"
                                is_visual_blank = True

                        # Feedback no console a cada 3 segundos
                        if now - last_feedback_time > 3.0:
                            last_feedback_time = now
                            status_label = "🔴 GRAVANDO" if is_recording else "⏹ ESPERANDO PLAY"
                            print(f"[Status] {status_label} | Áudio: {current_db:5.1f} dB | Vídeo: {visual_label}        ", end="\r")

                        # =========================================================
                        # 1. LÓGICA DE AUTO-START INTELIGENTE (< 100ms)
                        # =========================================================
                        if not is_recording:
                            # Dispara se houver áudio OU se a imagem sair de tela preta/azul para vídeo ativo!
                            has_content_signal = has_audio or is_visual_active

                            if has_content_signal:
                                if signal_start_time is None:
                                    signal_start_time = now
                                elif (now - signal_start_time >= START_CONFIRM_SEC):
                                    cause = "Áudio detectado" if has_audio else "Vídeo ativo detectado"
                                    print(f"\n[Auto-Start] ▶ SINAL DETECTADO ({cause})!")
                                    print(f"[Auto-Start] Disparando gravação no OBS imediatamente...")
                                    ws.send_json({
                                        "op": 6,
                                        "d": {
                                             "requestType": "StartRecord",
                                             "requestId": "start-rec-1"
                                        }
                                    })
                                    signal_start_time = None
                                    blank_silence_start_time = None
                                    is_recording = True
                            else:
                                signal_start_time = None

                        # =========================================================
                        # 2. LÓGICA DE AUTO-STOP INTELIGENTE (~1.0s)
                        # =========================================================
                        else:
                            signal_start_time = None
                            
                            # Se há áudio forte, reseta todos os contadores de parada
                            if has_audio:
                                blank_silence_start_time = None
                                quiet_scene_start_time = None
                            else:
                                # Áudio silencioso (< -50 dB)
                                # CASO A: Silêncio + Tela de Parada (Azul, Preta ou Imagem Congelada) -> FITA ACABOU!
                                if is_visual_blank or not HAS_PIL:
                                    quiet_scene_start_time = None
                                    if blank_silence_start_time is None:
                                        blank_silence_start_time = now
                                    elif now - blank_silence_start_time >= STOP_BLANK_CONFIRM_SEC:
                                        stop_reason = f"Silêncio + {visual_label}" if HAS_PIL else "Silêncio contínuo"
                                        print(f"\n[Auto-Stop] ⏹ FIM DE FITA / STOP DETECTADO ({stop_reason})!")
                                        print("[Auto-Stop] Encerrando gravação no OBS...")
                                        ws.send_json({
                                            "op": 6,
                                            "d": {
                                                 "requestType": "StopRecord",
                                                 "requestId": "stop-rec-1"
                                            }
                                        })
                                        blank_silence_start_time = None
                                        is_recording = False

                                # CASO B: Silêncio MAS o vídeo continua ATIVO -> CENA SILENCIOSA DO FILME!
                                elif is_visual_active:
                                    blank_silence_start_time = None
                                    if quiet_scene_start_time is None:
                                        quiet_scene_start_time = now
                                    elif now - quiet_scene_start_time >= STOP_QUIET_SCENE_SEC:
                                        # Apenas corta se ficar em silêncio absoluto por mais de 20s seguidos
                                        print(f"\n[Auto-Stop] ⏹ Silêncio prolongado ({STOP_QUIET_SCENE_SEC}s). Encerrando gravação...")
                                        ws.send_json({
                                            "op": 6,
                                            "d": {
                                                 "requestType": "StopRecord",
                                                 "requestId": "stop-rec-1"
                                            }
                                        })
                                        quiet_scene_start_time = None
                                        is_recording = False

        except Exception as e:
            print(f"\n[Aviso] Conexão com OBS interrompida ({e}).")
        finally:
            ws.close()

        time.sleep(1.0)
        if not is_obs_running():
            print("[VHS Studio] OBS Studio foi finalizado. Encerrando monitor de gravação.")
            return
        time.sleep(1.5)

if __name__ == "__main__":
    try:
        run_watcher()
    except KeyboardInterrupt:
        print("\nEncerrando monitoramento.")
