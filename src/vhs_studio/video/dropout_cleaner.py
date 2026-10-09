"""Magnetic tape dropout cleaner and horizontal static streak suppression filter."""


from vhs_studio.core.constants import (
    DEFAULT_DROPOUT_LUMA_THRESHOLD,
    DEFAULT_DROPOUT_LINE_RATIO,
)


class DropoutCleaner:
    """Detects and suppresses single-frame white streaks caused by magnetic oxide dropouts."""

    @staticmethod
    def get_ffmpeg_filter() -> str:
        """
        Return optimal FFmpeg filter chain for temporal dropout suppression.
        Uses temporal median filtering and spatial interpolation for instantaneous tape artifacts.
        """
        # tmedian with radius 1 removes 1-frame transient streaks; removegrain suppresses isolated impulsive dots
        return "removegrain=m=1,tmedian=radius=1"

    @staticmethod
    def is_dropout_line(
        line_bytes: bytes,
        threshold: int = DEFAULT_DROPOUT_LUMA_THRESHOLD,
        ratio: float = DEFAULT_DROPOUT_LINE_RATIO,
    ) -> bool:
        """Heuristic detection of full white horizontal streak in a single video line."""
        if not line_bytes:
            return False
        # If >85% of samples in this scanline are saturated white, it is a dropout streak
        white_count = sum(1 for b in line_bytes if b >= threshold)
        return (white_count / len(line_bytes)) > ratio
