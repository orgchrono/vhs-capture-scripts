"""Module documentation pending."""


class VHSStudioError(Exception):
    """Exceção base para todos os erros do VHS Studio."""


class ToolchainError(VHSStudioError):
    """Exceção levantada quando há problemas na toolchain (ex: FFmpeg ausente)."""


class MediaProbeError(VHSStudioError):
    """Exceção levantada quando não é possível analisar o arquivo de mídia."""


class VapourSynthError(VHSStudioError):
    """Exceção levantada por erros durante a execução de filtros VapourSynth."""
