const test=require('node:test');
const assert=require('node:assert/strict');
const {readJSON,loadApp}=require('./helpers/app.cjs');
const all=readJSON('data/events.json');
const events=all.filter(e=>e.eventType==='agari-stage'&&e.date.startsWith('2026-11'));
const monthly=readJSON('data/events/2026-11.json').filter(e=>e.eventType==='agari-stage');
const expected=[
  ['2026-11-02','17:00','ライダーキック','絶品',['サンライズ']],
  ['2026-11-02','19:30','パピヨン','ミロデジャネイロ',['バレンシア']],
  ['2026-11-04','17:00','きっと君はくるさ','ザ・ギター',['大晦日ナオト']],
  ['2026-11-04','19:30','プテラエリア','こへい',['鬼河童','フィッシュおさかな','ユンクフラワー']],
  ['2026-11-05','17:00','サクラダ前線','烏骨鶏',['でっかい！くぼた']],
  ['2026-11-05','19:30','坊主ボーイズ','パリストンズ',['京都熊本']],
  ['2026-11-06','17:00','ハヤヲ','ガチ銀河',['都々逸']],
  ['2026-11-06','19:30','フクロクジュ','桂馬大ジャンプ',['燦々メイデン']],
  ['2026-11-09','17:00','XYZ','トラモチーフ',['七色フラン']],
  ['2026-11-09','19:30','ピーチキャッスル','それありき',['ボレロ']],
  ['2026-11-10','17:00','バチョフ','象美人',['テキーラカンガルー']],
  ['2026-11-10','19:30','御恩と奉公と痛み','タナバタ',['クロフォード']],
  ['2026-11-11','17:00','バイバイスプリット','裏切りマンキーコング風次',['山下野村']],
  ['2026-11-11','19:30','阿部直也','髙橋ごとき',['ニューシャネル']],
  ['2026-11-12','17:00','ランス39号','ウルトラスーパーコバタナックス',['ラーフル']],
  ['2026-11-12','19:30','マルティンス','マシン語感',['ゾンビのアトリエ']],
  ['2026-11-13','17:00','パウリスタ','ヒッキー北風',['かるかん']],
  ['2026-11-13','19:30','まえだかっこかり','鈴木ララバイ',['ええいちにち']],
  ['2026-11-16','17:00','超アジア','タイサンボク',['既婚者']],
  ['2026-11-16','19:30','アイガモシーサー','2人のトイボックス',['ウィークリー習慣']],
  ['2026-11-17','17:00','ダスティローデス','ナビゲーター',['片翼のチキン']],
  ['2026-11-17','19:30','ただならぬ刀','千年ぶり',['まろやか']],
  ['2026-11-18','17:00','きしゃぽっぽ',['笠川拓夢'],['ナターリア']],
  ['2026-11-18','19:30','スーパートマト',['くろざとう','しゃちほこダイナソー'],['せらっきょ']],
  ['2026-11-19','17:00','ミックストマトジュース','デンゼル',['ムエタイ出身']],
  ['2026-11-19','19:30','ゴスケ','スティックセニョール',['ラクダ人生']],
  ['2026-11-20','17:00','き展','広島兄弟',['桃子','キンジトウ']],
  ['2026-11-20','19:30','つつがないね','あさゆま',['コロネケン']],
];
const key=e=>e.date+'T'+e.time;
const saraniTicket={url:'https://ticket.fany.lol/reception/70947/55946',linkLabel:'FANYチケット',saleInfo:'※FANY一般発売：11月20日(金)10:00〜',purchaseNote:'出演者への取り置きも可能です',streamingNote:'※配信はありません'};
function assertSarAniSchedule(result){
  assert.equal(result.nextDate,'2026-11-27');
  assert.equal(result.nextTime,'17:00');
  assert.equal(result.nextVenue,'歌舞伎町Sparkle');
  assert.deepEqual(result.nextTicket,saraniTicket);
  assert.ok(!('nextDateEnd' in result),'1公演だけの確定日時');
}

