"""Custom exception definitions for VHS Studio Pro."""


class VHSStudioError(Exception):
    """Base exception for all VHS Studio errors."""


class ToolchainError(VHSStudioError):
    """Exception raised when required external tools (FFmpeg, OBS, VSPipe) are unavailable."""


class MediaProbeError(VHSStudioError):
    """Exception raised when media container or stream inspection fails."""


class VapourSynthError(VHSStudioError):
    """Exception raised on VapourSynth script execution or filtergraph failures."""
