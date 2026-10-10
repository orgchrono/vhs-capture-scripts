"""Video and audio FFmpeg filter graph and argument builder.

Employs functional decomposition and pure functions to construct immutable
filter chains and encoder arguments without side-effects (FP Core / SoC).
"""

import sys
import subprocess
from typing import Optional, List, Callable

from vhs_studio.config.settings import Filters, AudioConfig, OutputConfig
from vhs_studio.core.logger import log
from vhs_studio.core.toolchain import Toolchain
from vhs_studio.core.constants import (
    DEFAULT_CRF,
    DEFAULT_ENCODER_TEST_TIMEOUT_SEC,
    OVERSCAN_BLANKING_HEIGHT_PX,
    AUDIO_NOTCH_HUM_FREQ_HZ,
    AUDIO_NOTCH_WIDTH_HZ,
    AUDIO_NOTCH_ATTENUATION_DB,
    DEFAULT_AUDIO_DENOISE_NR_DB,
    DEFAULT_AUDIO_DENOISE_NF_DB,
)


def resolve_deinterlace_filter(deinterlacer: str, has_filter: Callable[[str], bool]) -> str:
    """Pure functional resolver for deinterlacing filter string with capability fallback."""
    if deinterlacer == "bwdif":
        return Filters.DEINT_BWDIF_BOB
    if deinterlacer == "bwdif_single":
        return Filters.DEINT_BWDIF_SINGLE
    if deinterlacer in ("znedi3", "nnedi3"):
        if has_filter("znedi3"):
            return Filters.DEINT_ZNEDI3
        if has_filter("nnedi"):
            return Filters.DEINT_NNEDI
        return Filters.DEINT_BWDIF_BOB
    if deinterlacer == "nnedi":
        return Filters.DEINT_NNEDI if has_filter("nnedi") else Filters.DEINT_BWDIF_BOB
    if deinterlacer == "yadif":
        return Filters.DEINT_YADIF
    return ""


def resolve_codec_video_args(output_codec: str, encoder: Optional[str], crf: int) -> List[str]:
    """Pure functional resolver for video codec parameters."""
    if output_codec == "prores":
        return ["-c:v", "prores_ks", "-profile:v", "3", "-pix_fmt", "yuv422p10le", "-vendor", "ap10"]
    if output_codec == "ffv1":
        return ["-c:v", "ffv1", "-level", "3", "-g", "1", "-pix_fmt", "yuv420p"]
    if encoder == "h264_videotoolbox":
        return ["-c:v", "h264_videotoolbox", "-q:v", str(min(100, max(1, 100 - crf * 2))), "-pix_fmt", "yuv420p"]
    if encoder == "h264_nvenc":
        return ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", str(crf), "-rc", "vbr"]
    if encoder == "h264_amf":
        return ["-c:v", "h264_amf", "-quality", "speed", "-rc", "cqp", "-qp_i", str(crf), "-qp_p", str(crf)]
    if encoder == "h264_vaapi":
        return ["-c:v", "h264_vaapi", "-qp", str(crf)]
    if encoder == "h264_qsv":
        return ["-c:v", "h264_qsv", "-global_quality", str(crf)]
    if encoder == "hevc_videotoolbox":
        return ["-c:v", "hevc_videotoolbox", "-q:v", str(min(100, max(1, 100 - crf * 2))), "-pix_fmt", "yuv420p"]
    if encoder == "hevc_nvenc":
        return ["-c:v", "hevc_nvenc", "-preset", "p4", "-cq", str(crf), "-rc", "vbr"]
    if encoder == "hevc_amf":
        return ["-c:v", "hevc_amf", "-quality", "speed", "-rc", "cqp", "-qp_i", str(crf), "-qp_p", str(crf)]
    if encoder == "hevc_qsv":
        return ["-c:v", "hevc_qsv", "-global_quality", str(crf)]
    if output_codec == "hevc":
        return ["-c:v", "libx265", "-preset", "veryfast", "-crf", str(crf), "-pix_fmt", "yuv420p"]
    return ["-c:v", "libx264", "-preset", "veryfast", "-crf", str(crf), "-pix_fmt", "yuv420p"]


