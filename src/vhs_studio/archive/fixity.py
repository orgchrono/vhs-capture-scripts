import hashlib

class FixityChecker:
    @staticmethod
    def calculate_sha256(filepath, chunk_size=8192):
        sha256_hash = hashlib.sha256()
        with open(filepath, "rb") as f:
            for byte_block in iter(lambda: f.read(chunk_size), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()

    @staticmethod
    def verify_fixity(filepath, expected_hash):
        return FixityChecker.calculate_sha256(filepath) == expected_hash
