// Run: node tests/gail.test.js
const G = require('../www/js/gail.js');
let fail = 0;
function eq(name, got, exp, tol = 1e-5) {
  const ok = Math.abs(got - exp) <= tol;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: got ${got.toFixed(6)} expected ${exp}`);
}
// Relative risks published in BCRA package example output (relative.risk(exampledata))
let rr = G.relativeRisk({ NB: 0, AM: 2, AF: 1, NR: 1, RHyp: 1 });           // pattern 29
eq('RR pattern 29 (<50)', rr.rr1, 3.235354);
eq('RR pattern 29 pattern#', rr.pattern, 29, 0);
rr = G.relativeRisk({ NB: 1, AM: 2, AF: 1, NR: 1, RHyp: 1 });               // pattern 65
eq('RR pattern 65 (<50)', rr.rr1, 5.492604);
eq('RR pattern 65 (>=50)', rr.rr2, 4.117968);
rr = G.relativeRisk({ NB: 1, AM: 0, AF: 0, NR: 1, RHyp: 1 });               // pattern 38
eq('RR pattern 38 (<50)', rr.rr1, 4.426313);
eq('RR pattern 38 (>=50)', rr.rr2, 3.318538);

// Plausibility: risks must be monotone in risk factors and within sane ranges
const base = { age: 50, menarche: 13, firstBirth: 22, biopsies: 0, hyperplasia: 99, relatives: 0 };
const a = G.assess(base);
console.log('Baseline 50y 5yr=%s%% life=%s%% avg5=%s%% avgLife=%s%%', a.fiveYear.toFixed(2), a.lifetime.toFixed(2), a.fiveYearAvg.toFixed(2), a.lifetimeAvg.toFixed(2));
const b = G.assess({ ...base, relatives: 2, biopsies: 2, hyperplasia: 1, firstBirth: 98, menarche: 11 });
console.log('High-risk 50y 5yr=%s%% life=%s%%', b.fiveYear.toFixed(2), b.lifetime.toFixed(2));
if (!(b.fiveYear > a.fiveYear && a.fiveYear > 0.5 && a.fiveYear < 3)) { fail++; console.log('FAIL plausibility'); }
for (const age of [35, 40, 45, 50, 55, 60, 65, 70]) {
  const r = G.assess({ ...base, age });
  console.log(`age ${age}: 5yr ${r.fiveYear.toFixed(2)}%  avg ${r.fiveYearAvg.toFixed(2)}%  lifetime ${r.lifetime.toFixed(1)}%`);
}
// Input validation
const bad = G.assess({ ...base, firstBirth: 10 });
if (bad.ok) { fail++; console.log('FAIL validation first birth < menarche'); } else console.log('PASS validation');
process.exit(fail ? 1 : 0);
