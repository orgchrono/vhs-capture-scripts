# Suggestions & Improvements

These are non-breaking ideas you can adopt incrementally.

## Consistency & ergonomics
- **Use `$FFMPEG_BIN` and `$FFPLAY_BIN`** variables (exported in `video-lib.sh`) to allow pinning specific ffmpeg builds.
- For preview scripts, consider a small `run_ffplay` wrapper mirroring `run_ffmpeg` (no logging, but unified env).

## Provenance & audits
- Emit a tiny JSON sidecar per output with key parameters (filters, versions, git hash, date).
- Stamp the **git commit hash** into logs: append `git rev-parse --short HEAD` if repo available.

## Stability
- Add dependency checks at start of `master.sh` (e.g., `command -v vspipe` when using `--qtgmc`).
- Guard against overwriting outputs unless `-y` was **explicitly** chosen.

## Performance
- Permit **thread tuning** via env (e.g., `FFMPEG_THREADS`) and pass `-threads $FFMPEG_THREADS` to encodes.
- When concatenating steps, prefer reading lossless intermediates but consider pipe chains for temporary previews.

## Quality presets
- Provide named presets for `--qtgmc` (e.g., `--qtgmc=preset=slow`), and for h264/ProRes encodes.
- Consider `colorspace` / `setparams` metadata to keep BT.470bg flags consistent.

## Dev quality of life
- Add `.shellcheckrc` and run `shellcheck -x` in CI (GitHub Actions).
- `.editorconfig` to pin LF endings and spaces.
- Optional `Makefile` targets mirroring common `master.sh` invocations.
