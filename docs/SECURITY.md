# 🔒 Política de Segurança e Modelo de Ameaças - VHS Studio Pro

Este documento formaliza as práticas de segurança, proteções de código, sanitização de entrada e postura defensiva adotada no **VHS Studio Pro**.

---

## 1. Postura de Segurança e Princípios

O VHS Studio Pro é uma aplicação híbrida de desktop e backend local que processa arquivos de mídia pesados e interage com executáveis de baixo nível (FFmpeg, OBS, VapourSynth).

Nossa arquitetura segue quatro pilares defensivos:
1. **Menor Privilégio & Isolamento:** Nenhuma operação exige permissões de Administrador/Root. Todos os arquivos são manipulados dentro do diretório do usuário ou na pasta do projeto.
2. **Defesa em Profundidade contra Injeção:** Qualquer argumento repassado a processos externos é estruturado via vetores/listas tipadas, sem intermediação de shells (`cmd.exe` ou `/bin/sh`).
3. **Canonicidade e Bloqueio de Navegação:** Entrada de caminhos de arquivos é validada estritamente contra ataques de Path Traversal antes de qualquer leitura ou escrita.
4. **Zero-Trust de Rede Local:** Mesmo rodando em `localhost`, a API valida a origem das requisições e exige tokens dinâmicos para prevenir sequestro de sessão via navegadores web (Drive-by Localhost attacks).

---

## 2. Mitigações Específicas de Vulnerabilidades

### 2.1 Prevenção de Injeção de Comandos (CWE-78)
- **Eliminação de `shell=True`:**
  - Todas as invocações de `subprocess.Popen` e `subprocess.run` no backend utilizam vetores estritos de argumentos (`list[str]`).
  - No Windows, comandos como `npm run build` são resolvidos canonicamente via `npm.cmd` sem a necessidade de abrir o interpretador `cmd.exe`.
- **Prevenção de Injeção em Scripts Python (`python -c`):**
  - Módulos que executam código dinâmico como a transcrição Whisper (`whisper_engine`) **nunca** interpolam strings de entrada diretamente no código fonte Python.
  - Em vez disso, os parâmetros são passados como argumentos isolados do sistema operacional (`sys.argv[1]`, `sys.argv[2]`), tornando impossível que caracteres especiais como aspas simples, ponto-e-vírgula ou quebras de linha alterem o fluxo de execução.

### 2.2 Prevenção de Path Traversal (CWE-22)
- Todas as rotas de ingestão (`/api/run`, `/api/queue/enqueue`, `/api/action`) passam pela rotina canônica:
  ```python
  def is_safe_media_path(raw_path: str | None) -> bool:
      if not raw_path or not isinstance(raw_path, str):
          return False
      if "\0" in raw_path or ".." in raw_path:
          return False
      norm = os.path.normpath(raw_path).replace("\\", "/")
      if norm.startswith("media/") or norm == "media":
          return True
      try:
          abs_p = os.path.abspath(raw_path)
          media_abs = os.path.abspath(MEDIA_DIR)
          common = os.path.commonpath([abs_p, media_abs])
          return common == media_abs
      except Exception:
          return False
  ```
- **O que esta função garante:**
  - Bloqueio imediato de *null bytes* (`\0`), que em alguns sistemas podem enganar verificações de extensão.
  - Bloqueio de sequências relativas de subida de diretório (`../` ou `..\`).
  - Restrição de que qualquer arquivo esteja rigorosamente contido na raiz autorizada `MEDIA_DIR`.
  - Rejeição de caminhos sensíveis do sistema operacional (ex: `C:\Windows\System32\...` ou `/etc/passwd`).

### 2.3 Proteção contra Cross-Site Request Forgery (CSRF em Localhost)
- Se um operador estiver com o VHS Studio Pro aberto e navegar na internet em uma aba do navegador, páginas maliciosas externas não conseguem enviar requisições espúrias para `http://127.0.0.1:8088`.
- **Camadas de proteção aplicadas:**
  1. **CORS Restrito:** Apenas as origens `127.0.0.1:8088` e `localhost:8088` são aceitas.
  2. **Validação de Cabeçalho Host:** Requisições contendo cabeçalhos de DNS Rebinding são sumariamente rejeitadas com HTTP 403.
  3. **Validação de Cabeçalho Origin:** Chamadas `POST` de origens externas são descartadas.
  4. **Token de Sessão Unívoco:** A API gera um segredo criptográfico a cada inicialização (`SESSION_TOKEN`) exigido no cabeçalho `X-Session-Token`.

---

## 3. Gestão e Auditoria de Dependências

- **Python:**
  - Análise estática contínua de segurança via **Bandit AST Analyzer**:
    ```bash
    bandit -ll -r src
    ```
    *Resultado:* **0 vulnerabilidades** de alta ou média severidade.
  - Verificação de consistência de pacotes via `pip check`.
- **Node.js / Frontend:**
  - Auditoria contínua de vulnerabilidades de pacotes npm:
    ```bash
    npm audit --audit-level=high
    ```
    *Resultado:* **0 vulnerabilidades** encontradas.

---

## 4. Privacidade e Soberania dos Dados

- **Processamento 100% Offline:**
  - A digitalização, restauração, transcrição por IA (Whisper) e upscaling neural (Real-ESRGAN) operam inteiramente de forma local.
  - Nenhuma imagem, áudio, fita ou telemetria pessoal é enviada para servidores da nuvem sem a configuração manual de um provedor de armazenamento (S3, Drive ou Dropbox) pelo próprio operador.
- **Credenciais e Segredos:**
  - Chaves de API de nuvem e credenciais OAuth2 são armazenadas localmente na pasta protegida do usuário (`~/.vhs_studio/storage.json`).
  - Nenhum segredo ou token é comitado no repositório Git (ignorado via `.gitignore`).

---

## 5. Reporte de Vulnerabilidades

Caso identifique qualquer potencial fragilidade ou falha de segurança no projeto:
1. Abra uma issue privada no repositório GitHub ou entre em contato com a equipe de engenharia.
2. Não divulgue a falha publicamente antes de uma correção ter sido implementada e disponibilizada.
