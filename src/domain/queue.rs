//! Pure Functional Batch Queue Job State Machine, Ordering, and Telemetry.
//!
//! Models deterministic job lifecycles (Pending -> Processing -> Completed | Failed | Cancelled),
//! priority scheduling, parameter validation, and status metric aggregations.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Pending,
    Processing,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JobRecord {
    pub id: u64,
    pub raw_path: String,
    pub status: JobStatus,
    pub priority: i32,
    pub params: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct QueueStats {
    pub pending: usize,
    pub processing: usize,
    pub completed: usize,
    pub failed: usize,
    pub cancelled: usize,
    pub total: usize,
}

/// Pure functional state machine validating whether a job transition is semantically valid.
pub fn transition_job_status(
    mut job: JobRecord,
    new_status: JobStatus,
    error_message: Option<String>,
    timestamp: &str,
) -> Result<JobRecord, &'static str> {
    if job.status == new_status {
        job.updated_at = timestamp.to_string();
        return Ok(job);
    }

    match (job.status, new_status) {
        // Pending can transition to Processing or Cancelled
        (JobStatus::Pending, JobStatus::Processing) => {
            job.status = JobStatus::Processing;
            job.updated_at = timestamp.to_string();
            job.error_message = None;
            Ok(job)
        }
        (JobStatus::Pending, JobStatus::Cancelled) => {
            job.status = JobStatus::Cancelled;
            job.updated_at = timestamp.to_string();
            Ok(job)
        }
        (JobStatus::Pending, JobStatus::Completed) => {
            Err("Illegal transition: pending job must first transition to processing")
        }
        (JobStatus::Pending, JobStatus::Failed) => {
            Err("Illegal transition: pending job cannot fail without processing")
        }

        // Processing can transition to Completed, Failed, Cancelled, or Pending (requeue)
        (JobStatus::Processing, JobStatus::Completed) => {
            job.status = JobStatus::Completed;
            job.updated_at = timestamp.to_string();
            job.error_message = None;
            Ok(job)
        }
        (JobStatus::Processing, JobStatus::Failed) => {
            job.status = JobStatus::Failed;
            job.updated_at = timestamp.to_string();
            job.error_message = error_message;
            Ok(job)
        }
        (JobStatus::Processing, JobStatus::Cancelled) => {
            job.status = JobStatus::Cancelled;
            job.updated_at = timestamp.to_string();
            Ok(job)
        }
        (JobStatus::Processing, JobStatus::Pending) => {
            job.status = JobStatus::Pending;
            job.updated_at = timestamp.to_string();
            Ok(job)
        }

        // Failed can only be retried to Pending
        (JobStatus::Failed, JobStatus::Pending) => {
            job.status = JobStatus::Pending;
            job.updated_at = timestamp.to_string();
            job.error_message = None;
            Ok(job)
        }
        (JobStatus::Failed, _) => {
            Err("Illegal transition: failed job can only be retried to pending")
        }

        // Completed and Cancelled are terminal
        (JobStatus::Completed, _) => Err("Illegal transition: completed jobs are immutable"),
        (JobStatus::Cancelled, _) => Err("Illegal transition: cancelled jobs cannot be updated"),
        _ => unreachable!(),
    }
}

/// Pure deterministic priority sorting: orders by `priority DESC, id ASC`.
#[must_use]
pub fn order_queue(jobs: &[JobRecord]) -> Vec<JobRecord> {
    let mut sorted = jobs.to_vec();
    sorted.sort_by(|a, b| {
        b.priority
            .cmp(&a.priority)
            .then_with(|| a.id.cmp(&b.id))
    });
    sorted
}

/// Pure selector returning the next eligible pending job in FIFO priority order.
#[must_use]
pub fn select_next_pending_job(jobs: &[JobRecord]) -> Option<JobRecord> {
    jobs.iter()
        .filter(|j| j.status == JobStatus::Pending)
        .min_by(|a, b| {
            b.priority
                .cmp(&a.priority)
                .then_with(|| a.id.cmp(&b.id))
        })
        .cloned()
}

/// Pure aggregator computing status counts over a collection of jobs.
#[must_use]
pub fn calculate_queue_stats(jobs: &[JobRecord]) -> QueueStats {
    let mut stats = QueueStats {
        total: jobs.len(),
        ..Default::default()
    };

    for job in jobs {
        match job.status {
            JobStatus::Pending => stats.pending += 1,
            JobStatus::Processing => stats.processing += 1,
            JobStatus::Completed => stats.completed += 1,
            JobStatus::Failed => stats.failed += 1,
            JobStatus::Cancelled => stats.cancelled += 1,
        }
    }

    stats
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn make_test_job(id: u64, priority: i32, status: JobStatus) -> JobRecord {
        JobRecord {
            id,
            raw_path: format!("/media/tape_{id}.avi"),
            status,
            priority,
            params: json!({"preset": "gold"}),
            created_at: "2026-10-18T10:00:00Z".to_string(),
            updated_at: "2026-10-18T10:00:00Z".to_string(),
            error_message: None,
        }
    }

    #[test]
    fn test_valid_job_lifecycle_transitions() {
        let job = make_test_job(1, 0, JobStatus::Pending);

        // Pending -> Processing
        let processing = transition_job_status(job, JobStatus::Processing, None, "2026-10-18T10:05:00Z")
            .expect("should transition to processing");
        assert_eq!(processing.status, JobStatus::Processing);

        // Processing -> Completed
        let completed = transition_job_status(processing, JobStatus::Completed, None, "2026-10-18T10:30:00Z")
            .expect("should transition to completed");
        assert_eq!(completed.status, JobStatus::Completed);

        // Completed -> Processing should fail
        let illegal = transition_job_status(completed, JobStatus::Processing, None, "2026-10-18T10:35:00Z");
        assert!(illegal.is_err());
    }

    #[test]
    fn test_priority_scheduling_order() {
        let jobs = vec![
            make_test_job(1, 0, JobStatus::Pending),
            make_test_job(2, 10, JobStatus::Pending), // Higher priority
            make_test_job(3, 5, JobStatus::Pending),
            make_test_job(4, 10, JobStatus::Pending), // Equal priority, higher ID
        ];

        let next = select_next_pending_job(&jobs).expect("should select job");
        assert_eq!(next.id, 2); // Priority 10 with lowest ID

        let sorted = order_queue(&jobs);
        assert_eq!(sorted[0].id, 2);
        assert_eq!(sorted[1].id, 4);
        assert_eq!(sorted[2].id, 3);
        assert_eq!(sorted[3].id, 1);
    }

    #[test]
    fn test_queue_stats_aggregation() {
        let jobs = vec![
            make_test_job(1, 0, JobStatus::Pending),
            make_test_job(2, 0, JobStatus::Processing),
            make_test_job(3, 0, JobStatus::Completed),
            make_test_job(4, 0, JobStatus::Failed),
            make_test_job(5, 0, JobStatus::Cancelled),
        ];

        let stats = calculate_queue_stats(&jobs);
        assert_eq!(stats.total, 5);
        assert_eq!(stats.pending, 1);
        assert_eq!(stats.processing, 1);
        assert_eq!(stats.completed, 1);
        assert_eq!(stats.failed, 1);
        assert_eq!(stats.cancelled, 1);
    }
}
