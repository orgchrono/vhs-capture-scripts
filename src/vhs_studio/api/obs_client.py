import json
import base64
import hashlib
import time
from vhs_studio.core.logger import log


class OBSClient:
    """Cliente WebSocket robusto para OBS Studio (v5.x)."""

    def __init__(self, host="127.0.0.1", port=4455, password=None):
        self.host = host
        self.port = port
        self.password = password if password is not None else ""
        self.ws = None

    def connect(self):
        try:
            import websocket
        except ImportError:
            log.error("[ERRO] websocket-client não instalado. Use pip install websocket-client")
            return False

        try:
            self.ws = websocket.create_connection(f"ws://{self.host}:{self.port}", timeout=3)
            # Handshake inicial
            hello = json.loads(self.ws.recv())
            auth_info = hello.get("d", {}).get("authentication")

            identify_payload = {
                "op": 1,
                "d": {"rpcVersion": 1, "eventSubscriptions": 33},
            }

            if auth_info:
                if not self.password:
                    log.error("[ERRO] OBS requer senha, mas nenhuma foi configurada.")
                    return False

                salt = auth_info["salt"]
                challenge = auth_info["challenge"]
                secret = base64.b64encode(hashlib.sha256((self.password + salt).encode("utf-8")).digest()).decode(
                    "utf-8"
                )
                auth_resp = base64.b64encode(hashlib.sha256((secret + challenge).encode("utf-8")).digest()).decode(
                    "utf-8"
                )
                identify_payload["d"]["authentication"] = auth_resp

            self.ws.send(json.dumps(identify_payload))
            identified = json.loads(self.ws.recv())
            if identified.get("op") != 2:
                log.error(f"[ERRO] Falha na autenticação com OBS: {identified}")
                return False
            return True

        except Exception as e:
            log.warning(f"Falha ao conectar no OBS: {e}")
            return False

    def send_request(self, request_type, request_data=None):
        if not self.ws:
            return None
        req = {
            "op": 6,
            "d": {
                "requestType": request_type,
                "requestId": f"req_{int(time.time()*1000)}",
            },
        }
        if request_data:
            req["d"]["requestData"] = request_data

        try:
            self.ws.send(json.dumps(req))
            resp = json.loads(self.ws.recv())
            return resp
        except Exception as e:
            log.warning(f"Erro ao enviar requisição para OBS: {e}")
            return None

    def start_recording(self):
        return self.send_request("StartRecord")

    def stop_recording(self):
        return self.send_request("StopRecord")

    def get_record_status(self):
        resp = self.send_request("GetRecordStatus")
        if resp and resp.get("d", {}).get("responseData"):
            return resp["d"]["responseData"].get("outputActive", False)
        return False

    def close(self):
        if self.ws:
            self.ws.close()
            self.ws = None
