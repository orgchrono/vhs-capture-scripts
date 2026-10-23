//! Sequential background worker consuming the persistent batch queue.
//!
//! Native replacement for legacy `QueueWorker`. The command to execute for a job is injected
//! (`CommandBuilder`) so the infrastructure layer never depends on ViewModels.

use crate::domain::queue::JobRecord;
use crate::infrastructure::process_manager::ProcessManager;
use crate::infrastructure::queue_store::QueueStore;
use crate::models::constants::QUEUE_POLL_INTERVAL_MS;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

/// Turns a queued job into `(program, args)`.
pub type CommandBuilder = Arc<dyn Fn(&JobRecord) -> Result<(PathBuf, Vec<String>), String> + Send + Sync>;

#[derive(Clone)]
pub struct QueueWorker {
    enabled: Arc<AtomicBool>,
    thread_spawned: Arc<AtomicBool>,
    current_job: Arc<Mutex<Option<u64>>>,
    store: QueueStore,
    process: ProcessManager,
    build_command: CommandBuilder,
}

impl std::fmt::Debug for QueueWorker {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("QueueWorker")
            .field("enabled", &self.is_running())
            .finish_non_exhaustive()
    }
}

impl QueueWorker {
    #[must_use]
    pub fn new(store: QueueStore, process: ProcessManager, build_command: CommandBuilder) -> Self {
        Self {
            enabled: Arc::new(AtomicBool::new(false)),
            thread_spawned: Arc::new(AtomicBool::new(false)),
            current_job: Arc::new(Mutex::new(None)),
            store,
            process,
            build_command,
        }
    }

    #[must_use]
    pub fn is_running(&self) -> bool {
        self.enabled.load(Ordering::SeqCst)
    }

    /// Enables the worker, spawning its polling thread on first use.
    pub fn start(&self) {
        self.enabled.store(true, Ordering::SeqCst);
        if self
            .thread_spawned
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            let worker = self.clone();
            thread::spawn(move || loop {
                thread::sleep(Duration::from_millis(QUEUE_POLL_INTERVAL_MS));
                worker.tick();
            });
        }
    }

    /// Stops claiming new jobs (the job currently running is allowed to finish).
    pub fn stop(&self) {
        self.enabled.store(false, Ordering::SeqCst);
    }

    fn reconcile_finished_job(&self) -> bool {
        let mut current = self
            .current_job
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let Some(id) = *current else {
            return false;
        };
        if self.process.is_running() {
            return true;
        }
        let snapshot = self.process.snapshot();
        let error = (snapshot.last_success != Some(true)).then(|| {
            format!("Process exited with code {:?}", snapshot.last_exit_code)
        });
        let _ = self.store.finish(id, error);
        *current = None;
        false
    }

    fn launch(&self, job: &JobRecord) {
        let started = (self.build_command)(job)
            .and_then(|(program, args)| self.process.start(&program, &args));
        match started {
            Ok(()) => {
                *self
                    .current_job
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(job.id);
            }
            Err(e) => {
                let _ = self.store.finish(job.id, Some(e));
            }
        }
    }

    /// One scheduling step: reconcile the running job, then claim the next one if idle.
    pub fn tick(&self) {
        if self.reconcile_finished_job() || !self.is_running() || self.process.is_running() {
            return;
        }
        if let Some(job) = self.store.claim_next() {
            self.launch(&job);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::queue::JobStatus;
    use serde_json::json;
    use std::time::Instant;

    fn shell_builder(script: &'static str) -> CommandBuilder {
        Arc::new(move |_job| {
            Ok(if cfg!(windows) {
                ("cmd".into(), vec!["/C".into(), script.into()])
            } else {
                ("sh".into(), vec!["-c".into(), script.into()])
            })
        })
    }

    fn drive_until_idle(worker: &QueueWorker, store: &QueueStore) {
        let deadline = Instant::now() + Duration::from_secs(15);
        while Instant::now() < deadline {
            worker.tick();
            let stats = store.stats();
            if stats.pending == 0 && stats.processing == 0 {
                return;
            }
            thread::sleep(Duration::from_millis(30));
        }
        panic!("queue did not drain in time");
    }

    #[test]
    fn test_worker_drains_queue_and_records_outcomes() {
        let path = std::env::temp_dir().join(format!("vhs_worker_ok_{}.json", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let store = QueueStore::open(path.clone());
        store.enqueue("a.mkv", json!({}), 0).expect("enqueue");
        store.enqueue("b.mkv", json!({}), 0).expect("enqueue");
        let worker = QueueWorker::new(store.clone(), ProcessManager::default(), shell_builder("echo ok"));
        worker.tick();
        assert_eq!(store.stats().pending, 2, "idle worker must not claim jobs");
        worker.enabled.store(true, Ordering::SeqCst);
        drive_until_idle(&worker, &store);
        assert_eq!(store.stats().completed, 2);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_worker_marks_failures_and_builder_errors() {
        let path = std::env::temp_dir().join(format!("vhs_worker_fail_{}.json", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let store = QueueStore::open(path.clone());
        store.enqueue("a.mkv", json!({}), 0).expect("enqueue");
        let worker = QueueWorker::new(store.clone(), ProcessManager::default(), shell_builder("exit 2"));
        worker.enabled.store(true, Ordering::SeqCst);
        drive_until_idle(&worker, &store);
        assert_eq!(store.list()[0].status, JobStatus::Failed);

        store.enqueue("b.mkv", json!({}), 0).expect("enqueue");
        let broken: CommandBuilder = Arc::new(|_| Err("bad params".to_string()));
        let worker = QueueWorker::new(store.clone(), ProcessManager::default(), broken);
        worker.enabled.store(true, Ordering::SeqCst);
        worker.tick();
        assert_eq!(store.list()[1].error_message.as_deref(), Some("bad params"));
        let _ = std::fs::remove_file(path);
    }
}
