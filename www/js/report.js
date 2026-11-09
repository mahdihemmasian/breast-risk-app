/*
 * Offline PDF report generator.
 * Pages are drawn on <canvas> (native Persian shaping + RTL), encoded as JPEG,
 * and packed into a PDF by a tiny dependency-free PDF writer.
 */
(function (root) {
  'use strict';
  var W = 1240, H = 1754, M = 80;               // A4 @150dpi
  var FONT = '"Vazirmatn", "Vazir", Tahoma, "Noto Naskh Arabic", "Noto Sans Arabic", "Geeza Pro", "DejaVu Sans", sans-serif';
  var C = { pink: '#c2185b', dark: '#222', grey: '#666', light: '#f7e6ee', line: '#e5c6d4' };

  function fa(x, d) {
    if (typeof x === 'number') x = d != null ? x.toFixed(d) : String(x);
    return String(x).replace(/(\d)\.(\d)/g, '$1٫$2').replace(/[0-9]/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'[c]; });
  }

  /* ---------------- Minimal PDF writer (JPEG pages) ---------------- */
  function b64ToBytes(b64) {
    var bin = atob(b64), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function strBytes(s) { var o = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i) & 255; return o; }
  function buildPdf(jpegs, pw, ph) {
    // jpegs: [{bytes, w, h}]; page size in points (A4 = 595.28 x 841.89)
    var parts = [], offsets = [], pos = 0;
    function push(b) { if (typeof b === 'string') b = strBytes(b); parts.push(b); pos += b.length; }
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    var n = jpegs.length, objCount = 2 + n * 3;
    function obj(id, body, stream) {
      offsets[id] = pos;
      push(id + ' 0 obj\n' + body + '\n');
      if (stream) { push('stream\n'); push(stream); push('\nendstream\n'); }
      push('endobj\n');
    }
    var kids = [];
    for (var i = 0; i < n; i++) kids.push((3 + i * 3) + ' 0 R');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>');
    for (i = 0; i < n; i++) {
      var pid = 3 + i * 3, cid = pid + 1, iid = pid + 2, j = jpegs[i];
      var content = 'q ' + pw + ' 0 0 ' + ph + ' 0 0 cm /Im0 Do Q';
      obj(pid, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw + ' ' + ph + '] /Resources << /XObject << /Im0 ' + iid + ' 0 R >> >> /Contents ' + cid + ' 0 R >>');
      obj(cid, '<< /Length ' + content.length + ' >>', strBytes(content));
      obj(iid, '<< /Type /XObject /Subtype /Image /Width ' + j.w + ' /Height ' + j.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + j.bytes.length + ' >>', j.bytes);
    }
    var xref = pos;
    var x = 'xref\n0 ' + (objCount + 1) + '\n0000000000 65535 f \n';
    for (i = 1; i <= objCount; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    push(x);
    push('trailer\n<< /Size ' + (objCount + 1) + ' /Root 1 0 R /Info << /Producer (BreastRisk App) >> >>\nstartxref\n' + xref + '\n%%EOF');
    var out = new Uint8Array(pos), o = 0;
    parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
  }

  /* ---------------- Canvas page composer ---------------- */
  function Doc() { this.pages = []; this.newPage(); }
  Doc.prototype.newPage = function () {
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.direction = 'rtl'; g.textBaseline = 'top';
    this.c = c; this.g = g; this.y = M; this.pages.push(c);
    // header band
    g.fillStyle = C.pink; g.fillRect(0, 0, W, 14);
    // footer
    g.font = '18px ' + FONT; g.fillStyle = C.grey; g.textAlign = 'center';
    g.fillText('این گزارش ابزار غربالگری است و جایگزین تشخیص پزشک نیست — صفحه ' + fa(this.pages.length), W / 2, H - 50);
    this.y = 60;
  };
  Doc.prototype.ensure = function (h) { if (this.y + h > H - 90) this.newPage(); };
  Doc.prototype.wrap = function (text, maxW) {
    var words = String(text).split(/\s+/), lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var t = cur ? cur + ' ' + words[i] : words[i];
      if (this.g.measureText(t).width > maxW && cur) { lines.push(cur); cur = words[i]; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  Doc.prototype.text = function (text, o) {
    o = o || {};
    var g = this.g, size = o.size || 24, lh = Math.round(size * 1.7);
    g.font = (o.bold ? 'bold ' : '') + size + 'px ' + FONT;
    var indent = o.indent || 0, maxW = W - 2 * M - indent;
    if (!o.ltr) text = fa(text);
    var lines = this.wrap(text, maxW - (o.bullet ? 30 : 0));
    for (var i = 0; i < lines.length; i++) {
      this.ensure(lh); g = this.g;
      g.font = (o.bold ? 'bold ' : '') + size + 'px ' + FONT;
      g.fillStyle = o.color || C.dark; g.textAlign = o.align || 'right'; g.direction = o.ltr ? 'ltr' : 'rtl';
      var x = o.align === 'center' ? W / 2 : (o.align === 'left' ? M : W - M - indent);
      if (o.bullet && i === 0) { g.fillStyle = o.bulletColor || C.pink; g.beginPath(); g.arc(x - 8, this.y + size * 0.62, 6, 0, 7); g.fill(); g.fillStyle = o.color || C.dark; }
      g.fillText(lines[i], x - (o.bullet ? 30 : 0), this.y); g.direction = 'rtl';
      this.y += lh;
    }
    this.y += o.after || 4;
  };
  Doc.prototype.heading = function (t) {
    this.ensure(240); this.y += 16;
    var g = this.g;
    g.fillStyle = C.light; g.fillRect(M, this.y, W - 2 * M, 58);
    g.fillStyle = C.pink; g.fillRect(W - M - 10, this.y, 10, 58);
    g.font = 'bold 30px ' + FONT; g.textAlign = 'right'; g.fillStyle = C.pink;
    g.fillText(t, W - M - 28, this.y + 10);
    this.y += 78;
  };
  Doc.prototype.box = function (lines, color) {
    var g = this.g; g.font = '24px ' + FONT;
    var all = []; var self = this;
    lines.forEach(function (l) { all = all.concat(self.wrap(l, W - 2 * M - 60)); });
    var h = all.length * 40 + 36; this.ensure(h); g = this.g; g.font = '24px ' + FONT;
    g.fillStyle = color + '18'; g.strokeStyle = color; g.lineWidth = 3;
    g.fillRect(M, this.y, W - 2 * M, h); g.strokeRect(M, this.y, W - 2 * M, h);
    g.fillStyle = C.dark; g.textAlign = 'right';
    for (var i = 0; i < all.length; i++) g.fillText(all[i], W - M - 30, this.y + 18 + i * 40);
    this.y += h + 18;
  };
  Doc.prototype.kpis = function (items) {
    var n = items.length, gap = 24, bw = (W - 2 * M - gap * (n - 1)) / n, bh = 170;
    this.ensure(bh + 20); var g = this.g;
    for (var i = 0; i < n; i++) {
      var x = W - M - (i + 1) * bw - i * gap, it = items[i];
      g.fillStyle = '#fff'; g.strokeStyle = it.color || C.line; g.lineWidth = 3;
      g.fillRect(x, this.y, bw, bh); g.strokeRect(x, this.y, bw, bh);
      g.textAlign = 'center'; g.fillStyle = C.grey; g.font = '22px ' + FONT;
      g.fillText(it.label, x + bw / 2, this.y + 18);
      g.fillStyle = it.color || C.dark; var fs = 52; g.font = 'bold 52px ' + FONT;
      while (g.measureText(it.value).width > bw - 24 && fs > 22) { fs -= 2; g.font = 'bold ' + fs + 'px ' + FONT; }
      g.fillText(it.value, x + bw / 2, this.y + 58);
      g.fillStyle = C.grey; g.font = '20px ' + FONT;
      g.fillText(it.sub || '', x + bw / 2, this.y + 128);
    }
    this.y += bh + 24;
  };
  Doc.prototype.weights = function (ws) {
    var g = this.g, rowH = 48, labelW = 520, max = Math.log(4);
    var mid = M + (W - 2 * M - labelW) / 2, half = (W - 2 * M - labelW) / 2 - 90;
    this.ensure(60);
    g.font = '20px ' + FONT; g.fillStyle = C.grey; g.textAlign = 'center';
    g.fillText('← کاهش خطر    |    افزایش خطر →', mid, this.y); this.y += 36;
    for (var i = 0; i < ws.length; i++) {
      this.ensure(rowH); g = this.g;
      g.strokeStyle = '#999'; g.lineWidth = 2; g.beginPath(); g.moveTo(mid, this.y); g.lineTo(mid, this.y + rowH); g.stroke();
      var w = ws[i], v = Math.max(-max, Math.min(max, w.logw)), len = Math.abs(v) / max * half;
      g.textAlign = 'right'; g.fillStyle = C.dark; g.font = '21px ' + FONT;
      var lbl = this.wrap(fa(w.label), labelW - 20)[0];
      g.fillText(lbl, W - M, this.y + 10);
      g.fillStyle = v > 0 ? '#d35400' : '#27ae60';
      // bars grow right for risk increase (visual convention, LTR axis)
      if (v > 0) g.fillRect(mid, this.y + 8, len, 28); else g.fillRect(mid - len, this.y + 8, len, 28);
      g.fillStyle = C.dark; g.font = 'bold 20px ' + FONT; g.textAlign = 'center';
      g.fillText('×' + fa(w.rr, 2), v > 0 ? mid + len + 45 : mid - len - 45, this.y + 10);
      this.y += rowH;
    }
    this.y += 12;
  };
  Doc.prototype.table = function (head, rows, colW) {
    var g = this.g, self = this, pad = 12, size = 19, lh = 30;
    var widths = colW.map(function (p) { return p * (W - 2 * M); });
    function rowHeight(r, bold) {
      g.font = (bold ? 'bold ' : '') + size + 'px ' + FONT;
      return Math.max.apply(null, r.map(function (c, i) { return self.wrap(fa(c), widths[i] - 2 * pad).length; })) * lh + 2 * pad;
    }
    function draw(r, bold, fill) {
      var h = rowHeight(r, bold); self.ensure(h); g = self.g;
      var x = W - M;
      for (var i = 0; i < r.length; i++) {
        g.fillStyle = fill; g.fillRect(x - widths[i], self.y, widths[i], h);
        g.strokeStyle = C.line; g.lineWidth = 1.5; g.strokeRect(x - widths[i], self.y, widths[i], h);
        g.font = (bold || i === 0 ? 'bold ' : '') + size + 'px ' + FONT; g.fillStyle = bold ? '#fff' : C.dark; g.textAlign = 'right';
        var ls = self.wrap(fa(r[i]), widths[i] - 2 * pad);
        for (var k = 0; k < ls.length; k++) g.fillText(ls[k], x - pad, self.y + pad + k * lh);
        x -= widths[i];
      }
      self.y += h;
    }
    draw(head, true, C.pink);
    rows.forEach(function (r, i) { draw(r, false, i % 2 ? '#fff' : '#fbf3f7'); });
    this.y += 16;
  };

  /* ---------------- Report content ---------------- */
  function compose(res, ans) {
    var d = new Doc(), g = res.gail;
    d.text('گزارش ارزیابی خطر سرطان پستان', { size: 44, bold: true, color: C.pink, align: 'center', after: 0 });
    d.text('بر پایه مدل Gail (ابزار BCRAT مؤسسه ملی سرطان آمریکا) + غربالگری ژنتیکی FHS-7 + عوامل سبک زندگی', { size: 21, color: C.grey, align: 'center', after: 10 });
    var dt = res.date.toLocaleDateString ? res.date.toLocaleDateString('fa-IR') : '';
    d.text('نام: ' + (ans.name || '—') + '    |    سن: ' + fa(+ans.age) + ' سال    |    BMI: ' + (res.life.bmi ? fa(res.life.bmi, 1) : '—') + '    |    تاریخ: ' + dt, { size: 22, align: 'center', after: 16 });

    d.heading('۱. نتیجه پیش‌بینی');
    d.kpis([
      { label: 'خطر ۵ سال آینده (Gail)', value: fa(g.fiveYear, 2) + '٪', sub: 'میانگین هم‌سن: ' + fa(g.fiveYearAvg, 2) + '٪', color: res.cat.color },
      { label: 'خطر تا ۹۰ سالگی (Gail)', value: fa(g.lifetime, 1) + '٪', sub: 'میانگین هم‌سن: ' + fa(g.lifetimeAvg, 1) + '٪', color: res.cat.color },
      { label: 'برآورد ترکیبی ۵ ساله*', value: fa(g.fiveYearAdj, 2) + '٪', sub: 'Gail × عوامل سبک زندگی (×' + fa(res.life.multiplier, 2) + ')', color: C.grey }
    ]);
    d.box(['سطح خطر: ' + res.cat.label, 'خطر ۵ ساله شما ' + fa(g.fiveYear / g.fiveYearAvg, 1) + ' برابر یک زن هم‌سن با خطر متوسط است.'], res.cat.color);
    d.text('* برآورد ترکیبی، اثر عوامل تکمیلی (وزن، الکل، فعالیت، دخانیات، شیردهی، هورمون‌درمانی، سن یائسگی و تراکم پستان) را با ضرایب منتشرشده در متاآنالیزها به مدل Gail اضافه می‌کند. این ترکیب به‌صورت یک مدل واحد اعتبارسنجی نشده و جنبه راهنما دارد؛ مبنای تصمیم‌گیری بالینی، عدد مدل Gail است.', { size: 18, color: C.grey });
    if (res.excluded.length) d.box(['توجه: ' + res.excluded.join('، ') + ' — مدل Gail برای شما معتبر نیست؛ اعداد بالا خطر واقعی را کمتر نشان می‌دهند.'], '#c0392b');

    d.heading('۲. هشدارها');
    if (!res.reco.warnings.length) d.text('هشدار خاصی وجود ندارد.', { bullet: true });
    res.reco.warnings.forEach(function (w) { d.text(w.text, { bullet: true, bulletColor: w.urgent ? '#c0392b' : '#e67e22', color: w.urgent ? '#a01010' : C.dark }); });

    d.heading('۳. وزن عوامل خطر در محاسبه شما (نسبت خطر)');
    if (res.weights.length) d.weights(res.weights); else d.text('هیچ عامل افزاینده یا کاهنده‌ای نسبت به گروه مرجع ثبت نشد.');
    d.text('عدد ×۱٫۰ یعنی بدون اثر؛ بیشتر از ۱ افزایش و کمتر از ۱ کاهش خطر نسبت به گروه مرجع.', { size: 18, color: C.grey });
    d.table(['عامل', 'پاسخ شما', 'نسبت خطر'], [
      ['سن اولین قاعدگی', ans.menarcheUnknown ? 'نامشخص' : fa(+ans.menarche) + ' سالگی', '×' + fa(Math.exp(res.gail.rr.terms.menarche), 2)],
      ['اولین زایمان', ans.parous === 'no' ? 'زایمان نداشته' : (ans.parous === 'unknown' ? 'نامشخص' : fa(+ans.firstBirth) + ' سالگی'), '×' + fa(Math.exp(res.gail.rr.terms.firstBirth + res.gail.rr.terms.firstBirthXrelatives), 2) + ' (با اثر متقابل)'],
      ['بستگان درجه یک مبتلا', fa(+ans.relatives || 0) + ' نفر', '×' + fa(Math.exp(res.gail.rr.terms.relatives), 2)],
      ['نمونه‌برداری پستان', ans.biopsy === 'yes' ? fa(+ans.biopsyCount) + ' بار' : 'ندارد', '×' + fa(Math.exp(res.gail.rr.terms.biopsy + (+ans.age >= 50 ? res.gail.rr.terms.biopsyAge50 : 0) + res.gail.rr.terms.hyperplasia), 2)],
      ['خطر نسبی کل مدل Gail', '', '×' + fa(+ans.age >= 50 ? res.gail.rr.rr2 : res.gail.rr.rr1, 2)]
    ], [0.38, 0.32, 0.30]);

    d.heading('۴. غربالگری خطر ارثی (FHS-7)');
    d.text(res.fhs.positive ? 'نتیجه: مثبت — ارجاع به مشاوره ژنتیک توصیه می‌شود.' : 'نتیجه: منفی — شواهدی از الگوی خانوادگی پرخطر در پاسخ‌ها دیده نشد.', { bold: true, color: res.fhs.positive ? '#c0392b' : '#27ae60' });
    res.fhs.items.forEach(function (t) { d.text(fa(t), { bullet: true, size: 21 }); });

    d.heading('۵. توصیه‌های پزشکی');
    res.reco.medical.forEach(function (t) { d.text(t, { bullet: true }); });
    d.heading('۶. برنامه غربالگری پیشنهادی');
    res.reco.screening.forEach(function (t) { d.text(t, { bullet: true }); });
    d.heading('۷. سبک زندگی');
    res.reco.lifestyle.forEach(function (t) { d.text(t, { bullet: true }); });

    var n = res.nutrition;
    d.heading('۸. برنامه تغذیه');
    d.kpis([
      { label: 'هدف', value: n.goal.split(' (')[0], sub: '' },
      { label: 'انرژی روزانه پیشنهادی', value: fa(n.target), sub: 'کیلوکالری' },
      { label: 'متابولیسم پایه', value: fa(n.bmr), sub: 'کیلوکالری (Mifflin-St Jeor)' }
    ]);
    d.text('اصول تغذیه برای کاهش خطر (WCRF/AICR):', { bold: true });
    n.rules.forEach(function (t) { d.text(t, { bullet: true, size: 21 }); });
    d.ensure(400);
    d.text('نمونه برنامه غذایی ۷ روزه:', { bold: true });
    d.table(['روز', 'صبحانه', 'ناهار', 'شام', 'میان‌وعده'], n.days, [0.1, 0.22, 0.26, 0.24, 0.18]);
    d.text('در بیماری‌های زمینه‌ای (دیابت، کلیه، بارداری و...) برنامه را با متخصص تغذیه تنظیم کنید.', { size: 18, color: C.grey });

    d.heading('۹. محدودیت‌ها و منابع');
    ['این برآورد احتمال است، نه تشخیص. بیشتر زنان با خطر بالا هرگز مبتلا نمی‌شوند و بخشی از مبتلایان عامل خطر شناخته‌شده‌ای ندارند.',
     'مدل Gail با داده‌های زنان آمریکایی ساخته شده؛ مطالعات ایرانی دقت تفکیکی متوسطی برای آن گزارش کرده‌اند. نرخ‌های پایه از پارامترهای «سفیدپوست/سایر» BCRAT است.',
     'مدل Gail سابقه خانوادگی درجه دو، سن ابتلای بستگان و ژنتیک را لحاظ نمی‌کند؛ در سابقه خانوادگی قوی، مدل‌های Tyrer-Cuzick (IBIS) یا BOADICEA توسط متخصص توصیه می‌شوند.'
    ].forEach(function (t) { d.text(t, { bullet: true, size: 20 }); });
    res.references.forEach(function (t, i) { d.text((i + 1) + '. ' + t, { size: 17, color: C.grey, after: 0, ltr: true, align: 'left' }); });
    return d.pages;
  }

  function toPdfBytes(res, ans) {
    var pages = compose(res, ans);
    var jpegs = pages.map(function (c) {
      var url = c.toDataURL('image/jpeg', 0.88);
      return { bytes: b64ToBytes(url.split(',')[1]), w: c.width, h: c.height };
    });
    return buildPdf(jpegs, 595.28, 841.89);
  }

  function bytesToB64(bytes) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }

  /** Save / share the PDF on Android, iOS (Capacitor) or the web */
  async function savePdf(res, ans) {
    var bytes = toPdfBytes(res, ans);
    var name = 'breast-risk-report-' + new Date().toISOString().slice(0, 10) + '.pdf';
    var Cap = root.Capacitor;
    if (Cap && Cap.isNativePlatform && Cap.isNativePlatform()) {
      var FS = Cap.Plugins.Filesystem || Cap.registerPlugin('Filesystem');
      var Share = Cap.Plugins.Share || Cap.registerPlugin('Share');
      var w = await FS.writeFile({ path: name, data: bytesToB64(bytes), directory: 'CACHE' });
      if (Share) await Share.share({ title: 'گزارش ارزیابی خطر', url: w.uri, dialogTitle: 'ذخیره یا ارسال گزارش PDF' });
      return name;
    }
    var blob = new Blob([bytes], { type: 'application/pdf' });
    if (root.claude && root.claude.use) {           // hosted claude.ai artifact
      var dl = await root.claude.use('downloads');
      if (dl) { await dl.save({ filename: name, data: blob }); return name; }
    }
    var file = typeof File !== 'undefined' ? new File([blob], name, { type: 'application/pdf' }) : null;
    if (file && navigator.canShare && navigator.canShare({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      try { await navigator.share({ files: [file], title: 'گزارش ارزیابی خطر سرطان پستان' }); return name; } catch (e) { /* fall through */ }
    }
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    return name;
  }

  root.Report = { toPdfBytes: toPdfBytes, savePdf: savePdf, compose: compose, fa: fa };
})(typeof self !== 'undefined' ? self : globalThis);