test('公式発表28公演の入賞結果を正しく記録し、その他2公演は未発表',()=>{
  assert.equal(events.length,30);
  const resultKeys=new Set(expected.map(x=>x[0]+'T'+x[1]));
  for(const [date,time,winner,second,third] of expected){
    const e=events.find(e=>e.date===date&&e.time===time);
    assert.ok(e,date+time);
    assert.deepEqual(e.stageResults.map(x=>x.status),['ranked','ranked','ranked','advanced']);
    assert.deepEqual(e.stageResults.map(x=>x.performers),[[winner],Array.isArray(second)?second:[second],third,[winner]]);
    assert.equal(e.stageResults[3].nextEventType,'sarani-agari-stage');
    assert.equal(e.stageResults[3].nextEventTitle,'サラに！アガり！ステージ');
    assert.match(e.stageResults[3].label,/出場権/);
    assertSarAniSchedule(e.stageResults[3]);
    for(const name of [winner,...(Array.isArray(second)?second:[second]),...third]){
      if(date==='2026-11-02'&&time==='17:00'&&name==='サンライズ'){
        assert.equal(e.mc,name);assert.ok(!e.performers.includes(name),'MCを出演者へ勝手に追加しない');
      } else if(date==='2026-11-11'&&time==='17:00'&&name==='山下野村'){
        assert.ok(!e.performers.includes(name),'発表された3位を事前香盤に推測追加しない');
      } else if(date==='2026-11-18'&&time==='17:00'&&name==='笠川拓夢'){
        assert.ok(!e.performers.includes(name),'発表された2位を事前香盤に推測追加しない');
      } else if(date==='2026-11-11'&&time==='19:30'&&name==='髙橋ごとき'){
        assert.ok(e.performers.includes('高橋ごとき'),'事前香盤の表記を維持');
        assert.ok(!e.performers.includes(name),'公式表記で香盤を無断変更しない');
      } else assert.ok(e.performers.includes(name),date+time+name);
    }
    assert.deepEqual(monthly.find(x=>key(x)===key(e)),e);
  }
  assert.equal(events.filter(e=>!resultKeys.has(key(e))).length,2);
  assert.ok(events.filter(e=>!resultKeys.has(key(e))).every(e=>e.stageResults.every(r=>r.status==='pending'&&r.performers.length===0)));
  assert.equal(events.find(e=>e.date==='2026-11-04'&&e.time==='19:30').stageResults[2].performers.length,3);
});
test('30公演の共通FANYと販売・取り置き・配信なし',()=>{
  const app=loadApp();
  for(const e of events){
    assert.equal(e.ticket.url,'https://ticket.fany.lol/event/detail/22035');
    assert.equal(e.ticket.linkLabel,'FANYチケット');
    assert.match(e.ticket.saleInfo,/2026年10月19日（月）10:00/);
    assert.match(e.ticket.purchaseNote,/取り置き可能/);
    assert.match(e.ticket.streamingNote,/配信はございません/);
    assert.ok(app.context.getTicketLinkHTML(e,'results').includes('href="https://ticket.fany.lol/event/detail/22035"'));
  }
});
test('11/27開催のサラに！出場権28組は1枚の専用カード。3位同順位は3名表示',()=>{
  const app=loadApp();
  const e=events.find(e=>e.date==='2026-11-04'&&e.time==='19:30');
  const html=app.context.getStageResultsHTML(e,[]);
  for(const n of ['プテラエリア','こへい','鬼河童','フィッシュおさかな','ユンクフラワー'])assert.ok(html.includes(n),n);
  const groups=app.context.getPendingStageGroups({nameQuery:'',eventType:'all',month:'all',day:'all',hour:'all'});
  const rights=groups.filter(g=>g.nextEventType==='sarani-agari-stage');
  assert.equal(rights.length,1);assert.equal(rights[0].names.length,28);
  assert.equal(rights[0].nextDate,'2026-11-27');
  assert.equal(rights[0].nextTime,'17:00');
  assert.equal(rights[0].venue,'歌舞伎町Sparkle');
  assert.equal(JSON.stringify(rights[0].ticket),JSON.stringify(saraniTicket));
  const output=app.context.buildPendingStageCardHTML(rights[0],[]);
  assert.match(output,/出場権獲得者/);
  assert.match(output,/11月27日\(金\) 開演17:00/);
  assert.match(output,/会場：歌舞伎町Sparkle/);
  assert.ok(output.includes('href="https://ticket.fany.lol/reception/70947/55946"'));
  assert.ok(output.includes('※FANY一般発売：11月20日(金)10:00〜'));
  assert.doesNotMatch(output,/出演日時未確認/);
  assert.match(output,/ticket-note ticket-note-unified/);
  assert.match(output,/チケットの購入は <a href="https:\/\/ticket\.fany\.lol\/reception\/70947\/55946"[^>]*>FANY<\/a>/);
  assert.match(output,/もしくは出演者への取り置きも可能です/);
  assert.match(output,/※配信はありません/);
  assert.ok(output.indexOf('チケットの購入は')<output.indexOf('もしくは出演者への取り置きも可能です'));
  assert.ok(output.indexOf('もしくは出演者への取り置きも可能です')<output.indexOf('※FANY一般発売：11月20日(金)10:00〜'));
  assert.ok(output.indexOf('※FANY一般発売：11月20日(金)10:00〜')<output.indexOf('※配信はありません'));
  assert.equal((output.match(/ticket-note-unified/g)||[]).length,1,'同一カードに一つだけチケット案内');
});

