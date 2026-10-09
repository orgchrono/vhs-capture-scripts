# 🛠️ Guia do Desenvolvedor e Contribuição - VHS Studio Pro

Este guia detalha os padrões de desenvolvimento, configuração do ambiente local, convenções de código e o funcionamento dos Quality Gates obrigatórios do **VHS Studio Pro**.

---

## 1. Configuração do Ambiente de Desenvolvimento

### 1.1 Pré-requisitos
- **Git**
- **Python 3.10+** (recomendado Python 3.11 ou 3.12)
- **Node.js 18+** e **npm 9+**
- Ferramenta de gerenciamento rápido de dependências **uv** (opcional, mas recomendada):
  ```bash
  pip install uv
  ```

### 1.2 Clonando e Instalando Dependências

```bash
# 1. Clonar o repositório
git clone https://github.com/orgchrono/vhs-capture-scripts.git
cd vhs-capture-scripts

# 2. Criar e ativar o ambiente virtual Python
python -m venv .venv
# No Windows:
.venv\Scripts\activate
# No Linux/macOS:
source .venv/bin/activate

# 3. Instalar o projeto e dependências de desenvolvimento
pip install -e ".[dev]"

# 4. Instalar dependências da interface web
cd ui
npm ci
cd ..

# 5. Ativar os hooks de Git locais
git config core.hooksPath .githooks
```

---

## 2. A Suíte de 8 Quality Gates (`scripts/lint.py`)

Antes de qualquer commit ser aceito pelo Git, o hook de pre-commit executa paralelamente a suíte completa de qualidade de código:

| Quality Gate | Ferramenta | Escopo | Objetivo |
| :--- | :--- | :--- | :--- |
| **1. Anti-Plágio / Duplicação** | JSCPD | `src/`, `ui/src/` | Bloqueia blocos de código duplicados acima do limiar de 5%. |
| **2. UI Linter** | Oxlint / ESLint | `ui/` | Análise estática ultrarrápida do ecossistema React/TypeScript. |
| **3. Tipagem Python** | Mypy | `src/` | Validação estrita de tipos Python PEP 484 (`--ignore-missing-imports`). |
| **4. Estilo Python** | Flake8 | `src/`, `scripts/`, `tests/` | Conformidade com PEP 8, limite de linha 120 colunas e ausência de code smells. |
| **5. Testes Unitários da UI** | Vitest | `ui/` | Testes de componentes, hooks e store React. |
| **6. Compilação TypeScript** | TSC | `ui/` | Garante que o build de produção do Vite compila sem erros de tipos. |
| **7. Testes End-to-End** | Playwright | `ui/` | Emulação real de navegação no navegador Chromium. |
| **8. Testes Pytest** | Pytest | `tests/` | 80+ testes unitários e de integração de backend. |

### Como Executar os Quality Gates Manualmente
```bash
python scripts/lint.py
```
O script gera um relatório atualizado em tempo real no arquivo [`logs/build_report.md`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/logs/build_report.md).

---

## 3. O Enxame de Auditores (`scripts/swarm_auditors.py`)

O repositório inclui um orquestrador de auditoria profunda em thread pool que analisa 7 dimensões estruturais do projeto:

```bash
python scripts/swarm_auditors.py
```

Os auditores verificam:
1. **Arquitetura (SRP, SOC, SSOT, MVVM Strict):** Estrutura de pastas, mapeamento de responsabilidades e arquivos de configuração.
2. **CI/CD & Automação:** Workflows do GitHub Actions e integridade de scripts.
3. **Test Harness & Flaking Tests:** Detecta testes frágeis ou que utilizam `time.sleep` em vez de abordagens determinísticas baseadas em eventos (`threading.Event`).
4. **UX/UI, i18n & a11y:** Existência de dicionários multilíngues e atributos de acessibilidade.
5. **Segurança de Código:** Varredura Bandit AST e busca de credenciais *hardcoded*.
6. **Dependências (Pip & NPM):** Validação de compatibilidade e ausência de vulnerabilidades críticas.
7. **Melhores Práticas & Dívida Técnica:** Pontuação Pylint e ausência de tipagens soltas (`Any`).

---

## 4. Padrões de Código e Diretrizes

### 4.1 Backend (Python)
- **Subprocessos Seguros:** **Nunca** utilize `shell=True` em chamadas de `subprocess`. Passe os argumentos como listas estritas (`list[str]`).
- **Validação de Entrada:** Qualquer parâmetro que represente um caminho de arquivo deve obrigatoriamente ser verificado via `is_safe_media_path()` antes de qualquer operação de I/O.
- **Concorrência e Threads:** Ao criar workers em background, use instâncias de `threading.Event()` para sinalização de parada e garanta que o método `stop()` aguarde o `.join()` da thread com timeout.
- **Tipagem Estrita:** Sempre declare tipos de parâmetros e retorno em novas funções (`def func(param: str) -> bool:`).

### 4.2 Frontend (React & TypeScript)
- **Zero `any`:** Todos os tipos devem ser definidos em interfaces ou types dedicados.
- **Acessibilidade:** Todo botão deve possuir `aria-label` descritivo caso contenha apenas ícone; todos os controles interativos devem possuir estados de foco visíveis (`focus-visible:ring-2`).
- **Internacionalização:** Nenhuma string visível para o usuário deve ser hardcoded na tela; utilize o hook `useTranslation()` do i18next.

---

## 5. Convenção de Commits (Conventional Commits)

Adotamos a especificação de Conventional Commits:

- `feat(modulo): nova funcionalidade para o usuário`
- `fix(security): correção de vulnerabilidade ou bug`
- `docs(api): adição ou atualização de documentação`
- `test(e2e): novos testes automatizados`
- `refactor(core): melhoria estrutural sem alterar comportamento externo`
- `chore(ci): ajustes em workflows ou ferramentas de build`

---

## 6. Fluxo de Pull Requests

1. Crie uma branch a partir de `main` com um nome descritivo (ex: `feature/nvenc-lossless-preset` ou `fix/path-traversal-guard`).
2. Implemente suas alterações acompanhadas de testes unitários em `tests/` ou `ui/tests/`.
3. Execute `python scripts/lint.py` e garanta que **todos os 8 gates estejam verdes**.
4. Abra o Pull Request descrevendo claramente o objetivo, os testes realizados e os impactos na arquitetura.
