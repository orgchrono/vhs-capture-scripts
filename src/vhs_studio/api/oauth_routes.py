from typing import Optional, Dict, Any
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse
import httpx
from vhs_studio.core.logger import log

oauth_router = APIRouter()
oauth_sessions: Dict[str, Any] = {}


@oauth_router.get("/login/{provider}")
async def oauth_login(provider: str, request: Request):
    return HTMLResponse(content=f"<html><body>Simulating login for {provider}...</body></html>")


@oauth_router.get("/callback")
async def oauth_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
):
    if error:
        log.error(f"Erro no OAuth: {error}")
        raise HTTPException(status_code=400, detail=error)
    if not code:
        raise HTTPException(status_code=400, detail="No code provided")

    # Exemplo real de uso do httpx (Assíncrono e não-bloqueante)
    try:
        async with httpx.AsyncClient() as client:
            # Stub para a troca do authorization code pelo access token
            response = await client.post("https://oauth2.googleapis.com/token", data={"code": code})
            if response.status_code == 200:
                log.info("Token obtido com sucesso.")
            else:
                log.warning("Falha ao obter token (esperado em stub).")
    except httpx.RequestError as e:
        log.error(f"Falha de rede ao contatar provedor OAuth: {e}")

    return HTMLResponse(content="<html><body>Login processado! Verifique os logs.</body></html>")
