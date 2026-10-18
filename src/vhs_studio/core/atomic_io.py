"""Module documentation pending."""

import os
import hashlib
import json


class AtomicIO:
    """Documentation for AtomicIO."""

    @staticmethod
    def generate_hash(params_dict):
        """Generate a short hash to distinguish outputs with different filter parameters."""
        param_str = json.dumps(params_dict, sort_keys=True).encode("utf-8")
        return hashlib.sha256(param_str).hexdigest()[:8]

    @staticmethod
    def get_part_path(final_path):
        """Documentation for get_part_path."""
        return final_path + ".part"

    @staticmethod
    def commit_file(part_path, final_path):
        """Move the .part file to the final destination path atomically."""
        if os.path.exists(part_path):
            os.replace(part_path, final_path)
