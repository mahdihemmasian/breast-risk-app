/* Smart questionnaire (adaptive wizard) + results screen */
(function () {
  'use strict';
  var fa = Report.fa;
  var YN = [['yes', 'بله'], ['no', 'خیر']];
  var YNU = [['yes', 'بله'], ['no', 'خیر'], ['unknown', 'نمی‌دانم']];

  // ---------- Question bank (show-if logic makes it adaptive) ----------
  var STEPS = [
    { title: 'شرایط ویژه', intro: 'این سؤالات تعیین می‌کند مدل Gail برای شما قابل استفاده است یا نه.', qs: [
      { id: 'priorCancer', type: 'choice', opts: YN, label: 'آیا تاکنون سرطان سینه، DCIS یا LCIS داشته‌اید؟' },
      { id: 'chestRadiation', type: 'choice', opts: YN, label: 'آیا پیش از ۳۰ سالگی پرتودرمانی قفسه سینه (مثلاً برای لنفوم هوچکین) داشته‌اید؟' },
      { id: 'knownMutation', type: 'choice', opts: YNU, label: 'آیا در آزمایش ژنتیک، جهش BRCA1/BRCA2 یا ژن مشابه در خودتان پیدا شده است؟' }
    ]},
    { title: 'اطلاعات دموگرافیک', qs: [
      { id: 'name', type: 'text', label: 'نام (اختیاری، فقط برای گزارش)', optional: true },
      { id: 'age', type: 'number', label: 'سن (سال)', min: 20, max: 89, help: 'مدل برای ۳۵ تا ۸۵ سال معتبر است.' },
      { id: 'height', type: 'number', label: 'قد (سانتی‌متر)', min: 120, max: 210 },
      { id: 'weight', type: 'number', label: 'وزن (کیلوگرم)', min: 30, max: 250 }
    ]},
    { title: 'سابقه باروری و هورمونی', qs: [
      { id: 'menarche', type: 'number', label: 'سن اولین قاعدگی', min: 7, max: 20, unknownKey: 'menarcheUnknown', unknownLabel: 'به خاطر ندارم' },
      { id: 'parous', type: 'choice', label: 'آیا زایمان (تولد نوزاد زنده) داشته‌اید؟', opts: [['yes', 'بله'], ['no', 'خیر'], ['unknown', 'ترجیح می‌دهم نگویم']] },
      { id: 'firstBirth', type: 'number', label: 'سن شما در اولین زایمان', min: 10, max: 55, showIf: function (a) { return a.parous === 'yes'; } },
      { id: 'breastfeedingMonths', type: 'number', label: 'مجموع ماه‌های شیردهی (همه فرزندان)', min: 0, max: 200, showIf: function (a) { return a.parous === 'yes'; } },
      { id: 'menopause', type: 'choice', label: 'وضعیت یائسگی', opts: [['pre', 'هنوز قاعده می‌شوم'], ['post', 'یائسه شده‌ام']] },
      { id: 'menopauseAge', type: 'number', label: 'سن یائسگی', min: 30, max: 65, showIf: function (a) { return a.menopause === 'post'; } },
      { id: 'hrt', type: 'choice', label: 'آیا اکنون هورمون‌درمانی یائسگی مصرف می‌کنید؟', showIf: function (a) { return a.menopause === 'post'; },
        opts: [['none', 'خیر'], ['e', 'فقط استروژن'], ['ep', 'استروژن + پروژستین'], ['unknownType', 'بله، نوع را نمی‌دانم']] },
      { id: 'hrtYears', type: 'number', label: 'چند سال است هورمون مصرف می‌کنید؟', min: 0, max: 40, showIf: function (a) { return a.menopause === 'post' && a.hrt && a.hrt !== 'none'; } }
    ]},
    { title: 'سابقه پستان', qs: [
      { id: 'biopsy', type: 'choice', label: 'آیا تاکنون از پستان شما نمونه‌برداری (بیوپسی) شده است؟', opts: YNU },
      { id: 'biopsyCount', type: 'number', label: 'تعداد دفعات نمونه‌برداری', min: 1, max: 20, showIf: function (a) { return a.biopsy === 'yes'; } },
      { id: 'hyperplasiaAns', type: 'choice', label: 'آیا در جواب پاتولوژی «هیپرپلازی آتیپیک» گزارش شده است؟', opts: YNU, showIf: function (a) { return a.biopsy === 'yes'; } },
      { id: 'density', type: 'choice', label: 'تراکم پستان در آخرین ماموگرافی (اگر می‌دانید)', opts: [['', 'نمی‌دانم/ماموگرافی نداشته‌ام'], ['a', 'A - تقریباً چربی'], ['b', 'B - پراکنده'], ['c', 'C - ناهمگون متراکم'], ['d', 'D - بسیار متراکم']] }
    ]},
    { title: 'سابقه خانوادگی', intro: 'بستگان درجه یک = مادر، خواهر، دختر.', qs: [
      { id: 'relatives', type: 'number', label: 'چند نفر از بستگان درجه یک شما سرطان سینه داشته‌اند؟', min: 0, max: 10 },
      { id: 'familyMutation', type: 'choice', label: 'آیا در یکی از بستگان، جهش BRCA شناسایی شده است؟', opts: YNU }
    ].concat(RiskModels.FHS7.map(function (q) { return { id: q[0], type: 'choice', label: q[1], opts: YNU }; }))},
    { title: 'سبک زندگی و تغذیه', qs: [
      { id: 'activity', type: 'choice', label: 'فعالیت بدنی هفتگی', opts: [['low', 'کم‌تحرک'], ['some', 'کمتر از ۱۵۰ دقیقه'], ['active', '۱۵۰ دقیقه یا بیشتر']] },
      { id: 'smoking', type: 'choice', label: 'مصرف سیگار یا قلیان', opts: [['never', 'هرگز'], ['former', 'قبلاً'], ['current', 'اکنون']] },
      { id: 'alcohol', type: 'number', label: 'مصرف الکل (تعداد پیک/لیوان استاندارد در هفته)', min: 0, max: 100, help: 'اگر مصرف نمی‌کنید ۰ وارد کنید.' },
      { id: 'vegFruit', type: 'choice', label: 'میوه و سبزی روزانه', opts: [['low', 'کمتر از ۳ واحد'], ['mid', '۳ تا ۴ واحد'], ['high', '۵ واحد یا بیشتر']] },
      { id: 'redMeat', type: 'choice', label: 'گوشت قرمز و فرآوری‌شده (سوسیس، کالباس)', opts: [['low', 'کمتر از ۲ بار در هفته'], ['mid', '۲ تا ۴ بار'], ['high', 'تقریباً هر روز']] }
    ]},
    { title: 'علائم فعلی', intro: 'آیا در حال حاضر هر یک از این علائم را دارید؟', qs: [
      { id: 'symLump', type: 'choice', opts: YN, label: 'توده یا سفتی جدید در پستان' },
      { id: 'symDischarge', type: 'choice', opts: YN, label: 'ترشح خودبه‌خودی یا خونی از نوک پستان' },
      { id: 'symSkin', type: 'choice', opts: YN, label: 'فرورفتگی، قرمزی یا پوست پرتقالی شدن پوست پستان' },
      { id: 'symNipple', type: 'choice', opts: YN, label: 'فرورفتگی تازه نوک پستان یا زخم روی آن' },
      { id: 'symAxilla', type: 'choice', opts: YN, label: 'توده در زیر بغل' },
      { id: 'symPain', type: 'choice', opts: YN, label: 'درد موضعی و پایدار (بیش از ۲ هفته) غیرمرتبط با قاعدگی' }
    ]}
  ];

  var answers = load() || {};
  var step = -1;
  var $ = function (s) { return document.querySelector(s); };
  var app = $('#app');

  function save() { try { localStorage.setItem('brisk.answers', JSON.stringify(answers)); } catch (e) {} }
  function load() { try { return JSON.parse(localStorage.getItem('brisk.answers')); } catch (e) { return null; } }
  function visible(q) { return !q.showIf || q.showIf(answers); }

  function render() {
    if (step < 0) return renderIntro();
    if (step >= STEPS.length) return renderResult();
    var s = STEPS[step];
    var pct = Math.round(step / STEPS.length * 100);
    var h = '<div class="progress"><div style="width:' + pct + '%"></div></div>' +
      '<div class="steplbl">مرحله ' + fa(step + 1) + ' از ' + fa(STEPS.length) + '</div>' +
      '<h2>' + s.title + '</h2>' + (s.intro ? '<p class="muted">' + s.intro + '</p>' : '');
    s.qs.forEach(function (q) {
      if (!visible(q)) return;
      var v = answers[q.id];
      h += '<div class="q" data-id="' + q.id + '"><label>' + q.label + '</label>';
      if (q.type === 'choice') {
        h += '<div class="chips">' + q.opts.map(function (o) {
          return '<button type="button" class="chip' + (v === o[0] ? ' on' : '') + '" data-v="' + o[0] + '">' + o[1] + '</button>';
        }).join('') + '</div>';
      } else {
        var dis = q.unknownKey && answers[q.unknownKey];
        h += '<input inputmode="' + (q.type === 'number' ? 'decimal' : 'text') + '" type="' + (q.type === 'number' ? 'number' : 'text') + '" value="' + (v != null ? v : '') + '"' + (dis ? ' disabled' : '') + '>';
        if (q.unknownKey) h += '<label class="unk"><input type="checkbox" class="unkbox"' + (dis ? ' checked' : '') + '> ' + q.unknownLabel + '</label>';
      }
      if (q.help) h += '<div class="help">' + q.help + '</div>';
      h += '<div class="err"></div></div>';
    });
    h += '<div class="nav"><button class="btn sec" id="back">قبلی</button><button class="btn" id="next">' + (step === STEPS.length - 1 ? 'محاسبه خطر' : 'بعدی') + '</button></div>';
    app.innerHTML = h;
    app.querySelectorAll('.q').forEach(function (el) {
      var id = el.dataset.id, q = s.qs.filter(function (x) { return x.id === id; })[0];
      el.querySelectorAll('.chip').forEach(function (b) {
        b.onclick = function () { answers[id] = b.dataset.v; save(); render(); };
      });
      var inp = el.querySelector('input:not(.unkbox)');
      if (inp) inp.oninput = function () { answers[id] = q.type === 'number' ? (inp.value === '' ? null : +inp.value) : inp.value; save(); };
      var ub = el.querySelector('.unkbox');
      if (ub) ub.onchange = function () { answers[q.unknownKey] = ub.checked; save(); render(); };
    });
    $('#back').onclick = function () { step--; render(); window.scrollTo(0, 0); };
    $('#next').onclick = function () { if (validate(s)) { step++; render(); window.scrollTo(0, 0); } };
  }

  function validate(s) {
    var ok = true;
    s.qs.forEach(function (q) {
      if (!visible(q)) return;
      var el = app.querySelector('.q[data-id="' + q.id + '"] .err'), v = answers[q.id], msg = '';
      if (q.optional) return;
      if (q.unknownKey && answers[q.unknownKey]) return;
      if (v == null || v === '') msg = 'لطفاً پاسخ دهید.';
      else if (q.type === 'number' && (v < q.min || v > q.max)) msg = 'عدد باید بین ' + fa(q.min) + ' و ' + fa(q.max) + ' باشد.';
      if (!msg && q.id === 'menarche' && answers.age && v > answers.age) msg = 'سن قاعدگی نمی‌تواند از سن فعلی بیشتر باشد.';
      if (!msg && q.id === 'firstBirth') {
        if (v > answers.age) msg = 'سن اولین زایمان نمی‌تواند از سن فعلی بیشتر باشد.';
        else if (!answers.menarcheUnknown && answers.menarche && v < answers.menarche) msg = 'سن زایمان باید بعد از اولین قاعدگی باشد.';
      }
      if (!msg && q.id === 'menopauseAge' && v > answers.age) msg = 'سن یائسگی نمی‌تواند از سن فعلی بیشتر باشد.';
      if (msg) { ok = false; el.textContent = msg; }
    });
    if (!ok) { var e = app.querySelector('.err:not(:empty)'); if (e) e.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    return ok;
  }

  function renderIntro() {
    app.innerHTML = '<div class="hero"><div class="ribbon">🎗️</div><h1>ارزیابی هوشمند خطر سرطان پستان</h1>' +
      '<p>با پاسخ به حدود ۳۰ سؤال (۵ دقیقه)، احتمال ابتلا در ۵ سال آینده و تا ۹۰ سالگی را بر اساس <b>مدل Gail</b> (ابزار رسمی مؤسسه ملی سرطان آمریکا) محاسبه می‌کنیم، خطر ارثی را با پرسشنامه <b>FHS-7</b> می‌سنجیم و برنامه غربالگری، توصیه‌های پزشکی و برنامه غذایی شخصی را به‌صورت <b>PDF</b> دریافت می‌کنید.</p>' +
      '<div class="note">🔒 همه محاسبات روی گوشی شما انجام می‌شود و هیچ اطلاعاتی ارسال نمی‌شود.</div>' +
      '<div class="note warn">⚠️ این برنامه ابزار آگاهی‌بخشی و غربالگری است و جایگزین معاینه و تشخیص پزشک نیست.</div>' +
      '<button class="btn big" id="start">' + (Object.keys(answers).length ? 'ادامه پرسشنامه' : 'شروع') + '</button>' +
      (Object.keys(answers).length ? '<button class="btn sec" id="reset">شروع از نو</button>' : '') + '</div>';
    $('#start').onclick = function () { step = 0; render(); };
    var r = $('#reset'); if (r) r.onclick = function () { answers = {}; save(); render(); };
  }

  var lastRes = null;
  function renderResult() {
    var a = Object.assign({}, answers);
    if (a.hrt === 'unknownType') a.hrt = 'ep'; // conservative assumption
    var res = RiskModels.evaluate(a);
    if (!res.ok) { app.innerHTML = '<p>خطا در داده‌ها: ' + res.errors.join(', ') + '</p><button class="btn" id="b">بازگشت</button>'; $('#b').onclick = function () { step = 0; render(); }; return; }
    lastRes = res;
    var g = res.gail, h = '';
    h += '<h2>نتیجه ارزیابی</h2>';
    h += '<div class="badge" style="background:' + res.cat.color + '">' + res.cat.label + '</div>';
    res.reco.warnings.filter(function (w) { return w.urgent; }).forEach(function (w) { h += '<div class="alert">🚨 ' + w.text + '</div>'; });
    h += '<div class="kpis">' +
      kpi('خطر ۵ سال آینده', fa(g.fiveYear, 2) + '٪', 'میانگین هم‌سن ' + fa(g.fiveYearAvg, 2) + '٪', res.cat.color) +
      kpi('خطر تا ۹۰ سالگی', fa(g.lifetime, 1) + '٪', 'میانگین هم‌سن ' + fa(g.lifetimeAvg, 1) + '٪', res.cat.color) +
      kpi('برآورد ترکیبی ۵ ساله', fa(g.fiveYearAdj, 2) + '٪', 'با عوامل سبک زندگی', '#777') + '</div>';
    h += gauge(g.fiveYear);
    h += '<h3>وزن عوامل خطر شما</h3><div class="weights">' + (res.weights.length ? res.weights.map(function (w) {
      var v = Math.max(-1.4, Math.min(1.4, w.logw)), pct = Math.abs(v) / 1.4 * 50;
      return '<div class="wrow"><span class="wl">' + fa(w.label) + '</span><span class="wbar"><i class="' + (v > 0 ? 'up' : 'down') + '" style="width:' + pct + '%"></i></span><b>×' + fa(w.rr, 2) + '</b></div>';
    }).join('') : '<p class="muted">عاملی بیشتر یا کمتر از گروه مرجع ثبت نشد.</p>') + '</div>';
    h += section('هشدارها', res.reco.warnings.filter(function (w) { return !w.urgent; }).map(function (w) { return w.text; }));
    h += section('توصیه‌های پزشکی', res.reco.medical);
    h += section('برنامه غربالگری', res.reco.screening);
    h += section('سبک زندگی', res.reco.lifestyle);
    h += section('تغذیه (' + fa(res.nutrition.target) + ' کیلوکالری در روز — ' + res.nutrition.goal + ')', res.nutrition.rules.slice(0, 6));
    h += '<button class="btn big" id="pdf">📄 دریافت گزارش کامل PDF</button>' +
         '<div class="nav"><button class="btn sec" id="edit">ویرایش پاسخ‌ها</button><button class="btn sec" id="new">ارزیابی جدید</button></div>' +
         '<p class="muted small">مدل Gail برای زنان ۳۵ تا ۸۵ سال بدون سابقه سرطان پستان معتبر است. عدد «برآورد ترکیبی» راهنماست و به‌صورت یک مدل واحد اعتبارسنجی نشده است.</p>';
    app.innerHTML = h;
    $('#pdf').onclick = async function () {
      var b = this; b.disabled = true; b.textContent = 'در حال ساخت PDF...';
      try { await Report.savePdf(lastRes, a); b.textContent = '✅ گزارش آماده شد — دریافت دوباره'; }
      catch (e) { alert('خطا در ساخت PDF: ' + e.message); b.textContent = '📄 دریافت گزارش کامل PDF'; }
      b.disabled = false;
    };
    $('#edit').onclick = function () { step = 0; render(); };
    $('#new').onclick = function () { answers = {}; save(); step = -1; render(); };
    window.scrollTo(0, 0);
  }
  function kpi(l, v, s, c) { return '<div class="kpi" style="border-color:' + c + '"><small>' + l + '</small><strong style="color:' + c + '">' + v + '</strong><small>' + s + '</small></div>'; }
  function section(t, items) { return items.length ? '<h3>' + fa(t) + '</h3><ul>' + items.map(function (i) { return '<li>' + fa(i) + '</li>'; }).join('') + '</ul>' : ''; }
  function gauge(v) {
    var pos = Math.min(100, v / 5 * 100);
    return '<div class="gauge"><div class="gbar"><span style="right:' + pos + '%"></span></div><div class="gl">' + [[0, '۰٪'], [33.4, '۱٫۶۷٪'], [60, '۳٪'], [96, '۵٪+']].map(function (t) { return '<span style="right:' + t[0] + '%">' + t[1] + '</span>'; }).join('') + '</div></div>';
  }

  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
})();
