//! Pure Domain Classifiers & Rational Framerate Parsers (`probe/classifier.rs`).

pub const DEFAULT_NTSC_FPS: f64 = 29.97002997002997;
pub const DEFAULT_PAL_FPS: f64 = 25.0;

/// Pure parser converting rational frame rate ("30000/1001", "25/1", "29.97") to floating point.
#[must_use]
pub fn parse_frame_rate_rational(r_fps: &str) -> (f64, String) {
    let trimmed = r_fps.trim();
    if trimmed.is_empty() {
        return (DEFAULT_NTSC_FPS, "30000/1001".to_string());
    }

    if let Some((num_str, den_str)) = trimmed.split_once('/') {
        let num: f64 = num_str.trim().parse().unwrap_or(30000.0);
        let den: f64 = den_str.trim().parse().unwrap_or(1001.0);
        if den > 0.0 {
            (num / den, trimmed.to_string())
        } else {
            (DEFAULT_NTSC_FPS, "30000/1001".to_string())
        }
    } else if let Ok(val) = trimmed.parse::<f64>() {
        if val > 0.0 {
            (val, trimmed.to_string())
        } else {
            (DEFAULT_NTSC_FPS, "30000/1001".to_string())
        }
    } else {
        (DEFAULT_NTSC_FPS, "30000/1001".to_string())
    }
}

/// Pure classifier determining broadcast standard (NTSC, PAL, HD, CUSTOM).
#[must_use]
pub fn classify_broadcast_standard(width: u32, height: u32, fps: f64) -> &'static str {
    if width >= 1280 || height >= 720 {
        return "HD";
    }

    let is_around_25fps = (fps - 25.0).abs() < 0.5 || (fps - 50.0).abs() < 0.5;
    let is_around_30fps = (fps - 29.97).abs() < 0.5 || (fps - 59.94).abs() < 0.5;

    let is_ntsc_dims = (height == 480 || height == 240) && (width == 720 || width == 704 || width == 640);
    let is_pal_dims = (height == 576 || height == 288) && (width == 720 || width == 704);

    if is_ntsc_dims && is_around_30fps {
        "NTSC"
    } else if is_pal_dims && is_around_25fps {
        "PAL"
    } else if height == 480 && is_around_30fps {
        "NTSC"
    } else if height == 576 && is_around_25fps {
        "PAL"
    } else {
        "CUSTOM"
    }
}

/// Pure classifier detecting if field order implies interlacing.
#[must_use]
pub fn is_interlaced_field_order(field_order: &str) -> bool {
    let lower = field_order.to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "tt" | "bb" | "tb" | "bt" | "top first" | "bottom first"
    )
}

/// Pure calculation of total expected frames given duration and frame rate.
#[must_use]
pub fn calculate_expected_frames(duration_sec: f64, fps: f64) -> u64 {
    if duration_sec <= 0.0 || fps <= 0.0 {
        0
    } else {
        (duration_sec * fps).round() as u64
    }
}
