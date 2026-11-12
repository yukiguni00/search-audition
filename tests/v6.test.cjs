const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {createHash}=require('node:crypto');const {loadApp,readJSON}=require('./helpers/app.cjs');
test('194公演と従来OGPを保持し、MC検索でも出演者・順位・お気に入りへMCを追加しない',()=>{
 for(const [name,hash] of Object.entries({"ogp.jpg": "c7892401b3e3e6b456d9cb9b756c0f94be518d5fda0e7ee3c9c897cb84b606e6", "ogp-twitter.jpg": "63112fe7839ba0ef8dbc009445665e30a98e6305f292ab120adc99c75e3dba1b"}))assert.equal(createHash('sha256').update(fs.readFileSync(require('node:path').join(__dirname,'..',name))).digest('hex'),hash,'旧OGP URL用の画像を保持');
 const all=readJSON('data/events.json');assert.equal(all.length,194);assert.equal(all.filter(e=>e.eventType==='agari-stage').length,30);assert.equal(all.filter(e=>e.eventType!=='agari-stage').length,164);
 const a=loadApp();const e={date:'2026-12-01',month:12,day:1,time:'17:00',timeMinutes:1020,eventType:'agari-stage',mc:'ＭＣ芸人',performers:['出演芸人']};const f={nameQuery:a.context.normalizeText(' mc芸人 '),eventType:'all',month:'12',day:'1',hour:'17'};
 assert.equal(a.context.eventMatchesFilters(e,f),true);assert.deepEqual(Array.from(a.context.getEventPerformerNames(e)),['出演芸人']);
 a.set('e',e);a.run('events=[e];saveFavorites([normalizeText(e.mc)]);favoritesOnlyMode=true');assert.equal(a.context.eventMatchesFilters(e,f),false);assert.equal(a.context.getStageResults(e).length,0);
});
test('MCは見出しの後・ブロックの前。過去にも表示し、検索一致を強調、星は作らない',()=>{
 const a=loadApp();const e=readJSON('data/events.json').find(e=>e.id==='2026-11-02-1700-agari-stage');a.element('nameQuery').value='サンライズ';
 for(const target of ['results','archiveResults']){const html=a.context.buildEventCardHTML(e,target,[]);assert.ok(html.indexOf('class="event-mc"')>html.indexOf('class="performer-section'));assert.ok(html.indexOf('class="event-mc"')<html.indexOf('class="lineup-block"'));assert.match(html,/mc-name search-match/);assert.match(html,/MC：<span/);assert.equal((html.match(/class="star"/g)||[]).length,e.performers.length+a.context.getStageResults(e).reduce((s,r)=>s+r.performers.length,0));assert.ok(html.includes(e.eventNotice));}
 a.set('malicious',{...e,mc:'<img onerror=alert(1)>'});assert.ok(!a.run('buildMCHTML(malicious)').includes('<img'));assert.match(a.run('buildMCHTML(malicious)'),/&lt;img/);
});
test('お気に入りは確定日時順、未確認出場権は最後。今日の日付を代入しない',()=>{
 const a=loadApp();a.set('fixtures',[
 {id:'later',title:'後の確定公演',date:'2026-12-20',time:'18:00',timeMinutes:1080,performers:['対象'],venue:'非表示会場'},
 {id:'earlier',title:'先の確定公演',date:'2026-11-20',time:'17:00',timeMinutes:1020,performers:['対象'],venue:'非表示会場'},
 {id:'source',date:'2026-11-01',performers:['対象'],stageResults:[{status:'advanced',label:'出場権',nextEventType:'sarani-agari-stage',nextEventTitle:'サラに！アガり！ステージ',performers:['対象']}]}
 ]);a.run('events=fixtures;todayString=()=>"2026-11-11";saveFavorites(["対象"])');const g=a.context.getFavoriteScheduleData().eventGroups;
 assert.deepEqual(Array.from(g,x=>x.event.id).slice(0,2),['earlier','later']);assert.equal(g[2].event.date,'');assert.equal(g[2].event.dateEnd,'');assert.match(a.context.getFavoriteScheduleLabel(g[2].event),/出場権獲得・出演日時未確認/);a.run('renderFavoriteSchedule()');assert.ok(!a.element('favoriteSchedule').innerHTML.includes('非表示会場'));
});
test('11月アガりのチケットは3行とFANYリンクを過去にも保持し、他公演は従来',()=>{
 const a=loadApp();const e=readJSON('data/events.json').find(e=>e.id==='2026-11-02-1700-agari-stage');const html=a.context.getTicketLinkHTML(e,'archiveResults');assert.match(html,/チケットの購入は<a/);assert.match(html,/もしくは出演者への取り置きも可能です/);assert.match(html,/※配信はありません/);assert.match(html,/※FANY一般発売：10月19日\(月\)10:00〜/);assert.ok(html.includes(e.ticket.url));assert.equal(a.context.getTicketLinkHTML({...e,eventType:'standup'},'archiveResults'),'');
});
test('共有UIと全体香盤注記を除去、URL5条件と読み上げ件数領域を維持',()=>{
 const root=require('node:path').join(__dirname,'..');const html=fs.readFileSync(root+'/index.html','utf8');const js=fs.readFileSync(root+'/script.js','utf8');assert.ok(!/shareSearch|resultNote/.test(html));assert.ok(!/shareCurrentSearch|resetSearchShareFeedback/.test(js));assert.match(html,/id="searchResultSummary" class="visually-hidden" role="status"/);assert.match(html,/@agaristage/);assert.match(html,/オーディション EAST・アガり！ステージ<\/span><br>出演者検索（非公式）/);
});
