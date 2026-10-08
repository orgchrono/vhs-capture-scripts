import json
import os
import time


class SidecarManager:
    @staticmethod
    def generate_sidecar(video_path, metadata):
        """Gera um arquivo sidecar .vhs.json com metadados da fita."""
        sidecar_path = f"{video_path}.vhs.json"

        data = {
            "version": "1.0",
            "timestamp": time.time(),
            "original_file": os.path.basename(video_path),
            "metadata": metadata,
        }

        with open(sidecar_path, "w", encoding="utf-8") as f:
            json.dumps(data, indent=2)

        return sidecar_path
