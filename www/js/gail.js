/*
 * Gail model / NCI Breast Cancer Risk Assessment Tool (BCRAT) — JavaScript port.
 * Ported line-by-line from the official NCI "BCRA" R package v2.1.2
 * (relative.risk.R, recode.check.R, absolute.risk.R).
 * Population: White / Other (unknown) race parameter set (identical in BCRAT),
 * which is the set BCRAT applies to Middle-Eastern / Iranian women.
 *
 * References:
 *  Gail MH et al. J Natl Cancer Inst 1989;81(24):1879-86.
 *  Costantino JP et al. J Natl Cancer Inst 1999;91(18):1541-8 (Gail model 2, invasive cancer).
 */
(function (root) {
  'use strict';

  // ---- Constants (White / Other) — from BCRA absolute.risk.R ----
  // 14 five-year age groups: 20-24, 25-29, ..., 85-89
  var LAMBDA1 = [0.00001000, 0.00007600, 0.00026600, 0.00066100, 0.00126500, 0.00186600, 0.00221100,
                 0.00272100, 0.00334800, 0.00392300, 0.00417800, 0.00443900, 0.00442100, 0.00410900]; // SEER 1983-87 composite incidence
  var LAMBDA2 = [0.00049300, 0.00053100, 0.00062500, 0.00082500, 0.00130700, 0.00218100, 0.00365500,
                 0.00585200, 0.00943900, 0.01502800, 0.02383900, 0.03883200, 0.06682800, 0.14490800]; // competing mortality
  var LAMBDA1_AVG = [0.00001220, 0.00007410, 0.00022970, 0.00056490, 0.00116450, 0.00195250, 0.00261540,
                     0.00302790, 0.00367570, 0.00420290, 0.00473080, 0.00494250, 0.00479760, 0.00401060]; // SEER 1992-96 (average woman)
  var LAMBDA2_AVG = [0.00044120, 0.00052540, 0.00067460, 0.00090920, 0.00125340, 0.00195700, 0.00329840,
                     0.00546220, 0.00910350, 0.01418540, 0.02259350, 0.03611460, 0.06136260, 0.14206630];
  var ONE_MINUS_AR = [0.5788413, 0.5788413]; // (1 - attributable risk) for age <50, >=50
  // Logistic coefficients: [NB, AM, AF, NR, NB*Age>=50, AF*NR]
  var BETA = [0.5292641686, 0.0940103059, 0.2186262218, 0.9583027845, -0.2880424830, -0.1908113865];

  var UNKNOWN = 99, NULLIPAROUS = 98;

  /**
   * Recode raw answers into Gail categories (recode.check.R, race 1).
   * input: { age, menarche (99=unk), firstBirth (98=nulliparous, 99=unk),
   *          biopsies (99=unk), hyperplasia (0 no, 1 yes, 99 unk/NA), relatives (99=unk) }
   */
  function recode(inp) {
    var errors = [];
    var T1 = inp.age;
    if (!(T1 >= 20 && T1 < 90)) errors.push('age');

    // Biopsies
    var nb, rhyp;
    var b = inp.biopsies;
    if (b === 0 || b === UNKNOWN || b == null) { nb = 0; rhyp = 1.0; }
    else if (b === 1) nb = 1;
    else if (b >= 2) nb = 2;
    if (nb > 0) {
      var h = inp.hyperplasia;
      if (h === 0) rhyp = 0.93;
      else if (h === 1) rhyp = 1.82;
      else rhyp = 1.0;
    }

    // Age at menarche
    var am, m = inp.menarche;
    if (m === UNKNOWN || m == null) am = 0;
    else if (m > T1) { am = null; errors.push('menarche'); }
    else if (m >= 14) am = 0;
    else if (m >= 12) am = 1;
    else if (m > 0) am = 2;
    else { am = null; errors.push('menarche'); }

    // Age at first live birth
    var af, f = inp.firstBirth;
    if (f === UNKNOWN || f == null) af = 0;
    else if (f === NULLIPAROUS) af = 2;
    else if (f < 20) af = 0;
    else if (f < 25) af = 1;
    else if (f < 30) af = 2;
    else af = 3;
    if (f !== UNKNOWN && f !== NULLIPAROUS && f != null) {
      if (m !== UNKNOWN && m != null && f < m) { af = null; errors.push('firstBirth<menarche'); }
      if (f > T1) { af = null; errors.push('firstBirth>age'); }
    }

    // First-degree relatives
    var nr, r = inp.relatives;
    if (r === UNKNOWN || r == null || r === 0) nr = 0;
    else if (r === 1) nr = 1;
    else nr = 2;

    return { NB: nb, AM: am, AF: af, NR: nr, RHyp: rhyp, errors: errors };
  }

  /** relative.risk.R — returns RR for ages <50 and >=50 plus per-term contributions */
  function relativeRisk(cat) {
    var lp1 = cat.NB * BETA[0] + cat.AM * BETA[1] + cat.AF * BETA[2] + cat.NR * BETA[3] +
              cat.AF * cat.NR * BETA[5] + Math.log(cat.RHyp);
    var lp2 = lp1 + cat.NB * BETA[4];
    return {
      rr1: Math.exp(lp1), rr2: Math.exp(lp2),
      pattern: cat.NB * 36 + cat.AM * 12 + cat.AF * 3 + cat.NR + 1,
      terms: {
        biopsy: cat.NB * BETA[0],
        biopsyAge50: cat.NB * BETA[4],
        menarche: cat.AM * BETA[1],
        firstBirth: cat.AF * BETA[2],
        relatives: cat.NR * BETA[3],
        firstBirthXrelatives: cat.AF * cat.NR * BETA[5],
        hyperplasia: Math.log(cat.RHyp)
      }
    };
  }

  /**
   * absolute.risk.R — probability (%) of invasive breast cancer between ages T1 and T2.
   * rr1/rr2: relative risks (<50, >=50). avg=true -> average woman (SEER 1992-96, RR=1).
   * extraMultiplier: optional multiplicative modifier on the breast cancer hazard (default 1).
   */
  function absoluteRisk(T1, T2, rr1, rr2, avg, extraMultiplier) {
    if (!(T1 >= 20 && T1 < 90 && T2 > T1 && T2 <= 90)) return NaN;
    var mult = extraMultiplier || 1;
    var l1 = avg ? LAMBDA1_AVG : LAMBDA1;
    var l2 = avg ? LAMBDA2_AVG : LAMBDA2;
    var strt = Math.floor(T1) - 20;          // 0-based single-year index
    var n = Math.ceil(T2) - Math.floor(T1);
    var risk = 0, cum = 0;
    for (var j = 1; j <= n; j++) {
      var idx = strt + j - 1;                // single-year index (age-20)
      var grp = Math.floor(idx / 5);         // 5-year group
      var len;
      if (n === 1) len = T2 - T1;
      else if (j === 1) len = 1 - (T1 - Math.floor(T1));
      else if (j === n) len = (T2 > Math.floor(T2)) ? (T2 - Math.floor(T2)) : 1;
      else len = 1;
      var oneArRr = avg ? 1 : (idx < 30 ? ONE_MINUS_AR[0] * rr1 : ONE_MINUS_AR[1] * rr2);
      var h1 = oneArRr * l1[grp] * mult;
      var lam = h1 + l2[grp];
      risk += (h1 / lam) * Math.exp(-cum) * (1 - Math.exp(-lam * len));
      cum += lam * len;
    }
    return 100 * risk;
  }

  /** Convenience: full Gail assessment */
  function assess(inp, extraMultiplier) {
    var cat = recode(inp);
    if (cat.errors.length) return { ok: false, errors: cat.errors };
    var rr = relativeRisk(cat);
    var age = inp.age;
    var res = {
      ok: true, categories: cat, rr: rr,
      fiveYear: absoluteRisk(age, Math.min(age + 5, 90), rr.rr1, rr.rr2, false),
      fiveYearAvg: absoluteRisk(age, Math.min(age + 5, 90), 1, 1, true),
      lifetime: age < 90 ? absoluteRisk(age, 90, rr.rr1, rr.rr2, false) : NaN,
      lifetimeAvg: age < 90 ? absoluteRisk(age, 90, 1, 1, true) : NaN,
      validatedAge: age >= 35 && age <= 85
    };
    if (extraMultiplier && extraMultiplier !== 1) {
      res.fiveYearAdj = absoluteRisk(age, Math.min(age + 5, 90), rr.rr1, rr.rr2, false, extraMultiplier);
      res.lifetimeAdj = age < 90 ? absoluteRisk(age, 90, rr.rr1, rr.rr2, false, extraMultiplier) : NaN;
    } else { res.fiveYearAdj = res.fiveYear; res.lifetimeAdj = res.lifetime; }
    return res;
  }

  var api = { recode: recode, relativeRisk: relativeRisk, absoluteRisk: absoluteRisk, assess: assess,
              BETA: BETA, UNKNOWN: UNKNOWN, NULLIPAROUS: NULLIPAROUS };
  root.Gail = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