test('11/2 1部の第3位サンライズは公式結果を維持し、香盤MCとの差異を公演注記に表示',()=>{
  const e=events.find(e=>e.id==='2026-11-02-1700-agari-stage');
  assert.ok(e);
  const expectedNote='※公式Xでは第3位「サンライズ」と発表されていますが、事前香盤では同組はMCとして記載されています。';
  assert.equal(e.eventNotice,expectedNote);
  assert.equal(e.mc,'サンライズ');
  assert.ok(!e.performers.includes('サンライズ'),'事前香盤に追加しない');
  assert.deepEqual(e.stageResults[2].performers,['サンライズ'],'公式Xの3位は維持する');
  assert.equal(monthly.find(x=>x.id===e.id).eventNotice,expectedNote);
  const app=loadApp();
  const html=app.context.buildEventCardHTML(e,'archiveResults',[]);
  assert.match(html,/class="event-notice"/);
  assert.ok(html.includes(expectedNote),'カードの注記に正確な文言が出る');
  assert.equal(events.filter(x=>x.eventNotice===expectedNote).length,1,'注記は11/2 1部のみ');
});

test('11/11の発表結果と事前香盤の相違は該当公演に限定し、香盤やMCを保持',()=>{
  const cases=[
    ['2026-11-11-1700-agari-stage','山下野村',"※結果発表では第3位「山下野村」とされていますが、事前香盤の出演者欄には記載がありません。",'3位'],
    ['2026-11-11-1930-agari-stage','髙橋ごとき',"※結果発表では第2位「髙橋ごとき」とされていますが、事前香盤では「高橋ごとき」と表記されています。",'2位'],
  ];
  const app=loadApp();
  for(const [id,name,note,label] of cases){
    const e=events.find(x=>x.id===id);
    assert.ok(e,id);
    assert.equal(e.eventNotice,note);
    assert.equal(monthly.find(x=>x.id===id).eventNotice,note);
    const result=e.stageResults.find(x=>x.label===label);
    assert.ok(result&&result.performers.includes(name),id);
    const html=app.context.buildEventCardHTML(e,'archiveResults',[]);
    assert.ok(html.includes(note),'過去公演カードに注記を表示: '+id);
    assert.equal(events.filter(x=>x.eventNotice===note).length,1);
    assert.deepEqual(e.performers,e.lineup.map(p=>p.name),'元の香盤を変えない');
    if(label==='2位') assert.ok(e.performers.includes('高橋ごとき'));
    if(label==='3位') assert.ok(!e.performers.includes('山下野村'));
  }
});
test('11/12・13の4公演は発表順位・出場権のみ更新、香盤とMC・未確認日時を保持',()=>{
  const cases=[["2026-11-12","17:00","ランス39号","ウルトラスーパーコバタナックス",["ラーフル"]],["2026-11-12","19:30","マルティンス","マシン語感",["ゾンビのアトリエ"]],["2026-11-13","17:00","パウリスタ","ヒッキー北風",["かるかん"]],["2026-11-13","19:30","まえだかっこかり","鈴木ララバイ",["ええいちにち"]]];
  const app=loadApp();
  for(const [date,time,winner,second,third] of cases){
    const e=events.find(x=>x.date===date&&x.time===time);
    assert.ok(e,date+time);
    assert.deepEqual(e.stageResults.map(x=>x.status),['ranked','ranked','ranked','advanced']);
    assert.deepEqual(e.stageResults.map(x=>x.performers),[[winner],Array.isArray(second)?second:[second],third,[winner]]);
    assert.deepEqual(e.performers,e.lineup.map(p=>p.name),'香盤を変えない');
    assert.ok([winner,...(Array.isArray(second)?second:[second]),...third].every(n=>e.performers.includes(n)),'順位全員が出演者');
    assert.ok(!e.eventNotice,'香盤差異注記なし');
    assertSarAniSchedule(e.stageResults[3]);
    assert.match(app.context.getStageResultsHTML(e,[]),/サラに！アガり！ステージ出場権/);
  }
  const a=events.find(e=>e.date==='2026-11-12'&&e.time==='17:00');
  const b=events.find(e=>e.date==='2026-11-12'&&e.time==='19:30');
  assert.equal(a.mc,'マルティンス','1部のMCを維持');
  assert.equal(b.stageResults[0].performers[0],'マルティンス','2部の最優秀者を維持');
  const late=events.find(e=>e.id==='2026-11-13-1930-agari-stage');
  assert.equal(late.excludedSlots[0].order,4,'既存の判読不可枠を維持');
});

