"""Pydantic request and response schemas for VHS Studio API endpoints."""

from typing import Dict
from pydantic import BaseModel, Field


class StorageConfigPayload(BaseModel):
    """Payload schema for storage configuration updates."""
    provider: str
    config: Dict[str, object] = Field(default_factory=dict)


class QueueEnqueuePayload(BaseModel):
    """Payload schema for queueing a processing job."""
    input: str
    params: Dict[str, object] = Field(default_factory=dict)
    priority: int = 0


class ActionPayload(BaseModel):
    """Payload schema for triggering studio automation actions."""
    action: str
    params: Dict[str, object] = Field(default_factory=dict)


class ObsVirtualCamPayload(BaseModel):
    """Payload schema for toggling OBS Virtual Camera output."""
    enable: bool = True
