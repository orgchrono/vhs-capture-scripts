"""Media processing and visual asset generation package."""

from vhs_studio.media.thumbnail import (
    generate_smart_thumbnail,
    get_thumbnail_path_for_video,
)

__all__ = [
    "generate_smart_thumbnail",
    "get_thumbnail_path_for_video",
]
