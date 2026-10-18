//! Pure Functional Cloud Storage OAuth 2.0 State Machine.
//!
//! Models deterministic authorization URL generation and token exchange parameter
//! compilation for Google Drive, Dropbox, and Microsoft OneDrive.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OAuthProvider {
    GDrive,
    Dropbox,
    OneDrive,
}

impl OAuthProvider {
    #[must_use]
    pub fn auth_url(&self) -> &'static str {
        match self {
            Self::GDrive => "https://accounts.google.com/o/oauth2/v2/auth",
            Self::Dropbox => "https://www.dropbox.com/oauth2/authorize",
            Self::OneDrive => "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        }
    }

    #[must_use]
    pub fn token_url(&self) -> &'static str {
        match self {
            Self::GDrive => "https://oauth2.googleapis.com/token",
            Self::Dropbox => "https://api.dropboxapi.com/oauth2/token",
            Self::OneDrive => "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        }
    }

    #[must_use]
    pub fn scope(&self) -> &'static str {
        match self {
            Self::GDrive => "https://www.googleapis.com/auth/drive.file",
            Self::Dropbox => "",
            Self::OneDrive => "Files.ReadWrite.All offline_access",
        }
    }

    #[must_use]
    pub fn client_id_env_key(&self) -> &'static str {
        match self {
            Self::GDrive => "GDRIVE_CLIENT_ID",
            Self::Dropbox => "DROPBOX_APP_KEY",
            Self::OneDrive => "ONEDRIVE_CLIENT_ID",
        }
    }

    #[must_use]
    pub fn token_env_key(&self) -> &'static str {
        match self {
            Self::GDrive => "GDRIVE_REFRESH_TOKEN",
            Self::Dropbox => "DROPBOX_ACCESS_TOKEN",
            Self::OneDrive => "ONEDRIVE_REFRESH_TOKEN",
        }
    }
}

/// Pure builder constructing the authorization redirect URL.
#[must_use]
pub fn build_oauth_auth_url(
    provider: OAuthProvider,
    client_id: &str,
    redirect_uri: &str,
    state: &str,
) -> String {
    let mut url = format!(
        "{}?client_id={}&redirect_uri={}&response_type=code&state={}",
        provider.auth_url(),
        client_id,
        redirect_uri,
        state
    );

    let scope = provider.scope();
    if !scope.is_empty() {
        url.push_str("&scope=");
        url.push_str(scope);
    }

    match provider {
        OAuthProvider::GDrive => {
            url.push_str("&access_type=offline&prompt=consent");
        }
        OAuthProvider::Dropbox => {
            url.push_str("&token_access_type=offline");
        }
        OAuthProvider::OneDrive => {}
    }

    url
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OAuthTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<u64>,
    pub token_type: Option<String>,
}

/// Pure parser extracting token results from provider JSON response.
pub fn parse_oauth_token_response(json_body: &str) -> Result<OAuthTokenResponse, String> {
    serde_json::from_str(json_body).map_err(|e| format!("Invalid OAuth token response JSON: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_gdrive_auth_url() {
        let url = build_oauth_auth_url(OAuthProvider::GDrive, "client123", "http://localhost/cb", "state456");
        assert!(url.starts_with("https://accounts.google.com/o/oauth2/v2/auth?"));
        assert!(url.contains("client_id=client123"));
        assert!(url.contains("redirect_uri=http://localhost/cb"));
        assert!(url.contains("state=state456"));
        assert!(url.contains("access_type=offline"));
        assert!(url.contains("prompt=consent"));
    }

    #[test]
    fn test_build_dropbox_auth_url() {
        let url = build_oauth_auth_url(OAuthProvider::Dropbox, "drop123", "http://localhost/cb", "state789");
        assert!(url.starts_with("https://www.dropbox.com/oauth2/authorize?"));
        assert!(url.contains("token_access_type=offline"));
    }

    #[test]
    fn test_build_onedrive_auth_url() {
        let url = build_oauth_auth_url(OAuthProvider::OneDrive, "one123", "http://localhost/cb", "state000");
        assert!(url.starts_with("https://login.microsoftonline.com/common/oauth2/v2.0/authorize?"));
        assert!(url.contains("scope=Files.ReadWrite.All offline_access"));
    }

    #[test]
    fn test_parse_oauth_token_response_success() {
        let json = r#"{
            "access_token": "ya29.a0AfH6...",
            "refresh_token": "1//04...",
            "expires_in": 3599,
            "token_type": "Bearer"
        }"#;

        let res = parse_oauth_token_response(json).expect("Parse succeeds");
        assert_eq!(res.access_token, "ya29.a0AfH6...");
        assert_eq!(res.refresh_token, Some("1//04...".to_string()));
        assert_eq!(res.expires_in, Some(3599));
        assert_eq!(res.token_type, Some("Bearer".to_string()));
    }
}
