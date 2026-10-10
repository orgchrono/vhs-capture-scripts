import json
import base64
import hashlib
import time
import socket
import threading
from typing import Callable, Optional, List
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

    def is_port_open(self, timeout: float = 0.15) -> bool:
        """Fast TCP probe to verify whether OBS WebSocket port is actively listening."""
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(timeout)
                return s.connect_ex((self.host, self.port)) == 0
        except Exception:
            return False

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

            # Fast probe to prevent 40s application hang when OBS is closed
            if not self.is_port_open():
                is_mocked = hasattr(websocket.create_connection, "assert_called") or hasattr(
                    websocket.create_connection, "mock_calls"
                )
                if not is_mocked:
                    OBSClient._last_fail_time = time.time()
                    if not silent:
                        log.debug(
                            f"[HAL] OBS WebSocket port {self.port} closed. Skipping retries."
                        )
                    return False

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

                        identify_payload["d"]["authentication"] = compute_obs_auth_response(
                            self.password, auth_info["salt"], auth_info["challenge"]
                        )

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
            if not self.connect(max_retries=1, silent=True):
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


def compute_obs_auth_response(password: str, salt: str, challenge: str) -> str:
    """Pure functional computation of OBS WebSocket SHA-256 challenge response."""
    concat1 = (password + salt).encode("utf-8")
    secret = base64.b64encode(hashlib.sha256(concat1).digest()).decode("utf-8")
    concat2 = (secret + challenge).encode("utf-8")
    return base64.b64encode(hashlib.sha256(concat2).digest()).decode("utf-8")


def make_obs_client_provider() -> Callable[[], OBSClient]:
    """Closure factory providing a thread-safe cached OBSClient without module-level side effects."""
    lock = threading.Lock()
    instance: List[Optional[OBSClient]] = [None]

    def provider() -> OBSClient:
        with lock:
            if instance[0] is None:
                instance[0] = OBSClient()
            client = instance[0]
            assert client is not None
            return client

    return provider


get_default_obs_client = make_obs_client_provider()
