# VHS Studio Pro - Regras Rígidas para Agentes de IA (GEMINI.md)

> [!CRITICAL]
> **PROIBIÇÃO TOTAL DE HARDCODE (ZERO-HARDCODE POLICY)**
> Todo e qualquer agente que interagir ou modificar este repositório está **TERMINANTEMENTE PROIBIDO** de inserir texto hardcoded em componentes de interface (React / JSX / TSX), mensagens de toast, tooltips, placeholders e alertas.

Consulte o documento oficial de diretrizes em [AGENTS.md](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/AGENTS.md).

## Diretrizes de Execução Rápida:
1. **Interface 100% Internacionalizada:** Todo texto em JSX/TSX deve obrigatoriamente chamar `t('chave.namespace')`.
2. **Zero Caminhos Hardcoded:** Nenhum caminho absoluto ou magic string em arquivos de código. Usar `paths.py` e `constants.py`.
3. **8 Quality Gates Verificados:** Executar e validar `python scripts/lint.py` antes de qualquer finalização.
