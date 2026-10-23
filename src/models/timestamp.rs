//! Pure UTC ISO-8601 timestamp formatting (zero external dependencies).

use std::time::{SystemTime, UNIX_EPOCH};

const SECS_PER_DAY: u64 = 86_400;
const SECS_PER_HOUR: u64 = 3_600;
const SECS_PER_MINUTE: u64 = 60;

/// Converts a count of days since 1970-01-01 into a proleptic Gregorian `(year, month, day)`.
fn civil_from_days(days_since_epoch: i64) -> (i64, u32, u32) {
    let z = days_since_epoch + 719_468;
    let era = z.div_euclid(146_097);
    let day_of_era = z.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * month_prime + 2) / 5 + 1) as u32;
    let month = if month_prime < 10 {
        month_prime + 3
    } else {
        month_prime - 9
    } as u32;
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

/// Pure formatter turning Unix epoch seconds into `YYYY-MM-DDTHH:MM:SSZ`.
#[must_use]
pub fn unix_to_iso8601(secs: u64) -> String {
    let (year, month, day) = civil_from_days((secs / SECS_PER_DAY) as i64);
    let rem = secs % SECS_PER_DAY;
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rem / SECS_PER_HOUR,
        (rem % SECS_PER_HOUR) / SECS_PER_MINUTE,
        rem % SECS_PER_MINUTE
    )
}

/// Current UTC time as an ISO-8601 string.
#[must_use]
pub fn now_iso8601() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    unix_to_iso8601(secs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_epoch_and_known_instants() {
        assert_eq!(unix_to_iso8601(0), "1970-01-01T00:00:00Z");
        assert_eq!(unix_to_iso8601(1_700_000_000), "2023-11-14T22:13:20Z");
        assert_eq!(unix_to_iso8601(951_782_400), "2000-02-29T00:00:00Z");
    }

    #[test]
    fn test_now_is_well_formed() {
        let now = now_iso8601();
        assert_eq!(now.len(), 20);
        assert!(now.ends_with('Z'));
    }
}
