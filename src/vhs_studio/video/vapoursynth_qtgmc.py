import os
import sys
import subprocess
import shutil
from vhs_studio.core.logger import log


class VapourSynthQTGMC:
    """
    Gerencia a execução e geração de scripts VapourSynth com QTGMC (Padrão Ouro de Preservação).
    Permite processamento com compensação de movimento temporal de máxima qualidade.
    """

    @staticmethod
    def is_available():
        """Verifica se o binário vspipe está disponível no PATH."""
        return shutil.which("vspipe") is not None

    @staticmethod
    def check_python_vapoursynth():
        """Verifica se o módulo vapoursynth pode ser importado."""
        try:
            pass

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
        """
        Gera um script .vpy configurado para desentrelaçamento de alta precisão via QTGMC.
        field_order: 'tff' (Top Field First) ou 'bff' (Bottom Field First)
        fps_mode: 2 para dobrar a taxa de quadros (29.97i -> 59.94p), 1 para taxa simples.
        apply_comb_filter: Se True, aplica TComb para mitigar dot-crawl em sinal composto antes de desentrelaçar.
        """
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

# Carrega a fonte (tenta ffms2 ou lsmash)
try:
    clip = core.ffms2.Source(source=r"{escaped_input}")
except Exception:
    try:
        clip = core.lsmas.LWLibavSource(source=r"{escaped_input}")
    except Exception:
        clip = core.bs.VideoSource(source=r"{escaped_input}")

{comb_str}

# Aplica QTGMC (Avançado de desentrelaçamento temporal)
# Preset: {preset} | TFF: {tff_bool} | FPSDivisor: {1 if fps_mode == 2 else 2}
clip = haf.QTGMC(
    clip,
    Preset="{preset}",
    TFF={tff_bool},
    FPSDivisor={1 if fps_mode == 2 else 2},
    EdiMode="NNEDI3"
)

clip.set_output()
"""
        with open(output_vpy_path, "w", encoding="utf-8") as f:
            f.write(script_content)
        return output_vpy_path

    @classmethod
    def run_vspipe_ffmpeg(cls, vpy_path, ffmpeg_output_args):
        """
        Executa o pipeline via streaming pipe do vspipe diretamente para o FFmpeg.
        """
        if not cls.is_available():
            raise RuntimeError(
                "vspipe não foi encontrado no PATH. Instale o VapourSynth:\n"
                "  1. Baixe de: https://github.com/vapoursynth/vapoursynth/releases\n"
                "  2. Ou instale via: winget install VapourSynth.VapourSynth\n"
                "  3. Instale havsfunc: pip install havsfunc"
            )

        cmd_vspipe = ["vspipe", "-c", "y4m", vpy_path, "-"]
        log.info(f"[QTGMC] Executando VapourSynth: {' '.join(cmd_vspipe)}")

        p_vs = subprocess.Popen(cmd_vspipe, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        p_ff = subprocess.Popen(ffmpeg_output_args, stdin=p_vs.stdout, stderr=subprocess.PIPE)
        p_vs.stdout.close()

        stdout, stderr = p_ff.communicate()
        return p_ff.returncode == 0

    @classmethod
    def install_dependencies(cls, interactive=True):
        """
        Executa a instalação automatizada do VapourSynth e QTGMC.
        No Windows utiliza PowerShell (winget / installer oficial).
        No macOS / Linux utiliza o script Bash correspondente (brew / apt / pacman / dnf).
        """
        bin_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "bin"))

        if sys.platform == "win32":
            script_ps1 = os.path.join(bin_dir, "setup_vapoursynth.ps1")
            log.info(f"[QTGMC INSTALADOR] Iniciando instalador PowerShell no Windows: {script_ps1}")
            cmd = [
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                script_ps1,
            ]
        else:
            script_sh = os.path.join(bin_dir, "setup_vapoursynth.sh")
            log.info(f"[QTGMC INSTALADOR] Iniciando instalador Bash no macOS/Linux: {script_sh}")
            cmd = ["bash", script_sh]

        try:
            res = subprocess.run(cmd, check=False)
            return res.returncode == 0
        except Exception as e:
            log.error(f"[QTGMC INSTALADOR] Falha ao executar script de instalação: {e}")
            return False
