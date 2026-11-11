"""Entry point: GUI by default, CLI with --cli."""
import sys


def run():
    if len(sys.argv) > 1 and sys.argv[1] == "--cli":
        if sys.platform == "win32" and sys.stdout is None:
            # GUI-subsystem exe: attach to the parent console so output is visible
            try:
                import ctypes
                if ctypes.windll.kernel32.AttachConsole(-1):
                    sys.stdout = open("CONOUT$", "w", encoding="utf-8", buffering=1)
                    sys.stderr = sys.stdout
            except Exception:
                pass
            if sys.stdout is None:
                import io
                sys.stdout = sys.stderr = io.StringIO()
        from dicom2jpeg.cli import main as cli_main
        return cli_main(sys.argv[2:])
    from dicom2jpeg.gui import main as gui_main
    return gui_main()


if __name__ == "__main__":
    sys.exit(run())
