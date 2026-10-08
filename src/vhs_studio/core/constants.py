"""
Central de constantes da aplicacao.
Evita 'Magic Numbers' e 'Magic Strings' espalhados pela base de codigo,
garantindo um Single Source of Truth (SSOT).
"""

# Servidor de API (Backend)
DEFAULT_API_HOST = "127.0.0.1"
DEFAULT_API_PORT = 8088

# OBS Studio
OBS_WEBSOCKET_HOST = "127.0.0.1"
OBS_WEBSOCKET_PORT = 4455

# Token de Seguranca Base
SESSION_TOKEN_LENGTH = 32
