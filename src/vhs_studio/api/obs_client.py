"""Hardware Abstraction Layer (HAL) client for OBS Studio WebSocket v5 API."""

import json
import base64
import hashlib
import time
import threading
from vhs_studio.core.logger import log
from vhs_studio.core.constants import OBS_WEBSOCKET_HOST, OBS_WEBSOCKET_PORT


class OBSClient:
    """Robust WebSocket client for OBS Studio v5 with automated exponential backoff reconnection."""

    _last_fail_time = 0.0
    _fail_cooldown = 3.0

    def __init__(
        self,
        host=OBS_WEBSOCKET_HOST,
        port=OBS_WEBSOCKET_PORT,
        password=None,
    ):
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
        """Return True if WebSocket connection is currently active."""
        return self._connected

    def connect(self, max_retries=None, silent=False):
        """Initiate WebSocket connection and perform challenge-response authentication."""
        try:
            import websocket
        except ImportError:
            log.error(
                "[ERROR] websocket-client is not installed. Install via: pip install websocket-client"
            )
            return False

        with self._reconnect_lock:
            if self._connected:
                return True

            now = time.time()
            if now - OBSClient._last_fail_time < OBSClient._fail_cooldown:
                return False

            retries = max_retries if max_retries is not None else self._max_retries

            for attempt in range(retries):
                try:
                    self.ws = websocket.create_connection(
                        f"ws://{self.host}:{self.port}", timeout=2
                    )
                    # Handshake hello frame
                    hello = json.loads(self.ws.recv())
                    auth_info = hello.get("d", {}).get("authentication")

                    identify_payload = {
                        "op": 1,
                        "d": {"rpcVersion": 1, "eventSubscriptions": 33},
                    }

                    if auth_info:
                        if not self.password:
                            log.error(
                                "[ERROR] OBS WebSocket requires password, but none was provided."
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
                            f"[HAL] OBS WebSocket connected successfully on attempt {attempt + 1}."
                        )
                        return True
                    else:
                        log.error(f"[HAL] OBS WebSocket authentication failed: {resp}")
                        return False
                except Exception as e:
                    OBSClient._last_fail_time = time.time()
                    if not silent:
                        log.warning(
                            f"[HAL] Connection attempt {attempt + 1}/{retries} failed: {e}"
                        )
                    else:
                        log.debug(
                            f"[HAL] Silent check connection attempt {attempt + 1}/{retries} failed: {e}"
                        )
                    if self.ws:
                        try:
                            self.ws.close()
                        except Exception:
                            pass
                    if attempt < retries - 1:
                        time.sleep(self._backoff * (2**attempt))

            if not silent:
                log.error("[HAL] Exhausted all reconnection attempts to OBS Studio.")
            return False

    def send_request(self, request_type, request_data=None):
        """Send RPC command payload to OBS WebSocket and await response frame."""
        if not self._connected or not self.ws:
            log.warning(
                "[HAL] Connection inactive. Attempting reconnect before sending request..."
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
            log.error(f"[HAL] OBS RPC request error ({request_type}): {e}")
            self._connected = False
            return None

    def start_record(self):
        """Trigger StartRecord command in OBS Studio."""
        return self.send_request("StartRecord")

    def stop_record(self):
        """Trigger StopRecord command in OBS Studio."""
        return self.send_request("StopRecord")


_shared_obs_client = None
_client_lock = threading.Lock()


def get_default_obs_client() -> OBSClient:
    """Return shared thread-safe OBSClient instance."""
    global _shared_obs_client
    with _client_lock:
        if _shared_obs_client is None:
            _shared_obs_client = OBSClient()
        return _shared_obs_client
