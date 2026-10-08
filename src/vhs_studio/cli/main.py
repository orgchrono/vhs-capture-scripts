import sys
import argparse
from vhs_studio.video.direct_restore import restore_stream, get_stream_info
from vhs_studio.cli.desktop import run_desktop

def main():
    parser = argparse.ArgumentParser(description="VHS Studio CLI")
    subparsers = parser.add_subparsers(dest="command", help="Comandos disponÃ­veis")

    # Comando: desktop
    desktop_parser = subparsers.add_parser("desktop", help="Abre a interface grÃ¡fica do VHS Studio")

    # Comando: watcher
    watcher_parser = subparsers.add_parser("watcher", help="Inicia o monitor de gravaÃ§Ã£o do OBS")

    # Comando: api
    api_parser = subparsers.add_parser("api", help="Inicia o servidor de API FastAPI")

    # Comando: subtitles
    sub_parser = subparsers.add_parser("subtitles", help="Gera legendas offline via IA (Whisper)")
    sub_parser.add_argument("input", help="Caminho do vÃ­deo de entrada")
    sub_parser.add_argument("--model-size", default="tiny", choices=["tiny", "base", "small"], help="Tamanho do modelo")

    args, unknown = parser.parse_known_args()

    if args.command == "desktop" or args.command is None:
        run_desktop()
    elif args.command == "watcher":
        import vhs_studio.cli.watcher
        vhs_studio.cli.watcher.run_watcher()
    elif args.command == "api":
        from vhs_studio.api.server import run_server
        run_server()
    elif args.command == "subtitles":
        from vhs_studio.ai.whisper_engine import transcribe_and_generate_vtt
        transcribe_and_generate_vtt(args.input, args.model_size)
    elif args.command == "restore":
        sys.argv = [sys.argv[0]] + unknown
        import vhs_studio.video.direct_restore
        vhs_studio.video.direct_restore.main()
    else:
        parser.print_help()

if __name__ == "__main__":
    main()