# VHS Studio Pro - Regras Rígidas para Agentes de IA (AGENTS.md)

> [!CRITICAL]
> **PROIBIÇÃO TOTAL DE HARDCODE (ZERO-HARDCODE POLICY)**
> Todo e qualquer agente que interagir ou modificar este repositório está **TERMINANTEMENTE PROIBIDO** de inserir texto hardcoded em componentes de interface (React / JSX / TSX), mensagens de toast, tooltips, placeholders e alertas.

---

## 1. Regra Fundamental: Interface 100% Internacionalizada (i18n)

1. **Nunca escreva strings literais em JSX/TSX:**
   - ❌ **PROIBIDO:** `<span>Inspecionar</span>`
   - ❌ **PROIBIDO:** `<button>Recolher</button>`
   - ❌ **PROIBIDO:** `placeholder="Ex: C:\dumps\panasonic.img"`
   - ❌ **PROIBIDO:** `toast.error("Falha ao inspecionar")`
   - ❌ **PROIBIDO:** `addLog("[INGESTÃO] Fita carregada")`
   - ✅ **OBRIGATÓRIO:** Use sempre `t('files.inspect', '...')` ou chave i18n correspondente.
   - ✅ **OBRIGATÓRIO:** Atualize **TODAS** as traduções em `ui/src/locales/` (`pt-BR`, `en-US`, etc.) ao adicionar novas funcionalidades.

2. **Placeholders e Exemplos:**
   - Placeholders devem vir de `t('files.source_path_placeholder')`.
   - Nunca insira caminhos fictícios ou strings em português/inglês direto na tag `<input placeholder="..." />`.

3. **Toasts e Notificações:**
   - Sempre utilize chaves `t('toast.key')` para títulos e descrições.
   - Parâmetros dinâmicos devem ser passados como objeto de interpolação: `t('toast.message', { file: fileName })`.

---

## 2. Zero Magic Numbers e Zero Caminhos Hardcoded

1. **Backend Python:**
   - Constantes globais pertencem a `src/vhs_studio/core/constants.py`.
   - Caminhos de diretório e executáveis pertencem a `src/vhs_studio/core/paths.py`.
   - Nunca invente caminhos absolutos no código (`C:\...` ou `/var/...`).

2. **Frontend React:**
   - Constantes de tempo, dimensões e limites devem ser extraídas para `src/constants/` ou arquivos de tipos.

---

## 3. Qualidade e Integridade do Código (Quality Gates)

Todo commit ou alteração deve respeitar os 8 portões de qualidade do projeto:
- `Flake8` (Python Style): 0 violações
- `Mypy` (Python Types): 0 erros
- `Oxlint / ESLint` (UI Linter): 0 erros
- `TSC` (TypeScript Compiler): 0 erros
- `Vitest` (Unit Tests): 100% aprovado
- `Playwright` (E2E Tests): 100% aprovado
- `Pytest` (Backend Tests): 100% aprovado
- `JSCPD` (Anti-Duplicação): < 5% duplicidade

Qualquer violação das regras de hardcode ou quebra de testes resultará na rejeição imediata da tarefa.
