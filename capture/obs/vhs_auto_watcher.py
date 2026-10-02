"""
VHS Studio - Auto Watcher & Trigger (OBS WebSocket 5.x)
Monitora o volume da Blackmagic Intensity Shuttle em tempo real sem tocar na memória interna do OBS.
- Dá PLAY na câmera -> Inicia gravação automaticamente após 1s de áudio.
- Fita acaba / STOP -> Interrompe gravação automaticamente após 5s de silêncio.
- 100% thread-safe, nativo e blindado contra quedas.
"""

import socket
import struct
import json
import base64
import os
import time
import math
import sys

THRESHOLD_DB = -50.0
# Multiplicador correspondente a -50 dB: 10^(-50/20) = ~0.00316
THRESHOLD_MUL = 10.0 ** (THRESHOLD_DB / 20.0)
START_DELAY_SEC = 1.0
STOP_DELAY_SEC = 5.0

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
            except:
                pass

import subprocess

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

def run_watcher():
    os.system("title VHS Studio - Monitor de Gravacao Automatica")
    print("=" * 75)
    print("      📼 VHS STUDIO - SERVIÇO DE CAPTURA AUTOMÁTICA (WEBSOCKET) 📼")
    print("=" * 75)
    print(f"Limiar de Detecção : {THRESHOLD_DB:.1f} dB")
    print(f"Tempo de Início    : {START_DELAY_SEC:.1f}s com áudio contínuo")
    print(f"Tempo de Término   : {STOP_DELAY_SEC:.1f}s em silêncio contínuo")
    print("-" * 75)

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
            print("[Pronto] Monitoramento ativo de áudio e status do OBS.")

            is_recording = False
            signal_start_time = None
            silence_start_time = None
            last_feedback_time = 0
            target_input_name = None

            while True:
                msg_raw = ws.recv_msg()
                if not msg_raw:
                    break
                msg = json.loads(msg_raw)
                op = msg.get("op")

                # Evento recebido (OpCode 5)
                if op == 5:
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
                            silence_start_time = None

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
                        now = time.time()

                        # Feedback no console a cada 3 segundos
                        if now - last_feedback_time > 3.0:
                            last_feedback_time = now
                            status_label = "🔴 GRAVANDO" if is_recording else "⏹ ESPERANDO PLAY"
                            print(f"[Status] {status_label} | Volume: {current_db:5.1f} dB (Limiar: {THRESHOLD_DB:.1f} dB)", end="\r")

                        # LÓGICA DE AUTO-START
                        if current_max_mul >= THRESHOLD_MUL:
                            silence_start_time = None
                            if not is_recording:
                                if signal_start_time is None:
                                    signal_start_time = now
                                elif now - signal_start_time >= START_DELAY_SEC:
                                    print(f"\n[Auto-Start] ▶ SINAL DETECTADO ({current_db:.1f} dB >= {THRESHOLD_DB:.1f} dB)!")
                                    print("[Auto-Start] Iniciando gravação no OBS...")
                                    ws.send_json({
                                        "op": 6,
                                        "d": {
                                             "requestType": "StartRecord",
                                             "requestId": "start-rec-1"
                                        }
                                    })
                                    signal_start_time = None
                                    is_recording = True
                        else:
                            # LÓGICA DE AUTO-STOP
                            signal_start_time = None
                            if is_recording:
                                if silence_start_time is None:
                                    silence_start_time = now
                                elif now - silence_start_time >= STOP_DELAY_SEC:
                                    print(f"\n[Auto-Stop] ⏹ FITA FINALIZADA / SILÊNCIO DETECTADO ({STOP_DELAY_SEC}s)!")
                                    print("[Auto-Stop] Encerrando gravação no OBS...")
                                    ws.send_json({
                                        "op": 6,
                                        "d": {
                                             "requestType": "StopRecord",
                                             "requestId": "stop-rec-1"
                                        }
                                    })
                                    silence_start_time = None
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
