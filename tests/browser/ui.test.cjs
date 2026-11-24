const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { root, readJSON } = require('../helpers/app.cjs');
// Optional: use an existing Playwright installation; never download a browser here.
const { chromium } = require('playwright');
const {scenarioEvents} = require('../helpers/november-scenario.cjs');
const {expectedPendingIDs} = require('../helpers/pending-cards.cjs');
const published = scenarioEvents();
const scenarioFiles = new Map(readJSON('data/events-index.json').files.map(file =>
  ['/data/' + file, JSON.stringify(scenarioEvents('data/' + file))]));
scenarioFiles.set('/data/events.json', JSON.stringify(published));
const stages = published.filter(e => e.date === '2026-10-30' && e.eventType === 'audition-2nd-east');
const agari = published.filter(e => e.eventType === 'agari-stage' && e.date.startsWith('2026-11'));
const decemberAgari = published.filter(e => e.eventType === 'agari-stage' && e.date.startsWith('2026-12'));
const winterFirst = published.filter(e => e.eventType === 'audition-1st-east' && e.date >= '2026-11-24' && e.date <= '2026-12-17');
let browser, server, baseURL;
before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const type = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json'}[path.extname(file)] || 'application/octet-stream';
      if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
      const scenario = req.headers['x-november-scenario'] ? scenarioFiles.get(pathname) : undefined;
      const body = scenario ?? await fs.readFile(file);
      res.writeHead(200, {'Content-Type':type}).end(body);
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
async function openPage(width, now = '2026-10-24T03:00:00Z', {live = false, query = ''} = {}) {
  const context = await browser.newContext({extraHTTPHeaders:live ? {} : {'x-november-scenario':'1'}, viewport:{width,height:844}, timezoneId:'Asia/Tokyo', isMobile:width<500, hasTouch:width<500});
  await context.route('**/*', route => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
  await context.addInitScript(now => { Date.now = () => new Date(now).getTime(); }, now);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (['error','warning'].includes(msg.type())) errors.push(msg.text()); });
  await page.goto(`${baseURL}/?noanalytics=1${query}`);
  if (now === '2026-10-24T03:00:00Z') await page.locator(`#event-${stages[0].id}`).waitFor();
  else await readySearchPage(page);
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
for(const width of [1280,390,375,320]){
  test('12月アガり '+width+'px: 30公演・907出演記録・MC/3ブロック・チケット発売日・お気に入り',{timeout:60000},async()=>{
    const {context,page,errors}=await openPage(width,'2026-11-18T03:00:00Z');
    try{
      assert.equal(decemberAgari.length,30);
      await page.locator('#eventType').selectOption('agari-stage');
      await page.locator('#month').selectOption('12');
      assert.equal(await page.locator('#results .result-card').count(),30);
      assert.equal(await page.locator('#results .lineup-block').count(),90);
      assert.equal(await page.locator('#results .lineup-block .star').count(),907);
      assert.equal(await page.locator('#results .lineup-order').count(),0);
      const first=page.locator('#event-2026-12-01-1700-agari-stage');
      assert.match(await first.locator('.event-mc').textContent(),/MC：超巨大/);
      assert.deepEqual(await first.locator('.lineup-block .star').evaluateAll(nodes=>nodes.map(n=>n.dataset.name)),decemberAgari[0].lineup.map(x=>x.name));
      assert.equal(await first.locator('.ticket-purchase-link a').getAttribute('href'),'https://ticket.fany.lol/event/detail/23033');
      assert.equal(await first.locator('.ticket-streaming-note').textContent(),'※配信はありません');
      assert.equal(await first.locator('.ticket-sale-info').textContent(),'※FANY一般発売：11月20日(金)10:00〜');
      assert.equal(await first.locator('.qualified-performers .star').count(),0,'未発表の順位を表示しない');
      const second=page.locator('#event-2026-12-01-1930-agari-stage');
      assert.match(await second.locator('.event-mc').textContent(),/MC：広島兄弟/);
      assert.equal(await second.locator('.lineup-block .star').count(),30,'黒塗りの28番は出演者に加えない');
      await page.locator('#day').selectOption('1');
      assert.equal(await page.locator('#results .result-card').count(),2);
      await page.locator('#nameQuery').fill('JJブッツ');
      await page.waitForFunction(()=>new URL(location.href).searchParams.get('name')==='JJブッツ');
      assert.equal(await page.locator('#results .result-card').count(),1);
      assert.equal(await first.locator('.star[data-name="JJブッツ"]').count(),1);
      await first.locator('.star[data-name="JJブッツ"]').click();
      assert.equal(await first.locator('.star[data-name="JJブッツ"]').getAttribute('aria-pressed'),'true');
      await page.reload();
      await readySearchPage(page);
      assert.equal(await first.locator('.star[data-name="JJブッツ"]').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('#eventType').inputValue(),'agari-stage');
      assert.equal(await page.locator('#month').inputValue(),'12');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'スマホでも横はみ出しなし');
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });
}

for(const width of [1280,390,375,320]){
  test('FANYチケット4行・文字サイズと太さの統一 '+width+'px',{timeout:60000},async()=>{
    const {context,page,errors}=await openPage(width,'2026-11-18T03:00:00Z');
    try{
      const cases=[
        ['agari-stage','11','24','2026-11-24-1700-agari-stage','※FANY一般発売：10月19日(月)10:00〜','https://ticket.fany.lol/event/detail/22035'],
        ['agari-stage','12','1','2026-12-01-1700-agari-stage','※FANY一般発売：11月20日(金)10:00〜','https://ticket.fany.lol/event/detail/23033'],
        ['audition-1st-east','11','24','2026-11-24-1600-audition-1st-east','※FANY一般発売：11月18日(水)10:00〜','https://ticket.fany.lol/event/detail/23168'],
        ['audition-1st-east','11','30','2026-11-30-1600-audition-1st-east','※FANY一般発売：11月18日(水)10:00〜','https://ticket.fany.lol/event/detail/23161'],
      ];
      for(const [eventType,month,day,id,sale,url] of cases){
        await page.locator('#eventType').selectOption(eventType);
        await page.locator('#month').selectOption(month);
        await page.locator('#day').selectOption(day);
        const note=page.locator('#event-'+id+' .ticket-note-unified');
        assert.equal(await note.count(),1,id);
        assert.deepEqual(await note.locator('.ticket-purchase-link > div').allTextContents(),[
          'チケットの購入は FANY','もしくは出演者への取り置きも可能です'
        ],id);
        assert.deepEqual(await note.evaluate(el=>[...el.children].map(n=>n.className)),[
          'ticket-purchase-link','ticket-sale-info','ticket-streaming-note'
        ],id);
        assert.equal(await note.locator('.ticket-sale-info').textContent(),sale,id);
        assert.equal(await note.locator('.ticket-streaming-note').textContent(),'※配信はありません',id);
        assert.equal(await note.locator('a').textContent(),'FANY',id);
        assert.equal(await note.locator('a').getAttribute('href'),url,id);
        const computed=await note.evaluate(el=>[
          ...el.querySelectorAll('.ticket-purchase-link > div, .ticket-purchase-link a, .ticket-sale-info, .ticket-streaming-note')
        ].map(n=>({size:getComputedStyle(n).fontSize,weight:getComputedStyle(n).fontWeight})));
        assert.ok(computed.every(x=>x.size==='12px'&&x.weight==='400'),'4行は12px・通常ウェイト: '+id+' '+JSON.stringify(computed));
      }
      await page.locator('#eventType').selectOption('kiwami-grand-battle-east');
      await page.locator('#month').selectOption('12');
      await page.locator('#day').selectOption('12');
      assert.equal(await page.locator('#results .ticket-note-unified').count(),0,'取り置き不可等の他公演へ流用しない');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'横スクロールを発生させない');
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });
}

for(const width of [1280,390,375,320]){
  test('12月の2組判読不可: 両候補で検索・1枠お気に入り・URL復元 '+width+'px',{timeout:60000},async()=>{
    const {context,page,errors}=await openPage(width,'2026-11-18T03:00:00Z');
    try{
      const cases=[
        ['agari-stage','3','2026-12-03-1930-agari-stage','ドブレーテ／ドプレーテ（判読不可）',['ドブレーテ','ドプレーテ'],'agari-20261203-1930-05'],
        ['audition-1st-east','9','2026-12-09-1830-audition-1st-east','ドプレーテ／ドブレーテ（判読不可）',['ドブレーテ','ドプレーテ'],null],
        ['agari-stage','18','2026-12-18-1930-agari-stage','ビールモンスター／ピールモンスター（判読不可）',['ビールモンスター','ピールモンスター'],'agari-20261218-1930-28'],
        ['audition-1st-east','2','2026-12-02-1830-audition-1st-east','ピールモンスター／ビールモンスター（判読不可）',['ビールモンスター','ピールモンスター'],null]
      ];
      for(const [type,day,id,label,aliases,agariKey] of cases){
        await page.locator('#eventType').selectOption(type);
        await page.locator('#month').selectOption('12');
        await page.locator('#day').selectOption(day);
        const star=page.locator('#results #event-'+id+' .star[data-name="'+label+'"]');
        for(const alias of aliases){
          await page.locator('#nameQuery').fill(alias);
          await page.waitForFunction(alias=>new URL(location.href).searchParams.get('name')===alias,alias);
          await page.locator('#results #event-'+id+' .performer.search-match .star[data-name="'+label+'"]').waitFor();
          assert.equal(await star.count(),1,'いずれの候補でも1枠: '+id+' '+alias);
          assert.match(await star.locator('..').textContent(),/判読不可/);
          assert.ok((await star.locator('..').getAttribute('class')).includes('search-match'));
        }
        if(agariKey)assert.equal(await star.getAttribute('data-key'),agariKey);
        await star.click();
        const key=await star.getAttribute('data-key');
        assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('favoritePerformers'))),[key]);
        await page.locator('#nameQuery').fill(aliases[0]);
        await star.waitFor();
        assert.equal(await star.getAttribute('aria-pressed'),'true','両候補で同じお気に入りを使用');
        await page.reload();
        await readySearchPage(page);
        await star.waitFor();
        assert.equal(await star.getAttribute('aria-pressed'),'true','再読込後も1枠として保持');
        await star.click();
        assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('favoritePerformers'))),[]);
        await page.locator('#clearBtn').click();
      }
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'横スクロールを発生させない');
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });
}

