//! Shared runtime services container (process manager, persistent queue, session token).
//!
//! Built once by the composition root (`viewmodels::composition`) and injected into the
//! HTTP/IPC dispatchers, so no handler owns hidden global state.

use crate::infrastructure::process_manager::ProcessManager;
use crate::infrastructure::queue_store::QueueStore;
use crate::infrastructure::queue_worker::{CommandBuilder, QueueWorker};
use crate::infrastructure::security::derive_session_token;
use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone)]
pub struct AppContext {
    pub session_token: String,
    pub process: ProcessManager,
    pub queue: QueueStore,
    pub worker: QueueWorker,
}

/// Collects process-local entropy (clock, pid, randomized hasher seed) for the session token.
fn gather_session_entropy() -> Vec<u8> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let mut hasher = RandomState::new().build_hasher();
    hasher.write_u128(nanos);
    hasher.write_u32(std::process::id());
    let mut entropy = hasher.finish().to_le_bytes().to_vec();
    entropy.extend_from_slice(&nanos.to_le_bytes());
    entropy.extend_from_slice(&std::process::id().to_le_bytes());
    entropy
}

impl AppContext {
    #[must_use]
    pub fn new(queue_path: PathBuf, build_command: CommandBuilder) -> Self {
        let process = ProcessManager::default();
        let queue = QueueStore::open(queue_path);
        let worker = QueueWorker::new(queue.clone(), process.clone(), build_command);
        Self {
            session_token: derive_session_token(&gather_session_entropy()),
            process,
            queue,
            worker,
        }
    }

    #[must_use]
    pub fn default_runtime() -> Self {
        use std::sync::Arc;
        let q_path = crate::infrastructure::paths::queue_path();
        let builder: CommandBuilder = Arc::new(|job| {
            let current_exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let mapped = crate::viewmodels::job_request_vm::map_restoration_payload(
                &job.params,
                &job.raw_path,
                "",
            );
            crate::viewmodels::job_request_vm::build_restore_job_command(&current_exe, &mapped.request)
        });
        Self::new(q_path, builder)
    }

    #[must_use]
    pub fn new_test(dir: &std::path::Path) -> Self {
        use std::sync::Arc;
        let builder: CommandBuilder = Arc::new(|_| Err("unused in unit tests".into()));
        Self::new(dir.join("test_queue.json"), builder)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn test_contexts_get_distinct_tokens() {
        let path = std::env::temp_dir().join(format!("vhs_ctx_{}.json", std::process::id()));
        let builder: CommandBuilder = Arc::new(|_| Err("unused".into()));
        let a = AppContext::new(path.clone(), builder.clone());
        let b = AppContext::new(path.clone(), builder);
        assert_ne!(a.session_token, b.session_token);
        assert_eq!(a.session_token.len(), 32);
        let _ = std::fs::remove_file(path);
    }
}
