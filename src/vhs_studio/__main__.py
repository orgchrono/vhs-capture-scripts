import sys
import multiprocessing

if __name__ == "__main__":
    multiprocessing.freeze_support()
    from vhs_studio.cli.main import main
    sys.exit(main())