test('ライブ名選択にサラに！を追加し、11/27の28組を日付・時間・芸人名で絞り込める',()=>{
  const fs=require('node:fs');
  const path=require('node:path');
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.match(html,/<option value="sarani-agari-stage">サラに！アガり！ステージ<\/option>/);
  assert.doesNotMatch(html,/<option value="standup">/);
  const app=loadApp();
  const filters={nameQuery:'',eventType:'sarani-agari-stage',month:'all',day:'all',hour:'all'};
  assert.equal(events.filter(e=>e.eventType==='sarani-agari-stage').length,0,'既存の進出者カードを使い、重複公演を作成しない');
  const groups=app.context.getPendingStageGroups(filters);
  assert.equal(groups.length,1,'出場権獲得者は1枚の専用カード');
  assert.equal(groups[0].nextEventType,'sarani-agari-stage');
  assert.equal(groups[0].nextEventTitle,'サラに！アガり！ステージ');
  assert.equal(groups[0].nextDate,'2026-11-27','主催発表の開催日');
  assert.equal(groups[0].nextTime,'17:00');
  assert.equal(groups[0].venue,'歌舞伎町Sparkle');
  assert.equal(groups[0].names.length,28);
  const htmlCard=app.context.buildPendingStageCardHTML(groups[0],[]);
  assert.match(htmlCard,/出場権獲得者/);
  assert.match(htmlCard,/11月27日\(金\) 開演17:00/);
  assert.match(htmlCard,/※FANY一般発売：11月20日\(金\)10:00〜/);
  const one=app.context.getPendingStageGroups({...filters,nameQuery:app.context.normalizeText('ランス39号')});
  assert.equal(one.length,1);
  assert.deepEqual([...one[0].names],['ランス39号']);
  assert.equal(one[0].totalCount,28);
  assert.equal(app.context.getPendingStageGroups({...filters,month:'11'}).length,1,'11月を指定しても検索できる');
  assert.equal(app.context.getPendingStageGroups({...filters,month:'11',day:'27',hour:'17'}).length,1,'11/27 17時でヒット');
  assert.equal(app.context.getPendingStageGroups({...filters,month:'11',day:'26'}).length,0,'前日にはヒットしない');
  assert.equal(app.context.getPendingStageGroups({...filters,month:'11',day:'27',hour:'18'}).length,0,'開演後の時間ではヒットしない');
  assert.equal(app.context.getPendingStageGroups({...filters,month:'12'}).length,0,'別の月にはヒットしない');
});

