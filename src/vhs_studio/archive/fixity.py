"""Module documentation pending."""

import hashlib


class FixityChecker:
    """Documentation for FixityChecker."""

    @staticmethod
    def calculate_sha256(filepath, chunk_size=8192):
        """Documentation for calculate_sha256."""
        sha256_hash = hashlib.sha256()
        with open(filepath, "rb") as f:
            for byte_block in iter(lambda: f.read(chunk_size), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    @staticmethod
    def verify_fixity(filepath, expected_hash):
        """Documentation for verify_fixity."""
        return FixityChecker.calculate_sha256(filepath) == expected_hash
