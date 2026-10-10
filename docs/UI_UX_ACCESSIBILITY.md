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

### 4.1 Idiomas Nativamente Suportados (10 Idiomas de Preservação)
A plataforma suporta 10 idiomas globais com dicionários completos:
1. **Português (Brasil) - `pt-BR`** (Padrão de desenvolvimento)
2. **Inglês (Estados Unidos) - `en-US`**
3. **Espanhol - `es`**
4. **Francês - `fr`**
5. **Alemão - `de`**
6. **Italiano - `it`**
7. **Russo - `ru`**
8. **Chinês Simplificado - `zh-CN`**
9. **Japonês - `ja`**
10. **Árabe - `ar`**

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
    "gold_name": "Padrão Broadcast",
    "speed_name": "Ultra Rápido Hardware",
    "tbc_hold_name": "TBC Frame-Hold (Zero Pretos)",
    "ai_master_name": "AI Master (Real-ESRGAN)"
  },
  "settings": {
    "tab_presets": "Modos Prontos",
    "tab_video": "Vídeo",
    "tab_audio": "Áudio"
  },
  "telemetry": {
    "title": "Telemetria de Masterização Analógica",
    "stage_idle": "Em Espera / Pronto",
    "frames": "Quadros",
    "fps": "FPS",
    "eta": "Tempo Estimado"
  }
}
```
A troca de idioma ocorre instantaneamente via seletor no cabeçalho da interface, sem recarregar a página e persistindo a escolha no `localStorage`.

### 4.3 Invariância Estrutural de Layout em Ambientes NLE (BiDi & RTL)
Em softwares profissionais de áudio e vídeo (como DaVinci Resolve, Premiere e Avid), os fluxos de hardware analógico, osciloscópios (vectorscopes), canais de áudio L/R, barras de transporte e a linha do tempo são **estruturalmente orientados da esquerda para a direita (LTR)**.

- **Por que a estação não inverte o layout em Árabe:** Inverter as docas, mover o monitor CRT para o lado direito e espelhar as barras de ferramentas quebraria o mapeamento mental e as convenções físicas das placas de captura (DeckLink) e controles de transporte.
- **Implementação Técnica:** No [`i18n.ts`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/ui/src/i18n.ts), `document.documentElement.dir` é mantido estritamente como `'ltr'`, enquanto `document.documentElement.lang = lng` atualiza os metadados do documento. Isso assegura renderização perfeita de glifos árabes e suporte para leitores de tela sem causar o espelhamento disruptivo da interface.

---

## 5. Suíte de Testes da Interface

A qualidade e estabilidade da interface são asseguradas por duas camadas de teste:

1. **Testes Unitários e de Componente (Vitest + React Testing Library):**
   - 17 arquivos de teste e 45 testes cobrindo renderização, dispatch de ações, busca no console, explorador de fitas, internacionalização e componentes acessíveis.
   - Execução: `npm run test:unit` dentro de `ui/`.
2. **Testes End-to-End (Playwright):**
   - Inicializa um navegador Chromium automatizado, testa o fluxo de captura, navegação por abas com `getByTestId`, inspeção visual de layout e validação de acessibilidade.
   - Execução: `npx playwright test --project=chromium` dentro de `ui/`.

---

## 6. Footer StatusBar & Barra de Progresso React 19

1. **Componente Nativo React 19 Progress:**
   - O componente legado do Radix UI causava colisões de contexto no React 19 (`TypeError: Cannot read properties of null (reading 'useMemo')`).
   - Foi substituído por um componente acessível nativo ([`ui/src/components/ui/progress.tsx`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/ui/src/components/ui/progress.tsx)) com semântica WAI-ARIA completa (`role="progressbar"`, `aria-valuenow`, `aria-valuemin="0"`, `aria-valuemax="100"`).
2. **Footer StatusBar:**
   - Componente persistente de rodapé ([`FooterStatusBar.tsx`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/ui/src/components/FooterStatusBar.tsx)) que reúne Tally de hardware, nome da fita ativa, contagem de quadros, FPS em tempo real, velocidade relativa, ETA e botão de acesso rápido à gaveta de logs (`>_ Logs`).
3. **Aba Padrão "Modo":**
   - O termo hermético *"Pipelines"* foi substituído por **"Modo"** (anteriormente "Modos Prontos", ajustado para 4 caracteres para eliminar totalmente o bleed/quebra visual entre as 7 abas do painel) e configurado como a aba de inicialização padrão (`defaultValue="presets"`), oferecendo foco imediato nas estratégias macro de restauração.

---

## 7. Tape Library Explorer & Console Live Search

1. **Tape Library Explorer (Acervo Visual de Fitas):**
   - No [`FileSelector.tsx`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/ui/src/components/FileSelector.tsx), a seleção de arquivos conta com um explorador visual retrátil (estilo DaVinci Media Pool / VS Code File Explorer) localizado na coluna lateral.
   - Apresenta miniaturas estilizadas de fitas VHS (com carretéis e badge de container MKV/RAW), tamanho de arquivo em MB/GB, metadados e botão de recolher/expandir com botão `+`/`-`.
   - O placeholder da combobox foi corrigido para `<option value="" disabled hidden>`, garantindo que o texto guia nunca seja selecionável acidentalmente como uma fita válida.
2. **Console Live Search (Busca em Tempo Real no Console):**
   - No [`ConsoleViewer.tsx`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/ui/src/components/ConsoleViewer.tsx), foi incorporada uma barra de busca interativa com ícone `<Search />`, atalho de teclado, realce de termos encontrados via tag semântica `<mark>`, contador de resultados (`X/Y`) e botão de limpeza instantânea `<X />`.
   - Permite filtrar fluxos massivos de telemetria e depuração (ex: `QTGMC`, `Whisper`, `Dropped Frame`) sem sobrecarregar a visualização do operador.