for (const width of [1280,390,375,320]) {
  test(`アガり ${width}px: 両候補検索・1枠・1お気に入り・URL復元・香盤順・ブロック（番号表示なし）`, {timeout:60000}, async () => {
    const {context,page,errors}=await openPage(width);
    try {
      await page.locator('#eventType').selectOption('agari-stage');
      await page.locator('#month').selectOption('11');
      assert.equal(await page.locator('#results .result-card').count(),30);
      assert.equal(await page.locator('#results .lineup-block .star').count(),839);
      assert.equal(await page.locator('#results .lineup-order').count(),0,'番号チップを表示しない');
      const firstEvent=agari[0];
      const firstCard=page.locator('#event-'+firstEvent.id);
      assert.deepEqual(await firstCard.locator('.lineup-block .star').evaluateAll(nodes=>nodes.map(n=>n.dataset.name)),firstEvent.lineup.map(p=>p.name),'香盤順を保持');
      assert.match(await firstCard.locator('.venue-line').textContent(),/歌舞伎町Sparkle/);
      for(const e of agari.filter(e=>e.lineup.some(p=>p.entryKey))) {
        const p=e.lineup.find(p=>p.entryKey);
        for(const alias of p.searchAliases) {
          await page.locator('#nameQuery').fill(alias);
          await page.waitForFunction(alias=>new URL(location.href).searchParams.get('name')===alias,alias);
          const card=page.locator(`#event-${e.id}`);
          const star=card.locator(`.star[data-key="${p.entryKey}"]`);
          assert.equal(await star.count(),1);
          assert.equal(await card.locator('.lineup-block').count(),3);
          assert.equal(await card.locator('.lineup-block .star').count(),e.performers.length,'順位欄の星を香盤の出演組数に加算しない');
          assert.match(await star.locator('..').textContent(),/判読不可/);
          assert.ok((await star.locator('..').getAttribute('class')).includes('search-match'));
          assert.ok((await card.textContent()).includes(`MC：${e.mc}`));
          assert.equal((await card.textContent()).split(`MC：${e.mc}`).length-1,1);
          await star.click();
          assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('favoritePerformers'))),[p.entryKey]);
          assert.match(await page.locator('.favorite-summary').textContent(),/お気に入り1組中、1組/);
          await page.locator('#favoritesOnlyBtn').click();
          assert.equal(await page.locator('#results .result-card').count(),1);
          assert.match(await page.locator('#searchResultSummary').textContent(),/今後の開催：1件/);
          const url=page.url();
          assert.equal(new URL(url).searchParams.get('eventType'),'agari-stage');
          const shared=await context.newPage(); await shared.goto(url);
          await shared.locator(`#event-${e.id}`).waitFor();
          assert.equal(await shared.locator('#nameQuery').inputValue(),alias);
          assert.equal(await shared.locator(`#event-${e.id} .star[data-key="${p.entryKey}"]`).getAttribute('aria-pressed'),'true');
          await shared.close();
          await page.reload(); await page.locator(`#event-${e.id}`).waitFor();
          assert.equal(await star.getAttribute('aria-pressed'),'true');
          await star.scrollIntoViewIfNeeded();
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'横はみ出しなし');
          const box=await star.locator('..').boundingBox(); assert.ok(box.x>=0 && box.x+box.width<=width);
          if(process.env.TEST_SCREENSHOT_DIR && alias===p.searchAliases[0])
            await page.screenshot({path:path.join(process.env.TEST_SCREENSHOT_DIR,`agari-${p.entryKey}-${width}.png`)});
          await star.click();
          assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('favoritePerformers'))),[]);
        }
      }
      assert.deepEqual(errors,[]);
    } finally { await context.close(); }
  });
  test(`実DOM ${width}px: 各部情報、検索、お気に入り、保存・解除`, {timeout:30000}, async () => {
    const {context,page,errors} = await openPage(width);
    try {
      assert.equal(new URL(page.url()).origin, baseURL);
      assert.match(await page.title(), /オーディション EAST・アガり！ステージ/);
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
        assert.equal(await card.locator('.performer-section > .performers .performer').count(), ev.performers.length);
      }
      const name = stages[0].performers[0];
      await page.locator('#nameQuery').fill(name);
      await page.waitForFunction(() => document.querySelectorAll('#results .result-card').length === 1);
      assert.equal(await page.locator('#results .result-card').getAttribute('id'), `event-${stages[0].id}`);
      const star = page.locator('#results .performer-section .star').first();
      assert.equal(await star.getAttribute('data-name'), name);
      await star.click();
      assert.equal(await star.getAttribute('aria-pressed'), 'true');
      const favorite = page.locator(`#favoriteSchedule [data-event-id="${stages[0].id}"]`);
      await favorite.waitFor();
      assert.ok(!(await favorite.locator('.favorite-meta').textContent()).includes(stages[0].venueDisplayName));
      assert.ok((await favorite.locator('.favorite-meta').textContent()).includes(stages[0].title));
      await page.locator('#favoritesOnlyBtn').click();
      assert.equal(await page.locator('#favoritesOnlyBtn').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#results .result-card').count(), 1);
      await page.reload();
      await page.locator('#favoritePanel').waitFor({state:'visible'});
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('favoritePerformers'))), [name]);
      // Reload now restores search from the URL; reset it before the three-card check.
      await page.locator('#clearBtn').click();
      await filterSecondStage(page);
      await page.locator('#favoriteSchedule [data-event-id]').first().click();
      assert.equal(await page.locator('#eventType').inputValue(), 'all');
      await page.waitForFunction(id => document.getElementById(`event-${id}`).classList.contains('is-highlighted'), stages[0].id);
      await page.locator(`#event-${stages[0].id} .performer-section .star`).first().click();
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
      assert.equal(await page.locator('link[rel="stylesheet"]').getAttribute('href'), 'style.css?v=20261119-orange-highlight');
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
      await page.locator(`#event-${stages[0].id} .performer-section .star`).first().click();
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
    const {context,page,errors} = await openPage(width);
    try {
      await filterSecondStage(page);
      await page.locator(`#event-${stages[0].id} .performer-section .star`).first().click();
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
      await page.locator('#clearBtn').click();
      const toggle = page.locator('#archiveToggleBtn');
      const rect = await toggle.boundingBox();
      assert.ok(rect && rect.height >= 44, `過去の開催: ${JSON.stringify(rect)}`);
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('#archiveBody').isHidden(), true);
      if (process.env.TEST_SCREENSHOT_DIR) {
        await page.locator('#archive').screenshot({path:path.join(process.env.TEST_SCREENSHOT_DIR, `archive-closed-${width}.png`)});
      }
      await toggle.click();
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      assert.equal(await page.locator('#archiveBody').isVisible(), true);
      assert.equal(await toggle.locator('.archive-toggle-icon').textContent(), '−');
      assert.ok(await page.locator('#archiveResults .archive-month').count() > 0);
      const archiveLayout = await page.locator('#archive').evaluate(el => ({
        width:innerWidth, scrollWidth:document.documentElement.scrollWidth,
        clipped:[...el.querySelectorAll('button, summary, .archive-message')]
          .filter(node => node.getClientRects().length && node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1)
          .map(node => node.textContent.trim()),
      }));
      assert.ok(archiveLayout.scrollWidth <= archiveLayout.width, JSON.stringify(archiveLayout));
      assert.deepEqual(archiveLayout.clipped, [], '開いたアーカイブの文字はみ出し');
      if (process.env.TEST_SCREENSHOT_DIR) {
        await page.locator('#archive').screenshot({path:path.join(process.env.TEST_SCREENSHOT_DIR, `archive-open-${width}.png`)});
      }
      await toggle.click();
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('#archiveBody').isHidden(), true);
      assert.equal(await toggle.locator('.archive-toggle-icon').textContent(), '＋');
      console.log(`archive ${width}px: height=${rect.height}; ${JSON.stringify(archiveLayout)}`);
      assert.deepEqual(errors, []);

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
    await card.locator('.performer-section .star').first().click();
    assert.ok(!(await page.locator('#favoriteSchedule .favorite-meta').first().textContent()).includes(stages[0].venue));
    assert.ok((await page.locator('#favoriteSchedule .favorite-meta').first().textContent()).includes(stages[0].title));
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
async function assertBackupFilters(page) {
  const values = await page.locator('#eventType, #month, #day').evaluateAll(inputs =>
    Object.fromEntries(inputs.map(input => [input.id, input.value])));
  assert.deepEqual(values, {eventType:'audition-2nd-east', month:'10', day:'30'});
  assert.equal(await page.locator('#results .result-card').count(), 3);
}
async function reloadAndCheckBackup(page, keys, names = keys) {
  await page.reload();
  await page.locator(`#event-${stages[0].id}`).waitFor();
  await assertBackupFilters(page);
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
    const {context,page,errors} = await openPage(width, undefined, {query:'&eventType=audition-2nd-east&month=10&day=30'});
    try {
      await assertBackupFilters(page);
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

async function readySearchPage(page) {
  await page.waitForFunction(() => document.querySelector('#results').childElementCount > 0);
}
async function openSearchURL(page, url) {
  await page.goto(url);
  await readySearchPage(page);
}
async function currentSearchControls(page) {
  return page.evaluate(() => Object.fromEntries(['nameQuery','eventType','month','day','hour'].map(id=>[id,document.getElementById(id).value])));
}
async function searchCardIDs(page, target = '#results') {
  return page.locator(`${target} .result-card`).evaluateAll(cards=>cards.map(card=>card.id));
}
async function captureNormalizedSearchURL(page) {
  await page.evaluate(() => {updateSearchURL();window.copiedSearchURL=buildSharedSearchURL(location.href,getShareableSearchFilters()).href;});
}
for (const width of [1280,320]) {
  test(`共有検索 ${width}px: 日本語・空白と複数条件のURL更新、遷移なし、再読込復元`, {timeout:30000}, async () => {
    const {context,page,errors}=await openPage(width);
    try {
      const origin=await page.evaluate(()=>performance.timeOrigin);
      const length=await page.evaluate(()=>history.length);
      await filterSecondStage(page);
      await page.locator('#hour').selectOption('13');
      await page.locator('#nameQuery').fill('  野球とサッカー  ');
      await page.waitForFunction(()=>new URL(location.href).searchParams.get('name')==='  野球とサッカー  ');
      const url=new URL(page.url());
      assert.equal(url.searchParams.get('noanalytics'),'1');
      assert.equal(url.searchParams.get('eventType'),'audition-2nd-east');
      assert.equal(url.searchParams.get('month'),'10'); assert.equal(url.searchParams.get('day'),'30'); assert.equal(url.searchParams.get('hour'),'13');
      assert.equal(await page.evaluate(()=>performance.timeOrigin),origin);
      assert.equal(await page.evaluate(()=>history.length),length);
      const controls=await currentSearchControls(page);const ids=await searchCardIDs(page);
      assert.deepEqual(ids,[`event-${stages[0].id}`]);
      await page.reload(); await readySearchPage(page);
      assert.deepEqual(await currentSearchControls(page),controls); assert.deepEqual(await searchCardIDs(page),ids);
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
  });
  test(`共有検索 ${width}px: コピーは検索のみ、★のみ・保存・バックアップ・解析フラグを漏らさない`, {timeout:30000}, async () => {
    const {context,page,errors}=await openPage(width);
    let recipient;
    try {
      await filterSecondStage(page);
      await clickFavorite(page,backupNames[0],true);
      await page.locator('#favoriteBackupBtn').click(); await page.locator('#createBackupBtn').click();
      const backup=await page.locator('#backupCodeOutput').inputValue();assert.ok(backup);
      await page.locator('#closeBackupBtn').click();
      await page.locator('#nameQuery').fill(backupNames[0]);
      await page.waitForFunction(name=>new URL(location.href).searchParams.get('name')===name,backupNames[0]);
      await page.locator('#favoritesOnlyBtn').click();
      const before=await storageSnapshot(page);
      await page.evaluate(code=>history.replaceState(null,'',`${location.pathname}?noanalytics=1&favoritePerformers=SECRET&backup=${encodeURIComponent(code)}#private`),backup);
      await captureNormalizedSearchURL(page);
      const copied=await page.evaluate(()=>window.copiedSearchURL);const shared=new URL(copied);
      assert.deepEqual([...shared.searchParams.keys()],['name','eventType','month','day']);
      assert.equal(shared.hash,'');assert.equal(shared.searchParams.get('noanalytics'),null);
      assert.ok(!copied.includes('SECRET'));assert.ok(!copied.includes(backup));
      assert.deepEqual(await storageSnapshot(page),before);
      assert.equal(await page.locator('#favoritesOnlyBtn').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('#shareSearchBtn, #shareSearchFallback, #shareSearchNote').count(),0);
      recipient=await openPage(width);
      // Shared URLs intentionally omit noanalytics; satisfy analytics scripts locally
      // without network traffic or console noise in this separate empty context.
      await recipient.context.route('**/*', route=>new URL(route.request().url()).origin===baseURL
        ? route.continue() : route.fulfill({body:'',contentType:'text/javascript'}));
      await openSearchURL(recipient.page,copied);
      assert.equal(await recipient.page.locator('#nameQuery').inputValue(),backupNames[0]);
      assert.deepEqual(await searchCardIDs(recipient.page),[`event-${stages[0].id}`]);
      assert.equal(await recipient.page.locator('#favoritesOnlyBtn').getAttribute('aria-pressed'),'false');
      assert.equal(await recipient.page.evaluate(()=>localStorage.getItem('favoritePerformers')),null);
      assert.equal(await recipient.page.locator('#favoritePanel').isHidden(),true);
      assert.deepEqual(errors,[]);assert.deepEqual(recipient.errors,[]);
    } finally {if(recipient)await recipient.context.close();await context.close();}
  });
  test(`共有検索 ${width}px: 不正・未知・重複パラメータを無視し、条件クリアで検索パラメータを除去`, {timeout:30000}, async () => {
    const {context,page,errors}=await openPage(width);
    try {
      await openSearchURL(page,`${baseURL}/?noanalytics=1&name=a&name=b&eventType=unknown&month=13&day=-1&hour=NaN&favoritesOnly=1&backup=SECRET`);
      assert.deepEqual(await currentSearchControls(page),{nameQuery:'',eventType:'all',month:'all',day:'all',hour:'all'});
      assert.equal(new URL(page.url()).search,'?noanalytics=1');
      const malicious='<img src=x onerror="window.searchXSS=true"> 日本語 空白';
      await openSearchURL(page,`${baseURL}/?noanalytics=1&name=${encodeURIComponent(malicious)}&month=10`);
      assert.equal(await page.locator('#nameQuery').inputValue(),malicious);
      assert.equal(await page.evaluate(()=>window.searchXSS),undefined);
      await openSearchURL(page,`${baseURL}/?noanalytics=1&name=%E0%A4%A&day=30&day=31`);
      assert.equal(await page.locator('#day').inputValue(),'all');
      await page.locator('#clearBtn').click();
      assert.equal(new URL(page.url()).search,'?noanalytics=1');
      assert.deepEqual(await currentSearchControls(page),{nameQuery:'',eventType:'all',month:'all',day:'all',hour:'all'});
      assert.ok((await searchCardIDs(page)).length>0); assert.deepEqual(errors,[]);
    } finally {await context.close();}
  });
  for (const mode of ['missing','rejected']) {
    test(`URL検索 ${width}px: clipboard ${mode}でもURL更新、共有UI・参照は存在しない`,{timeout:30000},async()=>{
      const {context,page,errors}=await openPage(width);
      try {
        await page.evaluate(mode=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:mode==='missing'?undefined:{writeText:async()=>{throw new Error('denied');}}}),mode);
        await page.locator('#nameQuery').fill(' 日本語 空白 ');
        await page.waitForFunction(()=>new URL(location.href).searchParams.get('name')===' 日本語 空白 ');
        assert.equal(await page.locator('#shareSearchBtn,#shareSearchStatus,#shareSearchFallback,#shareSearchURL,[aria-describedby="shareSearchNote"]').count(),0);
        await page.reload();await readySearchPage(page);
        assert.equal(await page.locator('#nameQuery').inputValue(),' 日本語 空白 ');
        await page.locator('#clearBtn').click();assert.equal(new URL(page.url()).search,'?noanalytics=1');
        assert.deepEqual(errors,[]);
      } finally {await context.close();}
    });
  }
  test(`共有検索 ${width}px: 初期表示・条件変更・クリアは#contact保持、コピーには含めない`, {timeout:30000}, async () => {
    const {context,page,errors}=await openPage(width);
    try {
      await openSearchURL(page,`${baseURL}/?noanalytics=1&month=10&unknown=drop#contact`);
      assert.equal(new URL(page.url()).hash,'#contact');
      assert.equal(new URL(page.url()).searchParams.get('unknown'),null);
      assert.equal(await page.locator('script[src^="script.js?"]').getAttribute('src'),'script.js?v=20261120-sarani-ticket-four-lines');
      await page.locator('#day').selectOption('30');
      await page.locator('#nameQuery').fill(backupNames[0]);
      await page.waitForFunction(name=>new URL(location.href).searchParams.get('name')===name,backupNames[0]);
      assert.equal(new URL(page.url()).hash,'#contact');
      await clickFavorite(page,backupNames[0],true);
      await page.locator('#favoritesOnlyBtn').click();
      const before=await storageSnapshot(page);
      await captureNormalizedSearchURL(page);
      const copied=new URL(await page.evaluate(()=>window.copiedSearchURL));
      assert.deepEqual([...copied.searchParams.keys()],['name','month','day']);
      assert.equal(copied.hash,'');assert.equal(copied.searchParams.get('noanalytics'),null);
      assert.equal(copied.searchParams.get('favoritePerformers'),null);
      assert.equal(copied.searchParams.get('favoritesOnly'),null);
      assert.equal(copied.searchParams.get('backup'),null);
      assert.equal(new URL(page.url()).hash,'#contact');
      assert.deepEqual(await storageSnapshot(page),before);
      await page.locator('#clearBtn').click();
      assert.equal(new URL(page.url()).search,'?noanalytics=1');
      assert.equal(new URL(page.url()).hash,'#contact');
      assert.equal(await page.locator('#favoritesOnlyBtn').getAttribute('aria-pressed'),'false');
      await page.reload();await readySearchPage(page);
      assert.equal(new URL(page.url()).hash,'#contact');
      assert.equal(new URL(page.url()).search,'?noanalytics=1');
      assert.deepEqual(await storageSnapshot(page),before);assert.deepEqual(errors,[]);
    } finally {await context.close();}
  });
  test(`共有検索 ${width}px: 過去公演の再現とランダム芸人検索もURLを更新`, {timeout:30000}, async () => {
    const {context,page,errors}=await openPage(width);
    try {
      await openSearchURL(page,`${baseURL}/?noanalytics=1&eventType=audition-1st-east&month=4`);
      assert.equal(await page.locator('#archiveBody').isVisible(),true);
      const archive=await searchCardIDs(page,'#archiveResults');assert.ok(archive.length>0);
      await page.reload();await readySearchPage(page);
      assert.deepEqual(await searchCardIDs(page,'#archiveResults'),archive);
      await page.locator('#randomPerformerBtn').click();
      const selected=await page.locator('#nameQuery').inputValue();assert.ok(selected);
      const url=new URL(page.url());assert.equal(url.searchParams.get('name'),selected);
      assert.deepEqual([...url.searchParams.keys()],['name','noanalytics']);
      const ids=await searchCardIDs(page);
      await page.reload();await readySearchPage(page);
      assert.equal(await page.locator('#nameQuery').inputValue(),selected);
      assert.deepEqual(await searchCardIDs(page),ids);assert.deepEqual(errors,[]);
    } finally {await context.close();}
  });
}

for (const width of [1280,390,375,320]) {
  test(`10/30公式結果 ${width}px: 過去の極6・翔15を保持、未来予定は12月分とアガり香盤`, {timeout:30000}, async () => {
    const {context,page,errors} = await openPage(width);
    const expected = readJSON('tests/fixtures/2026-10-30-stage-results.json');
    try {
      // Change only this test's clock; existing regression cases retain their own date.
      await page.evaluate(() => { Date.now = () => new Date('2026-11-07T03:00:00Z').getTime(); runSearch(); });
      await assertUnfilteredCards(page, '2026-11-07');
      await page.locator('#eventType').selectOption('audition-2nd-east');
      await page.locator('#month').selectOption('10');
      await page.locator('#day').selectOption('30');
      assert.equal(await page.locator('#archiveBody').isVisible(),true);
      assert.equal(await page.locator('#archiveResults .result-card').count(),3);
      const totals = [0,0];
      for (const [index, event] of stages.entries()) {
        const card = page.locator(`#archiveResults #event-${event.id}`);
        const groups = card.locator('.qualified-performers');
        assert.equal(await groups.count(),2);
        for (const [categoryIndex,result] of expected.events[index].results.entries()) {
          const group = groups.nth(categoryIndex);
          assert.equal(await group.locator('.card-section-label').textContent(),result.label);
          const names = await group.locator('.star').evaluateAll(nodes=>nodes.map(node=>node.dataset.name));
          assert.deepEqual(names,result.performers);
          totals[categoryIndex] += names.length;
          assert.equal(await group.locator('.qualified-none').count(),result.performers.length ? 0 : 1);
          if(!result.performers.length) assert.equal(await group.locator('.qualified-none').textContent(),'該当者なし');
        }
        assert.deepEqual(await card.locator('.performer-section > .performers .star').evaluateAll(nodes=>nodes.map(node=>node.dataset.name)),event.performers);
        assert.equal(await card.locator('.venue-line').textContent(),`会場：${event.venueDisplayName}`);
      }
      assert.deepEqual(totals,[6,15]);
      assert.equal(await page.locator('#archiveResults .additional-qualified-badge').count(),17,'1st→2ndの追加区分を保持');
      if(process.env.TEST_SCREENSHOT_DIR) await page.locator('#archiveResults').screenshot({path:path.join(process.env.TEST_SCREENSHOT_DIR,`oct30-results-${width}.png`)});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const clipped = await page.locator('#archiveResults .performer, #archiveResults .card-section-label').evaluateAll(nodes=>nodes.filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>el.textContent));
      assert.deepEqual(clipped,[]);
      const winner = page.locator(`#event-${stages[0].id} .qualified-performers`).first().locator('.star');
      await winner.click();
      assert.equal(await winner.getAttribute('aria-pressed'),'true');
      await page.locator('#clearBtn').click();
      await assertUnfilteredCards(page, '2026-11-07');
      assert.equal(await page.locator('#favoriteSchedule .favorite-jump-btn').count(),3,'パピヨンの出演情報4件のうち先頭3件だけを折りたたみ表示');
      const favoriteDetails=await page.locator('#favoriteSchedule').textContent();
      assert.ok(!favoriteDetails.includes('出演部未定'),'日時の確定したサラに！が先頭3件に並ぶ');
      assert.ok(favoriteDetails.includes('サラに！アガり！ステージ'),'11/27の確定予定を先頭に表示');
      assert.ok(favoriteDetails.includes('11月27日(金) 開演17:00'),'お気に入りにも開催日時を表示');
      await page.locator('#favoriteScheduleToggleBtn').click();
      assert.equal(await page.locator('#favoriteSchedule .favorite-jump-btn').count(),4,'12/9アガり、12/14 1st、極進出、サラに！出場権の4件');
      const expandedFavoriteDetails=await page.locator('#favoriteSchedule').textContent();
      assert.ok(expandedFavoriteDetails.includes('サラに！アガり！ステージ'));
      assert.ok(!expandedFavoriteDetails.includes('出演日時未確認'),'確定済みの11/27を未確認扱いしない');
      assert.ok(expandedFavoriteDetails.includes('出演部未定'),'未確定の極EASTの出演部は維持');
      assert.equal(await page.locator('#favoriteSchedule .favorite-summary').textContent(),'お気に入り1組中、1組の出演情報があります');
      assert.deepEqual(errors,[]);
    } finally { await context.close(); }
  });
}

