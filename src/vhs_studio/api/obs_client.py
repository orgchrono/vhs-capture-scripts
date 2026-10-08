"""Module documentation pending."""

import json
import base64
import hashlib
import time
import threading
from vhs_studio.core.logger import log


class OBSClient:
    """Cliente WebSocket robusto para OBS Studio (v5.x) com reconexao automatica (HAL)."""

    def __init__(self, host="127.0.0.1", port=4455, password=None):
        """Documentation for __init__."""
        self.host = host
        self.port = port
        self.password = password if password is not None else ""
        self.ws = None
        self._connected = False
        self._reconnect_lock = threading.Lock()
        self._max_retries = 5
        self._backoff = 2.0

    @property
    def is_connected(self):
        """Documentation for is_connected."""
        return self._connected

    def connect(self):
        """Documentation for connect."""
        try:
            import websocket
        except ImportError:
            log.error(
                "[ERRO] websocket-client nao instalado. Use pip install websocket-client"
            )
            return False

        with self._reconnect_lock:
            if self._connected:
                return True

            for attempt in range(self._max_retries):
                try:
                    self.ws = websocket.create_connection(
                        f"ws://{self.host}:{self.port}", timeout=3
                    )
                    # Handshake inicial
                    hello = json.loads(self.ws.recv())
                    auth_info = hello.get("d", {}).get("authentication")

                    identify_payload = {
                        "op": 1,
                        "d": {"rpcVersion": 1, "eventSubscriptions": 33},
                    }

                    if auth_info:
                        if not self.password:
                            log.error(
                                "[ERRO] OBS requer senha, mas nenhuma foi configurada."
                            )
                            return False

                        salt = auth_info["salt"]
                        challenge = auth_info["challenge"]
                        concat1 = (self.password + salt).encode("utf-8")
                        secret = base64.b64encode(
                            hashlib.sha256(concat1).digest()
                        ).decode("utf-8")
                        concat2 = (secret + challenge).encode("utf-8")
                        auth_resp = base64.b64encode(
                            hashlib.sha256(concat2).digest()
                        ).decode("utf-8")
                        identify_payload["d"]["authentication"] = auth_resp

                    self.ws.send(json.dumps(identify_payload))
                    resp = json.loads(self.ws.recv())

                    if resp.get("op") == 2:
                        self._connected = True
                        log.info(
                            f"[HAL] OBS WebSocket Conectado com Sucesso! (Tentativa {attempt + 1})"
                        )
                        return True
                    else:
                        log.error(f"[HAL] Falha de auth no OBS: {resp}")
                        return False
                except Exception as e:
                    log.warning(
                        f"[HAL] Falha ao conectar no OBS (Tentativa {attempt + 1}/{self._max_retries}): {e}"
                    )
                    if self.ws:
                        self.ws.close()
                    time.sleep(self._backoff * (2**attempt))

            log.error("[HAL] Esgotadas as tentativas de conexao com o OBS.")
            return False

    def send_request(self, request_type, request_data=None):
        """Documentation for send_request."""
        if not self._connected or not self.ws:
            log.warning(
                "[HAL] Conexao perdida, tentando reconectar antes do request..."
            )
            if not self.connect():
                return None

        try:
            payload = {
                "op": 6,
                "d": {
                    "requestType": request_type,
                    "requestId": f"req_{int(time.time()*1000)}",
                    "requestData": request_data or {},
                },
            }
            self.ws.send(json.dumps(payload))
            resp = json.loads(self.ws.recv())
            return resp.get("d", {})
        except Exception as e:
            log.error(f"[HAL] Falha no Request do OBS ({request_type}): {e}")
            self._connected = False
            return None

    def start_record(self):
        """Documentation for start_record."""
        return self.send_request("StartRecord")

    def stop_record(self):
        """Documentation for stop_record."""
        return self.send_request("StopRecord")