test('11/17の2公演の1位・2位・3位、サラに！出場権を保存し、MC・香盤を変更しない',()=>{
  const app=loadApp();
  const source=[
    ['2026-11-17-1700-agari-stage','ダスティローデス','ナビゲーター','片翼のチキン','スーパーロバ'],
    ['2026-11-17-1930-agari-stage','ただならぬ刀','千年ぶり','まろやか','スーズ']
  ];
  for(const [id,winner,second,third,mc] of source){
    const e=events.find(x=>x.id===id);
    assert.ok(e,id);
    assert.equal(e.mc,mc,'既存MCを維持');
    assert.deepEqual(e.stageResults.map(x=>x.status),['ranked','ranked','ranked','advanced']);
    assert.deepEqual(e.stageResults.map(x=>x.performers),[[winner],[second],[third],[winner]]);
    assert.deepEqual(e.performers,e.lineup.map(p=>p.name),'香盤と出演者を維持');
    assert.ok([winner,second,third].every(x=>e.performers.includes(x)),'順位全員が出演者');
    assert.equal(e.stageResults[3].nextEventType,'sarani-agari-stage');
    assert.equal(e.stageResults[3].nextEventTitle,'サラに！アガり！ステージ');
    assertSarAniSchedule(e.stageResults[3]);
    assert.ok(!e.eventNotice,'香盤と公式結果に不一致なし');
    assert.deepEqual(monthly.find(x=>x.id===id),e);
    const html=app.context.buildEventCardHTML(e,'archiveResults',[]);
    for(const name of [winner,second,third])assert.ok(html.includes(name),name);
    assert.match(html,/サラに！アガり！ステージ出場権/);
  }
  assert.equal(events.filter(e=>e.stageResults[0].status==='ranked').length,28);
  assert.equal(events.filter(e=>e.stageResults[0].status==='pending').length,2);
  const rights=app.context.getPendingStageGroups({nameQuery:'',eventType:'sarani-agari-stage',month:'all',day:'all',hour:'all'});
  assert.equal(rights.length,1);
  assert.equal(rights[0].names.length,28);
  assert.equal(rights[0].nextDate,'2026-11-27');
});

test('11/16の2公演の公式順位を保持し、1部MCのウィークリー習慣と2部3位を区別',()=>{
  const app=loadApp();
  const source=[
    ['2026-11-16','17:00','超アジア','タイサンボク','既婚者'],
    ['2026-11-16','19:30','アイガモシーサー','2人のトイボックス','ウィークリー習慣']
  ];
  for(const [date,time,winner,second,third] of source){
    const e=events.find(x=>x.date===date&&x.time===time);
    assert.ok(e,date+time);
    assert.deepEqual(e.stageResults.map(x=>x.performers),[[winner],[second],[third],[winner]]);
    assert.deepEqual(e.stageResults.map(x=>x.status),['ranked','ranked','ranked','advanced']);
    assert.equal(e.stageResults[3].nextEventType,'sarani-agari-stage');
    assertSarAniSchedule(e.stageResults[3]);
    assert.deepEqual(e.performers,e.lineup.map(p=>p.name),'香盤を変更しない');
    assert.ok([winner,second,third].every(x=>e.performers.includes(x)));
    assert.ok(!e.eventNotice,'不一致注記を追加しない');
    assert.match(app.context.getStageResultsHTML(e,[]),/サラに！アガり！ステージ出場権/);
    assert.deepEqual(monthly.find(x=>x.id===e.id),e);
  }
  const first=events.find(e=>e.id==='2026-11-16-1700-agari-stage');
  const second=events.find(e=>e.id==='2026-11-16-1930-agari-stage');
  assert.equal(first.mc,'ウィークリー習慣');
  assert.ok(!first.performers.includes('ウィークリー習慣'),'MCを香盤に追加しない');
  assert.deepEqual(second.stageResults[2].performers,['ウィークリー習慣']);
  assert.equal(second.mc,'ちゃらん婆','2部MCを維持');
});

test('11/18の順位・同率2位と香盤不一致の注記を確認',()=>{
 const app=loadApp();
 const cases=[['2026-11-18-1700-agari-stage','きしゃぽっぽ',['笠川拓夢'],['ナターリア'],'草枕'],['2026-11-18-1930-agari-stage','スーパートマト',['くろざとう','しゃちほこダイナソー'],['せらっきょ'],'月面ビート']];
 for(const [id,winner,second,third,mc] of cases){
  const e=events.find(x=>x.id===id);assert.ok(e,id);assert.equal(e.mc,mc);
  assert.deepEqual(e.stageResults.map(r=>r.status),['ranked','ranked','ranked','advanced']);
  assert.deepEqual(e.stageResults.map(r=>r.performers),[[winner],second,third,[winner]]);
  assert.deepEqual(e.performers,e.lineup.map(p=>p.name),'香盤を維持');
  assert.deepEqual(monthly.find(x=>x.id===id),e);
  assert.equal(e.stageResults[3].nextEventType,'sarani-agari-stage');
  assertSarAniSchedule(e.stageResults[3]);
  const html=app.context.buildEventCardHTML(e,'archiveResults',[]);
  for(const name of [winner,...second,...third])assert.ok(html.includes(name),name);
  if(id.includes('1700')){
   assert.equal(e.eventNotice,'※結果発表では第2位「笠川拓夢」とされていますが、事前香盤の出演者欄には記載がありません。');
   assert.ok(!e.performers.includes('笠川拓夢'));
   assert.ok(html.includes(e.eventNotice));
  }else{
   assert.ok(second.every(n=>e.performers.includes(n)));
   assert.equal(second.length,2);
   assert.ok(!e.eventNotice);
  }
 }
});

