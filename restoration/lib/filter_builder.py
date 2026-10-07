import subprocess
try:
    from lib.config import Filters, AudioConfig, OutputConfig
    from lib.logger import log
except ImportError:
    from config import Filters, AudioConfig, OutputConfig
    from logger import log

class FilterBuilder:
    def __init__(self, target_1080p=True, crf=20, mode="freeze"):
        self.encoder = self.detect_best_encoder()
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

    @staticmethod
    def check_encoder_support(encoder_name):
        try:
            # Testa se o hardware e driver realmente aceitam codificar um frame
            cmd = ["ffmpeg", "-y", "-f", "lavfi", "-i", "nullsrc=s=64x64:d=0.04", "-c:v", encoder_name, "-f", "null", "-"]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=3)
            return res.returncode == 0
        except Exception:
            return False

    @classmethod
    def detect_best_encoder(cls):
        # Prioritize NVIDIA NVENC, then AMD AMF, then Intel QSV, fallback to libx264
        if cls.check_encoder_support("h264_nvenc"):
            return "h264_nvenc"
        elif cls.check_encoder_support("h264_amf"):
            return "h264_amf"
        elif cls.check_encoder_support("h264_qsv"):
            return "h264_qsv"
        return "libx264"

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
        elif deinterlacer in ("znedi3", "nnedi3"):
            if self.check_filter_support("znedi3"):
                vf_filters.append(Filters.DEINT_ZNEDI3)
            elif self.check_filter_support("nnedi"):
                log.info("[DEINTERLACE] Usando filtro de rede neural 'nnedi' nativo do FFmpeg.")
                vf_filters.append(Filters.DEINT_NNEDI)
            else:
                log.warning("[AVISO] Filtros 'znedi3'/'nnedi' não encontrados neste FFmpeg. Fazendo fallback para 'bwdif'!")
                vf_filters.append(Filters.DEINT_BWDIF_BOB)
        elif deinterlacer == "nnedi":
            if self.check_filter_support("nnedi"):
                vf_filters.append(Filters.DEINT_NNEDI)
            else:
                log.warning("[AVISO] Filtro 'nnedi' não encontrado neste FFmpeg. Fazendo fallback para 'bwdif'!")
                vf_filters.append(Filters.DEINT_BWDIF_BOB)
        elif deinterlacer == "yadif":
            vf_filters.append(Filters.DEINT_YADIF)

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

        if self.encoder == "h264_nvenc":
            cmd_out += ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", str(self.crf), "-rc", "vbr"]
        elif self.encoder == "h264_amf":
            cmd_out += ["-c:v", "h264_amf", "-quality", "speed", "-rc", "cqp", "-qp_i", str(self.crf), "-qp_p", str(self.crf)]
        elif self.encoder == "h264_qsv":
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
