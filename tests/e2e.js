// End-to-end test: drives the questionnaire in headless Chrome, generates the PDF.
// Run: NODE_PATH=/opt/npm-tools/node_modules node tests/e2e.js [profile]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const profile = process.argv[2] || 'elevated';
const P = {
  elevated: { name: 'نمونه آزمایشی', age: 52, height: 160, weight: 78, menarche: 11, parous: 'yes', firstBirth: 31, breastfeedingMonths: 6,
    menopause: 'post', menopauseAge: 51, hrt: 'none', biopsy: 'yes', biopsyCount: 1, hyperplasiaAns: 'no', density: 'c',
    relatives: 1, familyMutation: 'no', fhs1: 'yes', fhs2: 'no', fhs3: 'no', fhs4: 'no', fhs5: 'yes', fhs6: 'no', fhs7: 'no',
    activity: 'low', smoking: 'never', alcohol: 0, vegFruit: 'low', redMeat: 'mid',
    priorCancer: 'no', chestRadiation: 'no', knownMutation: 'no',
    symLump: 'no', symDischarge: 'no', symSkin: 'no', symNipple: 'no', symAxilla: 'no', symPain: 'no' }
};
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const page = await browser.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, acceptDownloads: true });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await page.goto('file://' + path.resolve('www/index.html'));
  await page.screenshot({ path: 'out/s0-intro.png' });
  await page.click('#start');
  const a = P[profile];
  for (let s = 0; s < 7; s++) {
    for (let pass = 0; pass < 3; pass++) {           // repeat: answers reveal follow-up questions
      const ids = await page.$$eval('.q', qs => qs.map(q => q.dataset.id));
      for (const id of ids) {
        if (!(id in a)) continue;
        const chip = await page.$(`.q[data-id="${id}"] .chip[data-v="${a[id]}"]`);
        if (chip) { if (!(await chip.evaluate(c => c.classList.contains('on')))) await chip.click(); }
        else { const inp = await page.$(`.q[data-id="${id}"] input:not(.unkbox)`); if (inp) await inp.fill(String(a[id])); }
      }
    }
    if (s === 2) await page.screenshot({ path: 'out/s1-question.png', fullPage: true });
    await page.click('#next');
  }
  await page.waitForSelector('#pdf');
  await page.screenshot({ path: 'out/s2-result.png', fullPage: true });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#pdf')]);
  await dl.saveAs('out/report-' + profile + '.pdf');
  console.log('PDF saved; size', fs.statSync('out/report-' + profile + '.pdf').size, 'errors:', errors);
  await browser.close();
})();
