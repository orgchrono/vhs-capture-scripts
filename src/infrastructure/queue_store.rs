//! Durable batch queue persisted as an atomic JSON file.
//!
//! Replaces the legacy SQLite `PersistentQueueManager`. Every state transition is validated
//! by the pure `domain::queue` state machine; this module only adds storage and locking.

use crate::domain::queue::{
    calculate_queue_stats, select_next_pending_job, transition_job_status, JobRecord, JobStatus,
    QueueStats,
};
use crate::models::timestamp::now_iso8601;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};

#[derive(Debug, Default, Serialize, Deserialize)]
struct QueueFile {
    next_id: u64,
    jobs: Vec<JobRecord>,
}

/// Cheaply clonable handle to the persistent queue.
#[derive(Debug, Clone)]
pub struct QueueStore {
    path: Arc<PathBuf>,
    state: Arc<Mutex<QueueFile>>,
}

fn lock(state: &Mutex<QueueFile>) -> MutexGuard<'_, QueueFile> {
    state.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
}

/// Pure crash-recovery rule: jobs interrupted mid-flight return to the pending state.
fn requeue_interrupted(mut file: QueueFile, timestamp: &str) -> QueueFile {
    file.jobs = file
        .jobs
        .into_iter()
        .map(|job| {
            if job.status == JobStatus::Processing {
                transition_job_status(job.clone(), JobStatus::Pending, None, timestamp)
                    .unwrap_or(job)
            } else {
                job
            }
        })
        .collect();
    file
}

impl QueueStore {
    /// Opens (or creates) the queue file, recovering interrupted jobs.
    #[must_use]
    pub fn open(path: PathBuf) -> Self {
        let loaded: QueueFile = fs::read_to_string(&path)
            .ok()
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or_default();
        let file = requeue_interrupted(loaded, &now_iso8601());
        Self {
            path: Arc::new(path),
            state: Arc::new(Mutex::new(file)),
        }
    }

    fn persist(&self, file: &QueueFile) -> Result<(), String> {
        if let Some(parent) = self.path.parent().filter(|p| !p.as_os_str().is_empty()) {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let tmp = self.path.with_extension("json.tmp");
        let content = serde_json::to_string_pretty(file).map_err(|e| e.to_string())?;
        fs::write(&tmp, content).map_err(|e| e.to_string())?;

        let mut last_err = None;
        for attempt in 0..5 {
            match fs::rename(&tmp, &*self.path) {
                Ok(()) => return Ok(()),
                Err(e) => {
                    last_err = Some(e);
                    std::thread::sleep(std::time::Duration::from_millis(20 * (1 << attempt)));
                }
            }
        }
        Err(last_err.map_or_else(|| "Failed to rename temp queue file".to_string(), |e| e.to_string()))
    }

    /// Appends a new pending job and returns its id.
    pub fn enqueue(&self, raw_path: &str, params: Value, priority: i32) -> Result<u64, String> {
        let mut file = lock(&self.state);
        let id = file.next_id + 1;
        let now = now_iso8601();
        file.next_id = id;
        file.jobs.push(JobRecord {
            id,
            raw_path: raw_path.to_string(),
            status: JobStatus::Pending,
            priority,
            params,
            created_at: now.clone(),
            updated_at: now,
            error_message: None,
        });
        self.persist(&file)?;
        Ok(id)
    }

    #[must_use]
    pub fn list(&self) -> Vec<JobRecord> {
        lock(&self.state).jobs.clone()
    }

    #[must_use]
    pub fn stats(&self) -> QueueStats {
        calculate_queue_stats(&lock(&self.state).jobs)
    }

    fn transition(
        &self,
        id: u64,
        status: JobStatus,
        error: Option<String>,
    ) -> Result<JobRecord, String> {
        let mut file = lock(&self.state);
        let idx = file
            .jobs
            .iter()
            .position(|j| j.id == id)
            .ok_or_else(|| format!("Job #{id} not found."))?;
        let updated = transition_job_status(file.jobs[idx].clone(), status, error, &now_iso8601())
            .map_err(str::to_string)?;
        file.jobs[idx] = updated.clone();
        self.persist(&file)?;
        Ok(updated)
    }

    /// Atomically selects the next pending job (priority DESC, id ASC) and marks it processing.
    pub fn claim_next(&self) -> Option<JobRecord> {
        let next = select_next_pending_job(&lock(&self.state).jobs)?;
        self.transition(next.id, JobStatus::Processing, None).ok()
    }

    /// Records the terminal outcome of a processing job.
    pub fn finish(&self, id: u64, error: Option<String>) -> Result<(), String> {
        let status = if error.is_none() {
            JobStatus::Completed
        } else {
            JobStatus::Failed
        };
        self.transition(id, status, error).map(|_| ())
    }

    /// Cancels a pending or processing job.
    pub fn cancel(&self, id: u64) -> Result<(), String> {
        self.transition(id, JobStatus::Cancelled, None).map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_queue(tag: &str) -> (QueueStore, PathBuf) {
        let path = std::env::temp_dir().join(format!("vhs_queue_{tag}_{}.json", std::process::id()));
        let _ = fs::remove_file(&path);
        (QueueStore::open(path.clone()), path)
    }

    #[test]
    fn test_enqueue_claim_priority_and_finish() {
        let (store, path) = temp_queue("flow");
        let low = store.enqueue("a.mkv", json!({}), 0).expect("enqueue");
        let high = store.enqueue("b.mkv", json!({}), 9).expect("enqueue");
        assert_eq!((low, high), (1, 2));
        let claimed = store.claim_next().expect("claim");
        assert_eq!(claimed.id, high);
        assert_eq!(claimed.status, JobStatus::Processing);
        store.finish(high, None).expect("finish");
        store.finish(store.claim_next().expect("claim").id, Some("boom".into())).expect("fail");
        let stats = store.stats();
        assert_eq!((stats.completed, stats.failed, stats.total), (1, 1, 2));
        assert!(store.claim_next().is_none());
        let _ = fs::remove_file(path);
    }

    #[test]
    fn test_cancel_rules() {
        let (store, path) = temp_queue("cancel");
        let id = store.enqueue("a.mkv", json!({}), 0).expect("enqueue");
        store.cancel(id).expect("cancel pending");
        assert_eq!(store.stats().cancelled, 1);
        assert!(store.claim_next().is_none(), "cancelled jobs are never claimed");
        assert!(store.cancel(999).is_err());
        let _ = fs::remove_file(path);
    }

    #[test]
    fn test_persistence_and_crash_recovery() {
        let (store, path) = temp_queue("persist");
        let id = store.enqueue("a.mkv", json!({"x": 1}), 3).expect("enqueue");
        store.claim_next().expect("claim");
        drop(store);
        let reopened = QueueStore::open(path.clone());
        let jobs = reopened.list();
        assert_eq!(jobs.len(), 1);
        assert_eq!(jobs[0].id, id);
        assert_eq!(jobs[0].status, JobStatus::Pending, "interrupted job is requeued");
        assert_eq!(reopened.enqueue("b.mkv", json!({}), 0).expect("enqueue"), id + 1);
        let _ = fs::remove_file(path);
    }
}
