"""Ingestion router for Panasonic DVR media recovery and raw dumps."""

import os
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from vhs_studio.api.routers.security import is_safe_ingest_path
from vhs_studio.core.paths import RAW_MEDIA_DIR
from vhs_studio.ingest.panasonic_dvr import (
    inspect_panasonic_source,
    extract_panasonic_media,
)

ingest_router = APIRouter(prefix="/api/ingest", tags=["Ingest"])


class PanasonicExtractPayload(BaseModel):
    """Payload for requesting Panasonic media extraction."""

    source_path: str
    output_dir: Optional[str] = None


@ingest_router.get("/panasonic/inspect")
def inspect_panasonic(source_path: str):
    """Inspect disk image or block device for Panasonic DVR signatures and filesystems."""
    if not is_safe_ingest_path(source_path):
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid or unsafe source path."},
        )

    result = inspect_panasonic_source(source_path)
    return {
        "is_panasonic": result.is_panasonic,
        "format": result.format,
        "details": result.details,
        "can_extract": result.can_extract,
        "toolchain_available": result.toolchain_available,
        "extractor_binary": result.extractor_binary,
        "source_size_bytes": result.source_size_bytes,
        "detected_offsets": result.detected_offsets,
        "estimated_titles": result.estimated_titles,
    }


@ingest_router.post("/panasonic/extract")
def extract_panasonic(payload: PanasonicExtractPayload):
    """Extract recovered MPEG-2/VRO video titles from Panasonic DVR source into media/raw."""
    source_path = payload.source_path
    if not is_safe_ingest_path(source_path):
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid or unsafe source path."},
        )

    out_dir = payload.output_dir or RAW_MEDIA_DIR
    try:
        extracted = extract_panasonic_media(source_path, output_dir=out_dir)
        return {
            "status": "success",
            "message": f"Successfully extracted {len(extracted)} title(s).",
            "extracted_files": [os.path.basename(f) for f in extracted],
            "destination": out_dir,
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"Extraction failed: {e}"},
        )
