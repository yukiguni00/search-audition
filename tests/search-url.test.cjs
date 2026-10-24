const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./helpers/app.cjs');
const empty = {nameQuery:'',eventType:'all',month:'all',day:'all',hour:'all'};
test('共有URLは検索5項目だけ。日本語・前後空白を保持し、私的な値・解析フラグ・hashは除去', () => {
  const a = loadApp();
  const filters = {...empty,nameQuery:' 野球 と サッカー ',eventType:'audition-2nd-east',month:'10',day:'30',hour:'13',favoritesOnly:true,favoritePerformers:['SECRET'],backup:'BACKUP'};
  const url = a.context.buildSharedSearchURL('https://example.test/search-audition/?noanalytics=1&backup=SECRET#private', filters);
  assert.equal(url.origin+url.pathname, 'https://example.test/search-audition/');
  assert.deepEqual([...url.searchParams.keys()], ['name','eventType','month','day','hour']);
  assert.equal(url.searchParams.get('name'), filters.nameQuery);
  assert.equal(url.hash, ''); assert.ok(!url.href.includes('SECRET')); assert.ok(!url.href.includes('BACKUP'));
});
test('条件なしの共有URLはquery/hashなし', () => {
  const a = loadApp();
  assert.equal(a.context.buildSharedSearchURL('https://example.test/?name=old&noanalytics=1#contact',empty).href,'https://example.test/');
});
function prepare(a, href) {
  for (const [id,values] of Object.entries({eventType:['all','audition-1st-east','audition-2nd-east'],month:['all','10'],day:['all','30'],hour:['all','13']})) {
    a.element(id).options=values.map(value=>({value}));
  }
  const state={location:{href},history:{state:{keep:true},replaceState(kept,title,url){assert.deepEqual(kept,{keep:true});state.location.href=url;}}};
  a.set('window',state);
  return state;
}
test('URL復元はselect選択肢だけを受理し、未知値・重複指定は初期値へ戻す', () => {
  const a=loadApp(); prepare(a,'https://example.test/?name=%E9%87%8E%E7%90%83+%E3%81%A8&eventType=unknown&month=13&day=30&hour=13&hour=14&favoritePerformers=secret');
  a.context.restoreSearchFiltersFromURL();
  assert.equal(a.element('nameQuery').value,'野球 と');
  assert.equal(a.element('eventType').value,'all'); assert.equal(a.element('month').value,'all');
  assert.equal(a.element('day').value,'30'); assert.equal(a.element('hour').value,'all');
});
test('URL更新はreplaceStateのみ。noanalytics=1を保持し、クリアで検索パラメータを除去', () => {
  const a=loadApp();const state=prepare(a,'https://example.test/?noanalytics=1&backup=secret');
  a.element('nameQuery').value='サンライズ'; a.element('day').value='30';
  a.context.updateSearchURL();
  let url=new URL(state.location.href);
  assert.equal(url.searchParams.get('noanalytics'),'1'); assert.equal(url.searchParams.get('name'),'サンライズ'); assert.equal(url.searchParams.get('backup'),null);
  a.element('nameQuery').value='';a.element('day').value='all';a.context.updateSearchURL();
  assert.equal(new URL(state.location.href).search,'?noanalytics=1');
});
test('history APIが拒否されても検索URL更新処理は例外を外へ出さない', () => {
  const a=loadApp();const state=prepare(a,'https://example.test/?noanalytics=1');
  a.element('nameQuery').value='サンライズ';state.history.replaceState=()=>{throw new Error('restricted');};
  assert.doesNotThrow(()=>a.context.updateSearchURL());
});
