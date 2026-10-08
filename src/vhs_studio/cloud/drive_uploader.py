import os
import json
from vhs_studio.core.logger import log

def get_credentials():
    try:
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        import keyring
    except ImportError:
        log.warning("[NUVEM ERRO] Dependências não instaladas. Instale: google-api-python-client google-auth-oauthlib keyring")
        return None

    SCOPES = ['https://www.googleapis.com/auth/drive.file']
    SERVICE_ID = 'vhs_studio_google_drive'
    ACCOUNT_ID = 'oauth2_token'
    
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    creds_path = os.path.join(project_root, "credentials.json")
    
    creds = None
    
    # 1. Tenta recuperar o token criptografado do OS Keychain (GNOME Keyring/KWallet/Windows/Mac)
    try:
        token_json_str = keyring.get_password(SERVICE_ID, ACCOUNT_ID)
        if token_json_str:
            token_data = json.loads(token_json_str)
            creds = Credentials.from_authorized_user_info(token_data, SCOPES)
    except Exception as e:
        log.warning(f"[NUVEM AVISO] OS Keyring indisponível (Linux Headless?): {e}")
            
    if not creds or not creds.valid:
        if not os.path.exists(creds_path):
            log.warning("[NUVEM ERRO] credentials.json do Google Cloud não encontrado na raiz. Pulei o upload.")
            return None
            
        log.info("[NUVEM OAUTH2] Aguardando autenticação segura do usuário no navegador...")
        flow = InstalledAppFlow.from_client_secrets_file(creds_path, SCOPES)
        creds = flow.run_local_server(port=0)
        
        # 2. Salva o token de forma criptografada
        try:
            keyring.set_password(SERVICE_ID, ACCOUNT_ID, creds.to_json())
            log.info("[NUVEM SECURE] Token OAuth2 criptografado e salvo no Cofre de Credenciais do Sistema Operacional.")
        except Exception as e:
            log.warning(f"[NUVEM AVISO] Falha ao salvar no Keyring do OS ({e}). O token não foi persistido.")
        
    return creds

def upload_to_drive(file_path):
    if not os.path.exists(file_path):
        return False

    log.info(f"[NUVEM] Iniciando upload seguro em background: {os.path.basename(file_path)}")
    try:
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
        
        creds = get_credentials()
        if not creds:
            return False
            
        service = build('drive', 'v3', credentials=creds)
        file_metadata = {'name': os.path.basename(file_path)}
        media = MediaFileUpload(file_path, resumable=True)
        
        request = service.files().create(body=file_metadata, media_body=media, fields='id')
        response = None
        while response is None:
            status, response = request.next_chunk()
            if status:
                log.info(f"  -> Uploading... {int(status.progress() * 100)}%")
                
        log.info(f"[NUVEM] Upload concluído! File ID: {response.get('id')}")
        return True
    except Exception as e:
        log.warning(f"[NUVEM ERRO] Falha durante o upload: {e}")
        return False

def upload_project_folder(folder_path):
    log.info(f"============================================================")
    log.info(f"[NUVEM] Sincronizando pasta de projeto: {folder_path}")
    
    if not os.path.exists(folder_path):
        return
        
    for root, dirs, files in os.walk(folder_path):
        for f in files:
            full_p = os.path.join(root, f)
            upload_to_drive(full_p)
            
    log.info(f"[NUVEM] Backup na Nuvem finalizado com sucesso!")