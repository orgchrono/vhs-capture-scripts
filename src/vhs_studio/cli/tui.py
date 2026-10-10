"""Interactive Terminal User Interface (TUI) for VHS Studio Pro.

Provides a full-featured terminal workstation experience without requiring a browser or CSS/HTML.
Integrates directly with PipelineOrchestrator, hardware diagnostics, and media library SSOT.
"""

import os
import sys
import time
import threading
from typing import List, Dict, Any, Optional

from vhs_studio.core.paths import RAW_MEDIA_DIR, RESTORED_MEDIA_DIR
from vhs_studio.core.hardware import get_hardware_profile
from vhs_studio.pipeline_planner import resolve_output_spec
from vhs_studio.core.logger import _enable_vt100_windows, log

# Enable VT100 on Windows host console
_enable_vt100_windows()

# ANSI Color and Style Codes
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
MAGENTA = "\033[95m"
CYAN = "\033[96m"
WHITE = "\033[97m"
BG_DARK = "\033[40m"
BG_BLUE = "\033[44m"


class TuiState:
    """Encapsulates the interactive state of the Terminal User Interface."""

    def __init__(self) -> None:
        self.tapes: List[Dict[str, Any]] = []
        self.selected_tape_idx: int = 0
        self.active_panel: str = "tapes"  # 'tapes', 'presets', 'options', 'actions'
        self.preset: str = "gold"  # 'gold', 'speed', 'tbc_hold', 'ai_master'
        self.params: Dict[str, Any] = {
            "deinterlacer": "bwdif",
            "mode": "double",
            "output_codec": "h264",
            "resolution": "1080p",
            "chroma_fix": True,
            "denoise": False,
            "comb_filter": True,
            "overscan_blanking": True,
            "audio_treatment": True,
            "dropout_clean": False,
            "ai_whisper": False,
            "ai_face_restore": False,
            "ai_rife_60fps": False,
            "ai_upscaler": False,
        }
        self.is_running: bool = False
        self.progress_pct: int = 0
        self.current_stage: str = "Aguardando início"
        self.recent_logs: List[str] = []
        self.status_message: str = "Pronto. Selecione uma fita e pressione [ENTER] para iniciar."
        self.hardware = get_hardware_profile()

        self.apply_preset("gold")
        self.refresh_tapes()

    def refresh_tapes(self) -> None:
        """Scan RAW_MEDIA_DIR and populate available tape files."""
        self.tapes.clear()
        if os.path.exists(RAW_MEDIA_DIR):
            valid_exts = (".mkv", ".mp4", ".mov", ".avi", ".vro", ".raw")
            for fname in sorted(os.listdir(RAW_MEDIA_DIR)):
                if fname.lower().endswith(valid_exts):
                    fpath = os.path.join(RAW_MEDIA_DIR, fname)
                    size_mb = os.path.getsize(fpath) / (1024 * 1024)
                    self.tapes.append({
                        "name": fname,
                        "path": fpath,
                        "size_mb": size_mb,
                    })
        if self.selected_tape_idx >= len(self.tapes) and self.tapes:
            self.selected_tape_idx = len(self.tapes) - 1

    def apply_preset(self, preset_id: str) -> None:
        """Apply restoration parameter preset matching UI SSOT definitions."""
        self.preset = preset_id
        if preset_id == "gold":
            self.params.update({
                "deinterlacer": "bwdif",
                "mode": "double",
                "output_codec": "h264",
                "resolution": "1080p",
                "chroma_fix": True,
                "denoise": False,
                "comb_filter": True,
                "overscan_blanking": True,
                "audio_treatment": True,
                "dropout_clean": False,
                "ai_whisper": False,
                "ai_face_restore": False,
                "ai_rife_60fps": False,
                "ai_upscaler": False,
            })
        elif preset_id == "speed":
            self.params.update({
                "deinterlacer": "bwdif",
                "mode": "passthrough",
                "output_codec": "h264",
                "resolution": "1080p",
                "chroma_fix": False,
                "denoise": False,
                "comb_filter": False,
                "overscan_blanking": True,
                "audio_treatment": False,
                "dropout_clean": False,
                "ai_whisper": False,
                "ai_face_restore": False,
                "ai_rife_60fps": False,
                "ai_upscaler": False,
            })
        elif preset_id == "tbc_hold":
            self.params.update({
                "deinterlacer": "znedi3",
                "mode": "freeze",
                "output_codec": "h264",
                "resolution": "1080p",
                "chroma_fix": True,
                "denoise": True,
                "comb_filter": True,
                "overscan_blanking": True,
                "audio_treatment": True,
                "dropout_clean": True,
                "ai_whisper": False,
                "ai_face_restore": False,
                "ai_rife_60fps": False,
                "ai_upscaler": False,
            })
        elif preset_id == "ai_master":
            self.params.update({
                "deinterlacer": "bwdif",
                "mode": "double",
                "output_codec": "h264",
                "resolution": "1080p",
                "chroma_fix": True,
                "denoise": False,
                "comb_filter": True,
                "overscan_blanking": True,
                "audio_treatment": True,
                "dropout_clean": False,
                "ai_whisper": True,
                "ai_face_restore": True,
                "ai_rife_60fps": True,
                "ai_upscaler": True,
            })

    def add_log(self, message: str) -> None:
        """Append log message and keep latest entries."""
        clean = message.strip()
        if clean:
            self.recent_logs.append(clean)
            if len(self.recent_logs) > 6:
                self.recent_logs.pop(0)