async function assertVisibleCounts(page) {
  // Open the archive to compare the summary to every matching rendered card.
  if(await page.locator('#archiveBody').isHidden()) await page.locator('#archiveToggleBtn').click();
  const future=await page.locator('#results .result-card:not(.pending-stage-card)').count();
  const pending=await page.locator('#results .pending-stage-card').count();
  const past=await page.locator('#archiveResults .result-card').count();
  assert.equal(await page.locator('#searchResultSummary').textContent(),`今後の開催：${future}件 ／ 進出者・出演予定者一覧：${pending}件 ／ 過去の開催：${past}件`);
  return {future,pending,past};
}
async function assertUnfilteredCards(page, today, catalog = published) {
  await assertVisibleCounts(page);
  const future = [];
  const past = [];
  for (const event of catalog) {
    const section = (event.dateEnd || event.date) < today ? past : future;
    section.push('event-' + event.id);
  }

  const pending = expectedPendingIDs(catalog, today);

  async function cardIDs(selector) {
    return page.locator(selector).evaluateAll(cards => cards.map(card => card.id).sort());
  }
  assert.deepEqual(await cardIDs('#results .result-card:not(.pending-stage-card)'), future.sort(), today + ' 今後');
  assert.deepEqual(await cardIDs('#results .pending-stage-card'), pending.sort(), today + ' 進出先');
  assert.deepEqual(await cardIDs('#archiveResults .result-card'), past.sort(), today + ' 過去');
}
for (const width of [1280,390,375,320]) {
  test(`掲載中の全公演と進出先を実DOMで照合 ${width}px`, async () => {
    const {context, page, errors} = await openPage(width, undefined, {live:true});
    try {
      await assertUnfilteredCards(page, '2026-10-24', readJSON('data/events.json'));
      const ranks = await page.locator('.result-card:not(.pending-stage-card)').evaluateAll(cards =>
        Object.fromEntries(cards.map(card => [card.id, Array.from(card.querySelectorAll('.qualified-performers'), section =>
          Array.from(section.querySelectorAll('.star'), star => star.dataset.name))])));
      for (const [id, entry] of Object.entries(readJSON('tests/audit/announcements.json').events)) {
        if (entry.ranks) assert.deepEqual(ranks['event-' + id], entry.ranks, id);
        if (!entry.stageResults && (entry.qualifiedResult === 'none' || entry.qualifiedPerformers || entry.additionalQualifiedPerformers)) {
          // An announced result with no qualifiers still has a result section.
          // Unlike an unannounced result, it must display an explicit empty-state message.
          const sections = [
            ...(entry.qualifiedResult === 'none' ? [[]] : entry.qualifiedPerformers?.length ? [entry.qualifiedPerformers] : []),
            ...(entry.additionalQualifiedPerformers?.length ? [entry.additionalQualifiedPerformers] : []),
          ];
          assert.deepEqual(ranks['event-' + id], sections, id);
          const groups = page.locator(`#event-${id} .qualified-performers`);
          assert.equal(await groups.locator('.qualified-none').count(), entry.qualifiedResult === 'none' ? 1 : 0, id + ' 合格結果の空欄表示');
          if (entry.qualifiedResult === 'none') {
            assert.equal(await groups.first().locator('.qualified-none').textContent(), '該当者なし', id);
          }
        }
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  });
}
async function assertMatchChips(page) {
  const state=await page.evaluate(()=>{
    const query=getCurrentFilters().nameQuery;
    return [...document.querySelectorAll('#results .performer, #archiveResults .performer')].map(chip=>({
      expected:performerMatchesNameQuery(chip.querySelector('.star').dataset.name,query),
      actual:chip.classList.contains('search-match'),
      description:chip.querySelector('.visually-hidden')?.textContent,
    }));
  });
  for(const chip of state){assert.equal(chip.actual,chip.expected);if(chip.expected)assert.equal(chip.description,'（芸人名の検索条件に一致）');}
  return state.filter(c=>c.actual).length;
}
for(const width of [1280,390,375,320]) {
  test(`結果視認性 ${width}px: 実データの件数・正規化一致・お気に入り・URL復元・クリア・0件`,{timeout:30000},async()=>{
    const {context,page,errors}=await openPage(width);
    try {
      await assertUnfilteredCards(page, '2026-10-24');
      assert.equal(await page.locator('#searchMatchLegend').count(),0);
      assert.equal(await assertMatchChips(page),0);
      await page.locator('#nameQuery').fill(' ｚａｚｙ ');
      await page.waitForFunction(()=>getCurrentFilters().nameQuery==='zazy'&&document.querySelector('.search-match'));
      await page.locator('#month').selectOption('10');await page.locator('#day').selectOption('30');
      assert.deepEqual(await assertVisibleCounts(page),{future:1,pending:0,past:0});
      assert.ok(await assertMatchChips(page)>0);
      const chip=page.locator('#results .performer-section .search-match').first();
      const profile=await chip.locator('.performer-profile-link').getAttribute('href');
      const order=await page.locator('#results .performer-section .star').evaluateAll(nodes=>nodes.map(n=>n.dataset.name));
      const matchedBeforeFavorite = await page.locator('#results .search-match').count();
      assert.ok(matchedBeforeFavorite >= 2, 'ZAZY is listed in lineup and 2nd-stage results');
      await chip.locator('.star').focus();await page.keyboard.press('Enter');
      assert.equal(await page.locator('#results .search-match.favorite').count(),matchedBeforeFavorite);
      assert.equal(await chip.locator('.star').getAttribute('aria-pressed'),'true');
      assert.deepEqual(await page.locator('#results .performer-section .star').evaluateAll(nodes=>nodes.map(n=>n.dataset.name)),order);
      assert.equal(await chip.locator('.performer-profile-link').getAttribute('href'),profile);
      const colors=await chip.evaluate(el=>({bg:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).outlineColor}));
      assert.equal(colors.bg,'rgb(255, 245, 157)');assert.equal(colors.border,'rgb(198, 83, 0)');
      assert.ok((await chip.locator('.performer-name-text').evaluate(el=>getComputedStyle(el).textDecorationLine)).includes('underline'));
      assert.equal(await page.locator('#searchMatchLegend').count(),0);
      await page.reload();await readySearchPage(page);
      assert.equal(await page.locator('#nameQuery').inputValue(),' ｚａｚｙ ');
      await assertVisibleCounts(page);assert.ok(await assertMatchChips(page)>0);
      assert.equal(await page.locator('#searchResultSummary').getAttribute('role'),'status');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const overflow=await page.locator('#results .performer').evaluateAll(nodes=>nodes.filter(el=>el.scrollWidth>el.clientWidth+1).length);
      assert.equal(overflow,0);
      for(const id of ['clearBtn','favoriteBackupBtn','archiveToggleBtn']) {const rect=await page.locator('#'+id).boundingBox();assert.ok(rect.height>=44&&rect.width>=44,id);}
      if(process.env.TEST_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.TEST_SCREENSHOT_DIR,`visibility-${width}.png`),fullPage:true});
      await page.locator('#clearBtn').click();assert.equal(await assertMatchChips(page),0);
      assert.equal(await page.locator('#searchMatchLegend').count(),0);
      await page.locator('#nameQuery').fill('存在しない視認性テスト');
      await page.waitForFunction(()=>document.querySelector('#searchResultSummary').textContent==='今後の開催：0件 ／ 進出者・出演予定者一覧：0件 ／ 過去の開催：0件');
      assert.deepEqual(await assertVisibleCounts(page),{future:0,pending:0,past:0});assert.deepEqual(errors,[]);
    } finally {await context.close();}
  });
  test(`結果視認性 ${width}px: 過去のみ・改名表記・日本語部分一致`,{timeout:30000},async()=>{
    const {context,page,errors}=await openPage(width);
    try {
      await openSearchURL(page,`${baseURL}/?noanalytics=1&name=${encodeURIComponent('竹迫ゆうじ')}&month=4`);
      const counts=await assertVisibleCounts(page);assert.equal(counts.future,0);assert.equal(counts.pending,0);assert.ok(counts.past>0);
      assert.ok(await assertMatchChips(page)>0);assert.equal(await page.locator('#archiveBody').isVisible(),true);
      await page.locator('#clearBtn').click();await page.locator('#nameQuery').fill('野球');
      await page.waitForFunction(()=>getCurrentFilters().nameQuery==='野球'&&document.querySelector('.search-match'));
      await assertVisibleCounts(page);assert.ok(await assertMatchChips(page)>0);assert.deepEqual(errors,[]);
    } finally {await context.close();}
  });
  test(`結果視認性 ${width}px: 合成データで進出一覧のみ・複数セッション・安全な名前表示`,{timeout:30000},async()=>{
    const {context,page,errors}=await openPage(width);
    try {
      // In-memory fixture only: never writes any production JSON.
      await page.evaluate(()=>{
        events=[
          {id:'qa-source',date:'2026-10-01',month:10,day:1,time:'13:00',timeMinutes:780,eventType:'audition-1st-east',title:'検証用進出元',performers:['テストＡ'],qualifiedPerformers:['テストＡ'],additionalQualifiedPerformers:['テストＢ'],qualifiedNextStageDate:'2026-11-01'},
          {id:'qa-sessions',date:'2026-12-01',dateEnd:'2026-12-02',month:12,day:1,time:'13:00',eventType:'standup',title:'検証用複数セッション',performers:[],sessions:[{date:'2026-12-01',time:'13:00',performers:['テストＡ','別の出演者']},{date:'2026-12-02',time:'19:00',performers:['テストＡ','<img src=x onerror="window.visibilityXSS=true">']}]}
        ];runSearch();
      });
      assert.deepEqual(await assertVisibleCounts(page),{future:1,pending:1,past:1});
      await page.locator('#month').selectOption('11');await page.locator('#nameQuery').fill(' テストａ ');
      await page.waitForFunction(()=>document.querySelector('#results .search-match'));
      assert.deepEqual(await assertVisibleCounts(page),{future:0,pending:1,past:0});assert.equal(await assertMatchChips(page),1);
      await page.locator('#clearBtn').click();await page.locator('#month').selectOption('12');await page.locator('#nameQuery').fill('テスト');
      await page.waitForFunction(()=>document.querySelectorAll('#results .search-match').length===2);
      assert.deepEqual(await assertVisibleCounts(page),{future:1,pending:0,past:0});assert.equal(await assertMatchChips(page),2);
      assert.equal(await page.locator('#results .event-session-row').count(),2);
      assert.equal(await page.locator('#results .performer').count(),4);
      assert.equal(await page.evaluate(()=>window.visibilityXSS),undefined);assert.equal(await page.locator('#results img').count(),0);
      await page.locator('#clearBtn').click();assert.equal(await assertMatchChips(page),0);
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
  });
}

