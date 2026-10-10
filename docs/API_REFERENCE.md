# 🔌 Referência Completa da API REST & SSE - VHS Studio Pro

O backend do VHS Studio Pro expõe uma API RESTful de alta velocidade aliada a Server-Sent Events (SSE) para comunicação em tempo real com o cliente desktop e integrações externas.

Por padrão, a API escuta no endereço:
`http://127.0.0.1:8088`

---

## 1. Segurança e Autenticação

### 1.1 Restrição de Origem e Host
Todas as requisições direcionadas para `/api/*` passam pelo middleware de segurança [`verify_origin`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/src/vhs_studio/api/routers/security.py#L35-L54):
- O cabeçalho `Host` deve obrigatoriamente iniciar com `127.0.0.1`, `localhost` ou `testserver`.
- Requisições do tipo `POST` validam a origem no cabeçalho `Origin`.
- Violações retornam `HTTP 403 Forbidden` (`{"error": "Access denied."}` ou `{"error": "Invalid origin."}`).

### 1.2 Session Token (Mitigação CSRF)
Em cada inicialização do backend, um token de sessão criptográfico de 32 caracteres hexadecimais é gerado (`SESSION_TOKEN` via `secrets.token_hex(16)`).
- **Endpoint:** `GET /api/token`
- **Cabeçalho Requerido em POST/Mutações:** `X-Session-Token: <token>`
- Requisições POST com token inválido retornam `HTTP 403 Forbidden` (`{"error": "Invalid session token."}`).

### 1.3 Validação de Caminhos Seguros (CWE-22)
Todos os endpoints que recebem caminhos de arquivos para restauração ou enfileiramento (`/api/run`, `/api/action`, `/api/queue/enqueue`) invocam [`is_safe_media_path`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/src/vhs_studio/api/routers/security.py#L16-L32):
- Rejeita bytes nulos (`\0`), sequências de traversal (`..`), caminhos absolutos fora de `MEDIA_DIR`.
- Tentativas de traversal retornam `HTTP 400 Bad Request` (`{"status": "error", "message": "Invalid or insecure file path."}`).

---

## 2. Endpoints do Sistema (`routers/system.py`)

### `GET /api/token`
Retorna o token ativo da sessão para o frontend.
- **Resposta (HTTP 200):**
  ```json
  {
    "token": "8a3e7b1c4d9f0e2a5c6b8d7e1f3a5c7b"
  }
  ```

### `GET /api/status`
Retorna o status abrangente de saúde do sistema, encoders detectados, presença do VapourSynth, conectividade OBS, arquivos brutos na pasta de mídia e telemetria básica.
- **Resposta (HTTP 200):**
  ```json
  {
    "encoder": "h264_nvenc",
    "vapoursynth_available": true,
    "obs_connected": true,
    "raw_files": [
      {
        "name": "tape_01.mkv",
        "path": "C:\\...\\media\\raw\\tape_01.mkv",
        "size_mb": 4250.4
      }
    ],
    "process_running": false,
    "process_logs": [],
    "hardware": {
      "tier": 2,
      "tier_name": "Multi-Core CPU + iGPU Vulkan",
      "tier_color": "amber",
      "recommendation": "Ideal para restauração com BWDIF/Lanczos...",
      "cpu": { "cores": 12, "arch": "AMD64", "model": "AMD Ryzen 5" },
      "ram": { "total_gb": 16.0, "available_gb": 10.2 },
      "gpu": { "type": "dedicated", "name": "NVIDIA GeForce RTX 3060", "vulkan_available": true, "vram_gb": 12.0 },
      "ai_capabilities": {
        "audio_deepfilter": { "name": "Restauração de Áudio Neural", "supported": true, "badge": "⚡ Tempo Real (CPU)", "cost": "low", "desc": "..." }
      }
    }
  }
  ```

### `GET /api/hardware`
Retorna o diagnóstico profundo do hospedeiro pelo HAL com classificação em tiers (1 a 4) e capacidades neurais suportadas.
- **Resposta (HTTP 200):**
  ```json
  {
    "tier": 2,
    "tier_name": "Multi-Core CPU + iGPU Vulkan",
    "tier_color": "amber",
    "recommendation": "...",
    "cpu": { "cores": 12, "arch": "AMD64", "model": "..." },
    "ram": { "total_gb": 16.0, "available_gb": 10.2 },
    "gpu": { "type": "dedicated", "name": "...", "vulkan_available": true, "vram_gb": 12.0 },
    "ai_capabilities": { ... }
  }
  ```

### `GET /api/logs`
Retorna os logs acumulados em memória pelo ProcessManager para consulta pelo RTK Query.
- **Resposta (HTTP 200):**
  ```json
  {
    "active": false,
    "logs": [
      "[RESTAURAÇÃO] Iniciando pipeline...",
      "[FFMPEG] frame=  120 fps= 59.9 q=18.0 ..."
    ]
  }
  ```

### `GET /api/logs/stream`
Endpoint Server-Sent Events (SSE) com mime type `text/event-stream`. Transmite cada linha de log emitida pelos processos com latência inferior a 200ms.
- **Formato das mensagens:**
  ```text
  data: {"connected": true, "active": true}

  data: {"line": "frame= 3120 fps= 59.9 q=18.0 ...", "active": true}

  data: {"active": false}
  ```

---

## 3. Fila Persistente de Processamento (`routers/queue.py`)

### `GET /api/queue`
Retorna a lista completa de jobs e as estatísticas da fila SQLite.
- **Resposta (HTTP 200):**
  ```json
  {
    "jobs": [
      {
        "id": 1,
        "raw_path": "media/raw/tape_01.mkv",
        "params": { "deinterlacer": "bwdif" },
        "status": "pending",
        "priority": 5,
        "created_at": "2026-10-09 20:00:00"
      }
    ],
    "stats": { "total": 1, "pending": 1, "processing": 0, "completed": 0, "failed": 0 },
    "worker_running": false
  }
  ```

### `POST /api/queue/enqueue`
Enfileira uma nova mídia para processamento sequencial.
- **Payload Schema (`QueueEnqueuePayload`):**
  ```json
  {
    "input": "media/raw/tape_01.mkv",
    "params": {
      "deinterlacer": "qtgmc",
      "crf": 18,
      "audio_mode": "stereo"
    },
    "priority": 5
  }
  ```
- **Resposta (HTTP 200):**
  ```json
  {
    "status": "ok",
    "job_id": 1,
    "message": "Job #1 enqueued."
  }
  ```

### `POST /api/queue/cancel/{job_id}`
Cancela um job pendente na fila.
- **Resposta (HTTP 200):**
  ```json
  {
    "status": "ok",
    "message": "Job #1 cancelled."
  }
  ```

### `POST /api/queue/start`
Inicia o worker em segundo plano que consome os jobs pendentes da fila SQLite por ordem de prioridade (FIFO).
- **Resposta (HTTP 200):** `{"status": "ok", "message": "Queue worker started."}`

### `POST /api/queue/stop`
Pausa o worker em segundo plano após o término do job ativo.
- **Resposta (HTTP 200):** `{"status": "ok", "message": "Queue worker stopped."}`

---

## 4. Integração OBS Studio WebSocket (`routers/obs.py`)

### `GET /api/obs/stats`
Retorna telemetria ao vivo da gravação analógica no OBS Studio.
- **Resposta (HTTP 200):**
  ```json
  {
    "connected": true,
    "recording": true,
    "timecode": "00:15:32",
    "duration_sec": 932.0,
    "bytes": 524288000,
    "bitrate_kbps": 18500.2,
    "fps": 59.94,
    "cpu_usage": 8.5,
    "memory_mb": 210.4
  }
  ```

### `POST /api/obs/start`
Dispara a gravação no OBS Studio via WebSocket v5.
- **Resposta (HTTP 200):** `{"status": "ok", "message": "Recording started."}`

### `POST /api/obs/stop`
Finaliza a gravação no OBS Studio e retorna o caminho do arquivo gerado no disco.
- **Resposta (HTTP 200):**
  ```json
  {
    "status": "ok",
    "message": "Recording stopped.",
    "path": "C:\\...\\media\\raw\\tape_capture_001.mkv"
  }
  ```

### `POST /api/obs/virtualcam`
Liga ou desliga a saída de Câmera Virtual do OBS Studio.
- **Payload Schema (`ObsVirtualCamPayload`):**
  ```json
  {
    "enable": true
  }
  ```
- **Resposta (HTTP 200):** `{"status": "ok", "message": "Virtual camera set to True."}`

---

## 5. Orquestração e Restauração (`routers/restoration.py`)

### `POST /api/run`
Dispara a execução imediata da pipeline de restauração DAG para o arquivo selecionado.
- **Payload:**
  ```json
  {
    "input": "media/raw/tape_01.mkv",
    "deinterlacer": "bwdif",
    "mode": "double",
    "crf": 18,
    "output_codec": "h264",
    "ai_face_restore": false,
    "ai_rife_60fps": false
  }
  ```
- **Resposta (HTTP 200):** `{"status": "ok", "message": "Restoration pipeline started."}`
- **Erro (HTTP 400):** `{"status": "error", "message": "A process is already running."}`

### `POST /api/action`
Despacha ações operacionais assíncronas do estúdio através de dispatch table funcional:
- **`start_restore`**: Inicia a restauração (com verificação automática e auto-instalação do QTGMC se necessário).
- **`install_obs`**: Dispara o instalador portátil automatizado do OBS Studio.
- **`install_vapoursynth`**: Dispara o instalador do VapourSynth + QTGMC.
- **`generate_subtitles`**: Executa o WhisperEngine para transcrição offline de fala (`params: {"input": "...", "model_size": "tiny"}`).
- **`stop_process`**: Finaliza o processo externo ativo via terminação limpa de subprocesso.

### `POST /api/install_qtgmc`
Dispara diretamente o processo de configuração e download do ambiente VapourSynth + QTGMC.
- **Resposta (HTTP 200):** `{"status": "started", "message": "VapourSynth installation started."}`

---

## 6. Configuração de Armazenamento (`routers/storage.py`)

### `GET /api/storage/config`
Retorna a configuração ativa e o status de conectividade do backend de armazenamento.
- **Resposta (HTTP 200):**
  ```json
  {
    "provider": "local_nas_usb",
    "config": { "path": "D:\\Acervo_VHS" },
    "status": { "ready": true },
    "available_providers": ["local_nas_usb", "supabase", "s3_generic", "gdrive", "dropbox", "onedrive"]
  }
  ```

### `POST /api/storage/config`
Salva e valida as credenciais do provedor de armazenamento selecionado.
- **Payload Schema (`StorageConfigPayload`):**
  ```json
  {
    "provider": "s3_generic",
    "config": {
      "S3_ENDPOINT_URL": "https://s3.us-east-1.amazonaws.com",
      "S3_BUCKET": "meu-acervo-vhs",
      "S3_ACCESS_KEY": "AKIA...",
      "S3_SECRET_KEY": "...",
      "S3_REGION": "us-east-1"
    }
  }
  ```
- **Resposta (HTTP 200):** `{"status": "ok", "message": "Configuration saved and validated successfully."}`
- **Erro (HTTP 400):** `{"error": "Failed to validate storage configuration."}`
