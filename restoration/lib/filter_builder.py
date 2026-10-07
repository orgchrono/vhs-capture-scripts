import subprocess
from lib.config import Filters, AudioConfig, OutputConfig

class FilterBuilder:
    def __init__(self, use_qsv=False, target_1080p=True, crf=20, mode="freeze"):
        self.use_qsv = use_qsv
        self.target_1080p = target_1080p
        self.crf = crf
        self.mode = mode

    @staticmethod
    def check_filter_support(filter_name):
        try:
            res = subprocess.run(["ffmpeg", "-filters"], capture_output=True, text=True)
            return filter_name in res.stdout
        except Exception:
            return False

    def build_video_filters(self, apply_chroma, apply_denoise, deinterlacer):
        vf_filters = []
        if apply_chroma:
            vf_filters.append(Filters.CHROMA_SHIFT)
        if apply_denoise:
            vf_filters.append(Filters.DENOISE)

        if deinterlacer == "bwdif":
            vf_filters.append(Filters.DEINT_BWDIF_BOB)
        elif deinterlacer == "bwdif_single":
            vf_filters.append(Filters.DEINT_BWDIF_SINGLE)
        elif deinterlacer == "znedi3":
            if self.check_filter_support("znedi3"):
                vf_filters.append(Filters.DEINT_ZNEDI3)
            else:
                print("[AVISO] Filtro 'znedi3' não encontrado neste FFmpeg. Fazendo fallback para 'bwdif'!", flush=True)
                vf_filters.append(Filters.DEINT_BWDIF_BOB)

        if self.target_1080p:
            vf_filters.append(Filters.UPSCALE_1080P_LANCZOS)

        return ",".join(vf_filters) if vf_filters else "null"

    def build_ffmpeg_output_args(self, input_path, output_path, w, h, fps, start_sec, audio_offset, duration, vf, audio_mode):
        cmd_out = [
            "ffmpeg", "-y", "-hide_banner",
            "-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", f"{w}x{h}", "-r", f"{fps:.3f}", "-i", "-"
        ]
        
        a_start_sec = max(0.0, start_sec + audio_offset)
        if a_start_sec > 0.05:
            cmd_out += ["-ss", f"{a_start_sec:.3f}"]
        if duration:
            cmd_out += ["-t", f"{duration:.3f}"]
            
        cmd_out += [
            "-i", input_path,
            "-map", "0:v", "-map", "1:a",
            "-vf", vf
        ]

        if audio_mode == "mono_l":
            cmd_out += ["-af", AudioConfig.PAN_MONO_LEFT]
        elif audio_mode == "mono_r":
            cmd_out += ["-af", AudioConfig.PAN_MONO_RIGHT]

        if self.use_qsv:
            cmd_out += ["-c:v", "h264_qsv", "-global_quality", str(self.crf)]
        else:
            cmd_out += ["-c:v", "libx264", "-preset", "veryfast", "-crf", str(self.crf), "-pix_fmt", "yuv420p"]

        cmd_out += ["-color_primaries", OutputConfig.COLOR_PRIMARIES, 
                   "-color_trc", OutputConfig.COLOR_TRC, 
                   "-colorspace", OutputConfig.COLOR_SPACE]

        cmd_out += ["-c:a", AudioConfig.CODEC, "-b:a", AudioConfig.BITRATE]

        if self.mode == "drop":
            cmd_out += ["-movflags", "+faststart", output_path]
        else:
            cmd_out += ["-shortest", "-movflags", "+faststart", output_path]

        return cmd_out
