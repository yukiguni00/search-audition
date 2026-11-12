const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { loadApp, readJSON } = require('./helpers/app.cjs');
const all = readJSON('data/events.json');
const added = all.filter(e => e.eventType === 'agari-stage');
const publishedResultEventIDs = new Set(['2026-11-02-1700-agari-stage','2026-11-02-1930-agari-stage','2026-11-04-1700-agari-stage','2026-11-04-1930-agari-stage','2026-11-05-1700-agari-stage','2026-11-05-1930-agari-stage','2026-11-06-1700-agari-stage','2026-11-06-1930-agari-stage','2026-11-09-1700-agari-stage','2026-11-09-1930-agari-stage','2026-11-10-1700-agari-stage','2026-11-10-1930-agari-stage','2026-11-11-1700-agari-stage','2026-11-11-1930-agari-stage']);
const filters = { nameQuery:'', eventType:'agari-stage', month:'11', day:'all', hour:'all' };

test('既存164公演は全フィールド不変、アガり30公演追加で194公演', () => {
  const old = all.filter(e => e.eventType !== 'agari-stage');
  assert.equal(old.length,164); assert.equal(added.length,30); assert.equal(all.length,194);
  assert.equal(createHash('sha256').update(JSON.stringify(old)).digest('hex'),
    '3d1ffbff43f1d28bd7986ed490d10259be53da464c2c6e8f90f0dee21815f813');
  assert.equal(new Set(added.map(e=>e.date)).size,15);
  assert.equal(createHash('sha256').update(JSON.stringify(added.map(e=>[e.date,e.time,e.mc,e.lineup,e.excludedSlots]))).digest('hex'),
    '4ef91538a5ee49010054d590c6b6c029cf84161a8a852b2ff9f3f16e8e102e6a', '提供データと全件照合済みの日時・MC・香盤を保持');
  assert.equal(added.flatMap(e=>e.performers).length,839);
  assert.equal(added.flatMap(e=>e.excludedSlots).length,2);
  for (const e of added) {
    assert.ok(e.mc); assert.equal(e.lineupOrder,true);
    assert.equal(e.venue,'歌舞伎町Sparkle','official venue: https://live.yoshimoto.co.jp/live/live-33060/');
    assert.deepEqual(e.performers,e.lineup.map(p=>p.name));
    const positions=[...e.lineup,...e.excludedSlots].map(p=>p.order).sort((a,b)=>a-b);
    assert.deepEqual(positions,Array.from({length:positions.length},(_,i)=>i+1));
    assert.ok(e.lineup.every(p=>[1,2,3].includes(p.block)));
    if(publishedResultEventIDs.has(e.id)){
      assert.deepEqual(e.stageResults.map(r=>r.status),['ranked','ranked','ranked','advanced']);
    } else {
      assert.ok(e.stageResults.every(r=>r.status==='pending' && r.performers.length===0));
    }
    assert.deepEqual(e.stageResults.map(r=>r.label),['最優秀者','2位','3位',
      publishedResultEventIDs.has(e.id) ? 'サラに！アガり！ステージ出場権' : 'サラに！への進出']);
    assert.ok(!/user_note|verification|source_file|publishable|candidates/.test(JSON.stringify(e)));
  }
  assert.equal(added.find(e=>e.date==='2026-11-20'&&e.time==='19:30').lineup.find(p=>p.order===29).name,'つつがないね');
  assert.deepEqual(added.filter(e=>e.excludedSlots.length).map(e=>[e.date,e.time,e.excludedSlots[0].order]),
    [['2026-11-13','19:30',4],['2026-11-17','17:00',14]]);
});

