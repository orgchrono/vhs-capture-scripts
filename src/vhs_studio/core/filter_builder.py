"""Video and audio FFmpeg filter graph and argument builder."""

from vhs_studio.config.settings import Filters, AudioConfig, OutputConfig
from vhs_studio.core.logger import log
import sys
import subprocess

from vhs_studio.core.toolchain import Toolchain
from vhs_studio.core.constants import (
    DEFAULT_CRF,
    DEFAULT_ENCODER_TEST_TIMEOUT_SEC,
)


class FilterBuilder:
    """Constructs adaptive FFmpeg filter chains and hardware-accelerated encoding arguments."""

    def __init__(
        self,
        target_1080p=True,
        crf=DEFAULT_CRF,
        mode="freeze",
        output_codec="h264",
    ):
        self.output_codec = output_codec
        self.encoder = self.detect_best_encoder() if output_codec == "h264" else None
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
                timeout=DEFAULT_ENCODER_TEST_TIMEOUT_SEC,
            )
            return res.returncode == 0
        except Exception:
            return False

    @classmethod
    def detect_best_encoder(cls) -> str:
        """Auto-detect optimal hardware encoder (NVIDIA, Apple, AMD, VAAPI, Intel) or fallback to libx264."""
        # 1. macOS (Apple Silicon M-Series and Intel Macs)
        if sys.platform == "darwin":
            if cls.check_encoder_support("h264_videotoolbox"):
                return "h264_videotoolbox"
            return "libx264"

        # 2. Windows and Linux: Prioritize NVENC, AMF, VAAPI, QSV, fallback to libx264
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
    ) -> str:
        """Assemble the video filtergraph string based on restoration toggles and deinterlacing engine."""
        vf_filters = []
        if overscan_blanking:
            vf_filters.append("drawbox=y=ih-12:color=black:width=iw:height=12:t=fill")
        if apply_comb_filter:
            if self.check_filter_support("dedot"):
                vf_filters.append("dedot=m=comb")
            else:
                log.warning(
                    "[WARNING] 3D Comb filter (dedot) not found in local FFmpeg build. Skipping."
                )

        if apply_chroma:
            vf_filters.append(Filters.CHROMA_SHIFT)
        if apply_denoise:
            vf_filters.append(Filters.DENOISE)

        if deinterlacer == "bwdif":
            vf_filters.append(Filters.DEINT_BWDIF_BOB)
        elif deinterlacer == "bwdif_single":
            vf_filters.append(Filters.DEINT_BWDIF_SINGLE)
        elif deinterlacer in ("znedi3", "nnedi3"):
            if self.check_filter_support("znedi3"):
                vf_filters.append(Filters.DEINT_ZNEDI3)
            elif self.check_filter_support("nnedi"):
                log.info(
                    "[DEINTERLACE] Using native neural network deinterlacer 'nnedi'."
                )
                vf_filters.append(Filters.DEINT_NNEDI)
            else:
                log.warning(
                    "[WARNING] Neither 'znedi3' nor 'nnedi' filters found. Falling back to 'bwdif'."
                )
                vf_filters.append(Filters.DEINT_BWDIF_BOB)
        elif deinterlacer == "nnedi":
            if self.check_filter_support("nnedi"):
                vf_filters.append(Filters.DEINT_NNEDI)
            else:
                log.warning(
                    "[WARNING] 'nnedi' filter not found in FFmpeg. Falling back to 'bwdif'."
                )
                vf_filters.append(Filters.DEINT_BWDIF_BOB)
        elif deinterlacer == "yadif":
            vf_filters.append(Filters.DEINT_YADIF)

        if self.target_1080p:
            vf_filters.append(Filters.UPSCALE_1080P_LANCZOS)

        return ",".join(vf_filters) if vf_filters else "null"

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
    ):
        """Build CLI command arguments for muxing restored video frames with aligned audio."""
        cmd_out = [
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
        if a_start_sec > 0.05:
            cmd_out += ["-ss", f"{a_start_sec:.3f}"]
        if duration:
            cmd_out += ["-t", f"{duration:.3f}"]

        cmd_out += ["-i", input_path, "-map", "0:v", "-map", "1:a", "-vf", vf]

        af_filters = []
        if audio_mode == "mono_l":
            af_filters.append(AudioConfig.PAN_MONO_LEFT)
        elif audio_mode == "mono_r":
            af_filters.append(AudioConfig.PAN_MONO_RIGHT)

        if audio_treatment:
            # Remove DC Offset and apply notch filter at 60Hz for electrical hum
            af_filters.append("dcshift=shift=0")
            af_filters.append("anequalizer=c0 f=60 w=5 g=-30|c1 f=60 w=5 g=-30")

        if af_filters:
            cmd_out += ["-af", ",".join(af_filters)]

        if self.output_codec == "prores":
            cmd_out += [
                "-c:v",
                "prores_ks",
                "-profile:v",
                "3",
                "-pix_fmt",
                "yuv422p10le",
                "-vendor",
                "ap10",
            ]
        elif self.output_codec == "ffv1":
            cmd_out += ["-c:v", "ffv1", "-level", "3", "-g", "1", "-pix_fmt", "yuv420p"]
        else:
            if self.encoder == "h264_videotoolbox":
                cmd_out += [
                    "-c:v",
                    "h264_videotoolbox",
                    "-q:v",
                    str(min(100, max(1, 100 - self.crf * 2))),
                    "-pix_fmt",
                    "yuv420p",
                ]
            elif self.encoder == "h264_nvenc":
                cmd_out += [
                    "-c:v",
                    "h264_nvenc",
                    "-preset",
                    "p4",
                    "-cq",
                    str(self.crf),
                    "-rc",
                    "vbr",
                ]
            elif self.encoder == "h264_amf":
                cmd_out += [
                    "-c:v",
                    "h264_amf",
                    "-quality",
                    "speed",
                    "-rc",
                    "cqp",
                    "-qp_i",
                    str(self.crf),
                    "-qp_p",
                    str(self.crf),
                ]
            elif self.encoder == "h264_vaapi":
                cmd_out += ["-c:v", "h264_vaapi", "-qp", str(self.crf)]
            elif self.encoder == "h264_qsv":
                cmd_out += ["-c:v", "h264_qsv", "-global_quality", str(self.crf)]
            else:
                cmd_out += [
                    "-c:v",
                    "libx264",
                    "-preset",
                    "veryfast",
                    "-crf",
                    str(self.crf),
                    "-pix_fmt",
                    "yuv420p",
                ]

        cmd_out += [
            "-color_primaries",
            OutputConfig.COLOR_PRIMARIES,
            "-color_trc",
            OutputConfig.COLOR_TRC,
            "-colorspace",
            OutputConfig.COLOR_SPACE,
        ]

        if self.output_codec in ("prores", "ffv1"):
            cmd_out += ["-c:a", "pcm_s24le"]  # Uncompressed audio for archival
        else:
            cmd_out += ["-c:a", AudioConfig.CODEC, "-b:a", AudioConfig.BITRATE]

        if self.mode == "drop":
            cmd_out += ["-movflags", "+faststart", output_path]
        else:
            cmd_out += ["-shortest", "-movflags", "+faststart", output_path]

        return cmd_out
