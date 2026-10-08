import subprocess
import shutil
from vhs_studio.core.logger import log


class VapourSynthQTGMC:
    """
    Gerencia a execucao e geracao de scripts VapourSynth com QTGMC.
    """

    @staticmethod
    def is_available():
        return shutil.which("vspipe") is not None

    @staticmethod
    def check_python_vapoursynth():
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
        if not cls.is_available():
            raise RuntimeError("vspipe nao encontrado.")

        cmd_vspipe = ["vspipe", "-c", "y4m", vpy_path, "-"]
        log.info(f"[QTGMC] Executando VapourSynth: {' '.join(cmd_vspipe)}")

        p_vs = subprocess.Popen(
            cmd_vspipe, stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        p_ff = subprocess.Popen(
            ffmpeg_output_args, stdin=p_vs.stdout, stderr=subprocess.PIPE
        )
        p_vs.stdout.close()

        stdout, stderr = p_ff.communicate()
        return p_ff.returncode == 0
