# ♿ Interface Design System, Accessibility (a11y) & Localization (i18n)

This document details the Design System conventions, **WCAG 2.1 Level AAA** digital accessibility implementations, and the multilingual localization architecture established for the **VHS Studio Pro** workstation interface.

---

## 1. User Interface Technology Stack

The graphical presentation application is located in `ui/` and is engineered with:
- **React 19:** High-performance UI rendering utilizing functional components, custom hooks, and concurrent features.
- **Vite 6:** Ultra-fast bundling engine with instantaneous Hot Module Replacement (HMR) and optimized tree-shaking code splitting.
- **Tailwind CSS v4:** Atomic styling utilities guaranteeing visual consistency, zero CSS runtime overhead, and automated bundle purging.
- **Redux Toolkit Query (RTK Query):** Advanced API caching and state synchronization preventing duplicate network requests and unnecessary component re-renders.
- **Sonner Toast:** Accessible, non-intrusive toast notifications with action buttons and dynamic progress transitions.
- **Framer Motion:** Smooth, hardware-accelerated transitions that honor motion-sensitivity accessibility settings.
- **Lucide Icons:** Highly legible, clean SVG icons.

---

## 2. Accessibility Compliance (WCAG 2.1 Level AAA)

The workstation is tailored for professional mastering environments, low-light control rooms, and operators with diverse physical or visual abilities.

### 2.1 Comprehensive Keyboard Navigation
- Every interactive control (buttons, tabs, strategy cards, links, queue cancel actions) is sequentially focusable via `Tab` and `Shift+Tab`.
- **High-Visibility Focus Indicators:** All interactive elements feature prominent dual-layer focus rings:
  `focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none`.
- **Keyboard Shortcuts:** Built-in support for semantic keys (`Space` / `Enter` for activation, `Escape` for dismissing modals and drawers).

### 2.2 Semantic HTML & Screen Reader Support
- **ARIA Attributes:**
  - `aria-label` and `aria-labelledby` on icon buttons and telemetry indicators.
  - `role="status"` and `aria-live="polite"` on real-time counters (FPS, recorded frames, elapsed time) and diagnostic log consoles.
  - `aria-live="assertive"` on critical error alerts and OBS disconnect warnings.
  - Tab navigation bars implement `role="tablist"`, `role="tab"`, and `role="tabpanel"` linked via `aria-controls`.
- **Visually Hidden Labels:** Graphic-only buttons contain `<span class="sr-only">` text elements, allowing assistive technologies (NVDA, JAWS, VoiceOver) to convey exact actions.

### 2.3 Chromatic Contrast & Dark Room Calibration
- Strict minimum contrast ratio of **7:1** between text and background across primary content surfaces (meeting WCAG Level AAA standards).
- Deep zinc and emerald color palette (`#09090b`, `#18181b`, `#10b981`), mitigating eye strain during extended multi-hour tape monitoring sessions.

### 2.4 Respect for `prefers-reduced-motion`
- All Framer Motion animations and CSS transitions automatically detect operating system accessibility settings.
- When reduced motion is enabled, slide and scale animations are suppressed in favor of instantaneous crossfades.

---

## 3. Sonner Toast Notification System

Sonner replaces intrusive modal dialogs with accessible, structured notifications:
- **Placement:** Bottom-right corner (`bottom-right`) with dynamic queue stacking.
- **Notification Patterns:**
  - `toast.success(t('toast.restoration_complete'))`: Green success confirmation with semantic icon.
  - `toast.error(t('toast.obs_error'))`: High-visibility red alert with an inline retry action.
  - `toast.info(...)`: Informative background updates.
  - `toast.promise(...)`: Real-time feedback for asynchronous tasks with automatic resolution transitions.

---

## 4. Multilingual Localization Architecture (i18n)

The interface implements end-to-end localization powered by **i18next** and `react-i18next`:

### 4.1 10 Supported Locales
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

### 4.2 Modular Translation Key Hierarchy
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

### 4.3 Zero-Hardcode Quality Enforcement
As defined in repository governance rules, any hardcoded text in TSX/JSX, placeholders, tooltips, or toasts will fail the automated `node scripts/lint.mts` quality gate, blocking commits.