for (const width of [1280, 320]) {
  test(`検索案内文 ${width}px: 進出一覧・過去公演が共存するときは過去のみと誤案内しない`, {timeout:30000}, async () => {
    const {context,page,errors}=await openPage(width);
    try {
      await page.evaluate(() => {
        events=[{
          id:'qa-past-qualified',eventType:'audition-1st-east',
          date:'2026-10-01',month:10,day:1,time:'13:00',timeMinutes:780,
          title:'合成データ: 過去開催',performers:['検証芸人'],
          qualifiedPerformers:['検証芸人'],qualifiedNextStageDate:'2026-11-01',
        }];
        document.getElementById('nameQuery').value='検証芸人';
        runSearch();
      });
      assert.equal(await page.locator('#results .pending-stage-card').count(),1);
      assert.equal(await page.locator('#results .result-card:not(.pending-stage-card)').count(),0);
      assert.equal(await page.locator('#archiveBody').isHidden(),true);
      assert.equal(await page.locator('#archiveMessage').textContent(),'過去の開催にも該当があります。');
      assert.equal(await page.locator('#searchResultSummary').textContent(),'今後の開催：0件 ／ 進出者・出演予定者一覧：1件 ／ 過去の開催：1件');
      await page.locator('#archiveToggleBtn').click();
      assert.equal(await page.locator('#archiveBody').isVisible(),true);
      await page.evaluate(() => runSearch());
      assert.equal(await page.locator('#archiveBody').isVisible(),true,'manual archive state preserved');
      assert.equal(await page.locator('#archiveMessage').textContent(),'過去の開催にも該当があります。');
      await page.evaluate(() => {
        delete events[0].qualifiedPerformers;
        delete events[0].qualifiedNextStageDate;
        runSearch();
      });
      assert.equal(await page.locator('#results .pending-stage-card').count(),0);
      assert.equal(await page.locator('#archiveMessage').textContent(),'今後の開催には該当がありません。過去の開催に該当があります。');
      assert.equal(await page.locator('#searchResultSummary').textContent(),'今後の開催：0件 ／ 進出者・出演予定者一覧：0件 ／ 過去の開催：1件');
      // Simulate a temporarily closed archive without invoking the click handler:
      // the existing click handler itself runs search and auto-opens past-only results.
      await page.evaluate(() => setArchiveOpen(false));
      assert.equal(await page.locator('#archiveBody').isHidden(),true);
      await page.evaluate(() => runSearch());
      assert.equal(await page.locator('#archiveBody').isVisible(),true,'past-only reopens archive');
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
  });
}

for(const width of [1280,390,375,320]) {
  test(`11月12月 ${width}px: 過去の翔15組・所属3組、12月4枠と未割当6組の1枚を分離`,{timeout:30000},async()=>{
    const {context,page,errors}=await openPage(width,'2026-11-08T03:00:00Z');
    const f=readJSON('tests/fixtures/2026-nov-dec-audition-path.json');
    try {
      assert.equal(new URL(page.url()).origin,baseURL);assert.match(await page.title(),/オーディション EAST・アガり！ステージ/);
      assert.equal(await page.locator('vite-error-overlay, nextjs-portal').count(),0);
      await assertUnfilteredCards(page, '2026-11-08');
      const pending=page.locator('#results .lineup-overview-card');assert.equal(await pending.count(),1);
      assert.equal(await pending.locator('h3').textContent(),'グランドバトルEAST');
      assert.match(await pending.locator('.lineup-overview-heading').textContent(),/2ndステージからの進出者/);
      assert.equal(await pending.locator('.lineup-overview-heading strong').textContent(),'6組');
      assert.deepEqual((await pending.locator('.star').evaluateAll(nodes=>nodes.map(n=>n.dataset.name))).sort(),[...f.auditionKiwami].sort());
      const note=await pending.locator('.lineup-overview-note').textContent();
      assert.equal(note.trim(),"※出演部は更新時点では未定です");assert.match(await pending.textContent(),/12月12日・12月13日に計4公演/);
      assert.match(await pending.textContent(),/12月12日\(土\) 17:00/);assert.match(await pending.textContent(),/12月13日\(日\) 20:15/);
      for(const [i,id] of f.decemberEventIds.entries()){const card=page.locator('#event-'+id);assert.equal(await card.locator('.star').count(),0);assert.match(await card.textContent(),/※出演部は更新時点では未定です/);assert.equal(await card.locator('.ticket-purchase-link a').getAttribute('href'),f.decemberTicketURLs[i]);}
      await page.locator('#month').selectOption('12');await page.locator('#day').selectOption('13');await page.locator('#hour').selectOption('20');
      assert.deepEqual(await assertVisibleCounts(page),{future:1,pending:1,past:0});
      assert.equal(await page.locator('#results .result-card:not(.pending-stage-card)').getAttribute('id'),'event-'+f.decemberEventIds[3]);
      assert.match(await pending.textContent(),/この日時への出演確定を示すものではありません/);
      assert.match(await pending.textContent(),/計4公演/);
      if(process.env.TEST_SCREENSHOT_DIR)await page.locator('#results').screenshot({path:path.join(process.env.TEST_SCREENSHOT_DIR,`dec-date-filter-${width}.png`)});
      await page.locator('#day').selectOption('14');
      assert.deepEqual(await assertVisibleCounts(page),{future:0,pending:0,past:0},'20時指定のままでは16:00と18:30の新規1stはヒットしない');
      await page.locator('#hour').selectOption('all');
      assert.deepEqual(await assertVisibleCounts(page),{future:4,pending:0,past:0},'時間条件を解除すると12/14の新規1stとアガり計4公演表示される');
      await page.locator('#clearBtn').click();await page.locator('#month').selectOption('11');await page.locator('#day').selectOption('6');
      assert.deepEqual(await assertVisibleCounts(page),{future:0,pending:0,past:3});
      const november=page.locator('#archiveResults #event-'+f.novemberEventId);
      const names=await november.locator('.performer-section .star').evaluateAll(nodes=>nodes.map(n=>n.dataset.name));
      assert.deepEqual(names,f.auditionKakeru);assert.equal(names.length,15);

      assert.match(await november.locator('.performer-section > .card-section-label').textContent(),/香盤順未確認/);
      assert.match(await november.textContent(),/記載順は香盤順ではありません/);
      assert.equal(await november.locator('.qualified-performers .card-section-label').textContent(),'劇場所属');
      assert.match(await november.locator('.event-notice').textContent(),/2026年12月からKakeru翔所属/);
      assert.deepEqual((await november.locator('.qualified-performers .star').evaluateAll(nodes=>nodes.map(n=>n.dataset.name))).sort(),[...f.promoted].sort());
      if(process.env.TEST_SCREENSHOT_DIR)await november.screenshot({path:path.join(process.env.TEST_SCREENSHOT_DIR,`nov-result-${width}.png`)});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const clipped=await november.locator('.performer, .card-section-label, .event-notice, h3').evaluateAll(nodes=>nodes.filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>el.textContent));assert.deepEqual(clipped,[]);
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
  });
  test(`11月12月 ${width}px: 芸人名・★・日時・共有URLも出演部未定のまま、2日目のお気に入りを保持`,{timeout:30000},async()=>{
    const {context,page,errors}=await openPage(width,'2026-11-08T03:00:00Z');
    const f=readJSON('tests/fixtures/2026-nov-dec-audition-path.json');
    try {
      await page.locator('#nameQuery').fill(' ＺＡＺＹ ');
      await page.waitForFunction(()=>getCurrentFilters().nameQuery==='zazy'&&document.querySelectorAll('#results .pending-stage-card .star').length===1);
      await page.locator('#month').selectOption('12');await page.locator('#day').selectOption('13');await page.locator('#hour').selectOption('20');
      assert.deepEqual(await assertVisibleCounts(page),{future:0,pending:1,past:0});
      const pending=page.locator('#results .pending-stage-card');
      assert.equal(await pending.locator('.lineup-overview-heading strong').textContent(),'6組');
      assert.match(await pending.textContent(),/検索条件に一致：1組（進出者全6組）/);
      assert.equal(await pending.locator('.search-match .star').getAttribute('data-name'),'ZAZY');
      const star=pending.locator('.star');await star.focus();await page.keyboard.press('Enter');
      assert.equal(await star.getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('#favoriteSchedule .favorite-jump-btn').count(),1);
      assert.match(await page.locator('#favoriteSchedule').textContent(),/出演部未定/);
      assert.equal(await page.locator('#favoriteSchedule [data-event-id^="2026-12-"]').count(),0);
      await page.locator('#favoritesOnlyBtn').click();assert.deepEqual(await assertVisibleCounts(page),{future:0,pending:1,past:0});
      await captureNormalizedSearchURL(page);
      const copied=await page.evaluate(()=>window.copiedSearchURL);const url=new URL(copied);
      assert.deepEqual([...url.searchParams.keys()],['name','month','day','hour']);assert.equal(url.hash,'');
      assert.equal(url.searchParams.get('noanalytics'),null);assert.equal(url.searchParams.get('favoritesOnly'),null);
      const saved=await storageSnapshot(page);
      await page.reload();await readySearchPage(page);
      assert.deepEqual(await currentSearchControls(page),{nameQuery:' ＺＡＺＹ ',eventType:'all',month:'12',day:'13',hour:'20'});
      assert.deepEqual(await assertVisibleCounts(page),{future:0,pending:1,past:0});assert.deepEqual(await storageSnapshot(page),saved);
      await page.evaluate(()=>{Date.now=()=>new Date('2026-12-13T03:00:00Z').getTime();renderFavoriteSchedule();runSearch();});
      assert.equal(await page.locator('#favoriteSchedule .favorite-jump-btn').count(),1);
      assert.equal(await page.locator('#results .pending-stage-card').count(),1);
      for(const id of ['clearBtn','favoriteBackupBtn','archiveToggleBtn']){const box=await page.locator('#'+id).boundingBox();assert.ok(box.width>=44&&box.height>=44,id);}
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const clipped=await pending.locator('.performer, .pending-stage-note, .lineup-overview-heading, h3').evaluateAll(nodes=>nodes.filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>el.textContent));assert.deepEqual(clipped,[]);
      if(process.env.TEST_SCREENSHOT_DIR)await page.locator('#results').screenshot({path:path.join(process.env.TEST_SCREENSHOT_DIR,`dec-name-favorite-${width}.png`)});
      const recipient=await openPage(width,'2026-11-08T03:00:00Z');
      try {
        await recipient.page.goto(copied+'&noanalytics=1');await readySearchPage(recipient.page);
        assert.equal(await recipient.page.locator('#favoritePanel').isHidden(),true);
        assert.deepEqual(await assertVisibleCounts(recipient.page),{future:0,pending:1,past:0});
        assert.equal(await recipient.page.locator('#results .pending-stage-card .star').getAttribute('data-name'),'ZAZY');
      } finally {await recipient.context.close();}
      await page.locator('#clearBtn').click();
      await assertUnfilteredCards(page, '2026-12-13');
      assert.deepEqual(errors,[]);
    } finally {await context.close();}
  });
}

