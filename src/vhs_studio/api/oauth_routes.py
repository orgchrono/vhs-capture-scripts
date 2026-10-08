import requests
from typing import Optional, Dict, Any
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse
from vhs_studio.core.logger import log

oauth_router = APIRouter()
oauth_sessions: Dict[str, Any] = {}


@oauth_router.get("/login/{provider}")
async def oauth_login(provider: str, request: Request):
    return HTMLResponse(
        content=f"<html><body>Simulating login for {provider}...</body></html>"
    )


@oauth_router.get("/callback")
async def oauth_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
):
    if error:
        raise HTTPException(status_code=400, detail=error)
    if not code:
        raise HTTPException(status_code=400, detail="No code provided")
    return HTMLResponse(
        content="<html><body>Login successful! You can close this window.</body></html>"
    )
