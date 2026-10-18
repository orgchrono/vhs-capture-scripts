"""Unified CLI entrypoint for VHS Studio Pro."""

import argparse
from typing import List, Optional
from vhs_studio.cli.desktop import run_desktop


def main(argv: Optional[List[str]] = None) -> int:
    """Parse CLI subcommands and dispatch execution without mutating global sys.argv."""
    if argv is None:
        import sys
        argv = sys.argv[1:]

    # Normalize invocations passing "-m <module>"
    if argv and len(argv) >= 2 and argv[0] == "-m":
        mod = argv[1]
        if "setup_qtgmc" in mod:
            argv = ["setup-qtgmc"] + argv[2:]
        elif "setup_obs" in mod:
            argv = ["setup-obs"] + argv[2:]
        elif mod == "vhs_studio" and len(argv) >= 3:
            argv = argv[2:]
        else:
            argv = argv[2:]

    parser = argparse.ArgumentParser(description="VHS Studio CLI")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    subparsers.add_parser("desktop", help="Launch VHS Studio graphic workstation")
    subparsers.add_parser("watcher", help="Start OBS recording folder watcher daemon")
    subparsers.add_parser("api", help="Start FastAPI local backend server")
    subparsers.add_parser("setup-qtgmc", help="Install and configure VapourSynth and QTGMC deinterlacer")
    subparsers.add_parser("setup-obs", help="Install and configure OBS Studio workstation")

    sub_parser = subparsers.add_parser(
        "subtitles", help="Generate offline subtitles via AI (Whisper)"
    )
    sub_parser.add_argument("input", help="Input video file path")
    sub_parser.add_argument(
        "--model-size",
        default="tiny",
        choices=["tiny", "base", "small"],
        help="Whisper model size",
    )
    sub_parser.add_argument(
        "--language",
        "-l",
        default="pt",
        help="Language code for transcription (e.g. pt, en, es, auto)",
    )

    qc_parser = subparsers.add_parser(
        "qc", help="Forensic inspection and archival defect report generation (QC)"
    )
    qc_parser.add_argument("input", help="Media file path for forensic QC inspection")

    subparsers.add_parser("restore", help="Direct FFmpeg restoration engine")
    subparsers.add_parser("pipeline", help="Multi-engine restoration DAG orchestrator")
    subparsers.add_parser("tui", help="Interactive terminal workstation (TUI)")

    args, unknown = parser.parse_known_args(argv)

    if args.command == "desktop" or args.command is None:
        run_desktop()
    elif args.command == "tui":
        from vhs_studio.cli.tui import run_tui

        run_tui()
    elif args.command == "watcher":
        import vhs_studio.cli.watcher

        vhs_studio.cli.watcher.run_watcher()
    elif args.command == "api":
        from vhs_studio.api.server import run_server

        run_server()
    elif args.command == "subtitles":
        from vhs_studio.ai.whisper_engine import transcribe_and_generate_vtt

        transcribe_and_generate_vtt(args.input, args.model_size, language=args.language)
    elif args.command == "qc":
        from vhs_studio.capture.qc import QualityControl

        QualityControl.run_qc(args.input)
    elif args.command == "setup-qtgmc":
        from vhs_studio.cli.setup_qtgmc import main as qtgmc_main
        return qtgmc_main()
    elif args.command == "setup-obs":
        from vhs_studio.cli.setup_obs import install_obs
        return 0 if install_obs() else 1
    elif args.command == "restore":
        import vhs_studio.video.direct_restore

        vhs_studio.video.direct_restore.main(unknown)
    elif args.command == "pipeline":
        import vhs_studio.pipeline

        vhs_studio.pipeline.main(unknown)
    else:
        parser.print_help()
        return 1
    return 0


if __name__ == "__main__":
    main()