test('判読不可2枠: 両候補で同一カード・チップ、MC/3ブロック表示・香盤順保持', () => {
  const a=loadApp();
  assert.equal(added.flatMap(e=>e.lineup).filter(p=>p.identityStatus==='unresolved').length,2);
  for (const e of added) {
    const html=a.context.buildEventCardHTML(e,'results',[]);
    assert.equal((html.match(/class="lineup-block"/g)||[]).length,3);
    assert.ok(!html.includes('class="lineup-order"'),'香盤番号は画面に表示しない');
    assert.equal((html.match(/class="star"/g)||[]).length,
      e.performers.length + a.context.getStageResults(e).reduce((sum,r)=>sum+r.performers.length,0));
    assert.ok(html.replace(/<[^>]*>/g, "").includes(`MC：${e.mc}`));
    assert.equal(html.replace(/<[^>]*>/g, "").split(`MC：${e.mc}`).length-1,1,'MCは既存の公演詳細欄に1回だけ表示');
    assert.equal(a.context.getStageResults(e).length,publishedResultEventIDs.has(e.id)?4:0,'発表済み14公演のみ結果表示');
    for (const p of e.lineup.filter(p=>p.entryKey)) {
      assert.match(p.name,/（判読不可）/);
      assert.equal(p.searchAliases.length,2);
      assert.ok(html.includes(`data-key="${p.entryKey}"`));
      for (const candidate of p.searchAliases) {
        const query=a.context.normalizeText(candidate);
        assert.ok(a.context.eventMatchesFilters(e,{...filters,nameQuery:query}));
        assert.ok(a.context.performerMatchesNameQuery(p.name,query));
        assert.notEqual(a.context.normalizeText(candidate),p.entryKey,'候補を確定した同一芸人にしない');
      }
    }
  }
});

test('暫定名のお気に入りは各1組: 保存・再読込・日程・解除', () => {
  const a=loadApp();
  a.set('CSS',{escape:value=>value});
  for(const e of added) for(const p of e.lineup.filter(p=>p.entryKey)) {
    a.context.toggleFavorite(p.name);
    assert.deepEqual(Array.from(a.context.getFavorites()),[p.entryKey]);
    const schedule=a.context.getFavoriteScheduleData();
    assert.equal(schedule.total,1); assert.equal(schedule.upcomingCount,1);
    assert.equal(schedule.eventGroups.length,1); assert.equal(schedule.eventGroups[0].event.id,e.id);
    a.context.toggleFavorite(p.name); assert.equal(a.context.getFavorites().length,0);
  }
});

test('正式名への訂正はentryKeyを保持。既存芸人への確定統合は改名aliasで重複解消', () => {
  const a=loadApp(); const e=structuredClone(added.find(e=>e.lineup.some(p=>p.entryKey)));
  const p=e.lineup.find(p=>p.entryKey); const oldName=p.name;
  a.context.saveFavorites([p.entryKey]);
  p.name='確定芸名_TEST'; p.identityStatus='confirmed'; e.performers=e.performers.map(n=>n===oldName?p.name:n);
  a.set('corrected',[e]); a.run('events=corrected; performerIdentities=buildPerformerIdentities(events)');
  assert.equal(a.context.normalizeText(p.name),p.entryKey);
  assert.equal(a.context.getFavoriteScheduleData().upcomingCount,1);
  assert.ok(a.context.buildEventCardHTML(e,'results',a.context.getFavorites()).includes('aria-pressed="true"'));
  a.set('migration',{aliases:[{currentName:p.name,aliases:[p.entryKey,oldName]}]});
  a.run('performerRenameAliases=buildPerformerAliasMap(migration)');
  a.context.saveFavorites([p.entryKey,p.name]);
  assert.deepEqual(Array.from(a.context.getFavorites()),['確定芸名_test']);
  assert.equal(a.context.getFavoriteScheduleData().upcomingCount,1);
});

test('後日の順位とサラに進出は既存結果UIに接続でき、未提供結果は空のまま', () => {
  const a=loadApp(); const e=structuredClone(added[0]);
  e.stageResults[0].status='ranked'; e.stageResults[0].performers=[e.performers[0]];
  Object.assign(e.stageResults[3],{status:'advanced',performers:[e.performers[0]],nextDate:'2026-12-01',nextEventTitle:'サラに！アガり！ステージ'});
  a.set('sample',e); a.run('events=[sample]');
  assert.match(a.context.getStageResultsHTML(e,[]),/最優秀者/);
  assert.equal(a.context.getPendingStageGroups({...filters,eventType:'all',month:'all'}).length,1);
  assert.ok(added.filter(e=>!publishedResultEventIDs.has(e.id)).every(e=>e.stageResults.every(r=>r.performers.length===0)));
});
