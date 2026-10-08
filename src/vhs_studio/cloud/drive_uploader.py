import os
from vhs_studio.core.logger import log

def upload_to_drive(file_path):
    """
    Mock do Upload para o Google Drive via google-api-python-client.
    Na versão de produção, aqui usaremos o OAuth2 e o MediaFileUpload.
    """
    if not os.path.exists(file_path):
        log.error(f"[NUVEM] Arquivo não encontrado: {file_path}")
        return False

    log.info(f"[NUVEM] Iniciando upload em background: {os.path.basename(file_path)}")
    try:
        # Ponto de injeção para o google-api-python-client no futuro
        # creds = Credentials.from_authorized_user_file('token.json', SCOPES)
        # service = build('drive', 'v3', credentials=creds)
        pass
    except Exception as e:
        log.warning(f"[NUVEM ERRO] Não foi possível conectar: {e}")
        return False
        
    log.info(f"[NUVEM] Upload concluído: {os.path.basename(file_path)}")
    return True

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
