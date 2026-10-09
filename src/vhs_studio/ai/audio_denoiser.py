"""Neural audio restoration engine for magnetic tape hiss and background hum removal."""

import subprocess
from vhs_studio.core.logger import log
from vhs_studio.core.toolchain import Toolchain
from vhs_studio.core.constants import (
    DEFAULT_AUDIO_DENOISE_NR_DB,
    DEFAULT_AUDIO_DENOISE_NF_DB,
    AUDIO_NOTCH_HUM_FREQ_HZ,
    AUDIO_NOTCH_WIDTH_HZ,
    AUDIO_NOTCH_ATTENUATION_DB,
)


class AudioDenoiser:
    """Manages neural (DeepFilterNet) and adaptive spectral audio denoising for analog tapes."""

    @staticmethod
    def is_deepfilter_available() -> bool:
        """Check if DeepFilterNet Python package is available."""
        try:
            import df  # noqa: F401
            return True
        except ImportError:
            return False

    @staticmethod
    def denoise_audio_file(
        input_wav: str,
        output_wav: str,
        noise_reduction_db: float = DEFAULT_AUDIO_DENOISE_NR_DB,
    ) -> bool:
        """
        Denoise an audio file removing analog tape hiss and electrical hum.
        Uses DeepFilterNet if available, otherwise falls back to adaptive FFT spectral subtraction.
        """
        if AudioDenoiser.is_deepfilter_available():
            try:
                log.info("[AUDIO AI] Aplicando DeepFilterNet (rede neural em tempo real)...")
                from df.enhance import enhance, init_df
                import torchaudio

                model, df_state, _ = init_df()
                audio, sr = torchaudio.load(input_wav)
                enhanced = enhance(model, df_state, audio)
                torchaudio.save(output_wav, enhanced, sr)
                log.info("[AUDIO AI] Denoise neural com DeepFilterNet concluído com sucesso!")
                return True
            except Exception as e:
                log.warning(f"[AUDIO AI] DeepFilterNet falhou ({e}), usando fallback espectral do FFmpeg.")

        # Fallback: High-quality FFmpeg adaptive FFT spectral denoiser + DC notch filter
        log.info("[AUDIO AI] Aplicando filtro espectral adaptativo de fita magnética (FFmpeg afftdn)...")
        ffmpeg_bin = Toolchain.get_ffmpeg_path()
        filter_str = (
            f"dcshift=shift=0,"
            f"anequalizer=c0 f={AUDIO_NOTCH_HUM_FREQ_HZ} w={AUDIO_NOTCH_WIDTH_HZ} g={AUDIO_NOTCH_ATTENUATION_DB}|"
            f"c1 f={AUDIO_NOTCH_HUM_FREQ_HZ} w={AUDIO_NOTCH_WIDTH_HZ} g={AUDIO_NOTCH_ATTENUATION_DB},"
            f"afftdn=nr={noise_reduction_db:.1f}:nf={DEFAULT_AUDIO_DENOISE_NF_DB:.1f}:tn=1"
        )
        cmd = [
            ffmpeg_bin,
            "-hide_banner",
            "-threads", "0",
            "-y",
            "-i", input_wav,
            "-af", filter_str,
            output_wav
        ]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, check=True)
            return res.returncode == 0
        except Exception as e:
            log.error(f"[AUDIO AI] Falha no filtro de áudio: {e}")
            return False
