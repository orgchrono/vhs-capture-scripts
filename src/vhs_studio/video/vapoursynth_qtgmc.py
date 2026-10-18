import os
import sys
import shutil
import subprocess
from typing import Optional
from vhs_studio.core.paths import PROJECT_ROOT, TOOLS_DIR
from vhs_studio.core.system_process import popen_silent
from vhs_studio.core.logger import log


class VapourSynthQTGMC:
    """
    Gerencia a execucao e geracao de scripts VapourSynth com QTGMC.
    """

    @staticmethod
    def _ensure_in_path(directory: str) -> None:
        """Add directory to PATH environment variable if not already present."""
        if directory and os.path.isdir(directory):
            current_path = os.environ.get("PATH", "")
            if directory.lower() not in current_path.lower():
                os.environ["PATH"] = directory + os.pathsep + current_path

    @classmethod
    def get_vspipe_path(cls) -> Optional[str]:
        """Locate vspipe executable across PATH, Registry, Python packages, and user directories."""
        # 1. Existing PATH
        found = shutil.which("vspipe")
        if found and os.path.isfile(found):
            return found

        # 2. Windows Registry (HKCU and HKLM)
        if sys.platform == "win32":
            try:
                import winreg
                for root in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
                    for subkey in (r"SOFTWARE\VapourSynth", r"SOFTWARE\WOW6432Node\VapourSynth"):
                        try:
                            with winreg.OpenKey(root, subkey) as k:
                                try:
                                    v, _ = winreg.QueryValueEx(k, "VSPipeEXE")
                                    if v and os.path.isfile(v):
                                        cls._ensure_in_path(os.path.dirname(v))
                                        return v
                                except (FileNotFoundError, OSError):
                                    pass
                                try:
                                    p, _ = winreg.QueryValueEx(k, "Path")
                                    if p:
                                        cand = os.path.join(p, "vspipe.exe")
                                        if os.path.isfile(cand):
                                            cls._ensure_in_path(p)
                                            return cand
                                except (FileNotFoundError, OSError):
                                    pass
                        except (FileNotFoundError, OSError):
                            pass
            except Exception as e:
                log.debug(f"[QTGMC] Erro consultando registro do Windows: {e}")

        # 3. Standard and project directories
        candidates = []
        if sys.platform == "win32":
            local_appdata = os.environ.get("LOCALAPPDATA", "")
            prog_files = os.environ.get("ProgramFiles", r"C:\Program Files")
            prog_files_x86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
            candidates.extend([
                os.path.join(prog_files, "VapourSynth", "vspipe.exe"),
                os.path.join(prog_files_x86, "VapourSynth", "vspipe.exe"),
                os.path.join(local_appdata, "Programs", "VapourSynth", "vspipe.exe"),
                os.path.join(local_appdata, "Programs", "VapourSynth", "sdk", "vspipe.exe"),
                os.path.join(local_appdata, "Programs", "VapourSynth", "python", "vspipe.exe"),
                os.path.join(PROJECT_ROOT, "tools", "vapoursynth", "vspipe.exe"),
                os.path.join(PROJECT_ROOT, "tools", "vspipe.exe"),
                os.path.join(PROJECT_ROOT, ".venv", "Scripts", "vspipe.exe"),
                os.path.join(os.getcwd(), ".venv", "Scripts", "vspipe.exe"),
            ])
            # Check Python site-packages in AppData
            python_appdata = os.path.join(local_appdata, "Python")
            if os.path.isdir(python_appdata):
                try:
                    for py_dir in os.listdir(python_appdata):
                        candidates.append(os.path.join(python_appdata, py_dir, "Lib", "site-packages", "vapoursynth", "vspipe.exe"))
                        candidates.append(os.path.join(python_appdata, py_dir, "Scripts", "vspipe.exe"))
                except Exception:
                    pass
        else:
            candidates.extend([
                "/usr/bin/vspipe",
                "/usr/local/bin/vspipe",
                "/opt/homebrew/bin/vspipe",
                os.path.expanduser("~/.local/bin/vspipe"),
            ])

        for cand in candidates:
            if cand and os.path.isfile(cand):
                cls._ensure_in_path(os.path.dirname(cand))
                return cand

        # 4. Check if vapoursynth python package directory has vspipe
        try:
            import vapoursynth
            vs_dir = os.path.dirname(vapoursynth.__file__)
            cand = os.path.join(vs_dir, "vspipe.exe" if sys.platform == "win32" else "vspipe")
            if os.path.isfile(cand):
                cls._ensure_in_path(vs_dir)
                return cand
        except Exception:
            pass

        return None

    @classmethod
    def is_available(cls) -> bool:
        """Check if VapourSynth and vspipe are available on the system."""
        return cls.get_vspipe_path() is not None

    @staticmethod
    def check_python_vapoursynth():
        """Documentation for check_python_vapoursynth."""
        try:
            return True
        except ImportError:
            return False

    @classmethod
    def generate_qtgmc_script(
        cls,
        input_path,
        output_vpy_path,
        preset="Slower",
        field_order="tff",
        fps_mode=2,
        apply_comb_filter=False,
    ):
        """Documentation for generate_qtgmc_script."""
        escaped_input = input_path.replace("\\", "/")
        tff_bool = "True" if field_order.lower() == "tff" else "False"

        comb_str = (
            "clip = core.tcomb.TComb(clip, mode=2, fthreshl=4, fthreshc=5, othreshl=5, othreshc=6)"
            if apply_comb_filter
            else ""
        )

        script_content = f"""# Script VapourSynth QTGMC gerado automaticamente pela Pipeline VHS Studio
import vapoursynth as vs
from vapoursynth import core
import havsfunc as haf
import multiprocessing

# OTIMIZACAO DE PERFORMANCE: MAXIMO PARALELISMO
core.num_threads = multiprocessing.cpu_count()
core.max_cache_size = 4000 # 4GB de cache agressivo para evitar engasgos de disco

try:
    clip = core.ffms2.Source(source=r"{escaped_input}")
except Exception:
    try:
        clip = core.lsmas.LWLibavSource(source=r"{escaped_input}")
    except Exception:
        clip = core.bs.VideoSource(source=r"{escaped_input}")

{comb_str}

clip = haf.QTGMC(
    clip,
    Preset="{preset}",
    TFF={tff_bool},
    FPSDivisor={1 if fps_mode == 2 else 2},
    EdiMode="NNEDI3"
)

# OTIMIZACAO: Prefetch de frames em background
clip = clip.std.Prefetch(frames=core.num_threads * 2)

clip.set_output()
"""
        with open(output_vpy_path, "w", encoding="utf-8") as f:
            f.write(script_content)
        return output_vpy_path

    @classmethod
    def run_vspipe_ffmpeg(cls, vpy_path, ffmpeg_output_args):
        """Documentation for run_vspipe_ffmpeg."""
        vspipe_bin = cls.get_vspipe_path()
        if not vspipe_bin:
            raise RuntimeError("vspipe nao encontrado.")

        cmd_vspipe = [vspipe_bin, "-c", "y4m", vpy_path, "-"]
        log.info(f"[QTGMC] Executando VapourSynth: {' '.join(cmd_vspipe)}")

        p_vs = popen_silent(
            cmd_vspipe, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        p_ff = popen_silent(
            ffmpeg_output_args, stdin=p_vs.stdout, stderr=subprocess.PIPE
        )
        p_vs.stdout.close()

        stdout, stderr = p_ff.communicate()
        return p_ff.returncode == 0