for(const width of [1280,320]){
  test('アガり結果 '+width+'px: 28公演結果・3位同順位・サラに出場権・FANY共通リンク',{timeout:30000},async()=>{
    const {context,page,errors}=await openPage(width,'2026-11-18T03:00:00Z');
    try{
      const rights=page.locator('#results .pending-stage-card').filter({hasText:'サラに！アガり！ステージ'});
      assert.equal(await rights.count(),1);
      assert.match(await rights.textContent(),/出場権獲得者/);
      assert.match(await rights.textContent(),/11月27日\(金\) 開演17:00/);
      assert.equal(await rights.locator('.venue-line').textContent(),'会場：歌舞伎町Sparkle');
      assert.equal(await rights.locator('.ticket-purchase-link a').getAttribute('href'),'https://ticket.fany.lol/reception/70947/55946');
      const ticketNote=rights.locator('.ticket-note-unified');
      assert.equal(await ticketNote.count(),1,'アガり！と同じチケット案内を1回表示');
      assert.equal(await rights.locator('.ticket-purchase-link a').textContent(),'FANY');
      assert.deepEqual(await ticketNote.locator('.ticket-purchase-link > div').allTextContents(),['チケットの購入は FANY','もしくは出演者への取り置きも可能です']);
      assert.equal(await rights.locator('.ticket-sale-info').textContent(),'※FANY一般発売：11月20日(金)10:00〜');
      assert.equal(await rights.locator('.ticket-streaming-note').textContent(),'※配信はありません');
      assert.deepEqual(await ticketNote.locator('.ticket-purchase-link, .ticket-sale-info, .ticket-streaming-note').evaluateAll(nodes=>nodes.map(el=>el.className)),['ticket-purchase-link','ticket-sale-info','ticket-streaming-note']);
      assert.equal(await rights.locator('.star').count(),28);
      await page.locator('#eventType').selectOption('agari-stage');
      await page.locator('#month').selectOption('11');
      await page.locator('#day').selectOption('4');
      const e=page.locator('#archiveResults #event-2026-11-04-1930-agari-stage');
      assert.equal(await e.locator('.qualified-performers').count(),3);
      assert.deepEqual(await e.locator('.qualified-performers').nth(2).locator('.star').evaluateAll(nodes=>nodes.map(n=>n.dataset.name)),['鬼河童','フィッシュおさかな','ユンクフラワー']);
      assert.equal(await e.locator('.next-stage-performers .star').getAttribute('data-name'),'プテラエリア');
      await page.locator('#day').selectOption('2');
      const first=page.locator('#archiveResults #event-2026-11-02-1700-agari-stage');
      assert.equal(await first.locator('.qualified-performers').nth(2).locator('.star').getAttribute('data-name'),'サンライズ');
      assert.equal(await first.locator('.performer-section .star[data-name="サンライズ"]').count(),0,'MCは香盤に追加しない');
      assert.equal(await first.locator('.event-notice').textContent(),'※公式Xでは第3位「サンライズ」と発表されていますが、事前香盤では同組はMCとして記載されています。');
      assert.equal(await page.locator('#archiveResults .event-notice').filter({hasText:'事前香盤では同組はMC'}).count(),1,'注記は該当1部だけ');
      await page.locator('#day').selectOption('11');
      const n11a=page.locator('#archiveResults #event-2026-11-11-1700-agari-stage');
      const n11b=page.locator('#archiveResults #event-2026-11-11-1930-agari-stage');
      assert.equal(await n11a.locator('.qualified-performers').nth(2).locator('.star').getAttribute('data-name'),'山下野村');
      assert.match(await n11a.locator('.event-notice').textContent(),/事前香盤の出演者欄には記載がありません/);
      assert.equal(await n11a.locator('.performer-section .star[data-name="山下野村"]').count(),0);
      assert.equal(await n11b.locator('.qualified-performers').nth(1).locator('.star').getAttribute('data-name'),'髙橋ごとき');
      assert.match(await n11b.locator('.event-notice').textContent(),/事前香盤では「高橋ごとき」と表記/);
      assert.equal(await n11b.locator('.performer-section .star[data-name="高橋ごとき"]').count(),1);
      for(const [day,id,winner,second,third] of [
        ['12','2026-11-12-1700-agari-stage','ランス39号','ウルトラスーパーコバタナックス','ラーフル'],
        ['12','2026-11-12-1930-agari-stage','マルティンス','マシン語感','ゾンビのアトリエ'],
        ['13','2026-11-13-1700-agari-stage','パウリスタ','ヒッキー北風','かるかん'],
        ['13','2026-11-13-1930-agari-stage','まえだかっこかり','鈴木ララバイ','ええいちにち']
      ]){
        await page.locator('#day').selectOption(day);
        const card=page.locator('#archiveResults #event-'+id);
        for(const [i,name] of [winner,second,third].entries())assert.equal(await card.locator('.qualified-performers').nth(i).locator('.star').getAttribute('data-name'),name);
        assert.equal(await card.locator('.next-stage-performers .star').getAttribute('data-name'),winner);
        assert.equal(await card.locator('.event-notice').count(),0,'今回4公演には注記不要');
      }
      await page.locator('#day').selectOption('16');
      const nov16a=page.locator('#archiveResults #event-2026-11-16-1700-agari-stage');
      const nov16b=page.locator('#archiveResults #event-2026-11-16-1930-agari-stage');
      for(const [card,rank] of [
        [nov16a,['超アジア','タイサンボク','既婚者']],
        [nov16b,['アイガモシーサー','2人のトイボックス','ウィークリー習慣']]
      ]){
        for(const [i,name] of rank.entries())assert.equal(await card.locator('.qualified-performers').nth(i).locator('.star').getAttribute('data-name'),name);
        assert.equal(await card.locator('.next-stage-performers .star').getAttribute('data-name'),rank[0]);
        assert.equal(await card.locator('.event-notice').count(),0);
      }
      assert.match(await nov16a.locator('.event-mc').textContent(),/ウィークリー習慣/);
      assert.equal(await nov16a.locator('.performer-section .star[data-name="ウィークリー習慣"]').count(),0,'1部MCを香盤へ混入しない');
      assert.equal(await nov16b.locator('.qualified-performers').nth(2).locator('.star').getAttribute('data-name'),'ウィークリー習慣');
      await page.locator('#day').selectOption('17');
      const nov17a=page.locator('#archiveResults #event-2026-11-17-1700-agari-stage');
      const nov17b=page.locator('#archiveResults #event-2026-11-17-1930-agari-stage');
      for(const [card,rank,mc] of [
        [nov17a,['ダスティローデス','ナビゲーター','片翼のチキン'],'スーパーロバ'],
        [nov17b,['ただならぬ刀','千年ぶり','まろやか'],'スーズ']
      ]){
        assert.match(await card.locator('.event-mc').textContent(),new RegExp('MC：'+mc));
        for(const [i,name] of rank.entries())assert.equal(await card.locator('.qualified-performers').nth(i).locator('.star').getAttribute('data-name'),name);
        assert.equal(await card.locator('.next-stage-performers .star').getAttribute('data-name'),rank[0]);
        assert.equal(await card.locator('.event-notice').count(),0);
      }
      await page.locator('#day').selectOption('18');
      const n18a=page.locator('#results #event-2026-11-18-1700-agari-stage');
      const n18b=page.locator('#results #event-2026-11-18-1930-agari-stage');
      assert.equal(await n18a.locator('.qualified-performers').nth(0).locator('.star').getAttribute('data-name'),'きしゃぽっぽ');
      assert.equal(await n18a.locator('.qualified-performers').nth(1).locator('.star').getAttribute('data-name'),'笠川拓夢');
      assert.equal(await n18a.locator('.qualified-performers').nth(2).locator('.star').getAttribute('data-name'),'ナターリア');
      assert.equal(await n18a.locator('.performer-section .star[data-name="笠川拓夢"]').count(),0);
      assert.match(await n18a.locator('.event-notice').textContent(),/事前香盤の出演者欄には記載がありません/);
      assert.equal(await n18a.locator('.next-stage-performers .star').getAttribute('data-name'),'きしゃぽっぽ');
      assert.deepEqual(await n18b.locator('.qualified-performers').nth(1).locator('.star').evaluateAll(nodes=>nodes.map(n=>n.dataset.name)),['くろざとう','しゃちほこダイナソー']);
      assert.equal(await n18b.locator('.qualified-performers').nth(2).locator('.star').getAttribute('data-name'),'せらっきょ');
      assert.equal(await n18b.locator('.next-stage-performers .star').getAttribute('data-name'),'スーパートマト');
      assert.equal(await n18b.locator('.event-notice').count(),0);
      await page.locator('#day').selectOption('19');
      const n19a=page.locator('#results #event-2026-11-19-1700-agari-stage');
      const n19b=page.locator('#results #event-2026-11-19-1930-agari-stage');
      for(const [card,names,mc] of [[n19a,['ミックストマトジュース','デンゼル','ムエタイ出身'],'ラクダ人生'],[n19b,['ゴスケ','スティックセニョール','ラクダ人生'],'キゲンゼン']]){
        assert.match(await card.locator('.event-mc').textContent(),new RegExp('MC：'+mc));
        for(const [i,name] of names.entries())assert.equal(await card.locator('.qualified-performers').nth(i).locator('.star').getAttribute('data-name'),name);
        assert.equal(await card.locator('.next-stage-performers .star').getAttribute('data-name'),names[0]);
        assert.equal(await card.locator('.event-notice').count(),0,'11/19は香盤と結果の不一致なし');
      }
      assert.equal(await n19a.locator('.performer-section .star[data-name="ラクダ人生"]').count(),0,'1部MCは香盤へ追加しない');
      assert.equal(await n19b.locator('.qualified-performers').nth(2).locator('.star').getAttribute('data-name'),'ラクダ人生','2部第3位を保持');
      await page.locator('#day').selectOption('20');
      const n20a=page.locator('#results #event-2026-11-20-1700-agari-stage');
      const n20b=page.locator('#results #event-2026-11-20-1930-agari-stage');
      assert.match(await n20a.locator('.event-mc').textContent(),/MC：コロネケン/);
      assert.deepEqual(await n20a.locator('.qualified-performers').nth(0).locator('.star').evaluateAll(nodes=>nodes.map(n=>n.dataset.name)),['き展']);
      assert.deepEqual(await n20a.locator('.qualified-performers').nth(1).locator('.star').evaluateAll(nodes=>nodes.map(n=>n.dataset.name)),['広島兄弟']);
      assert.deepEqual(await n20a.locator('.qualified-performers').nth(2).locator('.star').evaluateAll(nodes=>nodes.map(n=>n.dataset.name)),['桃子','キンジトウ'],'3位の同順位2組を表示');
      assert.equal(await n20a.locator('.next-stage-performers .star').getAttribute('data-name'),'き展');
      assert.equal(await n20a.locator('.event-notice').count(),0,'香盤差異なし');
      assert.equal(await n20a.locator('.performer-section .star[data-name="コロネケン"]').count(),0,'1部MCは出演者に追加しない');
      assert.match(await n20b.locator('.event-mc').textContent(),/MC：すしまる/);
      for(const [i,name] of ['つつがないね','あさゆま','コロネケン'].entries())
        assert.equal(await n20b.locator('.qualified-performers').nth(i).locator('.star').getAttribute('data-name'),name);
      assert.equal(await n20b.locator('.next-stage-performers .star').getAttribute('data-name'),'つつがないね');
      assert.equal(await n20b.locator('.performer-section .star[data-name="コロネケン"]').count(),1,'2部第3位は2部香盤の出演者');
      assert.equal(await n20b.locator('.event-notice').count(),0,'2部の香盤差異なし');
      await page.locator('#eventType').selectOption('sarani-agari-stage');
      await page.locator('#day').selectOption('all');
      assert.equal(await page.locator('#results .pending-stage-card').count(),1,'11月27日の確定日程なので11月絞り込みでも表示');
      await page.locator('#day').selectOption('27');
      assert.equal(await page.locator('#results .pending-stage-card .star').count(),28);
      await page.locator('#day').selectOption('26');
      assert.equal(await page.locator('#results .pending-stage-card').count(),0,'別日には出さない');
      await page.locator('#day').selectOption('all');
      await page.locator('#month').selectOption('all');
      assert.equal(await page.locator('#results .pending-stage-card .star').count(),28);
      await page.locator('#eventType').selectOption('agari-stage');
      await page.locator('#month').selectOption('11');
      await page.locator('#day').selectOption('24');
      const future=page.locator('#results #event-2026-11-24-1700-agari-stage');
      assert.equal(await future.locator('.ticket-purchase-link a').getAttribute('href'),'https://ticket.fany.lol/event/detail/22035');
      assert.match(await future.locator('.ticket-purchase-link').textContent(),/出演者への取り置きも可能です/);
      assert.equal(await future.locator('.ticket-streaming-note').textContent(),'※配信はありません');
      assert.equal(await future.locator('.ticket-sale-info').textContent(),'※FANY一般発売：10月19日(月)10:00〜');
      assert.deepEqual(errors,[]);
    } finally{await context.close();}
  });
}

