import logging
import sys
import os
import json
from datetime import datetime

class ColoredFormatter(logging.Formatter):
    """Formatter customizado para adicionar cores e melhorar a UX no terminal sem libs externas."""
    
    COLORS = {
        'DEBUG': '\033[94m',
        'INFO': '\033[92m',
        'WARNING': '\033[93m',
        'ERROR': '\033[91m',
        'CRITICAL': '\033[91m\033[1m'
    }
    RESET = '\033[0m'
    
    def __init__(self, use_color=True):
        super().__init__()
        self.use_color = use_color

    def format(self, record):
        msg = record.getMessage()
        if not self.use_color:
            return f"[{record.levelname}] {msg}" if record.levelname != 'INFO' else msg

        color = self.COLORS.get(record.levelname, self.RESET)
        prefix = f"{color}[{record.levelname}]{self.RESET}"
        
        if record.levelname == 'INFO':
            return f"{color}{msg}{self.RESET}"
        return f"{prefix} {color}{msg}{self.RESET}"

class JsonlFormatter(logging.Formatter):
    """Gera logs estruturados em formato JSON Lines."""
    def format(self, record):
        log_obj = {
            "timestamp": datetime.fromtimestamp(record.created).isoformat() + "Z",
            "level": record.levelname,
            "message": record.getMessage()
        }
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_obj)

def get_logger(name="VHSPipeline"):
    if os.name == 'nt':
        os.system('color')
        
    logger = logging.getLogger(name)
    
    if not logger.handlers:
        logger.setLevel(logging.DEBUG)
        
        # Console Handler
        if sys.stdout is not None:
            ch = logging.StreamHandler(sys.stdout)
            ch.setLevel(logging.INFO)
            use_color = hasattr(sys.stdout, 'isatty') and sys.stdout.isatty()
            ch.setFormatter(ColoredFormatter(use_color=use_color))
            logger.addHandler(ch)
        
        # File Handler (JSONL)
        log_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "media", "work"))
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, "pipeline.jsonl")
        
        try:
            fh = logging.FileHandler(log_file, encoding='utf-8')
            fh.setLevel(logging.DEBUG)
            fh.setFormatter(JsonlFormatter())
            logger.addHandler(fh)
        except Exception:
            pass
        
    return logger

log = get_logger()