def _get_key_input() -> Optional[str]:
    """Capture non-blocking keyboard input across Windows and POSIX systems."""
    if sys.platform == "win32":
        try:
            import msvcrt
            kbhit_fn = getattr(msvcrt, "kbhit", None)
            getch_fn = getattr(msvcrt, "getch", None)
            if kbhit_fn is not None and getch_fn is not None and kbhit_fn():
                ch = getch_fn()
                if ch in (b"\x00", b"\xe0"):
                    ch2 = getch_fn()
                    if ch2 == b"H":
                        return "UP"
                    if ch2 == b"P":
                        return "DOWN"
                    if ch2 == b"K":
                        return "LEFT"
                    if ch2 == b"M":
                        return "RIGHT"
                elif ch in (b"\r", b"\n"):
                    return "ENTER"
                elif ch == b" ":
                    return "SPACE"
                elif ch == b"\t":
                    return "TAB"
                elif ch in (b"\x1b", b"q", b"Q"):
                    return "QUIT"
                elif ch in (b"r", b"R"):
                    return "REFRESH"
                elif ch in (b"1", b"2", b"3", b"4"):
                    return ch.decode("ascii")
        except Exception:
            return None
    else:
        try:
            import select
            if select.select([sys.stdin], [], [], 0)[0]:
                ch_str = sys.stdin.read(1)
                if ch_str in ("\r", "\n"):
                    return "ENTER"
                elif ch_str == " ":
                    return "SPACE"
                elif ch_str == "\t":
                    return "TAB"
                elif ch_str in ("\x1b", "q", "Q"):
                    return "QUIT"
                elif ch_str in ("r", "R"):
                    return "REFRESH"
                elif ch_str in ("1", "2", "3", "4"):
                    return ch_str
        except Exception:
            return None
    return None


