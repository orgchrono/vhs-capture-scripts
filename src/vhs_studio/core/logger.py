import logging
import sys
from typing import List


class ColoredFormatter(logging.Formatter):
    COLORS = {
        "WARNING": "\033[93m",
        "INFO": "\033[94m",
        "DEBUG": "\033[92m",
        "CRITICAL": "\033[91m",
        "ERROR": "\033[91m",
    }
    RESET = "\033[0m"

    def __init__(self, use_color=True):
        super().__init__("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
        self.use_color = use_color

    def format(self, record):
        log_message = super().format(record)
        if self.use_color and record.levelname in self.COLORS:
            log_message = f"{self.COLORS[record.levelname]}{log_message}{self.RESET}"
        return log_message


class MemoryLogHandler(logging.Handler):
    """Armazena logs em memoria para serem consumidos pela interface web do React."""

    def __init__(self, capacity=1000):
        super().__init__()
        self.capacity = capacity
        self.logs: List[str] = []
        self.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))

    def emit(self, record):
        msg = self.format(record)
        self.logs.append(msg)
        if len(self.logs) > self.capacity:
            self.logs.pop(0)

    def get_logs(self):
        return self.logs


def get_logger(name):
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.setLevel(logging.DEBUG)

        # Handler em Memoria para a UI (Sempre ativo)
        mem_handler = MemoryLogHandler()
        logger.addHandler(mem_handler)

        # File Handler
        try:
            fh = logging.FileHandler("vhs_studio.log", encoding="utf-8")
            fh.setLevel(logging.DEBUG)
            fh.setFormatter(logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s"))
            logger.addHandler(fh)
        except Exception:
            pass

        # Console Handler (Protegido de forma robusta contra Wrappers Nulos no Windowed Mode)
        try:
            if sys.stdout:
                ch = logging.StreamHandler(sys.stdout)
                ch.setLevel(logging.INFO)

                # Wrappers (ex: colorama) no pyinstaller windowed env podem ter o metodo isatty
                # mas lancam erro ao delegar para a stream base que eh None.
                use_color = False
                try:
                    if hasattr(sys.stdout, "isatty"):
                        use_color = sys.stdout.isatty()
                except Exception:
                    use_color = False

                ch.setFormatter(ColoredFormatter(use_color=use_color))
                logger.addHandler(ch)
        except Exception:
            pass

    return logger


log = get_logger("vhs_studio")
