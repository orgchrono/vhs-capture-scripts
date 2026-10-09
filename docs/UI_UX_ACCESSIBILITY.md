# ♿ Guia de Interface, Acessibilidade (a11y) e Internacionalização (i18n)

Este documento documenta os padrões de Design System, acessibilidade digital em conformidade com as diretrizes **WCAG 2.1 nível AAA** e a arquitetura de localização multilíngue implementada na interface gráfica do **VHS Studio Pro**.

---

## 1. Stack Tecnológico da Interface (UI)

A aplicação gráfica reside no diretório `ui/` e é construída com:
- **React 19:** Renderização eficiente baseada em componentes funcionais limpos e hooks reativos.
- **Vite 6:** Bundler ultrarrápido com Hot Module Replacement (HMR) e divisão automática de pacotes (*code splitting*).
- **Tailwind CSS v4:** Utilitários de estilização atômica que garantem consistência visual e performance com CSS purgado.
- **Redux Toolkit Query (RTK Query):** Cliente de dados que mantém sincronizado o estado da API local, evitando duplicação de dados e re-renderizações desnecessárias.
- **Sonner Toast:** Sistema moderno de notificações acessíveis para mensagens operacionais, alertas de conclusão e erros.
- **Framer Motion:** Animações sutis e respeitosas com operadores com sensibilidade a movimento.
- **Lucide Icons:** Biblioteca SVG de alta legibilidade e semântica de ícones.

---

## 2. Acessibilidade (WCAG 2.1 Nível AAA)

A interface foi projetada para ser plenamente utilizável em estúdios profissionais, estações de restauração com iluminação controlada e por operadores com diferentes habilidades físicas ou visuais.

### 2.1 Navegação Completa via Teclado
- Todos os controles interativos (botões, abas, seletores de preset, links e botões de cancelamento da fila) são focáveis via `Tab` / `Shift+Tab`.
- **Anéis de Foco Visíveis:** Todo elemento interativo possui realce evidente com `focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none`.
- **Atalhos Operacionais:** Suporte a teclas semânticas como `Space` e `Enter` para ativação de ações e `Escape` para fechar modais e suspender tarefas.

### 2.2 Marcação Semântica e Leitores de Tela (Screen Readers)
- **Atributos ARIA:**
  - `aria-label` e `aria-labelledby` em botões de ação e ícones informativos.
  - `role="status"` e `aria-live="polite"` em contadores de telemetria (FPS, tempo de gravação, CPU) e no terminal de logs.
  - `aria-live="assertive"` em erros críticos e alertas de desconexão do OBS Studio.
  - Abas e painéis usam `role="tablist"`, `role="tab"` e `role="tabpanel"` com vinculação via `aria-controls`.
- **Textos Ocultos Visualmente:** Ícones utilitários contêm spans `<span class="sr-only">` para que softwares como NVDA, JAWS ou VoiceOver descrevam a ação exata.

### 2.3 Contraste Cromático e Tipografia
- Relação de contraste mínima de **7:1** entre texto e plano de fundo em elementos principais de leitura (nível AAA).
- Paleta escura calibrada em tons de zinco e esmeralda (`#09090b`, `#18181b`, `#10b981`), reduzindo a fadiga ocular em sessões prolongadas de monitoramento analógico.

### 2.4 Respeito a `prefers-reduced-motion`
- Todas as transições do Framer Motion e animações CSS respeitam a configuração de acessibilidade do sistema operacional do usuário.
- Quando o usuário solicita redução de movimento, as animações de slide e escala são automaticamente desativadas, mantendo apenas crossfades instantâneos.

---

## 3. Notificações Sonner Toast

O sistema de toasts substitui alertas modais intrusivos por notificações discretas e acessíveis:

- **Posicionamento:** Canto inferior direito (`bottom-right`), com empilhamento dinâmico.
- **Tipos de Toast:**
  - `toast.success("Restauração concluída!")`: Notificação verde de sucesso com ícone semântico.
  - `toast.error("Erro na comunicação com OBS")`: Alerta vermelho com botão de ação rápida para tentar reconexão.
  - `toast.info("QTGMC instalando dependências...")`: Informação de background.
  - `toast.promise(...)`: Feedback contínuo de tarefas assíncronas com transição automática para sucesso ou erro.

---

## 4. Internacionalização (i18n)

O sistema conta com arquitetura de localização completa via **i18next**:

### 4.1 Idiomas Nativamente Suportados
1. **Português (Brasil) - `pt-BR`** (Padrão)
2. **Inglês (Estados Unidos) - `en-US`**
3. **Espanhol - `es-ES`**

### 4.2 Estrutura Modular de Chaves
As mensagens são organizadas por domínio de aplicação:
```json
{
  "app": {
    "title": "VHS Studio Pro",
    "status": "Status do Sistema",
    "ready": "Pronto para Ingestão"
  },
  "presets": {
    "archive": "Arquivo Broadcast (Máxima Qualidade)",
    "high": "Alta Qualidade (Produção)",
    "fast": "Restauração Rápida"
  },
  "queue": {
    "title": "Fila de Processamento em Lote",
    "enqueue": "Adicionar à Fila",
    "cancel": "Cancelar Trabalho"
  },
  "compliance": {
    "terms": "Termos de Compliance e Licença",
    "as_is": "Software fornecido no estado em que se encontra (As Is)."
  }
}
```
A troca de idioma ocorre instantaneamente via seletor no cabeçalho da interface, sem recarregar a página e persistindo a escolha no `localStorage`.

---

## 5. Suíte de Testes da Interface

A qualidade e estabilidade da interface são asseguradas por duas camadas de teste:

1. **Testes Unitários e de Componente (Vitest + React Testing Library):**
   - Testa renderização de abas, dispatch de ações, hooks do RTK Query e sanitização de dados.
   - Execução: `npm run test:unit` dentro de `ui/`.
2. **Testes End-to-End (Playwright):**
   - Inicializa um navegador Chromium automatizado, testa navegação por abas, enfileiramento de trabalhos, disparo de toasts e validação de acessibilidade.
   - Execução: `npx playwright test --project=chromium` dentro de `ui/`.
