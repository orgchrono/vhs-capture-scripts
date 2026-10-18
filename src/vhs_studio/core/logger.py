"""Module documentation pending."""

import logging
import sys
import os
import json
from datetime import datetime, timezone
from typing import List, Tuple
from logging.handlers import RotatingFileHandler


def _enable_vt100_windows() -> None:
    """Enable VT100 ANSI processing on Windows console host if available."""
    if sys.platform == "win32":
        try:
            import ctypes
            windll = getattr(ctypes, "windll", None)
            if windll is not None:
                kernel32 = windll.kernel32
                handle = kernel32.GetStdHandle(-11)  # STD_OUTPUT_HANDLE
                mode = ctypes.c_ulong()
                if kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
                    kernel32.SetConsoleMode(handle, mode.value | 0x0004)  # ENABLE_VIRTUAL_TERMINAL_PROCESSING
        except Exception:
            pass


_enable_vt100_windows()


class ColoredFormatter(logging.Formatter):
    """Documentation for ColoredFormatter."""

    COLORS = {
        "WARNING": "\033[93m",
        "INFO": "\033[94m",
        "DEBUG": "\033[92m",
        "CRITICAL": "\033[91m",
        "ERROR": "\033[91m",
    }
    RESET = "\033[0m"

    def __init__(self, use_color=None):
        """Documentation for __init__."""
        super().__init__("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
        if use_color is None:
            self.use_color = hasattr(sys.stdout, "isatty") and sys.stdout.isatty()
        else:
            self.use_color = use_color

    def format(self, record):
        """Documentation for format."""
        log_message = super().format(record)
        if self.use_color and record.levelname in self.COLORS:
            log_message = f"{self.COLORS[record.levelname]}{log_message}{self.RESET}"
        return log_message


class JsonFormatter(logging.Formatter):
    """Format logs as structured JSON lines for easy parsing and analytics."""

    def format(self, record):
        log_record = {
            "time": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "name": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "funcName": record.funcName,
            "lineNo": record.lineno,
        }
        if record.exc_info:
            log_record["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_record)


class MemoryLogHandler(logging.Handler):
    """Stores logs in memory buffer to be streamed to the React UI."""

    def __init__(self, capacity: int = 1000) -> None:
        """Initialize memory log buffer with bounded capacity."""
        super().__init__()
        self.capacity = capacity
        self.logs: List[str] = []
        self.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))

    def emit(self, record: logging.LogRecord) -> None:
        """Append log record to memory buffer, dropping oldest entries upon reaching capacity."""
        msg = self.format(record)
        self.logs.append(msg)
        if len(self.logs) > self.capacity:
            self.logs.pop(0)

    def get_logs(self) -> List[str]:
        """Return snapshot of memory logs."""
        return self.logs


class SafeRotatingFileHandler(RotatingFileHandler):
    """Multi-process Windows-safe rotating file handler.

    Prevents PermissionError [WinError 32] during log rotation on Windows when
    another concurrent process or thread has the file descriptor open.
    """

    def doRollover(self) -> None:
        try:
            super().doRollover()
        except (PermissionError, OSError):
            # On Windows, os.rename fails if another process (e.g. API server or child) has the file open.
            # Close and reopen the stream cleanly without failing the emit.
            if self.stream:
                try:
                    self.stream.close()
                except Exception:
                    pass
                self.stream = None
            try:
                self.stream = self._open()
            except Exception:
                pass


def setup_logger() -> Tuple[logging.Logger, MemoryLogHandler]:
    os.makedirs("logs", exist_ok=True)

    logger = logging.getLogger("vhs_studio")
    logger.setLevel(logging.DEBUG)
    logger.propagate = False

    if logger.handlers:
        for h in logger.handlers:
            if isinstance(h, MemoryLogHandler):
                return logger, h
        mh = MemoryLogHandler()
        logger.addHandler(mh)
        return logger, mh

    # 1. Console Handler (Colorized)
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(ColoredFormatter())

    # 2. Memory Handler (For React UI via SSE/WebSocket)
    mh = MemoryLogHandler()
    mh.setLevel(logging.INFO)

    # 3. Safe Rotating File Handler (Structured JSONL for Data Analytics)
    fh = SafeRotatingFileHandler(
        "logs/runtime.jsonl", maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(JsonFormatter())

    logger.addHandler(ch)
    logger.addHandler(mh)
    logger.addHandler(fh)
    return logger, mh


log, memory_handler = setup_logger()
