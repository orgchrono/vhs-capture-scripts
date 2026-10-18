"""
fixity.py - Digital preservation fixity verification module.
Integrates canonical cryptographic checksumming to guarantee archive integrity.
"""

from vhs_studio.core.media_utils import compute_sha256, HASH_CHUNK_SIZE


class FixityChecker:
    """Verifies file fixity and integrity against cryptographic hashes."""

    @staticmethod
    def calculate_sha256(filepath: str, chunk_size: int = HASH_CHUNK_SIZE) -> str:
        """Calculate SHA-256 checksum for the specified file."""
        return compute_sha256(filepath, chunk_size=chunk_size)

    @staticmethod
    def verify_fixity(filepath: str, expected_hash: str) -> bool:
        """Verify whether the file matches the expected SHA-256 digest."""
        if not expected_hash:
            return False
        return FixityChecker.calculate_sha256(filepath).lower() == expected_hash.strip().lower()