for(const width of [1280,390,375,320]){
 test(`v6 ${width}px: MC検索・過去MC・順序・短い案内・URL復元・SR件数・既存保存`,{timeout:60000},async()=>{
 const {context,page,errors}=await openPage(width,'2026-11-11T03:00:00Z');try{
 assert.equal(await page.locator('h1').textContent(),'オーディション EAST・アガり！ステージ出演者検索（非公式）');assert.equal(await page.locator('h1 br').count(),1);assert.equal(await page.locator('.hero-title-main').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return range.getClientRects().length;}),1,'タイトル先頭行は折り返さない');assert.equal(await page.locator('.hero p,#shareSearchBtn,#shareSearchFallback,#resultNote').count(),0);
 assert.equal(await page.locator('#searchResultSummary').getAttribute('class'),'visually-hidden');assert.equal(await page.locator('#searchResultSummary').getAttribute('role'),'status');assert.equal(await page.locator('footer a[href="https://x.com/agaristage"]').count(),1);
 assert.equal(await page.locator('#siteNotice').isVisible(),true);
 assert.equal(await page.locator('#siteNoticeTrack span').count(),2,'流れる告知はシームレスループ用に同じ内容を2回描画');
 assert.equal((await page.locator('#siteNoticeTrack span').first().textContent()).replace(/\s+/g,' '),'🆕 12月アガり！ステージの香盤を掲載しました（出演者名は目視確認中です） ⚠️ 吉本のタレント検索サービスが一時停止中のためプロフィールリンクが飛べなくなっています');
 await page.locator('#eventType').selectOption('agari-stage');await page.locator('#month').selectOption('11');await page.locator('#day').selectOption('2');await page.locator('#nameQuery').fill(' サンライズ ');
 await page.waitForFunction(()=>new URL(location.href).searchParams.get('name')===' サンライズ ');await page.locator('#archiveBody').waitFor({state:'visible'});
 const card=page.locator('#event-2026-11-02-1700-agari-stage');assert.equal(await card.locator('.event-mc .mc-name.search-match').count(),1);assert.equal(await card.locator('.event-mc .star').count(),0);
 assert.equal(await card.locator('.event-mc .mc-name.search-match').evaluate(el=>getComputedStyle(el).outlineColor),'rgb(198, 83, 0)');assert.equal(await card.locator('.event-mc').textContent(),'MC：サンライズ（芸人名の検索条件に一致）');
 assert.equal(await card.locator('.lineup-order-note').textContent(),'※香盤順');assert.deepEqual(await card.locator('.performer-section').evaluate(el=>[...el.children].map(n=>n.className).slice(0,3)),['card-section-label','event-mc','lineup-block']);
 assert.match(await card.locator('.event-notice').textContent(),/公式Xでは第3位「サンライズ」/);assert.equal(await card.locator('.ticket-purchase-link a').getAttribute('href'),'https://ticket.fany.lol/event/detail/22035');assert.equal(await card.locator('.ticket-streaming-note').textContent(),'※配信はありません');assert.equal(await card.locator('.ticket-sale-info').textContent(),'※FANY一般発売：10月19日(月)10:00〜');
 const before=await searchCardIDs(page,'#archiveResults');await page.reload();await readySearchPage(page);assert.deepEqual(await searchCardIDs(page,'#archiveResults'),before);assert.equal(await card.locator('.event-mc .search-match').count(),1);
 if(process.env.TEST_SCREENSHOT_DIR)await card.screenshot({path:path.join(process.env.TEST_SCREENSHOT_DIR,`v6-mc-${width}.png`)});
 await page.locator('#clearBtn').click();await page.locator('#month').selectOption('12');const pending=page.locator('#results .pending-stage-card').filter({hasText:'2ndステージからの進出者'});assert.equal(await pending.count(),1);assert.equal(await pending.locator('.lineup-overview-heading span').textContent(),'2ndステージからの進出者');assert.equal(await pending.locator('.lineup-overview-note').textContent(),'※出演部は更新時点では未定です');
 assert.equal(await page.locator('#results .result-card:not(.pending-stage-card)[id*="kiwami-grand-battle-east"] .star').count(),0,'極の出演部未定枠だけは出演者ゼロ');
 await pending.locator('.star[data-name="ZAZY"]').click();assert.equal(await page.locator('#favoritePanel h2').textContent(),'★お気に入りの出演・進出情報');assert.ok(!(await page.locator('#favoriteSchedule').textContent()).includes('渋谷よしもと漫才劇場'));
 await page.locator('#favoriteBackupBtn').click();await page.locator('#createBackupBtn').click();assert.ok((await page.locator('#backupCodeOutput').inputValue()).length>0);await page.locator('#closeBackupBtn').click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const clipping=await page.locator('#results .pending-stage-note,.event-mc,.favorite-meta,h1').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&n.clientWidth>0&&n.scrollWidth>n.clientWidth+1).map(n=>n.textContent));assert.deepEqual(clipping,[]);
 if(process.env.TEST_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.TEST_SCREENSHOT_DIR,`v6-overview-${width}.png`),fullPage:false});assert.deepEqual(errors,[]);
 }finally{await context.close();}
 });
}

