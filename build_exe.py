import os
import subprocess
import shutil

print("=== Compilando VHS Studio Pro ===")

# 1. Garante que a UI esteja buildada (com a hash correta)
print("[1] Compilando UI (Vite)...")
subprocess.run("npm run build", cwd="ui", shell=True, check=True)

# 2. Comando PyInstaller
# Precisamos esconder o console (--windowed / --noconsole)
# Definir o ícone (-i vhs_icon.ico)
# Adicionar a UI Dist (--add-data "ui/dist;ui/dist")
# Hidden imports cruciais para uvicorn, websockets, whisper e google api

cmd = [
    "pyinstaller",
    "--noconfirm",
    "--onefile",
    "--windowed",
    "--name", "VHS_Studio_Pro",
    "--icon", "vhs_icon.ico",
    "--add-data", "ui/dist;ui/dist",
    "--hidden-import", "uvicorn.logging",
    "--hidden-import", "uvicorn.loops",
    "--hidden-import", "uvicorn.loops.auto",
    "--hidden-import", "uvicorn.protocols",
    "--hidden-import", "uvicorn.protocols.http",
    "--hidden-import", "uvicorn.protocols.http.auto",
    "--hidden-import", "uvicorn.protocols.websockets",
    "--hidden-import", "uvicorn.protocols.websockets.auto",
    "--hidden-import", "uvicorn.lifespan",
    "--hidden-import", "uvicorn.lifespan.on",
    "--hidden-import", "googleapiclient",
    "--hidden-import", "keyring",
    "--hidden-import", "faster_whisper",
    "--hidden-import", "scenedetect",
    "src/vhs_studio/__main__.py"
]

print("[2] Empacotando Monólito (Isso pode demorar alguns minutos)...")
subprocess.run(cmd, check=True)

print("\n=== SUCESSO! ===")
print("O executável VHS_Studio_Pro.exe foi gerado na pasta 'dist/'.")