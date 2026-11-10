const test = require('node:test');
const assert = require('node:assert/strict');
const {loadApp} = require('./helpers/app.cjs');

test('一致強調は検索と同じ正規化・部分一致。空白、全角、改名、日本語、空条件', () => {
  const a=loadApp();
  for(const [name,query,expected] of [['ＺＡＺＹ',' zazy ',true],['野球 と サッカー','と',true],['竹迫ゆうじだ！！！','竹迫ゆうじ',true],['別の名前','zazy',false],['ZAZY','   ',false]]) {
    assert.equal(a.context.performerMatchesNameQuery(name,a.context.normalizeText(query)),expected);
  }
});
test('件数はカード単位。複数セッションも1件、一覧は別枠、ゼロ件も明記', () => {
  const a=loadApp();
  a.context.updateSearchResultSummary([{sessions:[{},{}]}],2,[{}],{nameQuery:'a'});
  assert.equal(a.element('searchResultSummary').textContent,'今後の開催：1件 ／ 進出者・出演予定者一覧：2件 ／ 過去の開催：1件');
  assert.equal(a.element('searchMatchLegend').hidden,false);
  a.context.updateSearchResultSummary([],0,[],{nameQuery:''});
  assert.equal(a.element('searchResultSummary').textContent,'今後の開催：0件 ／ 進出者・出演予定者一覧：0件 ／ 過去の開催：0件');
  assert.equal(a.element('searchMatchLegend').hidden,true);
});
test('強調は既存チップにクラスと読み上げ説明を追加し、名前をHTMLへ挿入しない', () => {
  const a=loadApp();const added=[];const children=[];
  a.context.document.createElement=tag=>({tag});
  const name='<img src=x onerror=alert(1)>';
  const chip={querySelector:()=>({dataset:{name}}),classList:{add:value=>added.push(value)},appendChild:node=>children.push(node)};
  a.context.emphasizeSearchMatches({querySelectorAll:()=>[chip]},a.context.normalizeText(name));
  assert.deepEqual(added,['search-match']);assert.equal(children[0].tag,'span');
  assert.equal(children[0].textContent,'（芸人名の検索条件に一致）');
  assert.equal(children[0].innerHTML,undefined);
});
test('描画した自動生成一覧の件数を返す。通常カードや各セッションを加算しない', () => {
  const a=loadApp();
  a.set('fixture',[{id:'source',date:'2026-10-01',eventType:'audition-1st-east',performers:['ＺＡＺＹ'],qualifiedPerformers:['ＺＡＺＹ'],qualifiedNextStageDate:'2026-11-01'}]);
  a.run('events=fixture');const filters={nameQuery:'zazy',eventType:'all',month:'all',day:'all',hour:'all'};
  assert.equal(a.context.renderMainEvents('results',[],filters),1);
  assert.match(a.element('results').innerHTML,/pending-stage-card/);
  assert.equal(a.context.renderMainEvents('results',[],{...filters,nameQuery:'nonexistent'}),0);
});
