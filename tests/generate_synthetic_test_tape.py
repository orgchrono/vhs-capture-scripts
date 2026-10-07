#!/usr/bin/env python3
"""
generate_synthetic_test_tape.py - VHS Synthetic Test Tape Generator
Generates true interlaced video files with motion, audio click tracks, 
and different signal dropouts (blue screen or black screen).
Supports NTSC (BFF) and PAL (TFF) generation.
"""

import os
import sys
import argparse
import subprocess

def generate_fixture(output_path, standard="ntsc", field_order="bff", dropout_color="black"):
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    
    if standard == "ntsc":
        width, height = 720, 480
        fps_expr = "60000/1001"
    elif standard == "pal":
        width, height = 720, 576
        fps_expr = "50"
    else:
        raise ValueError("Invalid standard. Use 'ntsc' or 'pal'.")

    # tinterlace modes: 
    # 4 (interleave_top) -> TFF
    # 5 (interleave_bottom) -> BFF
    if field_order == "bff":
        tinterlace_mode = "5"
        setfield_mode = "bff"
    elif field_order == "tff":
        tinterlace_mode = "4"
        setfield_mode = "tff"
    else:
        raise ValueError("Invalid field order. Use 'bff' or 'tff'.")

    # testsrc generates a scrolling gradient and a moving bar, 
    # which ensures each 60fps/50fps frame is temporally unique.
    # We overlay a timecode so we can visually debug dropped frames or sync.
    # A click track is generated via aevalsrc: 1000Hz tone for 0.1s every second.
    
    # Segment 1: Leader (1s) - Black, Silence
    # Segment 2: Signal (3s) - testsrc, Beeps
    # Segment 3: Dropout (1s) - Dropout color, Static/Noise audio
    # Segment 4: Signal (3s) - testsrc, Beeps

    filter_complex = (
        f"color=c=black:s={width}x{height}:r={fps_expr}:d=1.0[v_lead];"
        f"anullsrc=r=48000:cl=stereo:d=1.0[a_lead];"

        f"testsrc=s={width}x{height}:r={fps_expr}:d=3.0[v_test1];"
        f"[v_test1]drawtext=fontfile=/Windows/Fonts/consola.ttf:text='%{{pts\\:hms}}':fontsize=72:fontcolor=white:box=1:boxcolor=black@0.5:x=(w-text_w)/2:y=(h-text_h)/2[v_seg1];"
        f"aevalsrc='sin(1000*2*PI*t)*lt(mod(t,1),0.1)':d=3.0:s=48000:c=stereo[a_seg1];"

        f"color=c={dropout_color}:s={width}x{height}:r={fps_expr}:d=1.0[v_gap];"
        f"anoisesrc=c=pink:r=48000:d=1.0,volume=0.2[a_gap];"

        f"testsrc=s={width}x{height}:r={fps_expr}:d=3.0[v_test2];"
        f"[v_test2]drawtext=fontfile=/Windows/Fonts/consola.ttf:text='%{{pts\\:hms}}':fontsize=72:fontcolor=white:box=1:boxcolor=black@0.5:x=(w-text_w)/2:y=(h-text_h)/2[v_seg2];"
        f"aevalsrc='sin(1000*2*PI*t)*lt(mod(t,1),0.1)':d=3.0:s=48000:c=stereo[a_seg2];"

        "[v_lead][a_lead][v_seg1][a_seg1][v_gap][a_gap][v_seg2][a_seg2]concat=n=4:v=1:a=1[v_prog][a_out];"

        # Interlace the progressive sequence
        f"[v_prog]tinterlace=mode={tinterlace_mode},setfield=mode={setfield_mode}[v_out]"
    )

    cmd = [
        "ffmpeg", "-y", "-hide_banner",
        "-filter_complex", filter_complex,
        "-map", "[v_out]", "-map", "[a_out]",
        "-c:v", "ffv1", "-level", "3", "-g", "1", "-slices", "24", "-slicecrc", "1",
        "-c:a", "pcm_s16le",
        output_path
    ]

    print(f"[TESTE] Gerando {output_path} ({standard.upper()}, {field_order.upper()}, dropout {dropout_color})...")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"[ERRO] Falha ao gerar vídeo: {res.stderr}", file=sys.stderr)
        sys.exit(1)
    
    print(f"[TESTE] Gerado com sucesso: {output_path}")

def main():
    parser = argparse.ArgumentParser(description="Generate synthetic VHS fixtures")
    parser.add_argument("--all", action="store_true", help="Generate all standard fixtures")
    args = parser.parse_args()

    fixtures_dir = os.path.join("tests", "fixtures")
    os.makedirs(fixtures_dir, exist_ok=True)

    if args.all:
        generate_fixture(os.path.join(fixtures_dir, "ntsc_bff_black.mkv"), "ntsc", "bff", "black")
        generate_fixture(os.path.join(fixtures_dir, "ntsc_bff_blue.mkv"), "ntsc", "bff", "blue")
        generate_fixture(os.path.join(fixtures_dir, "pal_tff_black.mkv"), "pal", "tff", "black")
    else:
        # Default fixture
        generate_fixture(os.path.join("tests", "vhs_test_synthetic.mkv"), "ntsc", "bff", "black")

if __name__ == "__main__":
    main()
