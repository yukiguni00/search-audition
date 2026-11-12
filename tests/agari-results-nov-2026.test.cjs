const test=require('node:test');
const assert=require('node:assert/strict');
const {readJSON,loadApp}=require('./helpers/app.cjs');
const all=readJSON('data/events.json');
const events=all.filter(e=>e.eventType==='agari-stage');
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
];
const key=e=>e.date+'T'+e.time;
test('公式発表14公演の入賞結果を正しく記録し、その他16公演は未発表',()=>{
  assert.equal(all.length,194);assert.equal(events.length,30);
  const resultKeys=new Set(expected.map(x=>x[0]+'T'+x[1]));
  for(const [date,time,winner,second,third] of expected){
    const e=events.find(e=>e.date===date&&e.time===time);
    assert.ok(e,date+time);
    assert.deepEqual(e.stageResults.map(x=>x.status),['ranked','ranked','ranked','advanced']);
    assert.deepEqual(e.stageResults.map(x=>x.performers),[[winner],[second],third,[winner]]);
    assert.equal(e.stageResults[3].nextEventType,'sarani-agari-stage');
    assert.equal(e.stageResults[3].nextEventTitle,'サラに！アガり！ステージ');
    assert.match(e.stageResults[3].label,/出場権/);
    assert.ok(!Object.hasOwn(e.stageResults[3],'nextDate'));
    for(const name of [winner,second,...third]){
      if(date==='2026-11-02'&&time==='17:00'&&name==='サンライズ'){
        assert.equal(e.mc,name);assert.ok(!e.performers.includes(name),'MCを出演者へ勝手に追加しない');
      } else if(date==='2026-11-11'&&time==='17:00'&&name==='山下野村'){
        assert.ok(!e.performers.includes(name),'発表された3位を事前香盤に推測追加しない');
      } else if(date==='2026-11-11'&&time==='19:30'&&name==='髙橋ごとき'){
        assert.ok(e.performers.includes('高橋ごとき'),'事前香盤の表記を維持');
        assert.ok(!e.performers.includes(name),'公式表記で香盤を無断変更しない');
      } else assert.ok(e.performers.includes(name),date+time+name);
    }
    assert.deepEqual(monthly.find(x=>key(x)===key(e)),e);
  }
  assert.equal(events.filter(e=>!resultKeys.has(key(e))).length,16);
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
test('サラに！出場権14組は1枚の専用カード。3位同順位は3名表示',()=>{
  const app=loadApp();
  const e=events.find(e=>e.date==='2026-11-04'&&e.time==='19:30');
  const html=app.context.getStageResultsHTML(e,[]);
  for(const n of ['プテラエリア','こへい','鬼河童','フィッシュおさかな','ユンクフラワー'])assert.ok(html.includes(n),n);
  const groups=app.context.getPendingStageGroups({nameQuery:'',eventType:'all',month:'all',day:'all',hour:'all'});
  const rights=groups.filter(g=>g.nextEventType==='sarani-agari-stage');
  assert.equal(rights.length,1);assert.equal(rights[0].names.length,14);
  assert.equal(rights[0].nextDate,'');
  const output=app.context.buildPendingStageCardHTML(rights[0],[]);
  assert.match(output,/出場権獲得者/);assert.match(output,/出演日時未確認/);
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
