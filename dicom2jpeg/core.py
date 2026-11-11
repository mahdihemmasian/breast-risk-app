"""
Core DICOM -> JPEG conversion engine.

Quality strategy
----------------
* Native resolution is always preserved (no resizing, no cropping).
* Modality LUT (RescaleSlope / RescaleIntercept or Modality LUT Sequence) is applied
  in floating point, then the VOI transform (window centre/width, VOI LUT Sequence,
  or an automatic window) maps the full 10-16-bit dynamic range to 8 bits with
  correct rounding (no clipping of useful data in "full range" mode).
* MONOCHROME1 images (common in mammography) are inverted so that they look as on
  the workstation.
* JPEG is written with quality=100, chroma subsampling 4:4:4, optimised Huffman
  tables and the physical pixel size stored as DPI.
* Optionally a bit-exact lossless 16-bit PNG/TIFF is written next to the JPEG,
  because baseline JPEG can only store 8 bits per channel.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable, List, Optional

import numpy as np
from PIL import Image

import pydicom
from pydicom.dataset import Dataset

try:  # pydicom >= 2.x
    from pydicom.pixels import apply_modality_lut, apply_voi_lut  # type: ignore
except Exception:  # pragma: no cover - older pydicom
    from pydicom.pixel_data_handlers.util import apply_modality_lut, apply_voi_lut  # type: ignore

try:
    from pydicom.pixels import convert_color_space  # type: ignore
except Exception:  # pragma: no cover
    from pydicom.pixel_data_handlers.util import convert_color_space  # type: ignore


try:
    _PYDICOM_MAJOR = int(str(pydicom.__version__).split(".")[0])
except Exception:  # pragma: no cover
    _PYDICOM_MAJOR = 3

WINDOW_MODES = {
    "dicom": "پنجره ذخیره‌شده در فایل DICOM (همان نمایش ایستگاه کاری)",
    "full": "کل محدوده دینامیک (حداقل تا حداکثر)",
    "auto": "پنجره خودکار (صدک ۰٫۵ تا ۹۹٫۵ – کنتراست بهتر)",
}

LOSSLESS_FORMATS = {"none": None, "png16": ".png", "tiff16": ".tif"}


@dataclass
class ConvertOptions:
    window_mode: str = "dicom"          # dicom | full | auto
    quality: int = 100                  # 1..100
    subsampling_444: bool = True
    lossless_copy: str = "none"         # none | png16 | tiff16
    keep_folder_structure: bool = True
    naming: str = "original"            # original | tags
    save_metadata_json: bool = False
    anonymize_metadata: bool = True
    overwrite: bool = False


@dataclass
class ConvertResult:
    source: Path
    outputs: List[Path] = field(default_factory=list)
    error: Optional[str] = None
    info: str = ""


# --------------------------------------------------------------------------- helpers
def is_dicom_file(path: Path) -> bool:
    """Quick check: DICM preamble or a parseable header."""
    try:
        with open(path, "rb") as f:
            head = f.read(132)
        if len(head) >= 132 and head[128:132] == b"DICM":
            return True
        if path.suffix.lower() in (".dcm", ".dicom", ".dic", ".ima"):
            return True
        if path.suffix == "":  # many PACS exports have no extension
            ds =pydicom.dcmread(str(path), stop_before_pixels=True, force=True)
            return "SOPClassUID" in ds or "PixelData" in ds or "Modality" in ds
    except Exception:
        return False
    return False


def find_dicom_files(inputs: Iterable[str]) -> List[Path]:
    found: List[Path] = []
    for item in inputs:
        p = Path(item)
        if p.is_dir():
            for root, _dirs, files in os.walk(p):
                for name in sorted(files):
                    fp = Path(root) / name
                    if is_dicom_file(fp):
                        found.append(fp)
        elif p.is_file() and is_dicom_file(p):
            found.append(p)
    # de-duplicate, keep order
    seen, unique = set(), []
    for f in found:
        k = str(f.resolve())
        if k not in seen:
            seen.add(k)
            unique.append(f)
    return unique


def _safe(text: str) -> str:
    text = re.sub(r"[^\w\-.]+", "_", str(text), flags=re.UNICODE).strip("_")
    return text or "x"


def _first(value):
    if isinstance(value, (list, tuple)) or value.__class__.__name__ == "MultiValue":
        return value[0] if len(value) else None
    return value


def _pixel_spacing_mm(ds: Dataset) -> Optional[float]:
    for tag in ("PixelSpacing", "ImagerPixelSpacing", "NominalScannedPixelSpacing"):
        v = ds.get(tag)
        if v:
            try:
                return float(v[0])
            except Exception:
                pass
    return None


# --------------------------------------------------------------------------- pixel pipeline
def _to_display_8bit(frame: np.ndarray, ds: Dataset, mode: str) -> np.ndarray:
    """Grayscale frame (raw stored values) -> uint8 for display."""
    data = apply_modality_lut(frame, ds).astype(np.float64)

    if mode == "dicom" and ("WindowCenter" in ds or "VOILUTSequence" in ds):
        try:
            voi = apply_voi_lut(data, ds, index=0, prefer_lut=True)
            data = np.asarray(voi, dtype=np.float64)
        except Exception:
            mode = "full"
    elif mode == "dicom":
        mode = "full"

    if mode == "auto":
        lo, hi = np.percentile(data, [0.5, 99.5])
    else:
        lo, hi = float(np.min(data)), float(np.max(data))
    if hi <= lo:
        hi = lo + 1.0
    scaled = (data - lo) / (hi - lo)
    scaled = np.clip(scaled, 0.0, 1.0)

    if str(ds.get("PhotometricInterpretation", "")).upper() == "MONOCHROME1":
        scaled = 1.0 - scaled
    return np.round(scaled * 255.0).astype(np.uint8)


def _to_lossless_16bit(frame: np.ndarray, ds: Dataset) -> np.ndarray:
    """Bit-exact (stored values) 16-bit copy; MONOCHROME1 inverted to keep orientation of greys."""
    arr = np.asarray(frame)
    if arr.dtype.kind == "f":
        lo, hi = float(arr.min()), float(arr.max())
        arr = (arr - lo) / max(hi - lo, 1e-12) * 65535.0
        arr = np.round(arr)
    elif arr.dtype.kind == "i":
        arr = arr.astype(np.int64) - int(arr.min())   # shift to positive, values unchanged otherwise
    arr = arr.astype(np.uint16)
    if str(ds.get("PhotometricInterpretation", "")).upper() == "MONOCHROME1":
        bits = int(ds.get("BitsStored", 16) or 16)
        maxv = (1 << bits) - 1 if bits <= 16 else 65535
        arr = (maxv - np.minimum(arr, maxv)).astype(np.uint16)
    return arr


def _color_to_rgb8(frame: np.ndarray, ds: Dataset) -> np.ndarray:
    pi = str(ds.get("PhotometricInterpretation", "RGB")).upper()
    arr = frame
    # pydicom >= 3 already returns RGB from ds.pixel_array; only older versions need converting
    if _PYDICOM_MAJOR < 3 and pi.startswith("YBR") and pi not in ("YBR_RCT", "YBR_ICT"):
        try:
            arr = convert_color_space(arr, pi, "RGB")
        except Exception:
            pass
    if arr.dtype != np.uint8:
        arr = arr.astype(np.float64)
        lo, hi = arr.min(), arr.max()
        arr = np.round((arr - lo) / max(hi - lo, 1e-12) * 255).astype(np.uint8)
    return arr


def read_frames(ds: Dataset) -> List[np.ndarray]:
    arr = ds.pixel_array
    n_frames = int(ds.get("NumberOfFrames", 1) or 1)
    spp = int(ds.get("SamplesPerPixel", 1) or 1)
    if n_frames > 1:
        return [arr[i] for i in range(arr.shape[0])]
    if spp == 1 and arr.ndim == 3:  # some files store frames without NumberOfFrames
        return [arr[i] for i in range(arr.shape[0])]
    return [arr]


def render_preview(path: Path, mode: str = "dicom") -> Image.Image:
    ds = pydicom.dcmread(str(path), force=True)
    frame = read_frames(ds)[0]
    if int(ds.get("SamplesPerPixel", 1) or 1) > 1:
        return Image.fromarray(_color_to_rgb8(frame, ds), "RGB")
    return Image.fromarray(_to_display_8bit(frame, ds, mode), "L")


def describe(ds: Dataset) -> str:
    parts = []
    for tag, label in (("Modality", "Modality"), ("ViewPosition", "View"),
                       ("ImageLaterality", "Side"), ("Rows", "Rows"), ("Columns", "Cols"),
                       ("BitsStored", "Bits"), ("PhotometricInterpretation", "PI")):
        v = ds.get(tag)
        if v not in (None, ""):
            parts.append(f"{label}={v}")
    try:
        parts.append(f"TS={ds.file_meta.TransferSyntaxUID.name}")
    except Exception:
        pass
    return ", ".join(parts)


_META_TAGS = ["Modality", "Manufacturer", "ManufacturerModelName", "StudyDate", "SeriesDescription",
              "ViewPosition", "ImageLaterality", "Laterality", "BodyPartExamined", "Rows", "Columns",
              "BitsStored", "PhotometricInterpretation", "PixelSpacing", "ImagerPixelSpacing",
              "WindowCenter", "WindowWidth", "RescaleSlope", "RescaleIntercept", "KVP", "Exposure",
              "CompressionForce", "BodyPartThickness"]
_PHI_TAGS = ["PatientName", "PatientID", "PatientBirthDate", "PatientSex", "PatientAge",
             "InstitutionName", "ReferringPhysicianName", "AccessionNumber"]


def _metadata(ds: Dataset, anonymize: bool) -> dict:
    out = {}
    for t in _META_TAGS + ([] if anonymize else _PHI_TAGS):
        v = ds.get(t)
        if v is None:
            continue
        if hasattr(v, "__iter__") and not isinstance(v, (str, bytes)):
            v = [str(x) for x in v]
        else:
            v = str(v)
        out[t] = v
    return out


# --------------------------------------------------------------------------- main API
def output_base(src: Path, ds: Dataset, out_dir: Path, root: Optional[Path], opts: ConvertOptions) -> Path:
    if opts.naming == "tags":
        bits = [ds.get("PatientID", ""), ds.get("StudyDate", ""),
                ds.get("ImageLaterality", "") or ds.get("Laterality", ""),
                ds.get("ViewPosition", ""), ds.get("InstanceNumber", "")]
        name = "_".join(_safe(b) for b in bits if str(b)) or _safe(src.stem)
    else:
        name = _safe(src.stem if src.suffix.lower() in (".dcm", ".dicom", ".dic", ".ima") else src.name)
    sub = Path()
    if opts.keep_folder_structure and root is not None:
        try:
            sub = src.parent.resolve().relative_to(root.resolve())
        except ValueError:
            sub = Path()
    return out_dir / sub / name


def _unique(path: Path, overwrite: bool) -> Path:
    if overwrite or not path.exists():
        return path
    i = 1
    while True:
        cand = path.with_name(f"{path.stem}_{i}{path.suffix}")
        if not cand.exists():
            return cand
        i += 1


def convert_file(src: Path, out_dir: Path, opts: ConvertOptions, root: Optional[Path] = None) -> ConvertResult:
    res = ConvertResult(source=src)
    try:
        ds = pydicom.dcmread(str(src), force=True)
        if "PixelData" not in ds and "FloatPixelData" not in ds and "DoubleFloatPixelData" not in ds:
            raise ValueError("این فایل DICOM تصویر ندارد (No Pixel Data)")
        if not hasattr(ds, "file_meta") or "TransferSyntaxUID" not in ds.file_meta:
            ds.file_meta = getattr(ds, "file_meta", pydicom.dataset.FileMetaDataset())
            ds.file_meta.TransferSyntaxUID = pydicom.uid.ImplicitVRLittleEndian
        res.info = describe(ds)
        frames = read_frames(ds)
        spp = int(ds.get("SamplesPerPixel", 1) or 1)
        base = output_base(src, ds, out_dir, root, opts)
        base.parent.mkdir(parents=True, exist_ok=True)

        spacing = _pixel_spacing_mm(ds)
        dpi = (25.4 / spacing, 25.4 / spacing) if spacing and spacing > 0 else None

        for idx, frame in enumerate(frames):
            suffix = f"_f{idx + 1:03d}" if len(frames) > 1 else ""
            if spp > 1:
                img = Image.fromarray(_color_to_rgb8(frame, ds), "RGB")
            else:
                img = Image.fromarray(_to_display_8bit(frame, ds, opts.window_mode), "L")

            jpg = _unique(base.with_name(base.name + suffix + ".jpg"), opts.overwrite)
            save_kw = dict(quality=int(opts.quality), optimize=True)
            if opts.subsampling_444:
                save_kw["subsampling"] = 0
            if opts.quality >= 100:
                save_kw.pop("quality")
                save_kw["qtables"] = _qtables_all_ones(img.mode)
            if dpi:
                save_kw["dpi"] = dpi
            img.save(jpg, "JPEG", **save_kw)
            res.outputs.append(jpg)

            ext = LOSSLESS_FORMATS.get(opts.lossless_copy)
            if ext:
                if spp > 1:
                    lossless = Image.fromarray(np.asarray(img), "RGB")
                else:
                    lossless = Image.fromarray(_to_lossless_16bit(frame, ds), "I;16")
                lp = _unique(base.with_name(base.name + suffix + ext), opts.overwrite)
                if ext == ".tif":
                    lossless.save(lp, "TIFF", compression="tiff_adobe_deflate", dpi=dpi or (72, 72))
                else:
                    lossless.save(lp, "PNG", optimize=True, dpi=dpi or (72, 72))
                res.outputs.append(lp)

        if opts.save_metadata_json:
            jp = _unique(base.with_name(base.name + ".json"), opts.overwrite)
            jp.write_text(json.dumps(_metadata(ds, opts.anonymize_metadata), ensure_ascii=False, indent=2),
                          encoding="utf-8")
            res.outputs.append(jp)
    except Exception as exc:  # noqa: BLE001
        res.error = f"{type(exc).__name__}: {exc}"
    return res


def _qtables_all_ones(mode: str):
    """Quantisation tables of all 1s = the highest fidelity a baseline JPEG can hold."""
    table = [1] * 64
    return [table] if mode == "L" else [table, table]


def convert_many(files: List[Path], out_dir: Path, opts: ConvertOptions, root: Optional[Path] = None,
                 progress: Optional[Callable[[int, int, ConvertResult], None]] = None,
                 should_stop: Optional[Callable[[], bool]] = None, workers: int = 0) -> List[ConvertResult]:
    from concurrent.futures import ThreadPoolExecutor, as_completed

    workers = workers or max(1, min(8, (os.cpu_count() or 2)))
    results: List[ConvertResult] = []
    total = len(files)
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(convert_file, f, out_dir, opts, root): f for f in files}
        done = 0
        for fut in as_completed(futs):
            r = fut.result()
            results.append(r)
            done += 1
            if progress:
                progress(done, total, r)
            if should_stop and should_stop():
                for other in futs:
                    other.cancel()
                break
    return results
