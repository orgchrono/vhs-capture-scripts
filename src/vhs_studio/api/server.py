import os
import sys
import threading
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import secrets

from vhs_studio.core.logger import log
from vhs_studio.core.filter_builder import FilterBuilder
from vhs_studio.video.vapoursynth_qtgmc import VapourSynthQTGMC
from vhs_studio.api.process_manager import ProcessManager

# Session token for minimal security against CSRF if accessed via browser
SESSION_TOKEN = secrets.token_hex(16)
pm = ProcessManager()

app = FastAPI(title="VHS Studio API")

# Setup CORS to only allow localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8088", "http://localhost:8088"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DIST_DIR = os.path.join(REPO_ROOT, "ui", "dist")

@app.middleware("http")
async def verify_origin(request: Request, call_next):
    # Protect API routes
    if request.url.path.startswith("/api/"):
        host = request.headers.get("host", "")
        if not host.startswith("127.0.0.1") and not host.startswith("localhost"):
            return JSONResponse(status_code=403, content={"error": "Acesso negado."})
            
        if request.method == "POST":
            origin = request.headers.get("origin")
            if origin and not (origin.startswith("http://127.0.0.1") or origin.startswith("http://localhost")):
                return JSONResponse(status_code=403, content={"error": "Origem inválida."})
                
        token = request.headers.get("X-Session-Token")
        if token and token != SESSION_TOKEN:
            return JSONResponse(status_code=403, content={"error": "Token de sessão inválido."})
            
    response = await call_next(request)
    return response

@app.get("/api/token")
def get_token():
    return {"token": SESSION_TOKEN}

@app.get("/api/status")
def get_status():
    encoder = FilterBuilder.detect_best_encoder()
    vs_ok = VapourSynthQTGMC.is_available()

    raw_dir = os.path.join(REPO_ROOT, "media", "raw")
    os.makedirs(raw_dir, exist_ok=True)

    valid_exts = {".mkv", ".mp4", ".mov", ".avi", ".ts", ".m2ts"}
    raw_files = []
    for f in os.listdir(raw_dir):
        ext = os.path.splitext(f)[1].lower()
        if ext in valid_exts:
            full_p = os.path.join(raw_dir, f)
            size_mb = os.path.getsize(full_p) / (1024 * 1024)
            raw_files.append({"name": f, "path": full_p, "size_mb": round(size_mb, 1)})

    return {
        "encoder": encoder,
        "vapoursynth_available": vs_ok,
        "obs_connected": False, # TODO: integrate OBS client
        "raw_files": raw_files,
        "process_running": pm.is_running(),
        "process_logs": pm.get_logs()
    }

@app.post("/api/action")
async def perform_action(request: Request):
    data = await request.json()
    action = data.get("action")
    params = data.get("params", {})
    
    if action == "start_restore":
        if pm.is_running():
            return {"status": "error", "message": "Já existe um processo em andamento."}
            
        input_file = params.get("input")
        if not input_file or "media" not in input_file:
            return {"status": "error", "message": "Caminho de arquivo inválido ou inseguro."}
            
        cmd = [sys.executable, "-m", "vhs_studio", "restore", input_file]
        
        # Add boolean flags
        if params.get("denoise"): cmd.append("--denoise")
        if params.get("chroma_fix"): cmd.append("--chroma-fix")
        if params.get("comb_filter"): cmd.append("--comb-filter")
        if params.get("overscan_blanking"): cmd.append("--overscan-blanking")
        if params.get("audio_treatment"): cmd.append("--audio-treatment")
        
        if params.get("deinterlacer"): cmd.extend(["--deinterlacer", params["deinterlacer"]])
        if params.get("audio_mode"): cmd.extend(["--audio-mode", params["audio_mode"]])
        if params.get("output_codec"): cmd.extend(["--output-codec", params["output_codec"]])
        
        success, msg = pm.start_process(cmd)
        if success:
            return {"status": "ok", "message": "Restauração iniciada!"}
        else:
            return {"status": "error", "message": msg}
            
    elif action == "install_vapoursynth":
        if pm.is_running():
            return {"status": "error", "message": "Aguarde o processo atual terminar."}
            
        bin_dir = os.path.abspath(os.path.join(REPO_ROOT, "restoration", "bin"))
        if sys.platform == "win32":
            script = os.path.join(bin_dir, "setup_vapoursynth.ps1")
            cmd = ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script]
        else:
            script = os.path.join(bin_dir, "setup_vapoursynth.sh")
            cmd = ["bash", script]
            
        success, msg = pm.start_process(cmd)
        if success:
            return {"status": "ok", "message": "Instalação do VapourSynth iniciada!"}
        else:
            return {"status": "error", "message": msg}
            
    elif action == "stop_process":
        if pm.terminate():
            return {"status": "ok", "message": "Processo encerrado via API."}
        return {"status": "error", "message": "Nenhum processo rodando."}

    return {"status": "error", "message": "Ação desconhecida"}

# Mount frontend
if os.path.isdir(DIST_DIR):
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="static")
else:
    @app.get("/")
    def index():
        return {"error": "UI não buildada. Execute 'npm run build' na pasta ui/"}

def run_server(port=8088):
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
