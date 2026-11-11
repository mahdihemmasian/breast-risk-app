"""Converts synthetic samples + pydicom's compressed reference files and checks the results."""
import shutil
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from dicom2jpeg.core import ConvertOptions, convert_many, find_dicom_files  # noqa: E402
import make_samples  # noqa: E402


def main():
    tmp = Path(tempfile.mkdtemp())
    src = tmp / "in"
    make_samples.main(src)

    try:
        from pydicom.data import get_testdata_file
        for name in ["JPEG2000.dcm", "MR_small_jpeg_ls_lossless.dcm", "MR_small_RLE.dcm",
                     "SC_rgb_jpeg_dcmtk.dcm", "JPEG-lossless.dcm", "JPGExtended.dcm", "CT_small.dcm"]:
            p = get_testdata_file(name)
            if p:
                shutil.copy(p, src / name)
    except Exception as exc:
        print("WARNING: could not fetch pydicom test files:", exc)

    files = find_dicom_files([str(src)])
    print("found", len(files), "DICOM files")
    assert not any(f.name == "notes.txt" for f in files)
    res = convert_many(files, tmp / "out", ConvertOptions(lossless_copy="png16"), src)
    bad = [r for r in res if r.error]
    for r in res:
        print(("FAIL " if r.error else "ok   ") + r.source.name, r.error or r.info)
    assert not bad, bad
    jpg = Image.open(tmp / "out" / "mammo_mono1_14bit.jpg")
    assert jpg.size == (900, 1200)
    a = np.asarray(jpg)
    assert a.max() == 255 and a.min() == 0
    print("ALL TESTS PASSED")


if __name__ == "__main__":
    main()
