# ♿ Interface Design System, Accessibility (a11y) & Localization (i18n)

This document details the Design System conventions, **WCAG 2.1 Level AAA** digital accessibility implementations, and the multilingual localization architecture established for the **VHS Studio Pro** workstation interface.

---

## 1. User Interface Technology Stack & Strict MVVM

The graphical presentation application is located in `ui/` and is engineered with:
- **React 19:** High-performance UI rendering utilizing functional components, custom hooks, and concurrent features.
- **Strict MVVM Separation:** View components (`ui/src/components/`) are purely declarative "dumb" components. All API requests, WebSocket/SSE state synchronization, asynchronous timers, and business logic are encapsulated in dedicated custom ViewModels (`ui/src/viewmodels/`).
- **Decomposed Studio Controls (`ui/src/components/settings/`):** The monolithic restoration settings panel has been partitioned into 7 specialized sub-tabs (`PresetsTab.tsx`, `VideoTab.tsx`, `AudioTab.tsx`, `FiltersTab.tsx`, `AdvancedTab.tsx`, `AiTab.tsx`, `StorageTab.tsx`) orchestrated by `useSettingsSearchViewModel.ts` and `SettingsPrimitives.tsx`.
- **Reusable Utility Hooks (`ui/src/lib/utils.ts`):** Standardized cross-component behaviors, such as `useEscapeClose` for unified modal and drawer keyboard dismissal without logic duplication.
- **Vite 6:** Ultra-fast bundling engine with instantaneous Hot Module Replacement (HMR) and optimized tree-shaking code splitting.
- **Tailwind CSS v4:** Atomic styling utilities guaranteeing visual consistency, zero CSS runtime overhead, and automated bundle purging.
- **Redux Toolkit Query (RTK Query):** Advanced API caching and state synchronization preventing duplicate network requests and unnecessary component re-renders.
- **Sonner Toast:** Accessible, non-intrusive toast notifications with action buttons and dynamic progress transitions.
- **Framer Motion:** Smooth, hardware-accelerated transitions that honor motion-sensitivity accessibility settings (`useReducedMotion`).
- **Lucide Icons:** Highly legible, clean SVG icons.

---

## 2. Dedicated ViewModels Registry (`ui/src/viewmodels/`)

The application enforces strict separation between domain state orchestration and declarative rendering:

| ViewModel Hook | Responsibility | Bound View Component |
| :--- | :--- | :--- |
| [`useStudioViewModel`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/ui/src/viewmodels/useStudioViewModel.ts) | Core studio lifecycle, pipeline start/pause/resume, SSE log subscription, polling fallback. | `App.tsx`, `Header.tsx` |
| [`useRestorationViewModel`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/ui/src/viewmodels/useRestorationViewModel.ts) | Restoration parameters, CRF configuration, codec presets, subtitle generation triggers. | `RestorationSettings.tsx` |
| [`useSettingsSearchViewModel`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/ui/src/components/settings/useSettingsSearchViewModel.ts) | Real-time settings search, fuzzy keyword matching, automatic tab switching. | `RestorationSettings.tsx` |
| [`useConsoleViewModel`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/ui/src/viewmodels/useConsoleViewModel.ts) | Telemetry log level filtering (`ALL`, `INFO`, `WARN`, `ERR`, `DEBUG`), live text search, diagnostic export. | `ConsoleViewer.tsx` |
| [`usePreferencesViewModel`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/ui/src/viewmodels/usePreferencesViewModel.ts) | RTK Query preference mutations, directory paths, high contrast/large text toggles, keyboard dismissal (`useEscapeClose`). | `AppPreferencesModal.tsx` |
| [`useConflictResolutionViewModel`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/ui/src/viewmodels/useConflictResolutionViewModel.ts) | Incomplete job detection, existing file collision detection, resume vs overwrite flow orchestration. | `App.tsx`, `RestorationConflictModal.tsx` |
| [`useQcReportViewModel`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/ui/src/viewmodels/useQcReportViewModel.ts) | Quality control report fetching (`studioApi.getQcReport`), markdown clipboard copying, JSON report downloading, keyboard dismissal (`useEscapeClose`). | `QcReportModal.tsx` |
| [`useStorageViewModel`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/ui/src/viewmodels/useStorageViewModel.ts) | Storage provider configuration (Local, Supabase, S3, GDrive, Dropbox, OneDrive), non-blocking save feedback banners, OAuth authorization triggers. | `StorageSettings.tsx` |
| [`useTapeLibraryViewModel`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/ui/src/viewmodels/useTapeLibraryViewModel.ts) | Raw file selection, checkpoint matching, incomplete job finalization/discarding, library expand/collapse state. | `TapeLibraryCard.tsx` |
| [`usePanasonicIngestViewModel`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/ui/src/viewmodels/usePanasonicIngestViewModel.ts) | Physical drive scanning, MEIHDFS inspection, interactive title tree navigation, selective title extraction. | `PanasonicIngestCard.tsx` |
| [`useSplitComparisonViewModel`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/ui/src/viewmodels/useSplitComparisonViewModel.ts) | A/B frame comparison, split-position scrubbing, wipe/dual layout modes, live stream vs freeze frame switching, timeline transport. | `SplitComparisonMonitor.tsx` |
| [`useLiveMonitor`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/ui/src/viewmodels/useLiveMonitor.ts) | Camera input feed, live restoration frame proxy, oscilloscope & vectorscope toggles, transport timeline scrubbing. | `LiveMonitor.tsx` |
| [`useCaptureViewModel`](file:///c:/Users/danie/Documents/vhs-capture-scripts-main/ui/src/viewmodels/useCaptureViewModel.ts) | OBS Studio WebSocket capture triggers, auto-watcher arming/disarming. | `CaptureBar.tsx` |

---

## 3. Accessibility Compliance (WCAG 2.1 Level AAA)

The workstation is tailored for professional mastering environments, low-light control rooms, and operators with diverse physical or visual abilities.

### 3.1 Comprehensive Keyboard Navigation & Shortcuts
- Every interactive control (buttons, tabs, strategy cards, links, queue cancel actions, tape cards) is sequentially focusable via `Tab` and `Shift+Tab`.
- **High-Visibility Focus Indicators:** All interactive elements feature prominent dual-layer focus rings:
  `focus-visible:ring-2 focus-visible:ring-amber-400/80 focus-visible:outline-none`.
- **Keyboard Shortcuts:** Built-in support for semantic keys:
  - `Space` / `Enter`: Activation of buttons, preset cards, and tape library items.
  - `Escape`: Standardized dismissal across all modals (`AppPreferencesModal`, `RestorationConflictModal`, `QcReportModal`) and drawers (`FooterStatusBar` hardware drawer) powered by `useEscapeClose`.
  - Arrow keys (`Left` / `Right`): Frame-by-frame and 5s/30s timeline transport navigation in monitor viewports.

### 3.2 Semantic HTML & Screen Reader Support
- **ARIA Attributes & Roles:**
  - `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` on all modal overlays.
  - `role="tablist"`, `role="tab"`, and `aria-selected` across preference tab bars and settings tabs.
  - `role="group"` with `aria-pressed` on multi-state controls (preset selectors, storage provider grids, monitor view mode toggles, console log level filters).
  - `role="status"` and `aria-live="polite"` on real-time telemetry counters, save feedback banners, and the permanent Footer status bar.
  - `role="log"` and `aria-live="polite"` on the diagnostic console log container.
  - `role="separator"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and `aria-label` on the A/B comparison divider line.
  - `role="tooltip"` with `aria-describedby` and keyboard focus access (`group-focus-within:block`) on help icons.
  - `aria-expanded` on collapsible accordions (Tape Library, Panasonic Ingest, Guidance, Chapters drawer, Console panel, Sidebar drawer).
  - `aria-label`, `aria-valuemin`, `aria-valuemax`, and `aria-valuenow` on all range sliders (CRF quality, CodeFormer face fidelity).
- **Visually Hidden Labels:** Graphic-only buttons contain descriptive `aria-label` and `title` attributes, allowing screen readers (NVDA, JAWS, VoiceOver) to convey exact actions.

### 3.3 Chromatic Contrast & Dark Room Calibration
- Strict minimum contrast ratio of **7:1** between text and background across primary content surfaces (meeting WCAG Level AAA standards).
- Deep studio zinc and amber/emerald color palette (`#09090b`, `#18181b`, `#10b981`, `#f59e0b`), mitigating eye strain during extended multi-hour tape monitoring sessions.
- High Contrast mode (`document.body.classList.add('high-contrast')`) and Large Text mode (`document.documentElement.classList.add('large-text')`) with dedicated header toggle buttons.

### 3.4 Respect for `prefers-reduced-motion`
- All Framer Motion animations and CSS transitions automatically detect operating system accessibility settings (`useReducedMotion()`).
- When reduced motion is enabled, slide and spring animations are suppressed in favor of instantaneous crossfades or `duration: 0`.

---

## 4. Sonner Toast Notification System

Sonner replaces intrusive modal dialogs with accessible, structured notifications:
- **Placement:** Bottom-right corner (`bottom-right`) with dynamic queue stacking.
- **Notification Patterns:**
  - `toast.success(t('toast.restoration_complete'))`: Green success confirmation with semantic icon.
  - `toast.error(t('toast.obs_error'))`: High-visibility red alert with an inline retry action.
  - `toast.info(t('toast.preset_applied', { name: p.name }))`: Informative background updates.
  - `toast.promise(...)`: Real-time feedback for asynchronous tasks with automatic resolution transitions.

---

## 5. Multilingual Localization Architecture (i18n)

The interface implements end-to-end localization powered by **i18next** and `react-i18next`:

### 5.1 10 Supported Locales
Full linguistic parity is maintained across 10 global languages:
1. **English (US) - `en-US`** (Default international locale)
2. **Portuguese (Brazil) - `pt-BR`**
3. **Spanish - `es`**
4. **French - `fr`**
5. **German - `de`**
6. **Italian - `it`**
7. **Russian - `ru`**
8. **Simplified Chinese - `zh-CN`**
9. **Japanese - `ja`**
10. **Arabic - `ar`** (Features dynamic Right-to-Left / RTL layout mirroring)

### 5.2 Modular Translation Key Hierarchy
Localization keys are partitioned by functional domain:
```json
{
  "app": {
    "title": "VHS Studio Pro",
    "status": "System Status",
    "ready": "Ready for Ingest"
  },
  "presets": {
    "gold_name": "Broadcast Standard",
    "speed_name": "Hardware Ultrafast",
    "tbc_hold_name": "TBC Frame-Hold (Zero Dropouts)",
    "ai_master_name": "AI Master (Real-ESRGAN)"
  },
  "settings": {
    "tab_presets": "Ready Modes",
    "tab_video": "Video",
    "tab_audio": "Audio"
  },
  "telemetry": {
    "title": "Analog Mastering Telemetry",
    "stage_idle": "Idle / Ready",
    "frames": "Frames"
  }
}
```

### 5.3 Zero-Hardcode Quality Enforcement
As defined in repository governance rules, any hardcoded user-facing text in TSX/JSX, placeholders, tooltips, toasts, or log displays will fail the automated `node scripts/lint.mts` quality gate, blocking commits. 100% of keys are verified with automated parity tests across all 10 translation dictionaries.
