#!/usr/bin/env python3
"""
assistant.py - Assistente Interativo Visual (Web & CLI) para o Pipeline VHS Studio
Fornece interface intuitiva para seleção de arquivos, presets padrão ouro, ajuste de hardware
e disparo do motor de restauração com logs em tempo real.
"""

import os
import sys
import json
import subprocess
import threading
import time
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.parse

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RESTORATION_DIR = os.path.join(REPO_ROOT, "restoration")
LIB_DIR = os.path.join(RESTORATION_DIR, "lib")
if RESTORATION_DIR not in sys.path:
    sys.path.insert(0, RESTORATION_DIR)
if LIB_DIR not in sys.path:
    sys.path.insert(0, LIB_DIR)

from lib.logger import log
from lib.filter_builder import FilterBuilder
from lib.vapoursynth_qtgmc import VapourSynthQTGMC

active_process = None
process_logs = []
process_lock = threading.Lock()

def get_system_status():
    """Coleta telemetria de hardware e suporte de encoders."""
    encoder = FilterBuilder.detect_best_encoder()
    vs_ok = VapourSynthQTGMC.is_available()
    
    # Lista arquivos em media/raw
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
        "raw_files": raw_files
    }

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VHS Studio - Assistente de Restauração</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #0b0f17;
            --surface: #121824;
            --surface-card: rgba(22, 30, 46, 0.7);
            --border: rgba(255, 255, 255, 0.08);
            --border-hover: rgba(56, 189, 248, 0.3);
            --primary: #38bdf8;
            --primary-glow: rgba(56, 189, 248, 0.25);
            --accent: #818cf8;
            --success: #34d399;
            --warning: #fbbf24;
            --danger: #f87171;
            --text-main: #f1f5f9;
            --text-muted: #94a3b8;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Outfit', sans-serif;
        }

        body {
            background-color: var(--bg);
            color: var(--text-main);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            overflow-x: hidden;
            background-image: 
                radial-gradient(circle at 15% 15%, rgba(56, 189, 248, 0.08) 0%, transparent 40%),
                radial-gradient(circle at 85% 85%, rgba(129, 140, 248, 0.08) 0%, transparent 40%);
        }

        header {
            padding: 1.5rem 2.5rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid var(--border);
            backdrop-filter: blur(12px);
            background: rgba(11, 15, 23, 0.8);
            position: sticky;
            top: 0;
            z-index: 100;
        }

        .logo-area {
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        .badge-vhs {
            background: linear-gradient(135deg, #ef4444, #f97316);
            color: #fff;
            font-weight: 700;
            font-size: 0.8rem;
            padding: 0.25rem 0.6rem;
            border-radius: 6px;
            letter-spacing: 1px;
            text-transform: uppercase;
        }

        h1 {
            font-size: 1.5rem;
            font-weight: 700;
            letter-spacing: -0.5px;
            background: linear-gradient(to right, #fff, var(--text-muted));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .system-telemetry {
            display: flex;
            gap: 1rem;
            align-items: center;
        }

        .telemetry-pill {
            font-size: 0.85rem;
            padding: 0.4rem 0.8rem;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid var(--border);
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .dot-green {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--success);
            box-shadow: 0 0 8px var(--success);
        }

        main {
            max-width: 1200px;
            width: 100%;
            margin: 2rem auto;
            padding: 0 1.5rem;
            display: grid;
            grid-template-columns: 1.3fr 0.9fr;
            gap: 2rem;
        }

        .card {
            background: var(--surface-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 1.75rem;
            backdrop-filter: blur(16px);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
            margin-bottom: 1.5rem;
        }

        .card-title {
            font-size: 1.15rem;
            font-weight: 600;
            margin-bottom: 1.25rem;
            display: flex;
            align-items: center;
            gap: 0.6rem;
            color: var(--primary);
        }

        .form-group {
            margin-bottom: 1.25rem;
        }

        label {
            display: block;
            font-size: 0.85rem;
            font-weight: 500;
            color: var(--text-muted);
            margin-bottom: 0.5rem;
        }

        select, input[type="text"], input[type="number"] {
            width: 100%;
            padding: 0.75rem 1rem;
            background: rgba(11, 15, 23, 0.7);
            border: 1px solid var(--border);
            border-radius: 10px;
            color: var(--text-main);
            font-size: 0.95rem;
            outline: none;
            transition: all 0.2s ease;
        }

        select:focus, input:focus {
            border-color: var(--primary);
            box-shadow: 0 0 0 3px var(--primary-glow);
        }

        .presets-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0.75rem;
            margin-bottom: 1.5rem;
        }

        .preset-btn {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 1rem;
            text-align: left;
            cursor: pointer;
            transition: all 0.2s ease;
            position: relative;
        }

        .preset-btn:hover {
            border-color: var(--primary);
            transform: translateY(-2px);
            background: rgba(56, 189, 248, 0.05);
        }

        .preset-btn.active {
            border-color: var(--primary);
            background: rgba(56, 189, 248, 0.1);
            box-shadow: 0 0 16px rgba(56, 189, 248, 0.15);
        }

        .preset-name {
            font-weight: 600;
            font-size: 0.95rem;
            margin-bottom: 0.25rem;
            color: #fff;
        }

        .preset-desc {
            font-size: 0.75rem;
            color: var(--text-muted);
            line-height: 1.3;
        }

        .grid-2col {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
        }

        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 0.6rem;
            margin-top: 0.5rem;
            cursor: pointer;
        }

        .checkbox-group input {
            cursor: pointer;
            width: 18px;
            height: 18px;
            accent-color: var(--primary);
        }

        .btn-run {
            width: 100%;
            padding: 1rem;
            border-radius: 12px;
            border: none;
            background: linear-gradient(135deg, #0284c7, #38bdf8);
            color: #0b0f17;
            font-weight: 700;
            font-size: 1.05rem;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 4px 20px rgba(56, 189, 248, 0.35);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.6rem;
        }

        .btn-run:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 24px rgba(56, 189, 248, 0.5);
            filter: brightness(1.1);
        }

        .btn-run:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }

        .console-card {
            display: flex;
            flex-direction: column;
            height: calc(100vh - 180px);
            position: sticky;
            top: 5.5rem;
        }

        .console-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
        }

        .terminal {
            flex: 1;
            background: #06090e;
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 1rem;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.8rem;
            line-height: 1.5;
            overflow-y: auto;
            color: #e2e8f0;
            white-space: pre-wrap;
            word-break: break-all;
        }

        .log-info { color: #34d399; }
        .log-warn { color: #fbbf24; }
        .log-error { color: #f87171; }
        .log-muted { color: #64748b; }

        @media(max-width: 900px) {
            main { grid-template-columns: 1fr; }
            .console-card { height: 400px; position: static; }
        }
    </style>
</head>
<body>

    <header>
        <div class="logo-area">
            <span class="badge-vhs">VHS Studio</span>
            <h1>Assistente de Restauração</h1>
        </div>
        <div class="system-telemetry">
            <div class="telemetry-pill">
                <span class="dot-green"></span>
                <span>Encoder: <strong id="encoder-badge">Detectando...</strong></span>
            </div>
            <div class="telemetry-pill">
                <span class="dot-green"></span>
                <span>QTGMC: <strong id="qtgmc-badge">Detectando...</strong></span>
                <button id="btn-install-qtgmc" onclick="installQtgmc()" style="display:none; margin-left: 0.5rem; font-size: 0.75rem; background: rgba(56, 189, 248, 0.2); border: 1px solid var(--primary); color: #fff; padding: 0.2rem 0.5rem; border-radius: 6px; cursor: pointer;">Instalar QTGMC</button>
            </div>
        </div>
    </header>

    <main>
        <div class="controls-col">
            <div class="card">
                <div class="card-title">⚡ Presets Rápidos de Preservação</div>
                <div class="presets-grid">
                    <div class="preset-btn active" onclick="applyPreset('gold')">
                        <div class="preset-name">🏆 Padrão Ouro (EH55 + QTGMC)</div>
                        <div class="preset-desc">DMR-EH55 Passthrough, QTGMC duplo 60p, áudio intacto bit-perfect.</div>
                    </div>
                    <div class="preset-btn" onclick="applyPreset('speed')">
                        <div class="preset-name">⚡ Ultra Rápido (QSV + BWDIF)</div>
                        <div class="preset-desc">Aceleração Intel/NVIDIA pura, BWDIF 60p, 500+ FPS em tempo real.</div>
                    </div>
                    <div class="preset-btn" onclick="applyPreset('tbc_hold')">
                        <div class="preset-name">🛡️ Restauração TBC Frame-Hold</div>
                        <div class="preset-desc">Congela glitches pretos, áudio contínuo sem cortes, ZNEDI3 neural.</div>
                    </div>
                    <div class="preset-btn" onclick="applyPreset('ai_master')">
                        <div class="preset-name">🤖 AI Master (Real-ESRGAN)</div>
                        <div class="preset-desc">Upscaling neural Vulkan, Denoise espacial e alinhamento de croma.</div>
                    </div>
                </div>

                <div class="card-title">📁 Arquivo de Entrada</div>
                <div class="form-group">
                    <label>Arquivo Capturado (em media/raw/):</label>
                    <select id="input_file">
                        <option value="">Carregando arquivos...</option>
                    </select>
                </div>

                <div class="card-title">⚙️ Parâmetros Técnicos</div>
                <div class="grid-2col">
                    <div class="form-group">
                        <label>Desentrelaçamento:</label>
                        <select id="deinterlacer">
                            <option value="auto">Auto (Detecta 60p ou entrelaçado)</option>
                            <option value="bwdif">BWDIF (Double-Rate 60p Ultra-Rápido)</option>
                            <option value="znedi3">ZNEDI3 / NNEDI (Rede Neural Intra-Campo)</option>
                            <option value="qtgmc">QTGMC (VapourSynth Padrão Ouro)</option>
                            <option value="none">Nenhum (Manter Entrelaçado)</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Modo de Pretos / TBC:</label>
                        <select id="mode">
                            <option value="freeze">TBC Frame-Hold (Congela pretos, sync perfeito)</option>
                            <option value="passthrough">Passthrough Puro (Sem filtro de pretos, EH55)</option>
                            <option value="drop">Descarte Direto (Acelera vídeo)</option>
                        </select>
                    </div>
                </div>

                <div class="grid-2col">
                    <div class="form-group">
                        <label>Política de Áudio:</label>
                        <select id="audio_mode">
                            <option value="auto">Auto (Verifica silêncio no canal R)</option>
                            <option value="stereo">Estéreo Normal</option>
                            <option value="mono_l">Mono Esquerdo (Câmera JVC L->R)</option>
                            <option value="mono_r">Mono Direito</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Resolução de Saída:</label>
                        <select id="resolution">
                            <option value="1080p">Upscale Lanczos 1080p (Pilar 4:3)</option>
                            <option value="original">Original 480p / 576p</option>
                        </select>
                    </div>
                </div>

                <div class="grid-2col">
                    <div class="form-group">
                        <label>Qualidade CRF (Menor = Maior Qualidade):</label>
                        <input type="number" id="crf" value="20" min="14" max="30">
                    </div>
                    <div class="form-group">
                        <label>Ajuste Fino de Sincronia de Áudio (segundos):</label>
                        <input type="number" id="audio_offset" value="0.0" step="0.05">
                    </div>
                </div>

                <div class="form-group">
                    <label>Filtros Especiais:</label>
                    <label class="checkbox-group">
                        <input type="checkbox" id="chroma_fix">
                        <span>Correção de Alinhamento de Croma (Chroma Shift VHS)</span>
                    </label>
                    <label class="checkbox-group">
                        <input type="checkbox" id="denoise">
                        <span>Redução de Ruído Temporal e Espacial (hqdn3d)</span>
                    </label>
                </div>

                <button class="btn-run" id="btn-start" onclick="startRestoration()">
                    <span>🚀 Iniciar Restauração Direta</span>
                </button>
            </div>
        </div>

        <div class="console-col">
            <div class="card console-card">
                <div class="console-header">
                    <div class="card-title" style="margin-bottom: 0;">📟 Console de Execução</div>
                    <span id="proc-status" class="telemetry-pill" style="font-size: 0.75rem;">Aguardando início</span>
                </div>
                <div class="terminal" id="terminal-output">VHS Studio Ready. Escolha um arquivo e clique em Iniciar.</div>
            </div>
        </div>
    </main>

    <script>
        let isRunning = false;

        async function fetchStatus() {
            try {
                const res = await fetch('/api/status');
                const data = await res.json();
                
                document.getElementById('encoder-badge').textContent = data.encoder.toUpperCase();
                document.getElementById('qtgmc-badge').textContent = data.vapoursynth_available ? 'Disponível' : 'FFmpeg Fallback';
                
                const select = document.getElementById('input_file');
                const prevVal = select.value;
                select.innerHTML = '';
                
                if (data.raw_files.length === 0) {
                    select.innerHTML = '<option value="">Nenhum vídeo em media/raw/ (Coloque um arquivo lá)</option>';
                } else {
                    data.raw_files.forEach(f => {
                        const opt = document.createElement('option');
                        opt.value = f.path;
                        opt.textContent = `${f.name} (${f.size_mb} MB)`;
                        select.appendChild(opt);
                    });
                    if (prevVal) select.value = prevVal;
                }
            } catch(e) {
                console.error(e);
            }
        }

        function applyPreset(name) {
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            event.currentTarget.classList.add('active');

            if (name === 'gold') {
                document.getElementById('deinterlacer').value = 'qtgmc';
                document.getElementById('mode').value = 'passthrough';
                document.getElementById('audio_mode').value = 'auto';
                document.getElementById('resolution').value = '1080p';
                document.getElementById('chroma_fix').checked = true;
                document.getElementById('denoise').checked = false;
            } else if (name === 'speed') {
                document.getElementById('deinterlacer').value = 'bwdif';
                document.getElementById('mode').value = 'passthrough';
                document.getElementById('audio_mode').value = 'auto';
                document.getElementById('resolution').value = '1080p';
                document.getElementById('chroma_fix').checked = false;
                document.getElementById('denoise').checked = false;
            } else if (name === 'tbc_hold') {
                document.getElementById('deinterlacer').value = 'znedi3';
                document.getElementById('mode').value = 'freeze';
                document.getElementById('audio_mode').value = 'mono_l';
                document.getElementById('resolution').value = '1080p';
                document.getElementById('chroma_fix').checked = true;
                document.getElementById('denoise').checked = true;
            } else if (name === 'ai_master') {
                document.getElementById('deinterlacer').value = 'bwdif';
                document.getElementById('mode').value = 'freeze';
                document.getElementById('audio_mode').value = 'auto';
                document.getElementById('resolution').value = '1080p';
                document.getElementById('chroma_fix').checked = true;
                document.getElementById('denoise').checked = true;
            }
        }

        async function startRestoration() {
            const inputPath = document.getElementById('input_file').value;
            if (!inputPath) {
                alert('Selecione um arquivo de entrada válido!');
                return;
            }

            const payload = {
                input: inputPath,
                deinterlacer: document.getElementById('deinterlacer').value,
                mode: document.getElementById('mode').value,
                audio_mode: document.getElementById('audio_mode').value,
                no_1080p: document.getElementById('resolution').value === 'original',
                crf: parseInt(document.getElementById('crf').value),
                audio_offset: parseFloat(document.getElementById('audio_offset').value),
                chroma_fix: document.getElementById('chroma_fix').checked,
                denoise: document.getElementById('denoise').checked
            };

            document.getElementById('btn-start').disabled = true;
            document.getElementById('proc-status').textContent = 'Processando...';

            const res = await fetch('/api/run', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.status === 'started') {
                isRunning = true;
                pollLogs();
            } else {
                alert(data.message || 'Erro ao iniciar');
                document.getElementById('btn-start').disabled = false;
            }
        }

        async function pollLogs() {
            if (!isRunning) return;
            const res = await fetch('/api/logs');
            const data = await res.json();
            
            const term = document.getElementById('terminal-output');
            term.textContent = data.logs.join('\\n');
            term.scrollTop = term.scrollHeight;

            if (data.active) {
                setTimeout(pollLogs, 1000);
            } else {
                isRunning = false;
                document.getElementById('btn-start').disabled = false;
                document.getElementById('proc-status').textContent = 'Concluído';
            }
        }

        fetchStatus();
        setInterval(fetchStatus, 5000);
    </script>
</body>
</html>
"""

class AssistantServer(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/" or parsed.path == "/index.html":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(HTML_TEMPLATE.encode("utf-8"))
        elif parsed.path == "/api/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(get_system_status()).encode("utf-8"))
        elif parsed.path == "/api/logs":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            with process_lock:
                active = active_process is not None and active_process.poll() is None
                logs = list(process_logs)
            self.wfile.write(json.dumps({"active": active, "logs": logs}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/run":
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            params = json.loads(body.decode("utf-8"))

            global active_process, process_logs
            with process_lock:
                if active_process is not None and active_process.poll() is None:
                    self.send_response(400)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "error", "message": "Já existe uma restauração em andamento!"}).encode("utf-8"))
                    return

                process_logs.clear()
                cmd = [
                    sys.executable,
                    os.path.join(RESTORATION_DIR, "direct_restore.py"),
                    params["input"],
                    "--deinterlacer", params.get("deinterlacer", "auto"),
                    "--mode", params.get("mode", "freeze"),
                    "--audio-mode", params.get("audio_mode", "auto"),
                    "--crf", str(params.get("crf", 20)),
                    "--audio-offset", str(params.get("audio_offset", 0.0))
                ]
                if params.get("no_1080p"):
                    cmd.append("--no-1080p")
                if params.get("chroma_fix"):
                    cmd.append("--chroma-fix")
                if params.get("denoise"):
                    cmd.append("--denoise")

                active_process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1
                )

                def reader_thread(proc):
                    for line in iter(proc.stdout.readline, ''):
                        if line:
                            with process_lock:
                                process_logs.append(line.rstrip())
                    proc.stdout.close()
                    proc.wait()

                t = threading.Thread(target=reader_thread, args=(active_process,), daemon=True)
                t.start()

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "started"}).encode("utf-8"))

def start_server(port=8088):
    server = HTTPServer(("127.0.0.1", port), AssistantServer)
    url = f"http://127.0.0.1:{port}"
    log.info(f"[ASSISTENTE] Servidor Web ativo em: {url}")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("[ASSISTENTE] Encerrando servidor.")
        server.server_close()

if __name__ == "__main__":
    start_server()