def render_tui(state: TuiState) -> str:
    """Render full ANSI TUI screen buffer into a single string."""
    lines: List[str] = []

    # Clear screen and move cursor to home position
    lines.append("\033[H\033[J")

    # Header
    tier_info = f"Tier {state.hardware.get('tier', 1)} ({state.hardware.get('tier_name', 'Básico')})"
    cpu_name = state.hardware.get("cpu", {}).get("model", "CPU Desconhecida")
    gpu_name = state.hardware.get("gpu", {}).get("name", "GPU Integrada")

    lines.append(f"{CYAN}{BOLD}╔══════════════════════════════════════════════════════════════════════════════════════════════╗{RESET}")
    lines.append(f"{CYAN}{BOLD}║  📼 VHS STUDIO PRO - ESTAÇÃO DE TRABALHO EM TERMINAL (TUI)                                    ║{RESET}")
    lines.append(f"{CYAN}{BOLD}║  Hardware: {WHITE}{tier_info:<16} {DIM}CPU: {cpu_name[:24]:<24} GPU: {gpu_name[:20]:<20}{CYAN}{BOLD}║{RESET}")
    lines.append(f"{CYAN}{BOLD}╠══════════════════════════════════════════════════════════════════════════════════════════════╣{RESET}")

    # Panel 1: Tape Library Explorer (Fitas em media/raw/)
    is_tapes_active = state.active_panel == "tapes"
    panel1_border = GREEN if is_tapes_active else BLUE
    lines.append(f"{panel1_border}║ [1] ACERVO DE FITAS ANALÓGICAS (media/raw/) {'[FOCO ATIVO]' if is_tapes_active else '            '}                         ║{RESET}")

    if not state.tapes:
        lines.append(f"{panel1_border}║   {YELLOW}Nenhuma fita encontrada em media/raw/. Coloque vídeos analógicos para restaurar.{panel1_border}    ║{RESET}")
    else:
        for idx, tape in enumerate(state.tapes[:5]):
            is_selected = idx == state.selected_tape_idx
            pointer = f"{GREEN}▶ {BOLD}" if is_selected else "  "
            size_str = f"{tape['size_mb'] / 1024:.1f} GB" if tape['size_mb'] >= 1024 else f"{tape['size_mb']:.0f} MB"
            name_cut = tape["name"][:45]
            fmt_str = f"{pointer}{name_cut:<46} │ {size_str:>8} │ {RESET}"
            line_content = f"{panel1_border}║ {fmt_str}"
            # Pad to 94 chars
            plain_len = len(f"║   {name_cut:<46} │ {size_str:>8} │ ")
            pad = 93 - plain_len
            lines.append(f"{line_content}{' ' * max(0, pad)}{panel1_border}║{RESET}")

    lines.append(f"{CYAN}{BOLD}╠══════════════════════════════════════════════════════════════════════════════════════════════╣{RESET}")

    # Panel 2: Presets & Opções
    is_presets_active = state.active_panel == "presets"
    p2_border = GREEN if is_presets_active else BLUE
    lines.append(f"{p2_border}║ [2] MODO DE PROCESSAMENTO & PRESETS {'[FOCO ATIVO]' if is_presets_active else '                  '}                               ║{RESET}")

    p_gold = f"{BOLD}{YELLOW}[1] Gold Archive (Referência){RESET}" if state.preset == "gold" else "[1] Gold Archive"
    p_speed = f"{BOLD}{YELLOW}[2] Fast Restore (Velocidade){RESET}" if state.preset == "speed" else "[2] Fast Restore"
    p_tbc = f"{BOLD}{YELLOW}[3] TBC Frame-Hold (Anti-Sync){RESET}" if state.preset == "tbc_hold" else "[3] TBC Frame-Hold"
    p_ai = f"{BOLD}{YELLOW}[4] AI Master (Neural IA){RESET}" if state.preset == "ai_master" else "[4] AI Master"

    lines.append(f"{p2_border}║   {p_gold:<36}   {p_speed:<36}  {p2_border}║{RESET}")
    lines.append(f"{p2_border}║   {p_tbc:<36}   {p_ai:<36}  {p2_border}║{RESET}")

    # Modifiers Summary
    p = state.params
    deint_lbl = p.get("deinterlacer", "bwdif").upper()
    whisper_lbl = f"{GREEN}ON{RESET}" if p.get("ai_whisper") else f"{DIM}OFF{RESET}"
    face_lbl = f"{GREEN}ON{RESET}" if p.get("ai_face_restore") else f"{DIM}OFF{RESET}"
    upscale_lbl = f"{GREEN}ON{RESET}" if p.get("ai_upscaler") else f"{DIM}OFF{RESET}"
    codec_lbl = p.get("output_codec", "h264").upper()

    summary = (
        f"Config: Desentrel.: {CYAN}{deint_lbl}{RESET} │ Codec: {CYAN}{codec_lbl}{RESET} │ "
        f"Whisper: {whisper_lbl} │ Face: {face_lbl} │ Upscale: {upscale_lbl}"
    )
    lines.append(f"{p2_border}║   {summary:<88} {p2_border}║{RESET}")

    lines.append(f"{CYAN}{BOLD}╠══════════════════════════════════════════════════════════════════════════════════════════════╣{RESET}")

    # Panel 3: Status da Restauração & Telemetria
    lines.append(f"{CYAN}║ TELEMETRIA & EXECUÇÃO DO DAG                                                                 ║{RESET}")

    status_tag = f"{YELLOW}PROCESSANDO...{RESET}" if state.is_running else f"{GREEN}EM ESPERA{RESET}"
    lines.append(f"{CYAN}║   Status: {status_tag} │ Etapa: {WHITE}{state.current_stage:<60}{CYAN}║{RESET}")

    # Progress bar
    bar_width = 50
    filled = int((state.progress_pct / 100.0) * bar_width)
    bar_str = f"[{'█' * filled}{'░' * (bar_width - filled)}]"
    lines.append(f"{CYAN}║   Progresso: {GREEN}{bar_str}{RESET} {state.progress_pct:>3}%                                                {CYAN}║{RESET}")

    # Mini Log Drawer
    lines.append(f"{CYAN}║ ──────────────────────────────────────────────────────────────────────────────────────────── ║{RESET}")
    lines.append(f"{CYAN}║   Console de Logs Recentes:                                                                  ║{RESET}")
    if not state.recent_logs:
        lines.append(f"{CYAN}║   {DIM}Nenhum log gerado ainda.{RESET}                                                                   {CYAN}║{RESET}")
    else:
        for log_line in state.recent_logs[-3:]:
            cut_log = log_line[:86]
            lines.append(f"{CYAN}║   {DIM}{cut_log:<86}{RESET} {CYAN}║{RESET}")

    lines.append(f"{CYAN}{BOLD}╠══════════════════════════════════════════════════════════════════════════════════════════════╣{RESET}")
    # Footer Navigation Controls
    nav_line = (
        f"{BOLD}{WHITE}[↑/↓]{RESET} Selecionar Fita   "
        f"{BOLD}{WHITE}[1-4]{RESET} Presets   "
        f"{BOLD}{WHITE}[R]{RESET} Atualizar   "
        f"{BOLD}{GREEN}[ENTER]{RESET} INICIAR   "
        f"{BOLD}{RED}[Q]{RESET} Sair"
    )
    lines.append(f"{CYAN}{BOLD}║  {nav_line:<100}{CYAN}{BOLD}║{RESET}")
    lines.append(f"{CYAN}{BOLD}╚══════════════════════════════════════════════════════════════════════════════════════════════╝{RESET}")

    return "\n".join(lines)


