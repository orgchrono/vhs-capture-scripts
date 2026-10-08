"""Module documentation pending."""
import uuid
from typing import Optional, Dict
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
import httpx
from vhs_studio.core.logger import log
from vhs_studio.config.storage_config import load_storage_config, save_storage_config

oauth_router = APIRouter()
oauth_sessions: Dict[str, str] = {}

OAUTH_CONFIG = {
    "gdrive": {
        "auth_url": "https://accounts.google.com/o/oauth2/v2/auth",
        "token_url": "https://oauth2.googleapis.com/token",
        "scope": "https://www.googleapis.com/auth/drive.file",
        "client_id_key": "GDRIVE_CLIENT_ID",
        "client_secret_key": "GDRIVE_CLIENT_SECRET",
        "token_key": "GDRIVE_REFRESH_TOKEN",  # We typically want the refresh token
    },
    "dropbox": {
        "auth_url": "https://www.dropbox.com/oauth2/authorize",
        "token_url": "https://api.dropboxapi.com/oauth2/token",
        "scope": "",
        "client_id_key": "DROPBOX_APP_KEY",
        "client_secret_key": "DROPBOX_APP_SECRET",
        "token_key": "DROPBOX_ACCESS_TOKEN",  # Dropbox gives long-lived or refresh tokens
    },
    "onedrive": {
        "auth_url": "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        "token_url": "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        "scope": "Files.ReadWrite.All offline_access",
        "client_id_key": "ONEDRIVE_CLIENT_ID",
        "client_secret_key": "ONEDRIVE_CLIENT_SECRET",
        "token_key": "ONEDRIVE_REFRESH_TOKEN",
    },
}


def get_redirect_uri(request: Request) -> str:
    # Retorna o callback baseando-se na URL do request
    """Documentation for get_redirect_uri."""
    return str(request.url_for("oauth_callback"))


@oauth_router.get("/login/{provider}")
async def oauth_login(provider: str, request: Request):
    """Documentation for oauth_login."""
    if provider not in OAUTH_CONFIG:
        raise HTTPException(status_code=404, detail="Provedor OAuth não suportado")

    config_data = load_storage_config()
    config = config_data.get("config", {})
    p_config = OAUTH_CONFIG[provider]

    client_id = config.get(p_config["client_id_key"])
    if not client_id:
        return HTMLResponse(
            content=f"<html><body><h2>Erro</h2><p>O <b>{p_config['client_id_key']}</b> não está configurado. Configure no painel de Storage antes de autenticar.</p></body></html>"  # noqa: E501
        )

    state = str(uuid.uuid4())
    oauth_sessions[state] = provider

    redirect_uri = get_redirect_uri(request)
    auth_url = (
        f"{p_config['auth_url']}?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&state={state}"
    )
    if p_config["scope"]:
        auth_url += f"&scope={p_config['scope']}"

    # Especifico do Google para garantir refresh token
    if provider == "gdrive":
        auth_url += "&access_type=offline&prompt=consent"

    # Especifico do Dropbox para tokens offline
    if provider == "dropbox":
        auth_url += "&token_access_type=offline"

    log.info(f"[OAuth] Redirecionando usuário para login em: {provider}")
    return RedirectResponse(url=auth_url)


@oauth_router.get("/callback")
async def oauth_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
):
    """Documentation for oauth_callback."""
    if error:
        log.error(f"[OAuth] Erro retornado pelo provedor: {error}")
        raise HTTPException(status_code=400, detail=error)
    if not code or not state:
        raise HTTPException(status_code=400, detail="Código de autorização ou state ausente.")

    provider = oauth_sessions.pop(state, None)
    if not provider:
        raise HTTPException(status_code=400, detail="Sessão OAuth inválida ou expirada (state mismatch).")

    p_config = OAUTH_CONFIG[provider]
    config_data = load_storage_config()
    current_config = config_data.get("config", {})

    client_id = current_config.get(p_config["client_id_key"])
    client_secret = current_config.get(p_config["client_secret_key"])
    redirect_uri = get_redirect_uri(request)

    if not client_id or not client_secret:
        raise HTTPException(status_code=400, detail="Credenciais de aplicativo ausentes no servidor local.")

    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": client_id,
        "client_secret": client_secret,
    }

    log.info(f"[OAuth] Trocando código por token no provedor {provider}...")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(p_config["token_url"], data=data)
            response_data = response.json()

            if response.status_code != 200:
                err_desc = response_data.get("error_description", response_data.get("error", "Erro desconhecido"))
                log.error(f"[OAuth] Falha ao obter token. HTTP {response.status_code}: {err_desc}")
                return HTMLResponse(
                    content=f"<html><body><h2>Falha na Autenticação</h2><p>{err_desc}</p></body></html>"
                )

            # Sucesso! Extraindo tokens
            access_token = response_data.get("access_token")
            refresh_token = response_data.get("refresh_token")

            # Nem todos os provedores retornam refresh token no primeiro grant (ex: dropbox as vezes só retorna access se nao pedir offline)  # noqa: E501
            token_to_save = refresh_token if refresh_token else access_token

            if token_to_save:
                current_config[p_config["token_key"]] = token_to_save
                save_storage_config(provider, current_config)
                log.info(f"[OAuth] Tokens para {provider} obtidos e salvos no Cofre Seguro nativo com sucesso.")
                return HTMLResponse(
                    content=f"<html><body><h2>Autenticação Bem-Sucedida!</h2><p>VHS Studio foi conectado ao {provider}. Você pode fechar esta janela.</p></body></html>"  # noqa: E501
                )
            else:
                log.warning("[OAuth] A resposta foi 200 OK, mas nenhum token foi encontrado no payload.")
                return HTMLResponse(
                    content="<html><body><h2>Falha Estranha</h2><p>Nenhum token retornado pelo servidor.</p></body></html>"  # noqa: E501
                )

    except httpx.RequestError as e:
        log.error(f"[OAuth] Falha de rede ao contatar provedor: {e}")
        return HTMLResponse(
            content=f"<html><body><h2>Erro de Rede</h2><p>Não foi possível alcançar {p_config['token_url']}</p></body></html>"  # noqa: E501
        )
