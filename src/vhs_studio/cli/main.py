import sys
import argparse
from vhs_studio.video.direct_restore import restore_stream, get_stream_info
from vhs_studio.cli.desktop import run_desktop

def main():
    parser = argparse.ArgumentParser(description="VHS Studio CLI")
    subparsers = parser.add_subparsers(dest="command", help="Comandos disponíveis")

    # Comando: desktop (Interface Gráfica)
    desktop_parser = subparsers.add_parser("desktop", help="Abre a interface gráfica do VHS Studio")

    # Comando: watcher (Monitor Automático do OBS)
    watcher_parser = subparsers.add_parser("watcher", help="Inicia o monitor de gravação do OBS (Auto-Restaurador)")

    # Comando: api (Modo Headless Daemon)
    api_parser = subparsers.add_parser("api", help="Inicia o servidor de API FastAPI em modo headless")

    # Comando: restore (Restauração via CLI, como o antigo direct_restore)
    # Apenas redireciona os argumentos se chamado diretamente
    
    args, unknown = parser.parse_known_args()

    if args.command == "desktop" or args.command is None:
        run_desktop()
    elif args.command == "watcher":
        import vhs_studio.cli.watcher
        vhs_studio.cli.watcher.run_watcher()
    elif args.command == "api":
        from vhs_studio.api.server import run_server
        run_server()
    elif args.command == "restore":
        # Pass unknown args to direct_restore via sys.argv
        sys.argv = [sys.argv[0]] + unknown
        # Import and run direct_restore main
        import vhs_studio.video.direct_restore
        # direct_restore.py has no main() function yet, it just runs if __name__ == "__main__"
        # We need to refactor direct_restore.py to have a main() function!
        vhs_studio.video.direct_restore.main()
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
