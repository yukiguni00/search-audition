const test = require('node:test');
const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {loadApp, readJSON} = require('./helpers/app.cjs');
const fixture = readJSON('tests/fixtures/2026-10-30-stage-results.json');
const all = readJSON('data/events.json');
const stages = fixture.events.map(expected => all.find(event => event.id === expected.id));

test('10/30公式結果: 極6・翔15、各部1/0・2/5・3/10。全員が出演者で区分間の重複なし', () => {
  const a = loadApp();
  assert.deepEqual(stages.map(event => event.stageResults.map(result => result.performers.length)), [[1,0],[2,5],[3,10]]);
  const registered = [];
  for (const [index, event] of stages.entries()) {
    const expected = fixture.events[index];
    assert.equal(event.stageResults.length, 2);
    for (const [categoryIndex, result] of event.stageResults.entries()) {
      const category = fixture.categories[categoryIndex];
      assert.equal(result.label, category.label);
      assert.deepEqual(result.performers, expected.results[categoryIndex].performers);
      assert.deepEqual(result.performers, event.performers.filter(name => category.performers.includes(name)), '元の香盤順の部分列');
      for (const name of result.performers) assert.ok(event.performers.includes(name), name);
      registered.push(...result.performers.map(a.context.normalizeText));
    }
  }
  assert.equal(registered.length, 21);
  assert.equal(new Set(registered).size, 21, '全公演・区分をまたいでも重複なし');
  assert.deepEqual(fixture.categories.map(category => category.performers.length), [6,15]);
  for (const category of fixture.categories) {
    const actual = stages.flatMap(event => event.stageResults.find(result => result.label === category.label).performers);
    assert.deepEqual([...actual].sort(), [...category.performers].sort(), '公式発表の各区分と完全一致');
  }
});

test('10/30の結果以外の全フィールドを保持: 23/24/23、70組、全194公演', () => {
  assert.equal(all.length, 194);
  assert.deepEqual(stages.map(event => event.performers.length), [23,24,23]);
  assert.equal(stages.flatMap(event => event.performers).length, 70);
  for (const [index, event] of stages.entries()) {
    const {stageResults, ...original} = event;
    assert.equal(createHash('sha256').update(JSON.stringify(original)).digest('hex'), fixture.events[index].originalSHA256,
      '既存の公演ID・香盤順・日時・会場・チケットなどをすべて保持');
    assert.equal(event.qualifiedPerformers, undefined);
    assert.equal(event.additionalQualifiedPerformers, undefined);
  }
});

test('既存の結果描画: advanced/none + qualifiedで両進出先・該当者なしを表示', () => {
  const a = loadApp();
  for (const event of stages) {
    const results = a.context.getStageResults(event);
    assert.equal(results.length, 2);
    const html = a.context.buildEventCardHTML(event, 'archiveResults', []);
    for (const result of event.stageResults) {
      assert.equal(result.status, result.performers.length ? 'advanced' : 'none');
      assert.equal(result.displayStyle, 'qualified');
      const {nextEventType,nextEventTitle,nextDate,nextDateEnd,nextTime,nextVenue,...core} = result;
      assert.deepEqual(Object.keys(core).sort(), ['displayStyle','label','performers','status']);
      assert.ok(html.includes(result.label));
      for (const name of result.performers) assert.ok(html.includes(`data-name="${a.context.escapeHTML(name)}"`));
    }
    assert.equal(html.includes('該当者なし'), event.id === stages[0].id);
    assert.equal(html.includes('pending-stage-card'), false);
  }
});

test('確定した進出先だけを接続: 翔は11/6に掲載済み、極は12/12〜13の共通一覧1枚', () => {
  const a = loadApp();
  a.run('todayString = () => "2026-11-08"');
  const filters = {nameQuery:'', eventType:'all',month:'all',day:'all',hour:'all'};
  for (const event of stages) {
    for (const [index,result] of a.context.getStageResults(event).entries()) {
      if (result.status === 'none') {
        assert.equal(result.nextEventType,''); assert.equal(result.nextDate,'');
        assert.equal(a.context.filtersAllowPendingStageCard(filters,result),false);
      } else {
        assert.deepEqual(JSON.parse(JSON.stringify({
          nextEventType:result.nextEventType,nextEventTitle:result.nextEventTitle,
          nextDate:result.nextDate,nextDateEnd:result.nextDateEnd,
          nextTime:result.nextTime,nextVenue:result.nextVenue,
        })),index===0 ? {
          nextEventType:'kiwami-grand-battle-east',nextEventTitle:'グランドバトルEAST（出演部未定）',
          nextDate:'2026-12-12',nextDateEnd:'2026-12-13',nextTime:'出演公演未定',nextVenue:'渋谷よしもと漫才劇場',
        } : {
          nextEventType:'kakeru-challenge-east',nextEventTitle:'Kakeru翔チャレンジバトルEAST',
          nextDate:'2026-11-06',nextDateEnd:'',nextTime:'19:30',nextVenue:'渋谷よしもと漫才劇場',
        });
        assert.equal(a.context.filtersAllowPendingStageCard(filters,result),index===0);
      }
    }
    assert.equal(a.context.eventMatchesFilters(event, filters), false);
    assert.equal(a.context.eventMatchesFilters(event, filters, true), true);
  }
  const groups=a.context.getPendingStageGroups(filters);
  assert.equal(groups.length,2,'極の出演部未定とサラに！出場権は別々のカード');
  const kiwami=groups.filter(g=>g.nextEventType==='kiwami-grand-battle-east');
  assert.equal(kiwami.length,1); assert.equal(kiwami[0].nextDate,'2026-12-12');
  assert.equal(kiwami[0].nextDateEnd,'2026-12-13');assert.equal(kiwami[0].names.length,6);
  assert.equal(a.context.getPendingStageGroups({...filters,month:'11'}).length,0);
  assert.equal(a.context.getPendingStageGroups({...filters,eventType:'kakeru-challenge-east'}).length,0);
  a.run('saveFavorites(["zazy"]); favoritesOnlyMode = true');
  const favorites=a.context.getPendingStageGroups(filters);
  assert.equal(favorites.length,1);assert.deepEqual(Array.from(favorites[0].names),['ZAZY']);
});
