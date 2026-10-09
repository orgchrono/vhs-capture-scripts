"""Module documentation pending."""

import logging
import sys
import os
import json
from datetime import datetime, timezone
from typing import List, Tuple
from logging.handlers import RotatingFileHandler


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

    def __init__(self, use_color=True):
        """Documentation for __init__."""
        super().__init__("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
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
    """Armazena logs em memoria para serem consumidos pela interface web do React."""

    def __init__(self, capacity: int = 1000) -> None:
        """Documentation for __init__."""
        super().__init__()
        self.capacity = capacity
        self.logs: List[str] = []
        self.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))

    def emit(self, record: logging.LogRecord) -> None:
        """Documentation for emit."""
        msg = self.format(record)
        self.logs.append(msg)
        if len(self.logs) > self.capacity:
            self.logs.pop(0)

    def get_logs(self) -> List[str]:
        """Documentation for get_logs."""
        return self.logs


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

    # 1. Console Handler (Colorido)
    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(ColoredFormatter())

    # 2. Memory Handler (Para a UI do React via WS ou Endpoint)
    mh = MemoryLogHandler()
    mh.setLevel(logging.INFO)

    # 3. File Handler Rotativo (JSONL Estruturado para Data Analytics)
    fh = RotatingFileHandler(
        "logs/runtime.jsonl", maxBytes=5 * 1024 * 1024, backupCount=5, encoding="utf-8"
    )
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(JsonFormatter())

    logger.addHandler(ch)
    logger.addHandler(mh)
    logger.addHandler(fh)
    return logger, mh


log, memory_handler = setup_logger()
