"""
config.py - Centralized configuration and constants for the VHS Restoration Pipeline.
"""

class VideoConfig:
    DEFAULT_WIDTH = 720
    DEFAULT_HEIGHT = 480
    DEFAULT_FPS = 29.97
    LUMA_THRESHOLD = 18.0
    CONSECUTIVE_GOOD_FRAMES_REQUIRED = 5
    MAX_SCAN_SECONDS = 120

class Filters:
    CHROMA_SHIFT = "chromashift=cbh=2:cbv=1:crh=2:crv=1:edge=smear"
    DENOISE = "hqdn3d=4.0:3.0:6.0:4.5"
    
    DEINT_BWDIF_BOB = "bwdif=mode=1:parity=auto"
    DEINT_BWDIF_SINGLE = "bwdif=mode=0:parity=auto"
    DEINT_ZNEDI3 = "znedi3"
    
    UPSCALE_1080P_LANCZOS = "scale=1440:1080:flags=lanczos:in_color_matrix=smpte170m:out_color_matrix=bt709,setsar=1:1,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,cas=0.4"
    
class AudioConfig:
    PAN_MONO_LEFT = "pan=stereo|c0=c0|c1=c0"
    PAN_MONO_RIGHT = "pan=stereo|c0=c1|c1=c1"
    CODEC = "aac"
    BITRATE = "192k"

class OutputConfig:
    COLOR_PRIMARIES = "bt709"
    COLOR_TRC = "bt709"
    COLOR_SPACE = "bt709"
