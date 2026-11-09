/*
 * Supplementary risk models, risk-factor weighting, recommendations and nutrition plan.
 * All relative risks below come from large meta-analyses / pooled analyses (see REFERENCES).
 */
(function (root) {
  'use strict';
  var Gail = root.Gail || (typeof require !== 'undefined' ? require('./gail.js') : null);

  var REFERENCES = [
    'Gail MH et al. J Natl Cancer Inst 1989;81:1879-86 — Gail model.',
    'NCI Breast Cancer Risk Assessment Tool (BCRAT), BCRA R package v2.1.2 — coefficients & rates.',
    'Ashton-Prolla P et al. BMC Cancer 2009;9:283 — FHS-7 family-history screening questionnaire.',
    'Collaborative Group on Hormonal Factors in Breast Cancer. Lancet 2019;394:1159-68 — menopausal hormone therapy.',
    'Collaborative Group on Hormonal Factors in Breast Cancer. Lancet 2002;360:187-95 — breastfeeding.',
    'Collaborative Group on Hormonal Factors in Breast Cancer. Br J Cancer 2002;87:1234-45 — alcohol.',
    'Collaborative Group on Hormonal Factors in Breast Cancer. Lancet Oncol 2012;13:1141-51 — menopause age.',
    'WCRF/AICR Continuous Update Project: Diet, Nutrition, Physical Activity and Breast Cancer (2017/2018).',
    'Wu Y et al. Breast Cancer Res Treat 2013;137:869-82 — physical activity meta-analysis.',
    'Macacu A et al. Breast Cancer Res Treat 2015;154:213-24 — active smoking meta-analysis.',
    'McCormack VA, dos Santos Silva I. Cancer Epidemiol Biomarkers Prev 2006;15:1159-69 — mammographic density.',
    'US Preventive Services Task Force. JAMA 2024;331:1918-30 — breast cancer screening (biennial, age 40-74).',
    'USPSTF. JAMA 2019;322:857-67 — medications to reduce breast cancer risk (5-yr risk ≥3%).',
    'American Cancer Society — MRI screening for women with ≥20-25% lifetime risk.'
  ];

  /* ---------- Exclusion criteria: Gail not applicable ---------- */
  function exclusions(a) {
    var out = [];
    if (a.priorCancer === 'yes') out.push('سابقه سرطان سینه، DCIS یا LCIS');
    if (a.chestRadiation === 'yes') out.push('پرتودرمانی قفسه سینه پیش از ۳۰ سالگی');
    if (a.knownMutation === 'yes') out.push('جهش ژنی شناخته‌شده (BRCA1/2 یا مشابه) در خود فرد');
    return out;
  }

  /* ---------- FHS-7 (Family History Screening-7) ---------- */
  var FHS7 = [
    ['fhs1', 'آیا هیچ‌یک از بستگان درجه یک (مادر، خواهر، دختر) سرطان سینه یا تخمدان داشته‌اند؟'],
    ['fhs2', 'آیا کسی در خانواده سرطان سینه در هر دو پستان داشته است؟'],
    ['fhs3', 'آیا مردی در خانواده سرطان سینه داشته است؟'],
    ['fhs4', 'آیا زنی در خانواده هم سرطان سینه و هم سرطان تخمدان داشته است؟'],
    ['fhs5', 'آیا زنی در خانواده پیش از ۵۰ سالگی به سرطان سینه مبتلا شده است؟'],
    ['fhs6', 'آیا دو نفر یا بیشتر از بستگان سرطان سینه و/یا تخمدان داشته‌اند؟'],
    ['fhs7', 'آیا دو نفر یا بیشتر از بستگان سرطان سینه و/یا روده بزرگ داشته‌اند؟']
  ];
  function fhs7(a) {
    var pos = FHS7.filter(function (q) { return a[q[0]] === 'yes'; }).map(function (q) { return q[1]; });
    if (a.familyMutation === 'yes') pos.push('جهش BRCA شناخته‌شده در یکی از بستگان');
    return { positive: pos.length > 0, items: pos };
  }

  /* ---------- Lifestyle / additional factors (multiplicative hazard modifiers) ---------- */
  function lifestyle(a) {
    var f = [];
    var post = a.menopause === 'post';
    var bmi = a.weight && a.height ? a.weight / Math.pow(a.height / 100, 2) : null;
    if (bmi && post && bmi > 25) {
      f.push({ key: 'bmi', label: 'اضافه‌وزن/چاقی پس از یائسگی (BMI ' + bmi.toFixed(1) + ')',
               rr: Math.pow(1.12, (bmi - 25) / 5), modifiable: true, src: 'WCRF/AICR 2018: RR 1.12 به ازای هر ۵ واحد BMI' });
    }
    var drinks = +a.alcohol || 0; // standard drinks per week (~10 g ethanol)
    if (drinks > 0) {
      var gDay = drinks * 10 / 7;
      f.push({ key: 'alcohol', label: 'مصرف الکل (' + drinks + ' واحد در هفته)', rr: Math.pow(1.071, gDay / 10),
               modifiable: true, src: 'افزایش ۷٫۱٪ به ازای هر ۱۰ گرم در روز' });
    }
    if (a.activity === 'active') f.push({ key: 'activity', label: 'فعالیت بدنی منظم (≥۱۵۰ دقیقه در هفته)', rr: 0.88, modifiable: true, src: 'Wu 2013: RR≈0.88' });
    if (a.smoking === 'current') f.push({ key: 'smoking', label: 'استعمال دخانیات (فعلی)', rr: 1.10, modifiable: true, src: 'Macacu 2015: RR≈1.10' });
    if (a.parous === 'yes' && +a.breastfeedingMonths > 0) {
      var m = Math.min(+a.breastfeedingMonths, 60);
      f.push({ key: 'bf', label: 'شیردهی (' + m + ' ماه در مجموع)', rr: Math.pow(1 - 0.043, m / 12), modifiable: false, src: 'کاهش ۴٫۳٪ به ازای هر ۱۲ ماه' });
    }
    if (post && a.hrt && a.hrt !== 'none') {
      var yrs = +a.hrtYears || 0, rr;
      if (a.hrt === 'ep') rr = yrs >= 5 ? 2.08 : 1.60; else rr = yrs >= 5 ? 1.33 : 1.17;
      f.push({ key: 'hrt', label: 'هورمون‌درمانی یائسگی ' + (a.hrt === 'ep' ? '(استروژن+پروژستین)' : '(فقط استروژن)'), rr: rr, modifiable: true, src: 'Lancet 2019' });
    }
    if (post && +a.menopauseAge > 50 && +a.menopauseAge < 65) {
      f.push({ key: 'meno', label: 'یائسگی دیررس (' + a.menopauseAge + ' سالگی)', rr: Math.pow(1.029, a.menopauseAge - 50), modifiable: false, src: '۲٫۹٪ به ازای هر سال تأخیر' });
    }
    var dens = { a: 0.6, b: 1.0, c: 1.4, d: 2.0 }[a.density];
    if (dens && dens !== 1) f.push({ key: 'density', label: 'تراکم بافت پستان در ماموگرافی (BI-RADS ' + a.density.toUpperCase() + ')', rr: dens, modifiable: false, src: 'McCormack 2006 (تقریبی)' });

    var mult = f.reduce(function (p, x) { return p * x.rr; }, 1);
    mult = Math.max(0.5, Math.min(3, mult)); // cap — supplementary factors are not jointly validated
    return { factors: f, multiplier: mult, bmi: bmi };
  }

  /* ---------- Gail factor weights (for the weighting chart) ---------- */
  function gailWeights(g, age) {
    var t = g.rr.terms, w = [];
    var lbl = {
      menarche: 'سن اولین قاعدگی', firstBirth: 'سن اولین زایمان / نزایمانی', relatives: 'بستگان درجه یک مبتلا',
      biopsy: 'تعداد نمونه‌برداری پستان', hyperplasia: 'نتیجه پاتولوژی نمونه‌برداری (هیپرپلازی)', firstBirthXrelatives: 'اثر متقابل زایمان×سابقه خانوادگی',
      biopsyAge50: 'اصلاح نمونه‌برداری برای سن ≥۵۰'
    };
    Object.keys(t).forEach(function (k) {
      if (k === 'biopsyAge50' && age < 50) return;
      if (Math.abs(t[k]) < 1e-9) return;
      w.push({ label: lbl[k], rr: Math.exp(t[k]), logw: t[k], source: 'Gail' });
    });
    return w;
  }

  /* ---------- Risk category ---------- */
  function category(fiveYear, lifetime, excluded, fhsPos) {
    if (excluded) return { level: 'high', label: 'خطر بالا (خارج از محدوده مدل)', color: '#c0392b' };
    if (fiveYear >= 3 || lifetime >= 20) return { level: 'high', label: 'خطر بالا', color: '#c0392b' };
    if (fiveYear >= 1.67 || lifetime >= 15 || fhsPos) return { level: 'elevated', label: 'خطر بالاتر از متوسط', color: '#e67e22' };
    return { level: 'average', label: 'خطر متوسط / پایین', color: '#27ae60' };
  }

  /* ---------- Warnings & medical recommendations ---------- */
  function recommendations(a, r) {
    var warn = [], med = [], screen = [];
    var age = a.age;
    var sym = ['symLump', 'symDischarge', 'symSkin', 'symNipple', 'symAxilla', 'symPain'].filter(function (k) { return a[k] === 'yes'; });
    if (sym.length) warn.push({ urgent: true, text: 'شما علامت(های) هشداردهنده گزارش کرده‌اید. صرف‌نظر از نتیجه این محاسبه، ظرف ۱ تا ۲ هفته آینده به پزشک (جراح عمومی/متخصص پستان) مراجعه کنید. این علائم در بیشتر موارد خوش‌خیم‌اند اما باید معاینه شوند.' });
    if (r.excluded.length) warn.push({ urgent: true, text: 'مدل Gail برای شرایط شما (' + r.excluded.join('، ') + ') معتبر نیست و خطر واقعی شما احتمالاً بیشتر از محاسبات استاندارد است. پیگیری باید زیر نظر متخصص پستان/انکولوژیست انجام شود.' });
    if (r.fhs.positive) warn.push({ urgent: false, text: 'پرسشنامه FHS-7 مثبت است: احتمال زمینه ارثی (مثل BRCA1/2) مطرح است. ارجاع به مشاوره ژنتیک توصیه می‌شود. توجه: مدل Gail فقط بستگان درجه یک را می‌شمارد و خطر ارثی را کمتر از واقع برآورد می‌کند.' });
    if (a.hyperplasia === 1) warn.push({ urgent: false, text: 'هیپرپلازی آتیپیک یک ضایعه پرخطر است؛ پیگیری منظم با متخصص پستان ضروری است.' });
    if (!r.gail.validatedAge) warn.push({ urgent: false, text: 'مدل Gail برای سنین ۳۵ تا ۸۵ سال اعتبارسنجی شده است؛ عدد محاسبه‌شده برای سن شما فقط تقریبی است.' });

    var lvl = r.cat.level;
    if (lvl === 'high') {
      med.push('مراجعه به متخصص پستان یا کلینیک ارزیابی خطر سرطان پستان در اولین فرصت (ظرف ۱ ماه).');
      med.push('بحث درباره غربالگری تشدیدشده: ماموگرافی سالانه و در صورت صلاحدید پزشک، MRI سالانه پستان.');
      if (r.gail.fiveYear >= 3 && !r.excluded.length) med.push('بر اساس USPSTF، در خطر ۵ ساله ≥۳٪ درباره داروهای کاهش‌دهنده خطر (تاموکسیفن، رالوکسیفن یا مهارکننده آروماتاز) با پزشک مشورت کنید.');
    } else if (lvl === 'elevated') {
      med.push('مراجعه به پزشک زنان یا جراح عمومی ظرف ۳ ماه برای بررسی دقیق‌تر خطر و تنظیم برنامه غربالگری.');
      if (r.gail.fiveYear >= 1.67) med.push('خطر ۵ ساله شما ≥۱٫۶۷٪ است (آستانه کلاسیک مطالعات پیشگیری دارویی). ارزیابی مزایا و عوارض داروهای پیشگیرانه با پزشک.');
    } else {
      med.push('معاینه دوره‌ای توسط پزشک طبق برنامه معمول؛ ارجاع فوری لازم نیست مگر علامت جدیدی ایجاد شود.');
    }
    if (r.fhs.positive) med.push('ارجاع به مشاوره ژنتیک برای بررسی نیاز به آزمایش BRCA1/2 و سایر ژن‌ها.');

    if (lvl === 'high') {
      screen.push('ماموگرافی: سالانه (شروع از ۳۰ تا ۴۰ سالگی بر اساس نظر متخصص).');
      screen.push('MRI پستان: در صورت تأیید خطر بالا توسط متخصص، سالانه.');
    } else if (age < 40) {
      screen.push('تا ۴۰ سالگی: آگاهی از وضعیت طبیعی پستان (خودآزمایی ماهانه) و معاینه بالینی هر ۱ تا ۳ سال.');
      screen.push('از ۴۰ سالگی: ماموگرافی هر ۲ سال (USPSTF 2024).');
    } else if (age <= 74) {
      screen.push('ماموگرافی هر ۲ سال یک‌بار (USPSTF 2024، سنین ۴۰ تا ۷۴ سال)' + (lvl === 'elevated' ? '؛ پزشک ممکن است فاصله سالانه را توصیه کند.' : '.'));
      screen.push('معاینه بالینی پستان توسط پزشک هنگام ویزیت‌های دوره‌ای.');
    } else {
      screen.push('بالای ۷۴ سال: ادامه ماموگرافی تصمیمی فردی است و باید با پزشک بر اساس وضعیت سلامت عمومی گرفته شود.');
    }
    if (a.density === 'c' || a.density === 'd') screen.push('پستان متراکم: درباره روش‌های تکمیلی (سونوگرافی یا MRI) با پزشک گفتگو کنید.');
    screen.push('در هر سنی: هر تغییر جدید در پستان (توده، ترشح خونی، فرورفتگی پوست یا نوک پستان، قرمزی، توده زیربغل) را سریعاً به پزشک اطلاع دهید.');

    var life = [];
    r.life.factors.filter(function (x) { return x.modifiable && x.rr > 1; }).forEach(function (x) {
      var tip = { bmi: 'کاهش وزن تدریجی (۵ تا ۱۰٪ وزن فعلی در ۶ ماه) با رژیم متعادل و فعالیت بدنی.',
                  alcohol: 'قطع یا حداقل کاهش مصرف الکل؛ هیچ سطح «بی‌خطری» برای سرطان پستان تعریف نشده است.',
                  smoking: 'ترک کامل دخانیات (سیگار و قلیان) — از خدمات ترک دخانیات کمک بگیرید.',
                  hrt: 'ادامه هورمون‌درمانی یائسگی را با پزشک بازبینی کنید (کمترین دوز و کوتاه‌ترین مدت لازم).' }[x.key];
      if (tip) life.push(tip);
    });
    if (a.activity !== 'active') life.push('حداقل ۱۵۰ دقیقه فعالیت متوسط (پیاده‌روی تند) یا ۷۵ دقیقه فعالیت شدید در هفته.');
    life.push('در صورت امکان شیردهی به فرزندان (اثر محافظتی دارد).');
    return { warnings: warn, medical: med, screening: screen, lifestyle: life };
  }

  /* ---------- Nutrition plan (WCRF/AICR based, Iranian foods) ---------- */
  function nutrition(a, lifeRes) {
    var w = +a.weight, h = +a.height, age = +a.age;
    var bmr = 10 * w + 6.25 * h - 5 * age - 161; // Mifflin-St Jeor (female)
    var pal = a.activity === 'active' ? 1.55 : (a.activity === 'some' ? 1.375 : 1.2);
    var tdee = bmr * pal;
    var bmi = lifeRes.bmi;
    var goal = 'حفظ وزن', target = tdee;
    if (bmi >= 25) { goal = 'کاهش تدریجی وزن (حدود ۰٫۵ کیلوگرم در هفته)'; target = Math.max(1200, tdee - 500); }
    else if (bmi < 18.5) { goal = 'رسیدن به وزن سالم (افزایش تدریجی)'; target = tdee + 300; }
    target = Math.round(target / 50) * 50;
    var scale = target / 1800; // menu designed for ~1800 kcal
    var bread = Math.max(1, Math.round(2 * scale)), rice = Math.max(4, Math.round(6 * scale));

    var rules = [
      'سبزی و میوه: حداقل ۵ واحد در روز (۴۰۰ گرم یا بیشتر)؛ تنوع رنگ‌ها (سبزی‌های برگ‌سبز، کلم و بروکلی، گوجه، هویج، مرکبات).',
      'غلات کامل: نان سبوس‌دار (سنگک، جو)، بلغور، جو پرک و برنج قهوه‌ای به‌جای نان و برنج سفید؛ فیبر روزانه ≥۲۵ تا ۳۰ گرم.',
      'حبوبات: حداقل ۳ تا ۴ بار در هفته (عدس، نخود، لوبیا، ماش، سویا). سویا و فرآورده‌های آن در حد غذا بی‌خطر است.',
      'گوشت قرمز: حداکثر ۳۵۰ تا ۵۰۰ گرم پخته در هفته؛ گوشت فرآوری‌شده (سوسیس، کالباس، همبرگر صنعتی) را حذف کنید.',
      'ماهی ۲ بار در هفته (کبابی/بخارپز)؛ مرغ بدون پوست؛ روش پخت: آب‌پز، بخارپز، تنوری؛ کمتر سرخ‌کردنی.',
      'لبنیات کم‌چرب ۲ تا ۳ واحد در روز (ماست، دوغ کم‌نمک، شیر).',
      'روغن: روغن زیتون و کانولا به مقدار کم؛ پرهیز از روغن جامد و ترانس.',
      'قند افزوده و نوشابه‌ها/آبمیوه‌های صنعتی را به حداقل برسانید؛ تنقلات شور و فست‌فود را محدود کنید.',
      'الکل: مصرف نکنید.',
      'مکمل‌ها جایگزین غذای سالم نیستند و برای پیشگیری از سرطان توصیه نمی‌شوند (مگر با تجویز پزشک، مثلاً ویتامین D در کمبود).'
    ];
    if (a.vegFruit === 'low') rules.unshift('مصرف فعلی میوه و سبزی شما پایین است: یک واحد سبزی به هر وعده اصلی و یک میوه به میان‌وعده‌ها اضافه کنید.');
    if (a.redMeat === 'high') rules.unshift('مصرف گوشت قرمز/فرآوری‌شده شما بالاست: هفته‌ای ۲ وعده آن را با حبوبات یا ماهی جایگزین کنید.');

    var B = bread + ' کف دست نان سبوس‌دار', R = rice + ' قاشق غذاخوری برنج/کته';
    var days = [
      ['شنبه', B + '، پنیر کم‌چرب، گردو، گوجه و خیار', 'خورش قورمه‌سبزی با گوشت کم + ' + R + '، سالاد', 'عدسی + ماست کم‌چرب', 'سیب، چای بدون قند'],
      ['یکشنبه', 'جو پرک با شیر کم‌چرب و دارچین + خرما (۲ عدد)', 'ماهی کبابی + سبزی‌پلو (' + R + ') + سالاد شیرازی', 'کوکو سبزی تنوری + ' + B, 'پرتقال، بادام (۱۰ عدد)'],
      ['دوشنبه', 'تخم‌مرغ آب‌پز + ' + B + ' + سبزی خوردن', 'خوراک لوبیا قرمز با قارچ + سالاد', 'سوپ جو با سبزیجات + مرغ آب‌پز', 'هویج، ماست'],
      ['سه‌شنبه', B + '، عسل کم + پنیر کم‌چرب', 'عدس‌پلو (' + R + ') + ماست و خیار', 'کباب تابه‌ای مرغ + سبزیجات بخارپز', 'انار یا کیوی'],
      ['چهارشنبه', 'حلیم بدون شکر (کاسه کوچک) یا جو پرک', 'خورش کرفس + ' + R + ' + سالاد', 'خوراک سویا یا عدس با گوجه + ' + B, 'لیموشیرین، گردو'],
      ['پنجشنبه', 'املت گوجه و سبزی + ' + B, 'ماهی قزل‌آلا تنوری + باقالی‌پلو (' + R + ')', 'آش رشته کم‌روغن (کشک کم‌چرب)', 'سیب، شیر کم‌چرب'],
      ['جمعه', 'نان سنگک + پنیر + سبزی + گوجه', 'آبگوشت کم‌چرب با نخود و لوبیا (گوشت کم) + سبزی خوردن', 'سالاد مرغ و کاهو با روغن زیتون + ' + B, 'هندوانه/خربزه یا گلابی']
    ];
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), target: target, goal: goal, rules: rules, days: days };
  }

  /* ---------- Orchestration ---------- */
  function evaluate(a) {
    var excluded = exclusions(a);
    var gIn = {
      age: +a.age,
      menarche: a.menarcheUnknown ? 99 : +a.menarche,
      firstBirth: a.parous === 'no' ? 98 : (a.parous === 'unknown' ? 99 : +a.firstBirth),
      biopsies: a.biopsy === 'yes' ? +a.biopsyCount : (a.biopsy === 'unknown' ? 99 : 0),
      hyperplasia: a.biopsy === 'yes' ? ({ yes: 1, no: 0 }[a.hyperplasiaAns] !== undefined ? { yes: 1, no: 0 }[a.hyperplasiaAns] : 99) : 99,
      relatives: +a.relatives || 0
    };
    a.hyperplasia = gIn.hyperplasia;
    var life = lifestyle(a);
    var gail = Gail.assess(gIn, life.multiplier);
    if (!gail.ok) return { ok: false, errors: gail.errors };
    var fhs = fhs7(a);
    var cat = category(gail.fiveYear, gail.lifetime, excluded.length > 0, fhs.positive);
    var weights = gailWeights(gail, +a.age).concat(life.factors.map(function (x) { return { label: x.label, rr: x.rr, logw: Math.log(x.rr), source: 'سبک زندگی', src: x.src }; }));
    weights.sort(function (p, q) { return Math.abs(q.logw) - Math.abs(p.logw); });
    var res = { ok: true, input: gIn, gail: gail, life: life, fhs: fhs, excluded: excluded, cat: cat, weights: weights };
    res.reco = recommendations(a, res);
    res.nutrition = nutrition(a, life);
    res.references = REFERENCES;
    res.date = new Date();
    return res;
  }

  var api = { evaluate: evaluate, FHS7: FHS7, REFERENCES: REFERENCES, lifestyle: lifestyle, nutrition: nutrition };
  root.RiskModels = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
