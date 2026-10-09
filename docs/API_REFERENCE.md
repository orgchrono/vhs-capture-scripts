# 🔌 Referência Completa da API REST & SSE - VHS Studio Pro

O backend do VHS Studio Pro expõe uma API RESTful de alta velocidade aliada a Server-Sent Events (SSE) para comunicação bidirecional reativa com o cliente desktop e integrações externas.

Por padrão, a API escuta no endereço:
`http://127.0.0.1:8088`

---

## 1. Segurança e Autenticação

### 1.1 Restrição de Origem e Host
Todas as requisições direcionadas para `/api/*` passam pelo middleware de segurança [`verify_origin`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/src/vhs_studio/api/server.py#L53-L84):
- O cabeçalho `Host` deve obrigatoriamente iniciar com `127.0.0.1`, `localhost` ou `testserver`.
- Requisições do tipo `POST` validam a origem no cabeçalho `Origin`.

### 1.2 Session Token (Mitigação CSRF)
Em cada inicialização do backend, um token de sessão criptográfico de 32 caracteres hexadecimais é gerado (`SESSION_TOKEN`).
- **Endpoint:** `GET /api/token`
- **Cabeçalho Requerido em POST/Mutações:** `X-Session-Token: <token>`

---

## 2. Endpoints do Sistema e Diagnóstico

### `GET /api/token`
Retorna o token ativo da sessão para o frontend.
- **Resposta:**
  ```json
  {
    "token": "a1b2c3d4e5f60718293a4b5c6d7e8f90"
  }
  ```

### `GET /api/status`
Retorna o status abrangente de saúde do sistema, encoders disponíveis, arquivos brutos na pasta de mídia e telemetria básica.
- **Resposta:**
  ```json
  {
    "encoder": "h264_nvenc",
    "vapoursynth_available": true,
    "obs_connected": true,
    "raw_files": [
      {
        "name": "tape_family_1994.mkv",
        "path": "C:\\...\\media\\raw\\tape_family_1994.mkv",
        "size_mb": 4250.4
      }
    ],
    "process_running": false,
    "process_logs": [],
    "hardware": {
      "tier": 1,
      "tier_name": "Broadcast AI Master",
      "cpu": "AMD Ryzen 9 5900X 12-Core",
      "ram": 32.0,
      "gpu": "NVIDIA GeForce RTX 3080",
      "recommendations": "Hardware ideal para QTGMC Ultra-High e Real-ESRGAN x4plus."
    }
  }
  ```

### `GET /api/hardware`
Retorna a análise detalhada do perfil de hardware detectado pelo HAL.
- **Resposta:**
  ```json
  {
    "tier": 1,
    "tier_name": "Broadcast AI Master",
    "cpu": "Intel Core i7-13700K",
    "cpu_cores": 16,
    "ram": 32.0,
    "gpu": "NVIDIA GeForce RTX 4070",
    "gpu_vram_gb": 12.0,
    "encoder": "h264_nvenc"
  }
  ```

---

## 3. Telemetria e Streaming de Logs (SSE)

### `GET /api/logs/stream`
Endpoint Server-Sent Events (SSE) com mime type `text/event-stream`.
Transmite em tempo real, com latência inferior a 200ms, cada linha emitida pelo motor de restauração ativo.
- **Formato das mensagens:**
  ```
  data: {"connected": true, "active": true}

  data: {"line": "frame= 3120 fps= 59.9 q=18.0 size= 145020kB time=00:00:52.05 bitrate=22822.4kbits/s speed=1.0x", "active": true}

  data: {"active": false}
  ```

### `GET /api/logs`
Retorna o buffer histórico acumulado de logs em memória para recarga de estado ou diagnósticos pós-processamento.
- **Resposta:**
  ```json
  {
    "active": false,
    "logs": [
      "[INFO] Inicializando pipeline de restauração...",
      "[INFO] Aplicando desentrelaçamento QTGMC 60p..."
    ]
  }
  ```

---

## 4. Orquestração da Restauração

### `POST /api/run`
Aciona a execução direta do pipeline de restauração sobre um arquivo analógico bruto.
- **Cabeçalho:** `X-Session-Token: <token>`
- **Corpo da Requisição:**
  ```json
  {
    "input": "media/raw/tape_01.mkv",
    "deinterlacer": "qtgmc",
    "preset": "archive",
    "denoise": "light",
    "upscale": "1080p",
    "ai_subtitles": true
  }
  ```
- **Respostas:**
  - `200 OK`: `{"status": "ok", "message": "Restoration pipeline started."}`
  - `400 Bad Request`: `{"status": "error", "message": "Invalid or insecure file path."}` (caso o arquivo tente acessar caminhos externos com `..` ou `\0`).
  - `400 Bad Request`: `{"status": "error", "message": "A process is already running."}`

### `POST /api/action`
Ponto central para disparo de ações utilitárias do estúdio.
- **Cabeçalho:** `X-Session-Token: <token>`
- **Ações Disponíveis:**
  1. `start_restore`: Inicia a pipeline com parâmetros granulares.
  2. `stop_process`: Interrompe imediatamente qualquer processo ativo.
  3. `install_obs`: Lança o utilitário de instalação do OBS Studio.
  4. `install_vapoursynth`: Dispara o instalador de dependências do VapourSynth + QTGMC.
  5. `generate_subtitles`: Executa a extração de áudio e transcrição Whisper neural:
     ```json
     {
       "action": "generate_subtitles",
       "params": {
         "input": "media/raw/tape.mkv",
         "model_size": "small"
       }
     }
     ```

---

## 5. Fila Sequencial Persistente (Batch Queue)

A fila persistente armazena tarefas no SQLite local, garantindo que o operador possa adicionar múltiplos vídeos sem sobrecarregar a CPU/GPU com execuções simultâneas.

### `GET /api/queue`
Retorna os trabalhos na fila, estatísticas agregadas e se o worker está rodando.
- **Resposta:**
  ```json
  {
    "jobs": [
      {
        "id": 1,
        "raw_path": "media/raw/fita_1990.mkv",
        "status": "pending",
        "priority": 1,
        "created_at": "2026-10-09 18:00:00"
      }
    ],
    "stats": {
      "pending": 1,
      "processing": 0,
      "completed": 4,
      "failed": 0
    },
    "worker_running": true
  }
  ```

### `POST /api/queue/enqueue`
Adiciona um novo item à fila.
- **Cabeçalho:** `X-Session-Token: <token>`
- **Corpo:**
  ```json
  {
    "input": "media/raw/fita_1991.mkv",
    "priority": 2,
    "params": {
      "deinterlacer": "qtgmc",
      "preset": "broadcast"
    }
  }
  ```
- **Resposta:** `{"status": "ok", "job_id": 2, "message": "Job #2 enqueued."}`

### `POST /api/queue/cancel/{job_id}`
Cancela um item que ainda se encontra pendente na fila.
- **Resposta:** `{"status": "ok", "message": "Job #2 cancelled."}`

### `POST /api/queue/start` & `POST /api/queue/stop`
Inicia ou pausa o consumidor sequencial em segundo plano (`QueueWorker`).

---

## 6. Integração com OBS Studio (WebSocket v5)

### `GET /api/obs/stats`
Lê a telemetria ao vivo da sessão de captura do OBS Studio:
- **Resposta:**
  ```json
  {
    "connected": true,
    "recording": true,
    "timecode": "00:14:32",
    "duration_sec": 872.0,
    "bytes": 352481024,
    "bitrate_kbps": 22400.0,
    "fps": 59.94,
    "cpu_usage": 8.5,
    "memory_mb": 420.0
  }
  ```

### `POST /api/obs/start`
Inicia a gravação direta no OBS Studio.

### `POST /api/obs/stop`
Para a gravação do OBS e retorna o caminho do arquivo gerado.
- **Resposta:**
  ```json
  {
    "status": "ok",
    "message": "Recording stopped.",
    "path": "C:\\...\\media\\raw\\2026-10-09_19-00-00.mkv"
  }
  ```

### `POST /api/obs/virtualcam`
Ativa ou desativa a câmera virtual do OBS (`{"enable": true}`).

---

## 7. Armazenamento em Nuvem e Provedores

### `GET /api/storage/config`
Lista o provedor ativo (`local`, `s3`, `google_drive`, `dropbox`), seu status e os provedores disponíveis.

### `POST /api/storage/config`
Salva e valida as credenciais do provedor:
- **Corpo:**
  ```json
  {
    "provider": "s3",
    "config": {
      "bucket": "meu-acervo-vhs",
      "region": "us-east-1",
      "access_key": "AKIA...",
      "secret_key": "SECRET..."
    }
  }
  ```
