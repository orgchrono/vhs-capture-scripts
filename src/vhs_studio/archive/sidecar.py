"""Module documentation pending."""

import json
import os
import time


class SidecarManager:
    """Documentation for SidecarManager."""

    @staticmethod
    def generate_sidecar(video_path: str, metadata: dict) -> str:
        """Generate a .vhs.json sidecar file with tape metadata."""
        sidecar_path = f"{video_path}.vhs.json"

        data = {
            "version": "1.0",
            "timestamp": time.time(),
            "original_file": os.path.basename(video_path),
            "metadata": metadata,
        }

        with open(sidecar_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

        return sidecar_path
