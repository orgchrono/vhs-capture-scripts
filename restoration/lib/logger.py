import logging
import sys
import os

class ColoredFormatter(logging.Formatter):
    """Formatter customizado para adicionar cores e melhorar a UX no terminal sem libs externas."""
    
    # ANSI Escape Codes para Windows 10+ e Unix
    COLORS = {
        'DEBUG': '\033[94m',      # Azul
        'INFO': '\033[92m',       # Verde
        'WARNING': '\033[93m',    # Amarelo
        'ERROR': '\033[91m',      # Vermelho
        'CRITICAL': '\033[91m\033[1m' # Vermelho Negrito
    }
    RESET = '\033[0m'
    
    def format(self, record):
        color = self.COLORS.get(record.levelname, self.RESET)
        # Formato de tag ex: [INFO], [WARNING]
        prefix = f"{color}[{record.levelname}]{self.RESET}"
        
        if record.levelname == 'INFO':
            # Info puro sem tag [INFO] para ficar mais limpo
            formatted_msg = f"{color}{record.getMessage()}{self.RESET}"
        else:
            formatted_msg = f"{prefix} {color}{record.getMessage()}{self.RESET}"
            
        return formatted_msg

def get_logger(name="VHSPipeline"):
    """
    Inicializa o logger unificado para toda a pipeline.
    Habilita suporte ANSI no Windows caso necessário.
    """
    # Habilitar cores no terminal Windows (CMD/PowerShell)
    if os.name == 'nt':
        os.system('color')
        
    logger = logging.getLogger(name)
    
    # Evitar handlers duplicados se chamado múltiplas vezes
    if not logger.handlers:
        logger.setLevel(logging.DEBUG)
        
        # Console Handler
        ch = logging.StreamHandler(sys.stdout)
        ch.setLevel(logging.INFO)
        formatter = ColoredFormatter()
        ch.setFormatter(formatter)
        logger.addHandler(ch)
        
        # File Handler (Opcional, salva um log limpo sem cores)
        # Aqui poderíamos adicionar um RotatingFileHandler para 'pipeline.log'
        
    return logger

# Instância global
log = get_logger()
