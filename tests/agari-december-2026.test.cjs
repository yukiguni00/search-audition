'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readJSON,loadApp}=require('./helpers/app.cjs');

const all=readJSON('data/events.json');
const monthly=readJSON('data/events/2026-12.json');
const december=monthly.filter(e=>e.eventType==='agari-stage');
const november=readJSON('data/events/2026-11.json').filter(e=>e.eventType==='agari-stage');
const sessions=[
 ['01','超巨大','広島兄弟'],
 ['02','マルモウケ','アイオライト'],
 ['03','祖よ祖よ','エンジェル温泉花火'],
 ['04','ASANA','恩徳'],
 ['07','ホルモン金魚','ウルトラスーパーコバタナックス'],
 ['08','イエローテープ','弁天フクロウ'],
 ['09','桃子','ナビゲーター'],
 ['10','ナターリア','九十州'],
 ['11','ゲルマニウム','金銅ニッチ'],
 ['14','さよならチェンジアップ','やさしい王様'],
 ['15','マルカ食堂','今夜はブルース'],
 ['16','ゴーヤゴー','峰岸'],
 ['17','ノコノコみさき','零点星人'],
 ['18','タナバタ','すしまる'],
 ['21','機運ダンク','切り抜きピッチャー'],
];
const missing=[
 ['2026-12-01-1930-agari-stage',28,3],
 ['2026-12-09-1700-agari-stage',20,2],
 ['2026-12-15-1930-agari-stage',2,1],
];
test('12月アガり！は15日間×2回の30公演、全体257件で既存の1st・極・11月アガりを保持',()=>{
 assert.equal(all.length,257);
 assert.equal(monthly.length,60);
 assert.equal(monthly.filter(e=>e.eventType==='audition-1st-east').length,26);
 assert.equal(monthly.filter(e=>e.eventType==='kiwami-grand-battle-east').length,4);
 assert.equal(november.length,30);
 assert.equal(december.length,30);
 assert.equal(all.filter(e=>e.eventType==='agari-stage').length,60);
 assert.equal(all.filter(e=>e.eventType!=='agari-stage').length,197);
 assert.deepEqual(all.filter(e=>e.date.startsWith('2026-12')),monthly,'月別正本と集約JSONは同じ');
 for(const [day,mc1,mc2] of sessions){
  const found=december.filter(e=>e.date==='2026-12-'+day);
  assert.deepEqual(found.map(e=>e.time),['17:00','19:30']);
  assert.deepEqual(found.map(e=>e.mc),[mc1,mc2]);
  assert.deepEqual(found.map(e=>e.timeMinutes),[1020,1170]);
  for(const e of found) assert.equal(e.id,e.date+'-'+e.time.replace(':','')+'-agari-stage');
 }
});
test('香盤の順序・3ブロック・黒塗り3枠を保ち、907件を空名や推測出演者にしない',()=>{
 assert.equal(december.reduce((n,e)=>n+e.performers.length,0),907);
 assert.equal(december.reduce((n,e)=>n+e.excludedSlots.length,0),3);
 assert.deepEqual(december.flatMap(e=>e.excludedSlots.map(x=>[e.id,x.order,x.block])),missing);
 for(const e of december){
  assert.ok(e.mc);
  assert.equal(e.venue,'歌舞伎町Sparkle');
  assert.equal(e.lineupOrder,true);
  assert.deepEqual(e.performers,e.lineup.map(x=>x.name));
  assert.ok(e.performers.every(x=>typeof x==='string'&&x.trim()&&!x.includes('__BLACK__')));
  assert.equal(new Set(e.performers).size,e.performers.length,'同一公演の芸名重複禁止: '+e.id);
  assert.deepEqual([...e.lineup,...e.excludedSlots].map(x=>x.order).sort((a,b)=>a-b),
    Array.from({length:e.lineup.length+e.excludedSlots.length},(_,i)=>i+1),'欠番を詰めない: '+e.id);
  assert.ok(e.lineup.every(x=>[1,2,3].includes(x.block)));
  assert.ok(e.lineup.some(x=>x.block===1)&&e.lineup.some(x=>x.block===2)&&e.lineup.some(x=>x.block===3));
  assert.equal(e.performers.length+e.excludedSlots.length,e.time==='17:00'?30:
    e.date<='2026-12-14'?31:30,'原画像の香盤の枠数を維持: '+e.id);
 }
 assert.equal(december.find(e=>e.id==='2026-12-01-1700-agari-stage').performers[0],'広島兄弟');
 assert.equal(december.find(e=>e.id==='2026-12-01-1700-agari-stage').performers.at(-1),'JJブッツ');
});
test('3枚の元画像と再照合した12月アガり5芸名を香盤位置と集約で固定する',()=>{
 const fixes=[
  {
    "id": "2026-12-01-1930-agari-stage",
    "position": 3,
    "from": "7関構テンパイ",
    "to": "7図柄テンパイ"
  },
  {
    "id": "2026-12-03-1700-agari-stage",
    "position": 16,
    "from": "こしょ温泉",
    "to": "ごしょ温泉"
  },
  {
    "id": "2026-12-04-1700-agari-stage",
    "position": 4,
    "from": "愛♡モーツ！",
    "to": "愛♡モーレツ！"
  },
  {
    "id": "2026-12-16-1700-agari-stage",
    "position": 22,
    "from": "大きくブリガラって",
    "to": "大きくブリガブって"
  },
  {
    "id": "2026-12-17-1700-agari-stage",
    "position": 7,
    "from": "仲悟ワンカラー",
    "to": "伸悟ワンカラー"
  }
];
 for(const {id,position,to} of fixes){
  const e=december.find(x=>x.id===id);
  const total=all.find(x=>x.id===id);
  assert.ok(e&&total,id);
  assert.equal(e.performers[position-1],to,id+' #'+position);
  assert.equal(e.lineup.find(x=>x.order===position).name,to,id+' #'+position);
  assert.deepEqual(total,e,'月別正本と集約一致: '+id);
 }
 assert.equal(december.reduce((n,e)=>n+e.performers.length,0),907);
 assert.equal(all.length,257);
});
test('12月のFANYと11/20発売を11月の10/19発売やオーディション1stの11/18と混同しない',()=>{
 const app=loadApp();
 const decTicket='https://ticket.fany.lol/event/detail/23033';
 const novTicket='https://ticket.fany.lol/event/detail/22035';
 for(const e of december){
  assert.equal(e.ticket.url,decTicket,e.id);
  assert.equal(e.ticket.saleInfo,'一般発売：2026年11月20日（金）10:00～');
  assert.match(e.ticket.purchaseNote,/取り置き可能/);
  assert.match(e.ticket.streamingNote,/配信はございません/);
  assert.deepEqual(e.stageResults.map(x=>x.status),['pending','pending','pending','pending']);
  assert.ok(e.stageResults.every(x=>x.performers.length===0),'未発表の順位を創作しない');
  assert.equal(e.stageResults[3].nextEventType,'sarani-agari-stage');
  const html=app.context.buildEventCardHTML(e,'results',[]);
  assert.equal((html.match(/class="lineup-block"/g)||[]).length,3,e.id);
  assert.ok(html.includes('href="'+decTicket+'"'),e.id);
  assert.ok(html.includes('※配信はありません'),e.id);
  assert.ok(html.includes('※FANY一般発売：11月20日(金)10:00〜'),e.id);
  assert.ok(!html.includes('※FANY一般発売：10月19日'),e.id);
  assert.ok(!html.includes('※ FANY一般販売：11月18日'),e.id);
 }
 for(const e of november){
  assert.equal(e.ticket.url,novTicket);
  const html=app.context.buildEventCardHTML(e,'results',[]);
  assert.ok(html.includes('※FANY一般発売：10月19日(月)10:00〜'),e.id);
  assert.ok(!html.includes('※FANY一般発売：11月20日'),e.id);
 }
 const rights=app.context.getPendingStageGroups({nameQuery:'',eventType:'sarani-agari-stage',month:'all',day:'all',hour:'all'});
 assert.equal(rights.length,1);
 assert.equal(rights[0].names.length,22,'12月未発表分をサラに！の出場権に追加しない');
});
