"""
media_utils.py - Single Source of Truth for Hashing, Timecodes, and Directory Enumeration.
Consolidates duplicated logic across fixity, packaging, desktop launcher, and ingest pipelines.
"""

import os
import hashlib
from typing import List, Dict, Any, Optional
from vhs_studio.core.constants import VALID_MEDIA_EXTENSIONS

HASH_CHUNK_SIZE: int = 65536


def compute_sha256(filepath: str, chunk_size: int = HASH_CHUNK_SIZE) -> str:
    """Canonical SHA-256 calculation for file integrity, caching, and fixity manifests."""
    if not os.path.exists(filepath):
        return ""
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def compute_directory_hash(directory_path: str, chunk_size: int = HASH_CHUNK_SIZE) -> str:
    """Canonical recursive directory SHA-256 hash for asset/UI cache validation."""
    hasher = hashlib.sha256()
    for root, dirs, files in os.walk(directory_path):
        for name in sorted(files):
            filepath = os.path.join(root, name)
            try:
                with open(filepath, "rb") as f:
                    for chunk in iter(lambda: f.read(chunk_size), b""):
                        hasher.update(chunk)
            except Exception:
                pass
    return hasher.hexdigest()


def seconds_to_timecode(seconds: float, include_ms: bool = True) -> str:
    """Canonical HH:MM:SS[.mmm] broadcast timecode formatter."""
    if seconds <= 0:
        return "00:00:00.000" if include_ms else "00:00:00"
    hrs = int(seconds // 3600)
    rem = seconds % 3600
    mins = int(rem // 60)
    secs = rem % 60
    if include_ms:
        return f"{hrs:02d}:{mins:02d}:{secs:06.3f}"
    return f"{hrs:02d}:{mins:02d}:{int(secs):02d}"


def scan_raw_media_directory(directory: str) -> List[Dict[str, Any]]:
    """Canonical raw media directory scanner with uniform metadata schema."""
    if not os.path.exists(directory):
        return []
    items: List[Dict[str, Any]] = []
    for f in sorted(os.listdir(directory)):
        ext = os.path.splitext(f)[1].lower()
        if ext in VALID_MEDIA_EXTENSIONS:
            full_path = os.path.join(directory, f)
            size_mb = round(os.path.getsize(full_path) / (1024 * 1024), 2)
            items.append({
                "name": f,
                "path": full_path,
                "size_mb": size_mb,
                "extension": ext,
            })
    return items
