"""Create synthetic DICOM test files (mammo-like MONOCHROME1 14-bit, MONOCHROME2 12-bit, signed CT, multi-frame, RGB)."""
import sys
from pathlib import Path

import numpy as np
import pydicom
from pydicom.dataset import FileDataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid


def make(path, arr, pi="MONOCHROME2", bits=16, signed=False, extra=None, frames=1, spp=1):
    meta = FileMetaDataset()
    meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.1.2"
    meta.MediaStorageSOPInstanceUID = generate_uid()
    meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds = FileDataset(str(path), {}, file_meta=meta, preamble=b"\0" * 128)
    ds.SOPClassUID = meta.MediaStorageSOPClassUID
    ds.SOPInstanceUID = meta.MediaStorageSOPInstanceUID
    ds.Modality = "MG"
    ds.PatientName = "Test^Patient"
    ds.PatientID = "P001"
    ds.StudyDate = "20261111"
    ds.SamplesPerPixel = spp
    ds.PhotometricInterpretation = pi
    if spp > 1:
        ds.PlanarConfiguration = 0
    ds.Rows, ds.Columns = arr.shape[-2] if spp == 1 else arr.shape[-3], arr.shape[-1] if spp == 1 else arr.shape[-2]
    ds.BitsAllocated = 16 if bits > 8 else 8
    ds.BitsStored = bits
    ds.HighBit = bits - 1
    ds.PixelRepresentation = 1 if signed else 0
    if frames > 1:
        ds.NumberOfFrames = frames
    for k, v in (extra or {}).items():
        setattr(ds, k, v)
    ds.PixelData = arr.tobytes()
    ds.save_as(str(path), enforce_file_format=True)


def main(out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    y, x = np.mgrid[0:1200, 0:900]
    breast = ((x / 900.0) ** 2 + ((y - 600) / 600.0) ** 2 < 1).astype(float)
    mammo = (breast * (6000 + 4000 * np.sin(x / 37.0) * np.cos(y / 53.0)) + 200).astype(np.uint16)
    mammo[500:510, 300:310] = 15000   # "micro-calcification"
    make(out / "mammo_mono1_14bit.dcm", 16383 - np.minimum(mammo, 16383), "MONOCHROME1", 14,
         extra={"WindowCenter": 8000, "WindowWidth": 12000, "ImagerPixelSpacing": [0.07, 0.07],
                "ViewPosition": "CC", "ImageLaterality": "L"})
    make(out / "mammo_mono2_12bit", (mammo // 4).astype(np.uint16), "MONOCHROME2", 12)  # no extension
    ct = (np.random.default_rng(0).normal(0, 300, (256, 256))).astype(np.int16)
    (out / "sub").mkdir(exist_ok=True)
    make(out / "sub" / "ct_signed.dcm", ct,
         "MONOCHROME2", 16, True, extra={"RescaleSlope": 1, "RescaleIntercept": -1024,
                                          "WindowCenter": 40, "WindowWidth": 400})
    mf = np.stack([mammo[:256, :256] * (i + 1) // 3 for i in range(3)]).astype(np.uint16)
    make(out / "multiframe.dcm", mf, "MONOCHROME2", 16, frames=3)
    rgb = np.zeros((128, 128, 3), np.uint8)
    rgb[..., 0] = 200
    rgb[32:96, 32:96, 1] = 255
    make(out / "color_rgb.dcm", rgb, "RGB", 8, spp=3)
    (out / "notes.txt").write_text("not a dicom")
    print("samples written to", out)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "samples")
