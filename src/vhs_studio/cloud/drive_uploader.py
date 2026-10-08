import os
from vhs_studio.core.logger import log

def upload_to_drive(file_path):
    """
    Upload real para o Google Drive via OAuth2 e google-api-python-client.
    """
    if not os.path.exists(file_path):
        log.error(f"[NUVEM] Arquivo não encontrado: {file_path}")
        return False

    log.info(f"[NUVEM] Iniciando upload em background: {os.path.basename(file_path)}")
    try:
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
        
        SCOPES = ['https://www.googleapis.com/auth/drive.file']
        creds = None
        
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        token_path = os.path.join(project_root, "token.json")
        creds_path = os.path.join(project_root, "credentials.json")
        
        if os.path.exists(token_path):
            creds = Credentials.from_authorized_user_file(token_path, SCOPES)
            
        if not creds or not creds.valid:
            if not os.path.exists(creds_path):
                log.warning("[NUVEM ERRO] credentials.json do Google Cloud não encontrado na raiz do projeto. Pulei o upload.")
                return False
                
            log.info("[NUVEM OAUTH2] Aguardando autenticação do usuário no navegador...")
            flow = InstalledAppFlow.from_client_secrets_file(creds_path, SCOPES)
            creds = flow.run_local_server(port=0)
            
            with open(token_path, 'w') as token:
                token.write(creds.to_json())
                
        service = build('drive', 'v3', credentials=creds)
        
        file_metadata = {'name': os.path.basename(file_path)}
        media = MediaFileUpload(file_path, resumable=True)
        
        # Faz o upload com barra de progresso simples no backend
        request = service.files().create(body=file_metadata, media_body=media, fields='id')
        response = None
        while response is None:
            status, response = request.next_chunk()
            if status:
                log.info(f"  -> Uploading... {int(status.progress() * 100)}%")
                
        log.info(f"[NUVEM] Upload concluído! File ID: {response.get('id')}")
        return True
    except ImportError:
        log.warning("[NUVEM ERRO] Dependências não instaladas. Execute: pip install google-api-python-client google-auth-oauthlib")
        return False
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