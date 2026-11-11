"""Command line interface:  DicomToJpeg.exe --cli <input files/folders...> -o <output folder> [options]"""
import argparse
import sys
from pathlib import Path

from . import __version__
from .core import ConvertOptions, convert_many, find_dicom_files


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="DicomToJpeg --cli", description="DICOM -> JPEG converter (max quality)")
    p.add_argument("inputs", nargs="+", help="DICOM files or folders (searched recursively)")
    p.add_argument("-o", "--output", required=True, help="output folder")
    p.add_argument("--window", choices=["dicom", "full", "auto"], default="dicom")
    p.add_argument("--quality", type=int, default=100)
    p.add_argument("--lossless", choices=["none", "png16", "tiff16"], default="none",
                   help="also write a bit-exact 16-bit lossless copy")
    p.add_argument("--naming", choices=["original", "tags"], default="original")
    p.add_argument("--json", action="store_true", help="write metadata JSON (anonymised)")
    p.add_argument("--flat", action="store_true", help="do not keep sub-folder structure")
    p.add_argument("--overwrite", action="store_true")
    p.add_argument("--version", action="version", version=__version__)
    a = p.parse_args(argv)

    files = find_dicom_files(a.inputs)
    if not files:
        print("No DICOM files found.")
        return 2
    opts = ConvertOptions(window_mode=a.window, quality=max(1, min(100, a.quality)), lossless_copy=a.lossless,
                          naming=a.naming, save_metadata_json=a.json, keep_folder_structure=not a.flat,
                          overwrite=a.overwrite)
    root = Path(a.inputs[0]) if len(a.inputs) == 1 and Path(a.inputs[0]).is_dir() else None

    def prog(done, total, r):
        status = "OK " if not r.error else "ERR"
        print(f"[{done}/{total}] {status} {r.source}  {r.error or ''}", flush=True)

    results = convert_many(files, Path(a.output), opts, root, progress=prog)
    errors = [r for r in results if r.error]
    print(f"Done: {len(results) - len(errors)} converted, {len(errors)} failed.")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