for(const width of [1280,390,375,320]){
  test(`サラに！専用絞り込み ${width}px: 11/27確定日時・28組・チケット・お気に入り・URL復元`,{timeout:30000},async()=>{
    const {context,page,errors}=await openPage(width,'2026-11-17T03:00:00Z');
    try{
      const picker=page.locator('#eventType');
      assert.equal(await picker.locator('option[value="standup"]').count(),0,'開催予定のないスタンドアップは選択肢から外す');
      assert.equal(await picker.locator('option[value="sarani-agari-stage"]').textContent(),'サラに！アガり！ステージ');
      await picker.selectOption('sarani-agari-stage');
      const rights=page.locator('#results .pending-stage-card');
      assert.equal(await rights.count(),1,'出場権獲得者カードは1枚');
      assert.equal(await page.locator('#results .result-card:not(.pending-stage-card)').count(),0,'架空の開催日付き公演は表示しない');
      assert.match(await rights.textContent(),/サラに！アガり！ステージ/);
      assert.match(await rights.textContent(),/11月27日\(金\) 開演17:00/);
      assert.equal(await rights.locator('.venue-line').textContent(),'会場：歌舞伎町Sparkle');
      assert.equal(await rights.locator('.ticket-purchase-link a').getAttribute('href'),'https://ticket.fany.lol/reception/70947/55946');
      const ticketNote=rights.locator('.ticket-note-unified');
      assert.equal(await ticketNote.count(),1,'アガり！と同じチケット案内を1回表示');
      assert.equal(await rights.locator('.ticket-purchase-link a').textContent(),'FANY');
      assert.deepEqual(await ticketNote.locator('.ticket-purchase-link > div').allTextContents(),['チケットの購入は FANY','もしくは出演者への取り置きも可能です']);
      assert.equal(await rights.locator('.ticket-sale-info').textContent(),'※FANY一般発売：11月20日(金)10:00〜');
      assert.equal(await rights.locator('.ticket-streaming-note').textContent(),'※配信はありません');
      assert.deepEqual(await ticketNote.locator('.ticket-purchase-link, .ticket-sale-info, .ticket-streaming-note').evaluateAll(nodes=>nodes.map(el=>el.className)),['ticket-purchase-link','ticket-sale-info','ticket-streaming-note']);
      assert.match(await rights.textContent(),/出場権獲得者/);
      assert.equal(await rights.locator('.star').count(),28);
      assert.equal(new URL(page.url()).searchParams.get('eventType'),'sarani-agari-stage','ライブ名選択は共有URLに保存');
      await page.locator('#month').selectOption('11');
      await page.locator('#day').selectOption('27');
      await page.locator('#hour').selectOption('17');
      assert.equal(await rights.count(),1,'11/27 17:00で検索できる');
      assert.equal(new URL(page.url()).searchParams.get('day'),'27');
      await page.locator('#day').selectOption('26');
      assert.equal(await rights.count(),0,'11/26には表示しない');
      await page.locator('#day').selectOption('27');
      assert.equal(await rights.count(),1);
      await page.locator('#month').selectOption('all');
      await page.locator('#day').selectOption('all');
      await page.locator('#hour').selectOption('all');
      await page.locator('#nameQuery').fill('ランス39号');
      await page.waitForFunction(()=>new URL(location.href).searchParams.get('name')==='ランス39号');
      assert.equal(await rights.locator('.star').count(),1);
      assert.equal(await rights.locator('.star').getAttribute('data-name'),'ランス39号');
      await rights.locator('.star').click();
      assert.equal(await rights.locator('.star').getAttribute('aria-pressed'),'true');
      assert.ok((await page.locator('#favoriteSchedule').textContent()).includes('11月27日(金) 開演17:00'),'お気に入りにも確定公演を表示');
      await page.locator('#favoritesOnlyBtn').click();
      assert.equal(await rights.count(),1);
      assert.equal(await rights.locator('.star').count(),1);
      await page.reload();
      await readySearchPage(page);
      assert.equal(await picker.inputValue(),'sarani-agari-stage');
      assert.equal(await page.locator('#nameQuery').inputValue(),'ランス39号');
      assert.equal(await rights.locator('.star').count(),1);
      assert.equal(await rights.locator('.star').getAttribute('aria-pressed'),'true','既存のお気に入り登録を維持');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'横スクロールを発生させない');
      await page.locator('#clearBtn').click();
      assert.equal(await picker.inputValue(),'all');
      assert.equal(new URL(page.url()).searchParams.has('eventType'),false);
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });
}

