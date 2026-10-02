# 00_qtgmc_deint.vpy — VapourSynth QTGMC deinterlace (50p)
# -------------------------------------------------------------------
# Usage (via wrapper):
#   export VS_SRC="/abs/path/input.mkv"
#   vspipe --y4m 00_qtgmc_deint.vpy - | ffmpeg ...
#
# Environment variables (all optional except VS_SRC):
#   VS_SRC        : (required) absolute/relative path to the input file
#   VS_FIELD      : TFF | BFF | AUTO        (default: TFF)
#                   - TFF/BFF set QTGMC's TFF flag True/False
#                   - AUTO sets Order=0 (let QTGMC decide)
#   VS_PRESET     : Placebo|VerySlow|Slower|Slow|Medium|Fast|Faster|VeryFast|SuperFast
#                   (default: Slow) — higher = slower/better
#   VS_EZDENOISE  : float (e.g. 0.75) to enable QTGMC’s built-in EZDenoise
#                   (omit or empty to leave at QTGMC defaults)
#   VS_SHARPNESS  : float 0.0..2.0 (default None) — maps to QTGMC Sharpness
#   VS_SOURCER    : ffms2 | lsmas | auto    (default: auto)
#                   - auto tries ffms2 then falls back to lsmas if available
#
# Notes:
#   - This script produces video only; your wrapper muxes original audio.
#   - For PAL VHS workflows, TFF is commonly correct; use AUTO if unsure and review motion.
#   - If FFMS2 struggles on specific files, set VS_SOURCER=lsmas explicitly.
# -------------------------------------------------------------------

import os
import vapoursynth as vs
core = vs.core

# --- read environment ---
src_path = os.environ.get("VS_SRC")
if not src_path:
    raise ValueError("Set VS_SRC to your input file path (e.g. export VS_SRC=/path/in.mkv)")

vs_field    = os.environ.get("VS_FIELD", "TFF").upper()   # TFF|BFF|AUTO
vs_preset   = os.environ.get("VS_PRESET", "Slow")
vs_ezden    = os.environ.get("VS_EZDENOISE", "").strip()
vs_sharp    = os.environ.get("VS_SHARPNESS", "").strip()
vs_sourcer  = os.environ.get("VS_SOURCER", "auto").lower()

# --- source (robust) ---
# Try FFMS2 first (good for many containers). Fall back to L-SMASH if requested/needed.
def open_source(path: str):
    if vs_sourcer in ("ffms2", "auto"):
        try:
            return core.ffms2.Source(path)
        except Exception as e:
            if vs_sourcer == "ffms2":
                raise
            # fall through to l-smash
    if vs_sourcer in ("lsmas", "auto"):
        try:
            return core.lsmas.LWLibavSource(path)
        except Exception as e:
            if vs_sourcer == "lsmas":
                raise
    # If both failed explicitly:
    raise RuntimeError("Failed to open source with ffms2 and lsmash. "
                       "Install at least one and/or set VS_SOURCER appropriately.")

clip = open_source(src_path)

# --- QTGMC parameters ---
import havsfunc as haf

qtgmc_kwargs = {
    "Preset": vs_preset,   # quality/speed tradeoff
}

# Field order: explicit TFF/BFF, or AUTO via Order=0
if vs_field == "TFF":
    qtgmc_kwargs["TFF"] = True
elif vs_field == "BFF":
    qtgmc_kwargs["TFF"] = False
elif vs_field == "AUTO":
    qtgmc_kwargs["Order"] = 0
else:
    raise ValueError("VS_FIELD must be TFF, BFF, or AUTO")

# Optional: EZDenoise
if vs_ezden:
    try:
        qtgmc_kwargs["EZDenoise"] = float(vs_ezden)
    except ValueError:
        raise ValueError("VS_EZDENOISE must be a float (e.g. 0.5, 1.0)")

# Optional: Sharpness
if vs_sharp:
    try:
        qtgmc_kwargs["Sharpness"] = float(vs_sharp)
    except ValueError:
        raise ValueError("VS_SHARPNESS must be a float (e.g. 0.6)")

# --- deinterlace to 50p ---
deint = haf.QTGMC(clip, **qtgmc_kwargs)

# Output
deint.set_output()
