//! Native Rust 10-Locale i18n Key Parity Validator (`infrastructure::i18n_validator`).
//!
//! Replaces `scripts/validate_i18n.py` and `scripts/i18n/validator.py` with a
//! pure functional JSON key flattener and parity verifier across all 10 supported locales.

use crate::models::constants::SUPPORTED_LOCALES;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

/// Report comparing a single target locale against the canonical reference locale.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LocaleParityReport {
    pub locale: String,
    pub total_keys: usize,
    pub missing_keys: Vec<String>,
    pub extra_keys: Vec<String>,
    pub is_valid: bool,
}

/// Aggregate summary of i18n parity across all 10 required locales.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct I18nValidationSummary {
    pub reference_locale: String,
    pub reference_key_count: usize,
    pub reports: Vec<LocaleParityReport>,
    pub all_passed: bool,
}

/// Pure function that recursively flattens a nested JSON object into dot-separated key paths.
#[must_use]
pub fn flatten_json_keys(value: &Value, prefix: &str) -> BTreeSet<String> {
    let mut keys = BTreeSet::new();
    if let Value::Object(map) = value {
        for (k, v) in map {
            let full_key = if prefix.is_empty() {
                k.clone()
            } else {
                format!("{prefix}.{k}")
            };
            if v.is_object() {
                keys.extend(flatten_json_keys(v, &full_key));
            } else {
                keys.insert(full_key);
            }
        }
    }
    keys
}

/// Pure function comparing a target locale's flattened key set against the reference key set.
#[must_use]
pub fn compare_locale_keys(
    locale: &str,
    reference_keys: &BTreeSet<String>,
    target_keys: &BTreeSet<String>,
) -> LocaleParityReport {
    let missing_keys: Vec<String> = reference_keys.difference(target_keys).cloned().collect();
    let extra_keys: Vec<String> = target_keys.difference(reference_keys).cloned().collect();
    let is_valid = missing_keys.is_empty() && extra_keys.is_empty();

    LocaleParityReport {
        locale: locale.to_string(),
        total_keys: target_keys.len(),
        missing_keys,
        extra_keys,
        is_valid,
    }
}

/// Validates key parity across all 10 mandatory locales inside `locales_dir`.
pub fn validate_locales_directory(locales_dir: &Path) -> Result<I18nValidationSummary, String> {
    let reference_locale = SUPPORTED_LOCALES[0];
    let ref_path = locales_dir.join(reference_locale).join("translation.json");
    let ref_content = fs::read_to_string(&ref_path).map_err(|e| {
        format!(
            "Failed to read reference locale '{}' at {}: {e}",
            reference_locale,
            ref_path.display()
        )
    })?;
    let ref_json: Value = serde_json::from_str(&ref_content)
        .map_err(|e| format!("Invalid JSON in reference locale '{reference_locale}': {e}"))?;
    let ref_keys = flatten_json_keys(&ref_json, "");

    let mut reports = Vec::with_capacity(SUPPORTED_LOCALES.len());
    let mut all_passed = true;

    for &locale in &SUPPORTED_LOCALES {
        let locale_path = locales_dir.join(locale).join("translation.json");
        let content = fs::read_to_string(&locale_path).map_err(|e| {
            format!(
                "Failed to read locale '{locale}' at {}: {e}",
                locale_path.display()
            )
        })?;
        let json: Value = serde_json::from_str(&content)
            .map_err(|e| format!("Invalid JSON in locale '{locale}': {e}"))?;
        let target_keys = flatten_json_keys(&json, "");
        let report = compare_locale_keys(locale, &ref_keys, &target_keys);
        if !report.is_valid {
            all_passed = false;
        }
        reports.push(report);
    }

    Ok(I18nValidationSummary {
        reference_locale: reference_locale.to_string(),
        reference_key_count: ref_keys.len(),
        reports,
        all_passed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_flatten_json_keys_nested() {
        let sample = json!({
            "console": {
                "title": "Execution Console",
                "clear": "Clear"
            },
            "status": "Ready"
        });
        let keys = flatten_json_keys(&sample, "");
        assert_eq!(keys.len(), 3);
        assert!(keys.contains("console.title"));
        assert!(keys.contains("console.clear"));
        assert!(keys.contains("status"));
    }

    #[test]
    fn test_compare_locale_keys_detects_missing_and_extra() {
        let ref_keys: BTreeSet<String> = ["a.b", "a.c"].iter().map(|s| (*s).to_string()).collect();
        let target_keys: BTreeSet<String> =
            ["a.b", "a.d"].iter().map(|s| (*s).to_string()).collect();
        let report = compare_locale_keys("es", &ref_keys, &target_keys);
        assert!(!report.is_valid);
        assert_eq!(report.missing_keys, vec!["a.c".to_string()]);
        assert_eq!(report.extra_keys, vec!["a.d".to_string()]);
    }
}
