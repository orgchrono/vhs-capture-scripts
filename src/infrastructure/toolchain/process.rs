//! Process creation and silent execution primitives with background priority.

use std::path::Path;
use std::process::{Command, Output};
use super::types::{BELOW_NORMAL_PRIORITY_CLASS, CREATE_NO_WINDOW};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Spawns a background Command configured to never flash console windows on Windows GUI.
#[must_use]
pub fn create_silent_command(program: &Path) -> Command {
    let mut cmd = Command::new(program);
    cmd.stdin(std::process::Stdio::null());
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Spawns a compute-heavy background Command (FFmpeg/VSPipe) configured with below-normal priority
/// so the operating system and UI thread remain fluid and responsive.
#[must_use]
pub fn create_compute_command(program: &Path) -> Command {
    let mut cmd = Command::new(program);
    cmd.stdin(std::process::Stdio::null());
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW | BELOW_NORMAL_PRIORITY_CLASS);
    }
    cmd
}

/// Executes a subprocess synchronously with invisible console window and captures output.
pub fn run_command_silent(program: &Path, args: &[&str]) -> Result<Output, std::io::Error> {
    let mut cmd = create_silent_command(program);
    cmd.args(args);
    cmd.output()
}
