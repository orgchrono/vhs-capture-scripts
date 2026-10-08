import os
import requests
import webbrowser
from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, JSONResponse
from urllib.parse import urlencode
from vhs_studio.core.logger import log
from vhs_studio.config.storage_config import load_storage_config, save_storage_config
from vhs_studio.storage.manager import StorageManager

oauth_router = APIRouter()

# Dicionário temporário para guardar state ou code verifier do PKCE
oauth_sessions = {}

@oauth_router.get("/login/{provider_id}")
def oauth_login(provider_id: str):
    config = load_storage_config().get("config", {})
    redirect_uri = "http://localhost:8088/api/oauth/callback"

    if provider_id == "gdrive":
        # Google OAuth 2.0 (Desktop)
        client_id = config.get("GDRIVE_CLIENT_ID")
        if not client_id:
            return JSONResponse(status_code=400, content={"error": "Client ID do Google ausente nas configs."})
            
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "https://www.googleapis.com/auth/drive.file",
            "access_type": "offline",
            "prompt": "consent",
            "state": "gdrive"
        }
        url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
        webbrowser.open(url)
        return {"status": "ok", "message": "Navegador aberto para Google."}
        
    elif provider_id == "dropbox":
        client_id = config.get("DROPBOX_APP_KEY")
        if not client_id:
            return JSONResponse(status_code=400, content={"error": "App Key do Dropbox ausente."})
            
        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "state": "dropbox"
        }
        url = "https://www.dropbox.com/oauth2/authorize?" + urlencode(params)
        webbrowser.open(url)
        return {"status": "ok", "message": "Navegador aberto para Dropbox."}
        
    elif provider_id == "onedrive":
        client_id = config.get("ONEDRIVE_CLIENT_ID")
        tenant = config.get("ONEDRIVE_TENANT_ID", "common")
        if not client_id:
            return JSONResponse(status_code=400, content={"error": "Client ID do OneDrive ausente."})
            
        params = {
            "client_id": client_id,
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "scope": "offline_access Files.ReadWrite.All",
            "state": "onedrive"
        }
        url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?" + urlencode(params)
        webbrowser.open(url)
        return {"status": "ok", "message": "Navegador aberto para Microsoft."}
        
    return JSONResponse(status_code=400, content={"error": "Provedor desconhecido."})


@oauth_router.get("/callback")
def oauth_callback(code: str = None, state: str = None, error: str = None):
    if error:
        return HTMLResponse(f"<h2>Erro de Autenticação: {error}</h2>")
    if not code or not state:
        return HTMLResponse("<h2>Parâmetros inválidos.</h2>")
        
    provider_id = state
    config_data = load_storage_config()
    config = config_data.get("config", {})
    redirect_uri = "http://localhost:8088/api/oauth/callback"
    
    try:
        if provider_id == "gdrive":
            client_id = config.get("GDRIVE_CLIENT_ID")
            client_secret = config.get("GDRIVE_CLIENT_SECRET")
            
            res = requests.post("https://oauth2.googleapis.com/token", data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri
            })
            if res.status_code == 200:
                import keyring, json
                keyring.set_password("vhs_studio", "gdrive_token", json.dumps(res.json()))
                log.info("[OAuth] Google Drive Autenticado com sucesso.")
            else:
                return HTMLResponse(f"<h2>Falha na troca de código GDrive</h2><p>{res.text}</p>")
                
        elif provider_id == "dropbox":
            app_key = config.get("DROPBOX_APP_KEY")
            app_secret = config.get("DROPBOX_APP_SECRET")
            
            res = requests.post("https://api.dropboxapi.com/oauth2/token", data={
                "code": code,
                "grant_type": "authorization_code",
                "client_id": app_key,
                "client_secret": app_secret,
                "redirect_uri": redirect_uri
            })
            if res.status_code == 200:
                config["DROPBOX_ACCESS_TOKEN"] = res.json().get("access_token")
                save_storage_config("dropbox", config)
                log.info("[OAuth] Dropbox Autenticado com sucesso.")
            else:
                return HTMLResponse(f"<h2>Falha na troca de código Dropbox</h2><p>{res.text}</p>")
                
        elif provider_id == "onedrive":
            client_id = config.get("ONEDRIVE_CLIENT_ID")
            client_secret = config.get("ONEDRIVE_CLIENT_SECRET")
            tenant = config.get("ONEDRIVE_TENANT_ID", "common")
            
            res = requests.post(f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token", data={
                "client_id": client_id,
                "client_secret": client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code"
            })
            if res.status_code == 200:
                token_path = os.path.join(os.path.expanduser("~"), ".vhs_studio", "onedrive_token.txt")
                with open(token_path, "w") as f:
                    import json
                    json.dump(res.json(), f)
                log.info("[OAuth] OneDrive Autenticado com sucesso.")
            else:
                return HTMLResponse(f"<h2>Falha na troca de código OneDrive</h2><p>{res.text}</p>")

        html = f"""
        <html>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h2 style="color: #10b981;">{provider_id.upper()} Autenticado com Sucesso!</h2>
            <p>O token foi armazenado com segurança. Pode fechar esta janela e voltar ao VHS Studio Pro.</p>
            <script>setTimeout(() => window.close(), 3000);</script>
        </body>
        </html>
        """
        return HTMLResponse(content=html)
    except Exception as e:
        log.error(f"[OAuth Callback Error] {e}")
        return HTMLResponse(f"<h2>Erro interno no servidor</h2><p>{str(e)}</p>")