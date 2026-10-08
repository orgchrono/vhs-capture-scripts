class VHSStudioError(Exception):
    """Exceção base para todos os erros do VHS Studio."""

    pass


class ToolchainError(VHSStudioError):
    """Exceção levantada quando há problemas na toolchain (ex: FFmpeg ausente)."""

    pass


class MediaProbeError(VHSStudioError):
    """Exceção levantada quando não é possível analisar o arquivo de mídia."""

    pass


class VapourSynthError(VHSStudioError):
    """Exceção levantada por erros durante a execução de filtros VapourSynth."""

    pass
