const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { root, readJSON } = require('../helpers/app.cjs');
// Optional: use an existing Playwright installation; never download a browser here.
const { chromium } = require('playwright');
const stages = readJSON('data/events.json').filter(e => e.date === '2026-10-30' && e.eventType === 'audition-2nd-east');
let browser, server, baseURL;
before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const type = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json'}[path.extname(file)] || 'application/octet-stream';
      if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
      res.writeHead(200, {'Content-Type':type}); res.end(await fs.readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  baseURL = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless:true,
    ...(process.env.BROWSER_EXECUTABLE_PATH ? {executablePath:process.env.BROWSER_EXECUTABLE_PATH} : {}) });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
});
async function openPage(width) {
  const context = await browser.newContext({viewport:{width,height:844}, timezoneId:'Asia/Tokyo', isMobile:width<500, hasTouch:width<500});
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  await context.addInitScript(() => { Date.now = () => new Date('2026-10-24T03:00:00Z').getTime(); });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (['error','warning'].includes(msg.type())) errors.push(msg.text()); });
  await page.goto(`${baseURL}/?noanalytics=1`);
  await page.locator(`#event-${stages[0].id}`).waitFor();
  if (process.env.TEST_SCREENSHOT_DIR) {
    await fs.mkdir(process.env.TEST_SCREENSHOT_DIR, {recursive:true});
    await page.screenshot({path:path.join(process.env.TEST_SCREENSHOT_DIR, `initial-${width}.png`),fullPage:false});
  }
  if (process.env.TEST_SCREENSHOT_DIR) {
    await page.locator('#favoriteBackupBtn').screenshot({path:path.join(process.env.TEST_SCREENSHOT_DIR, `backup-link-${width}.png`)});
  }
  return {context, page, errors};
}
async function filterSecondStage(page) {
  await page.locator('#eventType').selectOption('audition-2nd-east');
  await page.locator('#month').selectOption('10');
  await page.locator('#day').selectOption('30');
  assert.equal(await page.locator('#results .result-card').count(), 3);
}
for (const width of [1280,390,375,320]) {
  test(`実DOM ${width}px: 各部情報、検索、お気に入り、保存・解除`, {timeout:30000}, async () => {
    const {context,page,errors} = await openPage(width);
    try {
      assert.equal(new URL(page.url()).origin, baseURL);
      assert.match(await page.title(), /オーディションEAST/);
      assert.equal(await page.locator('h1').count(), 1);
      assert.equal(await page.locator('vite-error-overlay, nextjs-portal').count(), 0);
      await filterSecondStage(page);
      assert.equal(await page.locator('#results .additional-qualified-badge').count(), 17);
      for (const ev of stages) {
        const card = page.locator(`#event-${ev.id}`);
        assert.equal(await card.locator('.venue-line').textContent(), `会場：${ev.venueDisplayName}`);
        assert.ok((await card.textContent()).includes(ev.ticket.saleInfo));
        assert.ok(!(await card.textContent()).includes(`開場${ev.openTime}`));
        assert.equal(await card.locator('.ticket-purchase-link a').getAttribute('href'), ev.ticket.url);
        assert.equal(await card.locator('.performer').count(), ev.performers.length);
      }
      const name = stages[0].performers[0];
      await page.locator('#nameQuery').fill(name);
      await page.waitForFunction(() => document.querySelectorAll('#results .result-card').length === 1);
      assert.equal(await page.locator('#results .result-card').getAttribute('id'), `event-${stages[0].id}`);
      const star = page.locator('#results .star').first();
      assert.equal(await star.getAttribute('data-name'), name);
      await star.click();
      assert.equal(await star.getAttribute('aria-pressed'), 'true');
      const favorite = page.locator(`#favoriteSchedule [data-event-id="${stages[0].id}"]`);
      await favorite.waitFor();
      assert.ok((await favorite.locator('.favorite-meta').textContent()).includes(stages[0].venueDisplayName));
      await page.locator('#favoritesOnlyBtn').click();
      assert.equal(await page.locator('#favoritesOnlyBtn').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#results .result-card').count(), 1);
      await page.reload();
      await page.locator('#favoritePanel').waitFor({state:'visible'});
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('favoritePerformers'))), [name]);
      await filterSecondStage(page);
      await page.locator('#favoriteSchedule [data-event-id]').first().click();
      assert.equal(await page.locator('#eventType').inputValue(), 'all');
      await page.waitForFunction(id => document.getElementById(`event-${id}`).classList.contains('is-highlighted'), stages[0].id);
      await page.locator(`#event-${stages[0].id} .star`).first().click();
      assert.equal(await page.locator('#favoritePanel').isHidden(), true);
      await filterSecondStage(page);
      await page.locator('#nameQuery').fill('該当しないテスト出演者');
      await page.waitForFunction(() => document.querySelectorAll('#results .result-card').length === 0);
      await page.locator('#clearBtn').click();
      assert.equal(await page.locator('#nameQuery').inputValue(), '');
      assert.ok(await page.locator('#results .result-card').count() > 0);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
  test(`バックアップ操作領域 ${width}px: 移動前後・閉じるボタンは44px以上、下線を保持`, {timeout:30000}, async () => {
    const {context, page, errors} = await openPage(width);
    try {
      const metrics = [];
      const checkLink = async locator => {
        const style = await locator.evaluate(el => {
          const css = getComputedStyle(el);
          return {id:el.id,height:el.getBoundingClientRect().height,underline:css.textDecorationLine,background:css.backgroundColor};
        });
        metrics.push(style);
        assert.ok(style.height >= 44, JSON.stringify(style));
        assert.ok(style.underline.includes('underline'), JSON.stringify(style));
        assert.equal(style.background, 'rgba(0, 0, 0, 0)');
      };
      const link = page.locator('#favoriteBackupBtn');
      await checkLink(link);
      await link.click();
      await page.locator('#favoriteBackupPanel').waitFor({state:'visible'});
      await checkLink(page.locator('#closeBackupBtn'));
      await page.locator('#closeBackupBtn').click();
      assert.equal(await page.locator('#favoriteBackupPanel').isHidden(), true);
      await filterSecondStage(page);
      await page.locator(`#event-${stages[0].id} .star`).first().click();
      await checkLink(link);
      assert.equal(await link.evaluate(el => el.parentElement.id), 'favoriteSchedule');
      await link.click();
      await page.locator('#createBackupBtn').click();
      assert.ok((await page.locator('#backupCodeOutput').inputValue()).length > 0);
      if (process.env.TEST_SCREENSHOT_DIR) {
        await page.locator('#favoriteBackupPanel').screenshot({path:path.join(process.env.TEST_SCREENSHOT_DIR, `backup-panel-${width}.png`)});
      }
      await page.locator('#closeBackupBtn').click();
      assert.equal(await page.locator('#favoriteBackupPanel').isHidden(), true);
      console.log(`backup ${width}px: ${JSON.stringify(metrics)}`);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
  test(`レイアウト ${width}px: 横スクロール・文字はみ出し・タップ領域`, {timeout:30000}, async () => {
    const {context,page} = await openPage(width);
    try {
      await filterSecondStage(page);
      await page.locator(`#event-${stages[0].id} .star`).first().click();
      const layout = await page.evaluate(() => {
        const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
        const clipped = [...document.querySelectorAll('.performer, .performer-name, .performer-name-text, .datetime-venue, .favorite-meta, .favorite-name, h1, h3, .ticket-note')]
          .filter(visible).filter(el => el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0).map(el => el.textContent.trim());
        const small = [...document.querySelectorAll('button, select, input')].filter(visible).filter(el => {
          const r = el.getBoundingClientRect(); return r.width < 24 || r.height < 24;
        }).map(el => `${el.id || el.className}: ${el.getBoundingClientRect().width}x${el.getBoundingClientRect().height}`);
        return {width:innerWidth, scrollWidth:document.documentElement.scrollWidth,clipped,small};
      });
      if (process.env.TEST_SCREENSHOT_DIR) {
        await fs.mkdir(process.env.TEST_SCREENSHOT_DIR, {recursive:true});
        await page.screenshot({path:path.join(process.env.TEST_SCREENSHOT_DIR, `ui-${width}.png`), fullPage:false});
        await page.locator(`#event-${stages[0].id}`).screenshot({path:path.join(process.env.TEST_SCREENSHOT_DIR, `card-${width}.png`)});
      }
      console.log(`layout ${width}px: ${JSON.stringify(layout)}`);
      assert.ok(layout.scrollWidth <= layout.width, JSON.stringify(layout));
      assert.deepEqual(layout.clipped, [], '文字コンテナのはみ出し');
      assert.deepEqual(layout.small, [], '24 CSS px未満の操作対象 (44px推奨とは別の最低検知閾値)');
    } finally { await context.close(); }
  });
}
test('実DOM: 表示名未設定なら正式会場名へフォールバック', async () => {
  const context = await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Tokyo'});
  try {
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== baseURL) return route.abort();
      if (/\/data\/events\/.*\.json$/.test(url.pathname)) {
        const list = readJSON(url.pathname.slice(1)).map(ev => { const copy={...ev}; delete copy.venueDisplayName; return copy; });
        return route.fulfill({json:list});
      }
      return route.continue();
    });
    await context.addInitScript(() => {Date.now = () => new Date('2026-10-24T03:00:00Z').getTime();});
    const page = await context.newPage(); await page.goto(`${baseURL}/?noanalytics=1`);
    const card = page.locator(`#event-${stages[0].id}`); await card.waitFor();
    assert.equal(await card.locator('.venue-line').textContent(), `会場：${stages[0].venue}`);
    await card.locator('.star').first().click();
    assert.ok((await page.locator('#favoriteSchedule .favorite-meta').first().textContent()).includes(stages[0].venue));
  } finally {await context.close();}
});