for(const width of [1280,390,375,320]){
  test('12月期1st目視校正後 '+width+'px: 新規33公演・会場/チケット別・目視確認告知・検索URL・表示幅',{timeout:60000},async()=>{
    const {context,page,errors}=await openPage(width,'2026-11-17T03:00:00Z');
    try{
      assert.equal(winterFirst.length,33);
      assert.equal((await page.locator('#siteNoticeTrack span').first().textContent()).trim(),'🆕 12月アガり！ステージの香盤を掲載しました（出演者名は目視確認中です）　⚠️ 吉本のタレント検索サービスが一時停止中のためプロフィールリンクが飛べなくなっています');
      await page.locator('#eventType').selectOption('audition-1st-east');
      await page.locator('#month').selectOption('11');
      await page.locator('#day').selectOption('30');
      assert.equal(await page.locator('#results .result-card').count(),1,'11/30の黒塗り18:30公演を掲載しない');
      const sparkle=page.locator('#event-2026-11-30-1600-audition-1st-east');
      assert.match(await sparkle.locator('.venue-line').textContent(),/歌舞伎町Sparkle/);
      assert.equal(await sparkle.locator('.ticket-purchase-link a').getAttribute('href'),'https://ticket.fany.lol/event/detail/23161');
       assert.equal(await sparkle.locator('.ticket-streaming-note').textContent(),'※配信はありません');
       assert.equal(await sparkle.locator('.ticket-sale-info').textContent(),'※FANY一般発売：11月18日(水)10:00〜');
      await page.locator('#day').selectOption('24');
      assert.equal(await page.locator('#results .result-card').count(),2);
      const november=page.locator('#event-2026-11-24-1600-audition-1st-east');
      assert.equal(await november.locator('.performer-section .star').nth(5).getAttribute('data-name'),'ビィワゴン');
      assert.match(await november.locator('.venue-line').textContent(),/LEFKADA新宿/);
      assert.equal(await november.locator('.ticket-purchase-link a').getAttribute('href'),'https://ticket.fany.lol/event/detail/23168');
       assert.equal(await november.locator('.ticket-streaming-note').textContent(),'※配信はありません');
       assert.equal(await november.locator('.ticket-sale-info').textContent(),'※FANY一般発売：11月18日(水)10:00〜');
      assert.equal(await november.locator('.qualified-performers .star').count(),1,'11/24 16:00の合格者は1組だけ');
      assert.equal(await november.locator('.qualified-performers .star').getAttribute('data-name'),'サクラダ前線');
      assert.match(await november.locator('.qualified-performers').textContent(),/12月23日\(水\)出演予定/);
      await page.locator('#eventType').selectOption('audition-2nd-east');
      await page.locator('#month').selectOption('12');
      await page.locator('#day').selectOption('23');
      const next=page.locator('#results .pending-stage-card');
      assert.equal(await next.count(),1,'12/23の2nd進出予定を1枚表示');
      assert.match(await next.textContent(),/12月23日\(水\)/);
      assert.match(await next.textContent(),/開演時間未定/);
      assert.equal(await next.locator('.venue-line').textContent(),'会場：詳細未定');
      assert.equal(await next.locator('.star').getAttribute('data-name'),'サクラダ前線');
      await next.locator('.star').click();
      const showAllFavorites=page.locator('#favoriteScheduleToggleBtn');
      if(await showAllFavorites.count()) await showAllFavorites.click();
      assert.ok((await page.locator('#favoriteSchedule').textContent()).includes('12月23日(水)'),'お気に入り一覧を展開して2nd進出予定も表示');
      await page.locator('#day').selectOption('22');
      assert.equal(await next.count(),0,'12/22には表示しない');
      await page.locator('#eventType').selectOption('audition-1st-east');
      await page.locator('#month').selectOption('12');
      await page.locator('#day').selectOption('1');
      assert.equal(await page.locator('#results .result-card').count(),2);
      const dec=page.locator('#event-2026-12-01-1830-audition-1st-east');
      assert.equal(await dec.locator('.performer-section .star').nth(4).getAttribute('data-name'),'毛極蜂空芯蝶々虻火鉢');
      assert.equal(await dec.locator('.performer-section .star').nth(8).getAttribute('data-name'),'ayu♡','12月の目視校正を確認');
      assert.equal(await dec.locator('.ticket-purchase-link a').getAttribute('href'),'https://ticket.fany.lol/event/detail/23168');
       assert.equal(await dec.locator('.ticket-streaming-note').textContent(),'※配信はありません');
       assert.equal(await dec.locator('.ticket-sale-info').textContent(),'※FANY一般発売：11月18日(水)10:00〜');
      assert.equal(new URL(page.url()).searchParams.get('eventType'),'audition-1st-east');
      await page.locator('#nameQuery').fill('毛極蜂空芯蝶々虻火鉢');
      await page.waitForFunction(()=>new URL(location.href).searchParams.get('name')==='毛極蜂空芯蝶々虻火鉢' && document.querySelectorAll('#results .result-card').length===1);
      assert.equal(await page.locator('#results .result-card').count(),1);
      assert.equal(await dec.locator('.star[data-name="毛極蜂空芯蝶々虻火鉢"]').count(),1);
      await page.reload();await readySearchPage(page);
      assert.equal(await page.locator('#nameQuery').inputValue(),'毛極蜂空芯蝶々虻火鉢');
      assert.equal(await page.locator('#eventType').inputValue(),'audition-1st-east');
      assert.equal(await page.locator('#results .result-card').count(),1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'横スクロールなし');
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });
}
