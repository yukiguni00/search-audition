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
  a.context.updateSearchResultSummary([{sessions:[{},{}]}],2,[{}]);
  assert.equal(a.element('searchResultSummary').textContent,'今後の開催：1件 ／ 進出者・出演予定者一覧：2件 ／ 過去の開催：1件');
  a.context.updateSearchResultSummary([],0,[]);
  assert.equal(a.element('searchResultSummary').textContent,'今後の開催：0件 ／ 進出者・出演予定者一覧：0件 ／ 過去の開催：0件');
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

test('検索一致の凡例を撤去し、オレンジ枠と読み上げ・お気に入りの区別を維持',()=>{
  const fs=require('node:fs');
  const path=require('node:path');
  const root=path.join(__dirname,'..');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const css=fs.readFileSync(path.join(root,'style.css'),'utf8');
  const script=fs.readFileSync(path.join(root,'script.js'),'utf8');
  assert.doesNotMatch(html,/searchMatchLegend|青い枠・下線/);
  assert.doesNotMatch(css,/search-match-legend|#185a9d/);
  assert.doesNotMatch(script,/searchMatchLegend/);
  assert.match(css,/\.performer\.search-match\{outline:2px solid #c65300/);
  assert.match(css,/\.mc-name\.search-match\{outline:2px solid #c65300/);
  assert.match(css,/\.performer\.favorite\{background:#fff59d\}/);
  assert.match(css,/\.performer\.search-match \.performer-name[^\n]*text-decoration:underline/);
  assert.match(script,/（芸人名の検索条件に一致）/);
});
