//! Pure FFmpeg Capability & Codec/Filter Output Matchers (`package/capabilities.rs`).

/// Pure capability checker determining if an encoder is listed in FFmpeg `-encoders` output.
#[must_use]
pub fn has_ffmpeg_encoder(encoders_output: &str, encoder_name: &str) -> bool {
    let target = encoder_name.trim();
    if target.is_empty() {
        return false;
    }

    for line in encoders_output.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            // First column is flags (e.g. "V....."), second is codec identifier
            if parts[1].eq_ignore_ascii_case(target) {
                return true;
            }
        }
    }
    false
}

/// Pure capability checker determining if a filter is listed in FFmpeg `-filters` output.
#[must_use]
pub fn has_ffmpeg_filter(filters_output: &str, filter_name: &str) -> bool {
    let target = filter_name.trim();
    if target.is_empty() {
        return false;
    }

    for line in filters_output.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            // First column is flags (e.g. "T.."), second is filter name
            if parts[1].eq_ignore_ascii_case(target) {
                return true;
            }
        }
    }
    false
}
