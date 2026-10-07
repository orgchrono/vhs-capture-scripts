#!/usr/bin/env python3
"""
00_trim_black_sync.py - Shim de compatibilidade
Encaminha a execução para a nova implementação segura de neutralização TBC:
00_black_hold.py (TBC frame-hold, sem perda de sincronia labial).
O script original com cortes agressivos foi preservado em legado/00_trim_black_sync_legado.py.
"""

import sys
import os
import subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TARGET_SCRIPT = os.path.join(SCRIPT_DIR, "00_black_hold.py")

print("[AVISO] 00_trim_black_sync.py foi substituído por 00_black_hold.py (TBC Frame-Hold).", file=sys.stderr)
print("[AVISO] Executando com preservação 100% contínua de sincronia de áudio...", file=sys.stderr)

cmd = [sys.executable, TARGET_SCRIPT] + sys.argv[1:]
res = subprocess.run(cmd)
sys.exit(res.returncode)
