const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {loadApp,readJSON}=require('./helpers/app.cjs');
const f=readJSON('tests/fixtures/2026-nov-dec-audition-path.json');
const all=readJSON('data/events.json').filter(e=>e.eventType!=='agari-stage');
const empty={nameQuery:'',eventType:'all',month:'all',day:'all',hour:'all'};
function current(){const a=loadApp();a.run('todayString=()=>"2026-11-08"');return a;}

test('既存オーディション経路164件を保持。従来の5公演はオーディション由来のみ',()=>{
  assert.equal(all.length,164);
  const old=structuredClone(all.filter(e=>e.date<'2026-11-01'));
  assert.equal(old.length,159);
  for(const e of old.filter(e=>e.date==='2026-10-30'&&e.eventType==='audition-2nd-east'))
    for(const r of e.stageResults)for(const key of ['nextEventType','nextEventTitle','nextDate','nextDateEnd','nextTime','nextVenue'])delete r[key];
  assert.equal(createHash('sha256').update(JSON.stringify(old)).digest('hex'),f.originalEventsSHA256);
  const added=all.filter(e=>e.date>='2026-11-01');
  assert.equal(added.length,5);
  assert.deepEqual(added.map(e=>e.id),[f.novemberEventId,...f.decemberEventIds]);
  assert.deepEqual([...new Set(added.flatMap(e=>[...e.performers,...(e.stageResults||[]).flatMap(r=>r.performers)]))].sort(),[...f.auditionKakeru].sort());
});
test('11/6は15組だけ、列挙順は香盤ではない。公式記事の新所属3組を別結果として保存',()=>{
  const e=all.find(e=>e.id===f.novemberEventId);
  assert.deepEqual(e.performers,f.auditionKakeru);assert.equal(e.performers.length,15);
  assert.equal(e.lineupOrder,false);assert.match(e.performerLabel,/香盤順未確認/);
  assert.equal(e.date,'2026-11-06');assert.equal(e.time,'19:30');assert.equal(e.openTime,'19:15');
  assert.equal(e.ticket.url,f.novemberTicketURL);
  assert.equal(e.stageResults.length,1);
  const r=e.stageResults[0];assert.equal(r.status,'advanced');assert.equal(r.displayStyle,'qualified');
  assert.equal(r.label,'劇場所属');
  assert.match(e.eventNotice,/2026年12月からKakeru翔所属/);
  assert.deepEqual([...r.performers].sort(),[...f.promoted].sort());
  assert.deepEqual(Object.keys(r).sort(),['displayStyle','label','performers','status']);
  assert.equal(current().context.eventMatchesFilters(e,empty,true),true);
});
test('12月の4公演は独立した日時枠だけ。共通一覧は極6組を1枚、日付順に全4枠を案内',()=>{
  const a=current();const events=f.decemberEventIds.map(id=>all.find(e=>e.id===id));
  assert.deepEqual(events.map(e=>[e.date,e.time,e.performers]),[['2026-12-12','17:00',[]],['2026-12-12','20:15',[]],['2026-12-13','17:00',[]],['2026-12-13','20:15',[]]]);
  for(const [i,e] of events.entries()){
    assert.equal(e.sessions,undefined);
    assert.deepEqual(e.ticket,{url:f.decemberTicketURLs[i],linkLabel:'FANYチケット'});
    assert.equal(e.openTime,undefined);assert.equal(e.stageResults,undefined);
    a.set('event',e);
    const html=a.run('buildEventCardHTML(event,"results",[])');
    assert.ok(html.includes(`href="${f.decemberTicketURLs[i]}"`),e.id);
  }
  const groups=a.context.getPendingStageGroups(empty).filter(g=>g.nextEventType==='kiwami-grand-battle-east');
  assert.equal(groups.length,1);
  const g=groups[0];assert.deepEqual(Array.from(g.names).sort(),[...f.auditionKiwami].sort());assert.equal(g.totalCount,6);
  assert.deepEqual(Array.from(a.context.getConfirmedStageSlots(g),e=>e.id),f.decemberEventIds);
  const html=a.context.buildPendingStageCardHTML(g,[]);
  assert.match(html,/2ndステージからの進出者/);assert.match(html,/6組/);assert.match(html,/※出演部は更新時点では未定です/);assert.match(html,/12月12日・12月13日に計4公演/);
  assert.ok(!html.includes('下の2公演'));
  for(const e of events){a.set('event',e);assert.ok(!a.run('buildEventCardHTML(event,"results",[])').includes('class="star"'));}
});
test('日時・名前の検索でも6組は未割当。1名検索と★のみは一覧1枚、期間の2日目もお気に入り保持',()=>{
  const a=current();
  for(const day of ['12','13'])for(const hour of ['17','20']){
    const filters={...empty,month:'12',day,hour,nameQuery:'zazy'};
    const groups=a.context.getPendingStageGroups(filters);assert.equal(groups.length,1);
    assert.deepEqual(Array.from(groups[0].names),['ZAZY']);assert.equal(groups[0].totalCount,6);
    assert.equal(all.filter(e=>a.context.eventMatchesFilters(e,filters)).length,0);
    assert.match(a.context.buildPendingStageCardHTML(groups[0],[]),/この日時への出演確定を示すものではありません/);
  }
  assert.equal(a.context.getPendingStageGroups({...empty,month:'12',day:'14'}).length,0);
  assert.equal(a.context.getPendingStageGroups({...empty,month:'12',day:'13',hour:'21'}).length,0,'21時以降の候補枠はない');
  a.run('saveFavorites(["zazy"]); favoritesOnlyMode=true');
  assert.equal(a.context.getPendingStageGroups(empty).length,1);
  for(const date of ['2026-11-08','2026-12-13']){a.set('date',date);a.run('todayString=()=>date');assert.equal(a.context.getFavoriteScheduleData().eventGroups.length,1);}
  a.run('todayString=()=>"2026-12-14"');assert.equal(a.context.getPendingStageGroups(empty).length,0);
});
test('翔15組の次回は掲載済み11/6と一致。3組の所属を通常の劇場出演へ拡張しない',()=>{
  const a=current();
  assert.equal(a.context.getPendingStageGroups({...empty,eventType:'kakeru-challenge-east'}).length,0);
  for(const e of all.filter(e=>e.date==='2026-10-30'&&e.eventType==='audition-2nd-east')){
    const result=e.stageResults[1];
    if(!result.performers.length)continue;
    assert.equal(result.nextDate,'2026-11-06');assert.equal(result.nextTime,'19:30');
    assert.equal(a.context.hasPublishedStageDetails(result),true);
  }
  for(const name of f.promoted){a.set('name',name);a.run('saveFavorites([normalizeText(name)])');assert.ok(a.context.getFavoriteScheduleData().eventGroups.every(g=>g.event.eventType==='agari-stage'));}
});
