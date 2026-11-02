/// Helper to launch the default system browser pointing to the server URL.
pub fn launch_default_browser(url: &str) {
    if !url.starts_with("http://127.0.0.1:") && !url.starts_with("http://localhost:") {
        return;
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/c", "start", "", url])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(url).spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
}
