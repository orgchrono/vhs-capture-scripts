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
    subparsers = parser.add_subparsers(dest="command", help="Comandos disponíveis")

    subparsers.add_parser("desktop", help="Abre a interface gráfica do VHS Studio")
    subparsers.add_parser("watcher", help="Inicia o monitor de gravação do OBS")
    subparsers.add_parser("api", help="Inicia o servidor de API FastAPI")
    subparsers.add_parser("setup-qtgmc", help="Instalação e configuração do VapourSynth + QTGMC")
    subparsers.add_parser("setup-obs", help="Instalação e configuração do OBS Studio")

    sub_parser = subparsers.add_parser(
        "subtitles", help="Gera legendas offline via IA (Whisper)"
    )
    sub_parser.add_argument("input", help="Caminho do vídeo de entrada")
    sub_parser.add_argument(
        "--model-size",
        default="tiny",
        choices=["tiny", "base", "small"],
        help="Tamanho do modelo",
    )

    qc_parser = subparsers.add_parser(
        "qc", help="Inspeção forense e geração de relatório museológico de defeitos (QC)"
    )
    qc_parser.add_argument("input", help="Caminho do arquivo de mídia para inspeção")

    subparsers.add_parser("restore", help="Restauração direta FFmpeg")
    subparsers.add_parser("pipeline", help="Pipeline orquestrada de restauração")
    subparsers.add_parser("tui", help="Estação interativa de terminal (TUI) sem navegador")

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

        transcribe_and_generate_vtt(args.input, args.model_size)
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