test('11/19の2公演の順位・出場権を保持し、香盤やMCを変更しない',()=>{
 const app=loadApp();
 const cases=[['2026-11-19-1700-agari-stage','ミックストマトジュース','デンゼル','ムエタイ出身','ラクダ人生'],['2026-11-19-1930-agari-stage','ゴスケ','スティックセニョール','ラクダ人生','キゲンゼン']];
 for(const [id,winner,second,third,mc] of cases){
  const e=events.find(x=>x.id===id);assert.ok(e,id);
  assert.equal(e.mc,mc,'元のMCを変更しない');
  assert.deepEqual(e.performers,e.lineup.map(x=>x.name),'香盤順と出演者を維持');
  assert.equal(e.performers.length,28);
  assert.ok([winner,second,third].every(n=>e.performers.includes(n)),'全入賞者は出演者一覧にいる');
  assert.deepEqual(e.stageResults.map(x=>x.status),['ranked','ranked','ranked','advanced']);
  assert.deepEqual(e.stageResults.map(x=>x.performers),[[winner],[second],[third],[winner]]);
  assert.equal(e.stageResults[3].nextEventType,'sarani-agari-stage');
  assert.equal(e.stageResults[3].nextEventTitle,'サラに！アガり！ステージ');
  assertSarAniSchedule(e.stageResults[3]);
  assert.ok(!e.eventNotice,'香盤不一致の注記は不要');
  assert.deepEqual(monthly.find(x=>x.id===id),e,'月別と集約の同期');
  const html=app.context.buildEventCardHTML(e,'archiveResults',[]);
  for(const name of [winner,second,third])assert.ok(html.includes(name),name);
  assert.match(html,/サラに！アガり！ステージ出場権/);
 }
 const a=events.find(x=>x.id==='2026-11-19-1700-agari-stage');
 const b=events.find(x=>x.id==='2026-11-19-1930-agari-stage');
 assert.equal(a.mc,'ラクダ人生');
 assert.ok(!a.performers.includes('ラクダ人生'),'1部MCを勝手に出演者へ追加しない');
 assert.deepEqual(b.stageResults[2].performers,['ラクダ人生'],'2部第3位と1部MCを区別');
 const rights=app.context.getPendingStageGroups({nameQuery:'',eventType:'sarani-agari-stage',month:'all',day:'all',hour:'all'});
 assert.equal(rights.length,1);assert.equal(rights[0].names.length,28);
 assert.equal(events.filter(x=>x.stageResults[0].status==='pending').length,2);
});

test('11/24の未発表2公演には架空の最優秀者やサラに！出場権を追加しない',()=>{
 const pending=events.filter(e=>e.stageResults[0].status==='pending');
 assert.equal(pending.length,2);
 for(const e of pending){
  assert.ok(e.stageResults.every(r=>r.performers.length===0&&r.status==='pending'));
  assert.ok(e.stageResults.every(r=>!r.nextDate&&!r.nextTicket));
 }
 assert.equal(events.filter(e=>e.stageResults[3].status==='advanced').length,28);
});

