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
  test(`バックアップ操作領域 ${width}px: 移動前後・閉じるボタンは縦横44px以上、CSSバージョン・下線を確認`, {timeout:30000}, async () => {
    const {context, page, errors} = await openPage(width);
    try {
      assert.equal(await page.locator('link[rel="stylesheet"]').getAttribute('href'), 'style.css?v=20261024-1');
      const metrics = [];
      const checkLink = async locator => {
        const style = await locator.evaluate(el => {
          const css = getComputedStyle(el);
          return {id:el.id,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,underline:css.textDecorationLine,background:css.backgroundColor};
        });
        metrics.push(style);
        assert.ok(style.height >= 44 && style.width >= 44, JSON.stringify(style));
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

// Exercise the actual backup controls. Payload fixtures use independent UTF-8/Base64
// encoding so malformed input cannot accidentally use production encoder behavior.
const backupKey = 'favoritePerformers';
const backupNames = stages[0].performers.slice(0, 2);
const replacementName = stages[1].performers[0];
const encodeFixture = payload => Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
async function storageSnapshot(page) {
  return page.evaluate(() => Object.fromEntries(Object.entries(localStorage).sort(([a], [b]) => a.localeCompare(b))));
}
async function clickFavorite(page, name, add) {
  const action = add ? `${name}をお気に入りに追加` : `${name}をお気に入りから解除`;
  await page.locator('#results').getByRole('button', {name:action,exact:true}).first().click();
}
async function assertBackupState(page, keys, displayNames = keys) {
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), backupKey), keys);
  assert.equal(await page.locator('#favoritePanel').isVisible(), keys.length > 0);
  if (keys.length) {
    assert.ok((await page.locator('.favorite-summary').textContent()).startsWith(`お気に入り${keys.length}組中、`));
    for (const name of displayNames) assert.ok((await page.locator('#favoriteSchedule').textContent()).includes(name), name);
  }
  const selected = await page.locator('#results .star[aria-pressed="true"]').evaluateAll(nodes => [...new Set(nodes.map(n => n.dataset.key))].sort());
  assert.deepEqual(selected, [...keys].sort(), '星の状態も保存内容と一致');
}
async function reloadAndCheckBackup(page, keys, names = keys) {
  await page.reload();
  await page.locator(`#event-${stages[0].id}`).waitFor();
  await filterSecondStage(page);
  await assertBackupState(page, keys, names);
  assert.equal(await page.evaluate(() => localStorage.getItem('qaBackupGuard')), 'unchanged');
}
async function submitValidBackup(page, code, accept) {
  await page.locator('#backupCodeInput').fill(code);
  const confirmation = page.waitForEvent('dialog');
  const click = page.locator('#restoreBackupBtn').click();
  const dialog = await confirmation;
  assert.equal(dialog.type(), 'confirm');
  assert.equal(dialog.message(), '現在のお気に入りを上書きして復元します。よろしいですか？');
  if (accept) await dialog.accept(); else await dialog.dismiss();
  await click;
}
function backupScenario(width, name, body) {
  test(`バックアップ復元 ${width}px: ${name}`, {timeout:30000}, async () => {
    const {context,page,errors} = await openPage(width);
    try {
      await filterSecondStage(page);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), backupKey), null, '独立コンテキストから開始');
      for (const name of backupNames) await clickFavorite(page, name, true);
      await page.evaluate(() => localStorage.setItem('qaBackupGuard', 'unchanged'));
      await assertBackupState(page, backupNames);
      await page.locator('#favoriteBackupBtn').click();
      await body(page);
      assert.deepEqual(errors, [], 'ブラウザの未処理例外・警告なし');
    } finally { await context.close(); }
  });
}
const invalidBackups = [
  ['空文字', '', 'バックアップコードが空です'],
  ['空白のみ', ' \n\t ', 'バックアップコードが空です'],
  ['Base64でない文字', '%%%not-base64%%%', null],
  ['破損・切れたBase64', 'a', null],
  ['Base64の中身が不正JSON', Buffer.from('{"v":1,').toString('base64'), null],
  ['未対応バージョン', encodeFixture({v:2,favorites:['XYZ']}), 'バックアップコードの形式が正しくありません'],
  ['バージョンなし', encodeFixture({favorites:['XYZ']}), 'バックアップコードの形式が正しくありません'],
  ['favoritesなし', encodeFixture({v:1}), 'バックアップコードの形式が正しくありません'],
  ['favoritesが配列でない', encodeFixture({v:1,favorites:'XYZ'}), 'バックアップコードの形式が正しくありません'],
  ['nullペイロード', encodeFixture(null), 'バックアップコードの形式が正しくありません'],
  ['配列内の不正な数値', encodeFixture({v:1,favorites:[123]}), null],
  ['配列内の不正なオブジェクト', encodeFixture({v:1,favorites:[{}]}), null],
];
for (const width of [1280,390]) {
  backupScenario(width, '実UIで生成したコードから上書き復元・再読込', async page => {
    await page.locator('#createBackupBtn').click();
    const code = await page.locator('#backupCodeOutput').inputValue();
    assert.ok(code.length > 0);
    const payload = JSON.parse(Buffer.from(code, 'base64').toString('utf8'));
    assert.equal(payload.v, 1);
    assert.deepEqual(payload.favorites, backupNames);
    assert.ok(!Number.isNaN(Date.parse(payload.createdAt)));
    assert.equal(await page.locator('#backupCreateStatus').textContent(), 'バックアップコードを生成しました（2組）');
    await page.locator('#closeBackupBtn').click();
    for (const name of backupNames) await clickFavorite(page, name, false);
    await clickFavorite(page, replacementName, true);
    await assertBackupState(page, [replacementName]);
    await page.locator('#favoriteBackupBtn').click();
    await submitValidBackup(page, ` \n${code}\n `, true);
    assert.equal(await page.locator('#backupRestoreStatus').textContent(), 'お気に入りを復元しました（2組）');
    await assertBackupState(page, backupNames);
    assert.equal(await page.locator('#favoritesOnlyBtn').getAttribute('aria-pressed'), 'false');
    if (process.env.TEST_SCREENSHOT_DIR) {
      await page.locator('#favoritePanel').screenshot({path:path.join(process.env.TEST_SCREENSHOT_DIR, `restored-favorites-${width}.png`)});
    }
    await reloadAndCheckBackup(page, backupNames);
  });
  backupScenario(width, '復元確認の取消はlocalStorageと表示を保持', async page => {
    const before = await storageSnapshot(page);
    await submitValidBackup(page, encodeFixture({v:1,favorites:[replacementName]}), false);
    assert.deepEqual(await storageSnapshot(page), before);
    assert.equal(await page.locator('#backupRestoreStatus').textContent(), '');
    await assertBackupState(page, backupNames);
    await reloadAndCheckBackup(page, backupNames);
    assert.deepEqual(await storageSnapshot(page), before);
  });
  backupScenario(width, '重複・全角/大小文字・空白は正規化して統合', async page => {
    await submitValidBackup(page, encodeFixture({v:1,favorites:[' ＸＹＺ ', 'XYZ', 'xyz', backupNames[0], backupNames[0], '', ' \t ']}), true);
    assert.equal(await page.locator('#backupRestoreStatus').textContent(), 'お気に入りを復元しました（2組）');
    await assertBackupState(page, ['xyz',backupNames[0]], ['XYZ',backupNames[0]]);
    await reloadAndCheckBackup(page, ['xyz',backupNames[0]], ['XYZ',backupNames[0]]);
  });
  backupScenario(width, '有効な空配列は承認後に0組へ復元し保持', async page => {
    await submitValidBackup(page, encodeFixture({v:1,favorites:[]}), true);
    assert.equal(await page.locator('#backupRestoreStatus').textContent(), 'お気に入りを復元しました（0組）');
    await assertBackupState(page, []);
    await reloadAndCheckBackup(page, []);
    await page.locator('#favoriteBackupBtn').click();
    await page.locator('#createBackupBtn').click();
    assert.equal(await page.locator('#backupCodeOutput').inputValue(), '');
    assert.equal(await page.locator('#backupCreateStatus').textContent(), 'お気に入りが登録されていません');
    assert.ok((await page.locator('#backupCreateStatus').getAttribute('class')).includes('is-error'));
  });
  for (const [name, code, expectedMessage] of invalidBackups) {
    backupScenario(width, `${name}は拒否して既存データを保持`, async page => {
      const before = await storageSnapshot(page);
      const dialogs = [];
      const dismissUnexpected = async dialog => { dialogs.push(dialog.type()); await dialog.dismiss(); };
      page.on('dialog', dismissUnexpected);
      try {
        await page.locator('#backupCodeInput').fill(code);
        await page.locator('#restoreBackupBtn').click();
        const status = page.locator('#backupRestoreStatus');
        assert.ok((await status.getAttribute('class')).includes('is-error'));
        const message = await status.textContent();
        assert.ok(message.trim().length > 0);
        // Native atob/JSON/TypeError wording varies by browser; pin only app messages.
        if (expectedMessage) assert.equal(message, expectedMessage);
        assert.deepEqual(dialogs, [], '不正コードでは確認ダイアログを出さない');
        assert.deepEqual(await storageSnapshot(page), before);
        await assertBackupState(page, backupNames);
        await reloadAndCheckBackup(page, backupNames);
        assert.deepEqual(await storageSnapshot(page), before);
      } finally { page.off('dialog', dismissUnexpected); }
    });
  }
}
