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
    """Return the callback URI based on current request URL."""
    return str(request.url_for("oauth_callback"))


@oauth_router.get("/login/{provider}")
async def oauth_login(provider: str, request: Request):
    """Initiate OAuth authorization workflow for cloud storage provider."""
    if provider not in OAUTH_CONFIG:
        raise HTTPException(status_code=404, detail="OAuth provider not supported")

    config_data = load_storage_config()
    config = config_data.get("config", {})
    p_config = OAUTH_CONFIG[provider]

    client_id = config.get(p_config["client_id_key"])
    if not client_id:
        return HTMLResponse(
            content=f"<html><body><h2>Configuration Error</h2><p><b>{p_config['client_id_key']}</b> is not configured. Configure in the Storage panel before authenticating.</p></body></html>"  # noqa: E501
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

    # Google-specific parameter to guarantee refresh token grant
    if provider == "gdrive":
        auth_url += "&access_type=offline&prompt=consent"

    # Dropbox-specific parameter for offline access
    if provider == "dropbox":
        auth_url += "&token_access_type=offline"

    log.info(f"[OAuth] Redirecting user for login with provider: {provider}")
    return RedirectResponse(url=auth_url)


@oauth_router.get("/callback")
async def oauth_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
):
    """Handle OAuth redirection callback, exchange code for tokens, and persist to vault."""
    if error:
        log.error(f"[OAuth] Error returned by provider: {error}")
        raise HTTPException(status_code=400, detail=error)
    if not code or not state:
        raise HTTPException(
            status_code=400, detail="Missing authorization code or state parameter."
        )

    provider = oauth_sessions.pop(state, None)
    if not provider:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired OAuth session (state mismatch).",
        )

    p_config = OAUTH_CONFIG[provider]
    config_data = load_storage_config()
    current_config = config_data.get("config", {})

    client_id = current_config.get(p_config["client_id_key"])
    client_secret = current_config.get(p_config["client_secret_key"])
    redirect_uri = get_redirect_uri(request)

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=400,
            detail="Application credentials missing in local vault.",
        )

    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": client_id,
        "client_secret": client_secret,
    }

    log.info(f"[OAuth] Exchanging authorization code for token with provider {provider}...")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(p_config["token_url"], data=data)
            response_data = response.json()

            if response.status_code != 200:
                err_desc = response_data.get(
                    "error_description", response_data.get("error", "Unknown error")
                )
                log.error(
                    f"[OAuth] Failed to retrieve token. HTTP {response.status_code}: {err_desc}"
                )
                return HTMLResponse(
                    content=f"<html><body><h2>Authentication Failure</h2><p>{err_desc}</p></body></html>"
                )

            # Success! Extract tokens
            access_token = response_data.get("access_token")
            refresh_token = response_data.get("refresh_token")

            # Store refresh token if present, otherwise access token
            token_to_save = refresh_token if refresh_token else access_token

            if token_to_save:
                current_config[p_config["token_key"]] = token_to_save
                save_storage_config(provider, current_config)
                log.info(
                    f"[OAuth] Tokens for {provider} retrieved and saved to vault successfully."
                )
                return HTMLResponse(
                    content=f"<html><body><h2>Authentication Successful!</h2><p>VHS Studio connected to {provider}. You may close this window.</p></body></html>"  # noqa: E501
                )
            else:
                log.warning(
                    "[OAuth] Response was 200 OK, but no token was found in payload."
                )
                return HTMLResponse(
                    content="<html><body><h2>Unexpected Result</h2><p>No token returned by server.</p></body></html>"  # noqa: E501
                )

    except httpx.RequestError as e:
        log.error(f"[OAuth] Network failure contacting provider: {e}")
        return HTMLResponse(
            content=f"<html><body><h2>Network Error</h2><p>Could not reach {p_config['token_url']}</p></body></html>"  # noqa: E501
        )