def resolve_codec_audio_args(output_codec: str) -> List[str]:
    """Pure functional resolver for audio codec parameters."""
    if output_codec in ("prores", "ffv1"):
        return ["-c:a", "pcm_s24le"]
    return ["-c:a", AudioConfig.CODEC, "-b:a", AudioConfig.BITRATE]


class FilterBuilder:
    """Constructs adaptive FFmpeg filter chains and hardware-accelerated encoding arguments."""

    def __init__(
        self,
        target_1080p: bool = True,
        crf: int = DEFAULT_CRF,
        mode: str = "freeze",
        output_codec: str = "h264",
    ):
        self.output_codec = output_codec
        self.encoder = self.detect_best_encoder(output_codec) if output_codec in ("h264", "hevc") else None
        self.target_1080p = target_1080p
        self.crf = crf
        self.mode = mode

    @staticmethod
    def check_filter_support(filter_name: str) -> bool:
        """Check if FFmpeg supports the requested filter."""
        return Toolchain.has_filter(filter_name)

    @staticmethod
    def check_encoder_support(encoder_name: str) -> bool:
        """Verify if current hardware and driver can successfully encode a test frame."""
        try:
            cmd = [
                Toolchain.get_ffmpeg_path(),
                "-f",
                "lavfi",
                "-i",
                "nullsrc=s=64x64:d=0.04",
                "-c:v",
                encoder_name,
                "-f",
                "null",
                "-",
            ]
            res = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                errors="replace",
                timeout=DEFAULT_ENCODER_TEST_TIMEOUT_SEC,
            )
            return res.returncode == 0
        except Exception:
            return False

    @classmethod
    def detect_best_encoder(cls, output_codec: str = "h264") -> str:
        """Auto-detect optimal hardware encoder (NVIDIA, Apple, AMD, VAAPI, Intel) or fallback."""
        if output_codec == "hevc":
            if sys.platform == "darwin":
                if cls.check_encoder_support("hevc_videotoolbox"):
                    return "hevc_videotoolbox"
                return "libx265"
            if cls.check_encoder_support("hevc_nvenc"):
                return "hevc_nvenc"
            if sys.platform == "win32" and cls.check_encoder_support("hevc_amf"):
                return "hevc_amf"
            if cls.check_encoder_support("hevc_qsv"):
                return "hevc_qsv"
            return "libx265"

        if sys.platform == "darwin":
            if cls.check_encoder_support("h264_videotoolbox"):
                return "h264_videotoolbox"
            return "libx264"

        if cls.check_encoder_support("h264_nvenc"):
            return "h264_nvenc"
        if sys.platform == "win32" and cls.check_encoder_support("h264_amf"):
            return "h264_amf"
        if sys.platform != "win32" and cls.check_encoder_support("h264_vaapi"):
            return "h264_vaapi"
        if cls.check_encoder_support("h264_qsv"):
            return "h264_qsv"
        return "libx264"

    def build_video_filters(
        self,
        apply_chroma: bool,
        apply_denoise: bool,
        deinterlacer: str,
        apply_comb_filter: bool = False,
        overscan_blanking: bool = False,
        apply_dropout_clean: bool = False,
    ) -> str:
        """Assemble the video filtergraph string using declarative functional composition."""
        dropout_filter = ""
        if apply_dropout_clean:
            from vhs_studio.video.dropout_cleaner import DropoutCleaner
            dropout_filter = DropoutCleaner.get_ffmpeg_filter()

        comb_filter = "dedot=m=comb" if apply_comb_filter and self.check_filter_support("dedot") else ""
        overscan_box = (
            f"drawbox=y=ih-{OVERSCAN_BLANKING_HEIGHT_PX}:color=black:width=iw:height={OVERSCAN_BLANKING_HEIGHT_PX}:t=fill"
            if overscan_blanking
            else ""
        )

        filters = [
            f
            for f in (
                overscan_box,
                dropout_filter,
                comb_filter,
                Filters.CHROMA_SHIFT if apply_chroma else "",
                Filters.DENOISE if apply_denoise else "",
                resolve_deinterlace_filter(deinterlacer, self.check_filter_support),
                Filters.UPSCALE_1080P_LANCZOS if self.target_1080p else "",
            )
            if f
        ]
        return ",".join(filters) if filters else "null"

    def build_ffmpeg_output_args(
        self,
        input_path: str,
        output_path: str,
        w: int,
        h: int,
        fps: float,
        start_sec: float,
        audio_offset: float,
        duration: float,
        vf: str,
        audio_mode: str,
        audio_treatment: bool = False,
        ai_audio_denoise: bool = False,
    ) -> List[str]:
        """Build CLI command arguments for muxing restored video frames with aligned audio."""
        header_args = [
            Toolchain.get_ffmpeg_path(),
            "-hide_banner",
            "-threads",
            "0",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "yuv420p",
            "-s",
            f"{w}x{h}",
            "-r",
            f"{fps:.3f}",
            "-i",
            "-",
        ]

        a_start_sec = max(0.0, start_sec + audio_offset)
        timing_args = (
            (["-ss", f"{a_start_sec:.3f}"] if a_start_sec > 0.05 else [])
            + (["-t", f"{duration:.3f}"] if duration else [])
        )

        input_mapping_args = ["-i", input_path, "-map", "0:v", "-map", "1:a", "-vf", vf]

        audio_pan_filter = (
            AudioConfig.PAN_MONO_LEFT if audio_mode == "mono_l"
            else AudioConfig.PAN_MONO_RIGHT if audio_mode == "mono_r"
            else ""
        )
        audio_notch_filter = (
            f"dcshift=shift=0,anequalizer=c0 f={AUDIO_NOTCH_HUM_FREQ_HZ} w={AUDIO_NOTCH_WIDTH_HZ} g={AUDIO_NOTCH_ATTENUATION_DB}|"
            f"c1 f={AUDIO_NOTCH_HUM_FREQ_HZ} w={AUDIO_NOTCH_WIDTH_HZ} g={AUDIO_NOTCH_ATTENUATION_DB}"
            if audio_treatment
            else ""
        )
        audio_denoise_filter = (
            f"afftdn=nr={DEFAULT_AUDIO_DENOISE_NR_DB:.1f}:nf={DEFAULT_AUDIO_DENOISE_NF_DB:.1f}:tn=1"
            if ai_audio_denoise
            else ""
        )

        af_chain = [f for f in (audio_pan_filter, audio_notch_filter, audio_denoise_filter) if f]
        audio_filter_args = ["-af", ",".join(af_chain)] if af_chain else []

        video_codec_args = resolve_codec_video_args(self.output_codec, self.encoder, self.crf)

        color_metadata_args = [
            "-color_primaries",
            OutputConfig.COLOR_PRIMARIES,
            "-color_trc",
            OutputConfig.COLOR_TRC,
            "-colorspace",
            OutputConfig.COLOR_SPACE,
        ]

        audio_codec_args = resolve_codec_audio_args(self.output_codec)

        format_flag = (
            ["-f", "matroska"]
            if self.output_codec == "ffv1"
            else ["-f", "mov"]
            if self.output_codec == "prores"
            else ["-f", "mp4"]
        )
        is_mov_or_mp4 = self.output_codec in ("h264", "hevc", "prores")
        mov_flags = ["-movflags", "+faststart"] if is_mov_or_mp4 else []
        shortest_flag = [] if self.mode == "drop" else ["-shortest"]

        mux_flags = shortest_flag + mov_flags + format_flag + [output_path]

        return (
            header_args
            + timing_args
            + input_mapping_args
            + audio_filter_args
            + video_codec_args
            + color_metadata_args
            + audio_codec_args
            + mux_flags
        )