def _run_pipeline_worker(state: TuiState, input_file: str, output_path: str, params: Dict[str, Any]) -> None:
    """Worker background thread executing the actual PipelineOrchestrator."""
    try:
        from vhs_studio.pipeline import PipelineOrchestrator
        import argparse

        state.is_running = True
        state.progress_pct = 10
        state.current_stage = "Inicializando DAG Multi-Engine"
        state.add_log(f"[TUI] Iniciando restauração de: {input_file}")

        dummy_args = argparse.Namespace(input=input_file, params_json="{}")
        orch = PipelineOrchestrator(input_file, output_path, dummy_args, params)

        state.progress_pct = 30
        state.current_stage = "Processando desentrelaçamento QTGMC / BWDIF"
        state.add_log("[TUI] Executando desentrelaçamento e correção de base de tempo")

        orch.start()

        state.progress_pct = 100
        state.current_stage = "Concluído com Sucesso!"
        state.add_log(f"[TUI] Restauração concluída! Salvo em: {output_path}")
        state.status_message = "Processo finalizado com sucesso."
    except Exception as exc:
        state.current_stage = f"Erro: {str(exc)[:50]}"
        state.add_log(f"[TUI ERRO] Falha no pipeline: {exc}")
        log.error(f"[TUI ERROR] Pipeline execution failed: {exc}")
    finally:
        state.is_running = False


def run_tui() -> None:
    """Main interactive execution loop for VHS Studio Terminal Workstation."""
    state = TuiState()

    # Hide cursor
    sys.stdout.write("\033[?25l")
    sys.stdout.flush()

    try:
        while True:
            # Render and display current frame
            output = render_tui(state)
            sys.stdout.write(output)
            sys.stdout.flush()

            # Process input
            key = _get_key_input()

            if key == "QUIT":
                break
            elif key == "REFRESH":
                state.refresh_tapes()
                state.add_log("[TUI] Lista de fitas atualizada.")
            elif key == "UP":
                if state.selected_tape_idx > 0:
                    state.selected_tape_idx -= 1
            elif key == "DOWN":
                if state.selected_tape_idx < len(state.tapes) - 1:
                    state.selected_tape_idx += 1
            elif key == "1":
                state.apply_preset("gold")
                state.add_log("[TUI] Preset aplicado: Gold Archive")
            elif key == "2":
                state.apply_preset("speed")
                state.add_log("[TUI] Preset aplicado: Fast Restore")
            elif key == "3":
                state.apply_preset("tbc_hold")
                state.add_log("[TUI] Preset aplicado: TBC Frame-Hold")
            elif key == "4":
                state.apply_preset("ai_master")
                state.add_log("[TUI] Preset aplicado: AI Master (Neural IA)")
            elif key == "ENTER":
                if not state.is_running:
                    if not state.tapes:
                        state.add_log("[TUI AVISO] Nenhuma fita selecionada. Adicione fitas em media/raw/.")
                    else:
                        selected_tape = state.tapes[state.selected_tape_idx]
                        input_file = selected_tape["path"]
                        base_name = os.path.splitext(selected_tape["name"])[0]
                        out_dir = os.path.join(RESTORED_MEDIA_DIR, base_name)
                        os.makedirs(out_dir, exist_ok=True)
                        output_path, _ = resolve_output_spec(input_file, out_dir, state.params)

                        worker = threading.Thread(
                            target=_run_pipeline_worker,
                            args=(state, input_file, output_path, state.params),
                            daemon=True,
                        )
                        worker.start()

            time.sleep(0.08)
    finally:
        # Restore cursor and clean screen
        sys.stdout.write("\033[?25h\033[2J\033[H")
        sys.stdout.flush()
        print(f"{GREEN}VHS Studio Pro TUI finalizado com sucesso.{RESET}")


if __name__ == "__main__":
    run_tui()