test('11/20 1部のき展・広島兄弟・桃子とキンジトウ同率3位を反映し、元の香盤とMCを保持',()=>{
 const a=events.find(e=>e.id==='2026-11-20-1700-agari-stage');
 const b=events.find(e=>e.id==='2026-11-20-1930-agari-stage');
 assert.ok(a&&b,'11/20の2公演を維持');
 assert.equal(a.mc,'コロネケン');
 assert.equal(a.performers.length,28);
 assert.deepEqual(a.performers,a.lineup.map(x=>x.name),'事前香盤順を変更しない');
 assert.ok(['き展','広島兄弟','桃子','キンジトウ'].every(x=>a.performers.includes(x)),'入賞者は全員事前香盤に存在');
 assert.deepEqual(a.stageResults.map(r=>r.status),['ranked','ranked','ranked','advanced']);
 assert.deepEqual(a.stageResults.map(r=>r.performers),[['き展'],['広島兄弟'],['桃子','キンジトウ'],['き展']]);
 assertSarAniSchedule(a.stageResults[3]);
 assert.ok(!a.eventNotice,'新たな相違注記は不要');
 assert.deepEqual(monthly.find(e=>e.id===a.id),a,'月別正本と集約を同期');
 assert.equal(b.mc,'すしまる','2部のMCは変えない');
 const app=loadApp();
 const html=app.context.getStageResultsHTML(a,[]);
 for(const name of ['き展','広島兄弟','桃子','キンジトウ'])assert.ok(html.includes(name),name);
 const advance=app.context.getPendingStageGroups({nameQuery:app.context.normalizeText('き展'),eventType:'sarani-agari-stage',month:'11',day:'27',hour:'17'});
 assert.equal(advance.length,1);
 assert.deepEqual(Array.from(advance[0].names),['き展'],'11/27の専用カードで検索できる');
});

test('11/20 2部のつつがないね・あさゆま・コロネケン3位を登録し、1部MCと区別',()=>{
 const first=events.find(e=>e.id==='2026-11-20-1700-agari-stage');
 const second=events.find(e=>e.id==='2026-11-20-1930-agari-stage');
 assert.ok(first&&second,'11/20の2公演');
 assert.equal(first.mc,'コロネケン','1部はMC');
 assert.ok(!first.performers.includes('コロネケン'),'1部のMCを香盤に入れない');
 assert.equal(second.mc,'すしまる','2部のMCは維持');
 assert.equal(second.performers.length,29);
 assert.deepEqual(second.performers,second.lineup.map(x=>x.name),'2部香盤順は不変');
 assert.ok(['つつがないね','あさゆま','コロネケン'].every(n=>second.performers.includes(n)),'発表順位は全員2部出演者');
 assert.deepEqual(second.stageResults.map(r=>r.status),['ranked','ranked','ranked','advanced']);
 assert.deepEqual(second.stageResults.map(r=>r.performers),[['つつがないね'],['あさゆま'],['コロネケン'],['つつがないね']]);
 assertSarAniSchedule(second.stageResults[3]);
 assert.ok(!second.eventNotice,'2部の香盤と結果は一致');
 assert.deepEqual(monthly.find(e=>e.id===second.id),second,'月別正本と集約を同期');
 assert.deepEqual(first.stageResults[2].performers,['桃子','キンジトウ'],'1部の3位同順位も維持');
 const app=loadApp();
 const html=app.context.getStageResultsHTML(second,[]);
 for(const name of ['つつがないね','あさゆま','コロネケン'])assert.ok(html.includes(name),name);
 const groups=app.context.getPendingStageGroups({nameQuery:app.context.normalizeText('つつがないね'),eventType:'sarani-agari-stage',month:'11',day:'27',hour:'17'});
 assert.equal(groups.length,1,'11/27サラに！へ進出');
 assert.deepEqual(Array.from(groups[0].names),['つつがないね'],'新規出場権が個別検索に表示');
});

test('11/27日時確定サラに！の出場権は、お気に入りで12月の予定より先に表示',()=>{
 const app=loadApp();
 app.run('todayString=()=>"2026-11-20"');
 app.context.saveFavorites([app.context.normalizeText('パピヨン')]);
 const g=app.context.getFavoriteScheduleData().eventGroups;
 const sarani=g.find(x=>x.event.eventType==='sarani-agari-stage');
 assert.ok(sarani,'出場権カードはお気に入りの予定に含まれる');
 assert.equal(sarani.event.date,'2026-11-27');
 assert.equal(sarani.event.time,'17:00');
 assert.equal(sarani.event.venue,'歌舞伎町Sparkle');
 assert.match(app.context.getFavoriteScheduleLabel(sarani.event),/11月27日\(金\) 開演17:00/);
 const nextDecember=g.findIndex(x=>x.event.date.startsWith('2026-12'));
 assert.ok(nextDecember>=0,'12月の出演予定が残っている');
 assert.ok(g.indexOf(sarani)<nextDecember,'日程確定した11/27を12月公演より先に表示');
});
