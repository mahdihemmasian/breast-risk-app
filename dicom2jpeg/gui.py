"""PySide6 desktop GUI (Persian, right-to-left)."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import List, Optional

from PIL.ImageQt import ImageQt
from PySide6.QtCore import QObject, Qt, QThread, Signal, QUrl
from PySide6.QtGui import QAction, QDesktopServices, QFont, QIcon, QPixmap
from PySide6.QtWidgets import (QApplication, QCheckBox, QComboBox, QFileDialog, QFormLayout, QGroupBox,
                               QHBoxLayout, QLabel, QLineEdit, QListWidget, QListWidgetItem, QMainWindow,
                               QMessageBox, QPlainTextEdit, QProgressBar, QPushButton, QSlider, QSplitter,
                               QVBoxLayout, QWidget)

from . import APP_NAME, __version__
from .core import (WINDOW_MODES, ConvertOptions, convert_many, find_dicom_files, render_preview)


def resource_path(name: str) -> str:
    base = getattr(sys, "_MEIPASS", os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    return os.path.join(base, "assets", name)


class Worker(QObject):
    progress = Signal(int, int, str, bool)
    finished = Signal(int, int, str)

    def __init__(self, files, out_dir, opts, root):
        super().__init__()
        self.files, self.out_dir, self.opts, self.root = files, out_dir, opts, root
        self._stop = False

    def stop(self):
        self._stop = True

    def run(self):
        def cb(done, total, r):
            if r.error:
                msg = f"✗ {r.source.name} — {r.error}"
            else:
                msg = f"✓ {r.source.name} → {', '.join(o.name for o in r.outputs)}"
            self.progress.emit(done, total, msg, bool(r.error))

        results = convert_many(self.files, self.out_dir, self.opts, self.root, progress=cb,
                               should_stop=lambda: self._stop)
        errors = sum(1 for r in results if r.error)
        self.finished.emit(len(results) - errors, errors, str(self.out_dir))


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle(f"{APP_NAME}  –  مبدل DICOM به JPEG  (v{__version__})")
        icon = resource_path("app.ico")
        if os.path.exists(icon):
            self.setWindowIcon(QIcon(icon))
        self.resize(1200, 780)
        self.setAcceptDrops(True)
        self.files: List[Path] = []
        self.root: Optional[Path] = None
        self.thread: Optional[QThread] = None
        self.worker: Optional[Worker] = None
        self._build()

    # ------------------------------------------------------------------ UI
    def _build(self):
        central = QWidget()
        self.setCentralWidget(central)
        main = QVBoxLayout(central)

        title = QLabel("تبدیل تصاویر DICOM (ماموگرافی، رادیوگرافی، CT، MRI …) به JPEG با حداکثر کیفیت")
        title.setStyleSheet("font-size:16px;font-weight:bold;color:#0b4f8a;padding:4px;")
        main.addWidget(title)

        btns = QHBoxLayout()
        self.btn_files = QPushButton("➕ افزودن فایل‌ها")
        self.btn_folder = QPushButton("📁 افزودن پوشه")
        self.btn_clear = QPushButton("🗑 پاک کردن فهرست")
        for b in (self.btn_files, self.btn_folder, self.btn_clear):
            b.setMinimumHeight(34)
            btns.addWidget(b)
        btns.addStretch()
        main.addLayout(btns)
        self.btn_files.clicked.connect(self.add_files)
        self.btn_folder.clicked.connect(self.add_folder)
        self.btn_clear.clicked.connect(self.clear_list)

        split = QSplitter(Qt.Horizontal)
        left = QWidget()
        ll = QVBoxLayout(left)
        ll.setContentsMargins(0, 0, 0, 0)
        self.count_lbl = QLabel("فایل‌ها را اینجا بکشید و رها کنید (Drag & Drop) – ۰ فایل")
        ll.addWidget(self.count_lbl)
        self.list = QListWidget()
        self.list.setLayoutDirection(Qt.LeftToRight)
        self.list.currentItemChanged.connect(self.show_preview)
        ll.addWidget(self.list)
        split.addWidget(left)

        right = QWidget()
        rl = QVBoxLayout(right)
        rl.setContentsMargins(0, 0, 0, 0)
        self.preview = QLabel("پیش‌نمایش")
        self.preview.setAlignment(Qt.AlignCenter)
        self.preview.setMinimumSize(380, 380)
        self.preview.setStyleSheet("background:#111;color:#aaa;border:1px solid #444;")
        rl.addWidget(self.preview, 1)
        self.preview_info = QLabel("")
        self.preview_info.setWordWrap(True)
        self.preview_info.setLayoutDirection(Qt.LeftToRight)
        rl.addWidget(self.preview_info)
        split.addWidget(right)
        split.setSizes([520, 680])
        main.addWidget(split, 1)

        # options
        box = QGroupBox("تنظیمات خروجی")
        form = QFormLayout(box)
        self.window_cb = QComboBox()
        for k, v in WINDOW_MODES.items():
            self.window_cb.addItem(v, k)
        self.window_cb.currentIndexChanged.connect(lambda _: self.show_preview(self.list.currentItem()))
        form.addRow("روش نگاشت شدت روشنایی:", self.window_cb)

        qrow = QHBoxLayout()
        self.q_slider = QSlider(Qt.Horizontal)
        self.q_slider.setRange(80, 100)
        self.q_slider.setValue(100)
        self.q_lbl = QLabel("100 (بدون افت محسوس)")
        self.q_slider.valueChanged.connect(
            lambda v: self.q_lbl.setText(f"{v}" + (" (بدون افت محسوس)" if v == 100 else "")))
        qrow.addWidget(self.q_slider)
        qrow.addWidget(self.q_lbl)
        form.addRow("کیفیت JPEG:", qrow)

        self.lossless_cb = QComboBox()
        self.lossless_cb.addItem("ندارد – فقط JPEG", "none")
        self.lossless_cb.addItem("PNG ۱۶ بیتی (کاملاً بدون اتلاف، مناسب پردازش/هوش مصنوعی)", "png16")
        self.lossless_cb.addItem("TIFF ۱۶ بیتی (کاملاً بدون اتلاف)", "tiff16")
        form.addRow("نسخه بدون اتلاف کنار JPEG:", self.lossless_cb)

        self.naming_cb = QComboBox()
        self.naming_cb.addItem("همان نام فایل اصلی", "original")
        self.naming_cb.addItem("از روی برچسب‌ها: شناسه بیمار_تاریخ_سمت_نما", "tags")
        form.addRow("نام‌گذاری فایل خروجی:", self.naming_cb)

        chk = QHBoxLayout()
        self.keep_tree = QCheckBox("حفظ ساختار زیرپوشه‌ها")
        self.keep_tree.setChecked(True)
        self.save_json = QCheckBox("ذخیره مشخصات تصویر (JSON)")
        self.anon = QCheckBox("بی‌نام‌سازی مشخصات بیمار")
        self.anon.setChecked(True)
        self.overwrite = QCheckBox("بازنویسی فایل‌های موجود")
        for c in (self.keep_tree, self.save_json, self.anon, self.overwrite):
            chk.addWidget(c)
        chk.addStretch()
        form.addRow("", chk)

        orow = QHBoxLayout()
        self.out_edit = QLineEdit(str(Path.home() / "Pictures" / "DICOM_JPEG"))
        self.out_edit.setLayoutDirection(Qt.LeftToRight)
        ob = QPushButton("انتخاب…")
        ob.clicked.connect(self.choose_out)
        orow.addWidget(self.out_edit, 1)
        orow.addWidget(ob)
        form.addRow("پوشه خروجی:", orow)
        main.addWidget(box)

        run = QHBoxLayout()
        self.btn_go = QPushButton("▶  شروع تبدیل")
        self.btn_go.setMinimumHeight(42)
        self.btn_go.setStyleSheet("QPushButton{background:#0b6bcb;color:white;font-size:15px;font-weight:bold;"
                                  "border-radius:6px;padding:4px 24px;} QPushButton:disabled{background:#8aa;}")
        self.btn_stop = QPushButton("■ توقف")
        self.btn_stop.setEnabled(False)
        self.btn_open = QPushButton("📂 باز کردن پوشه خروجی")
        self.progress = QProgressBar()
        self.progress.setFormat("%v / %m")
        run.addWidget(self.btn_go)
        run.addWidget(self.btn_stop)
        run.addWidget(self.progress, 1)
        run.addWidget(self.btn_open)
        main.addLayout(run)
        self.btn_go.clicked.connect(self.start)
        self.btn_stop.clicked.connect(self.stop)
        self.btn_open.clicked.connect(lambda: QDesktopServices.openUrl(QUrl.fromLocalFile(self.out_edit.text())))

        self.log = QPlainTextEdit()
        self.log.setReadOnly(True)
        self.log.setMaximumHeight(140)
        self.log.setLayoutDirection(Qt.LeftToRight)
        main.addWidget(self.log)

        about = QAction("درباره", self)
        about.triggered.connect(self.about)
        self.menuBar().addAction(about)

    # ------------------------------------------------------------------ list handling
    def _add(self, paths: List[str]):
        self.setCursor(Qt.WaitCursor)
        try:
            new = find_dicom_files(paths)
        finally:
            self.unsetCursor()
        if len(paths) == 1 and Path(paths[0]).is_dir():
            self.root = Path(paths[0])
        existing = {str(f) for f in self.files}
        added = 0
        for f in new:
            if str(f) not in existing:
                self.files.append(f)
                it = QListWidgetItem(str(f))
                it.setData(Qt.UserRole, str(f))
                self.list.addItem(it)
                added += 1
        self._update_count()
        self.log.appendPlainText(f"{added} DICOM file(s) added.")
        if self.list.currentRow() < 0 and self.list.count():
            self.list.setCurrentRow(0)

    def _update_count(self):
        self.count_lbl.setText(f"فایل‌ها را اینجا بکشید و رها کنید – {len(self.files)} فایل DICOM")

    def add_files(self):
        files, _ = QFileDialog.getOpenFileNames(self, "انتخاب فایل‌های DICOM", "",
                                                "DICOM (*.dcm *.dicom *.dic *.ima);;All files (*)")
        if files:
            self._add(files)

    def add_folder(self):
        d = QFileDialog.getExistingDirectory(self, "انتخاب پوشه حاوی DICOM")
        if d:
            self._add([d])

    def clear_list(self):
        self.files.clear()
        self.list.clear()
        self.root = None
        self.preview.clear()
        self.preview.setText("پیش‌نمایش")
        self.preview_info.clear()
        self._update_count()

    def dragEnterEvent(self, e):
        if e.mimeData().hasUrls():
            e.acceptProposedAction()

    def dropEvent(self, e):
        paths = [u.toLocalFile() for u in e.mimeData().urls() if u.isLocalFile()]
        if paths:
            self._add(paths)

    def show_preview(self, item):
        if item is None:
            return
        try:
            import pydicom
            from .core import describe
            path = Path(item.data(Qt.UserRole))
            img = render_preview(path, self.window_cb.currentData())
            qimg = ImageQt(img.convert("RGB"))
            pm = QPixmap.fromImage(qimg).scaled(self.preview.size(), Qt.KeepAspectRatio, Qt.SmoothTransformation)
            self.preview.setPixmap(pm)
            ds = pydicom.dcmread(str(path), stop_before_pixels=True, force=True)
            self.preview_info.setText(describe(ds))
        except Exception as exc:  # noqa: BLE001
            self.preview.setText(f"پیش‌نمایش ممکن نیست\n{exc}")

    def choose_out(self):
        d = QFileDialog.getExistingDirectory(self, "انتخاب پوشه خروجی", self.out_edit.text())
        if d:
            self.out_edit.setText(d)

    # ------------------------------------------------------------------ conversion
    def start(self):
        if not self.files:
            QMessageBox.information(self, "توجه", "ابتدا فایل یا پوشه DICOM را اضافه کنید.")
            return
        out = Path(self.out_edit.text().strip())
        try:
            out.mkdir(parents=True, exist_ok=True)
        except Exception as exc:  # noqa: BLE001
            QMessageBox.critical(self, "خطا", f"ساخت پوشه خروجی ممکن نیست:\n{exc}")
            return
        opts = ConvertOptions(window_mode=self.window_cb.currentData(), quality=self.q_slider.value(),
                              lossless_copy=self.lossless_cb.currentData(), naming=self.naming_cb.currentData(),
                              keep_folder_structure=self.keep_tree.isChecked(),
                              save_metadata_json=self.save_json.isChecked(),
                              anonymize_metadata=self.anon.isChecked(), overwrite=self.overwrite.isChecked())
        self.progress.setRange(0, len(self.files))
        self.progress.setValue(0)
        self.btn_go.setEnabled(False)
        self.btn_stop.setEnabled(True)
        self.log.appendPlainText(f"--- Converting {len(self.files)} file(s) → {out}")

        self.thread = QThread()
        self.worker = Worker(list(self.files), out, opts, self.root)
        self.worker.moveToThread(self.thread)
        self.thread.started.connect(self.worker.run)
        self.worker.progress.connect(self.on_progress)
        self.worker.finished.connect(self.on_finished)
        self.worker.finished.connect(self.thread.quit)
        self.thread.start()

    def stop(self):
        if self.worker:
            self.worker.stop()
            self.btn_stop.setEnabled(False)

    def on_progress(self, done, total, msg, err):
        self.progress.setValue(done)
        self.log.appendPlainText(msg)

    def on_finished(self, ok, errors, out):
        self.btn_go.setEnabled(True)
        self.btn_stop.setEnabled(False)
        self.log.appendPlainText(f"--- Finished: {ok} converted, {errors} failed.")
        text = f"تبدیل تمام شد.\n\nموفق: {ok}\nناموفق: {errors}\n\nپوشه خروجی:\n{out}"
        if QMessageBox.question(self, "پایان", text + "\n\nپوشه خروجی باز شود؟") == QMessageBox.Yes:
            QDesktopServices.openUrl(QUrl.fromLocalFile(out))

    def about(self):
        QMessageBox.about(self, "درباره", f"<b>{APP_NAME}</b> نسخه {__version__}<br><br>"
                          "تبدیل DICOM به JPEG با حفظ رزولوشن اصلی، اعمال LUT و پنجره DICOM، "
                          "پشتیبانی از MONOCHROME1، چندفریمی و DICOM فشرده (JPEG، JPEG-LS، JPEG2000، RLE).<br><br>"
                          "حالت خط فرمان: <code>DicomToJpeg.exe --cli پوشه -o خروجی</code>")


def main():
    QApplication.setHighDpiScaleFactorRoundingPolicy(Qt.HighDpiScaleFactorRoundingPolicy.PassThrough)
    app = QApplication(sys.argv)
    app.setLayoutDirection(Qt.RightToLeft)
    app.setFont(QFont("Tahoma", 10))
    app.setStyle("Fusion")
    w = MainWindow()
    w.show()
    args = [a for a in sys.argv[1:] if os.path.exists(a)]
    if args:  # "Open with" / drag onto the exe
        w._add(args)
    return app.exec()
