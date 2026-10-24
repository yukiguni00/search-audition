const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, readJSON, loadApp } = require('./helpers/app.cjs');
const { checkEvents } = require('./helpers/integrity.cjs');
const all = readJSON('data/events.json');
const exceptions = readJSON('tests/fixtures/known-qualifier-exceptions.json');
const app = loadApp();
const key = name => app.context.normalizeText(name);

test('月別JSON、索引、集約JSONが一致し、公演は対応月に属する', () => {
  const files = fs.readdirSync(path.join(root, 'data/events')).filter(n => /^\d{4}-\d{2}\.json$/.test(n)).sort();
  assert.deepEqual(readJSON('data/events-index.json').files, files.map(n => `events/${n}`));
  const monthly = files.flatMap(file => {
    const list = readJSON(`data/events/${file}`);
    assert.ok(Array.isArray(list), file);
    for (const ev of list) assert.equal(ev.date.slice(0, 7), file.slice(0, 7), ev.id);
    return list;
  });
  assert.deepEqual(all, monthly);
});
test('公演ID・正規化/改名後の出演者重複・合格区分を確認', () => {
  checkEvents(all, key, exceptions);
});
test('整合性チェックは重複ID、表記揺れ、合格区分混在を拒否する', () => {
  const ev = { id: 'synthetic', performers: ['Ａ', 'B'], qualifiedPerformers: ['Ａ'], additionalQualifiedPerformers: ['B'] };
  assert.throws(() => checkEvents([ev, ev]), /公演ID重複/);
  assert.throws(() => checkEvents([{ ...ev, performers: ['Ａ', 'a'] }]), /出演者名重複/);
  assert.throws(() => checkEvents([{ ...ev, additionalQualifiedPerformers: ['a'] }]), /通常・追加合格の重複/);
  assert.throws(() => checkEvents([{ ...ev, qualifiedPerformers: ['C'] }]), /出演者にいない合格者/);
  assert.doesNotThrow(() => checkEvents([ev, { ...ev, id: 'another-date' }]));
});
test('2026-10-30だけの香盤: 23/24/23、計70、通常53・追加17、全員が一致', () => {
  const stages = all.filter(e => e.date === '2026-10-30' && e.eventType === 'audition-2nd-east').sort((a,b) => a.timeMinutes-b.timeMinutes);
  assert.deepEqual(stages.map(e => [e.time, e.performers.length]), [['13:30',23],['16:30',24],['19:30',23]]);
  const sources = all.filter(e => e.eventType === 'audition-1st-east' && e.qualifiedNextStageDate === '2026-10-30');
  const regular = sources.flatMap(e => e.qualifiedPerformers || []).map(key);
  const additional = sources.flatMap(e => e.additionalQualifiedPerformers || []).map(key);
  const lineup = stages.flatMap(e => e.performers).map(key);
  assert.equal(regular.length, 53); assert.equal(additional.length, 17);
  assert.equal(new Set([...regular, ...additional]).size, 70, '通常・追加は排他的で重複なし');
  assert.equal(lineup.length, 70); assert.equal(new Set(lineup).size, 70);
  assert.deepEqual([...lineup].sort(), [...regular, ...additional].sort());
});
test('2026-10-30の開場時刻、発売情報と各部FANYリンクの対応を保持', () => {
  const expected = [
    ['2026-10-30-1330-audition-2nd-east-1','13:15','53893'],
    ['2026-10-30-1630-audition-2nd-east-2','16:15','53894'],
    ['2026-10-30-1930-audition-2nd-east-3','19:15','53895'],
  ];
  for (const [id, openTime, reception] of expected) {
    const ev = all.find(e => e.id === id);
    assert.ok(ev, id); assert.equal(ev.openTime, openTime); assert.equal(ev.hideOpenTime, true);
    assert.equal(ev.ticket.saleInfo, '一般発売開始：10月24日(土)10:00');
    assert.equal(ev.ticket.url, `https://ticket.fany.lol/reception/67769/${reception}`);
  }
});

test('既知例外は指定3組だけ。例外なしではFAIL、指定した場合だけPASS', () => {
  assert.deepEqual(exceptions.map(({eventId, performerName, field}) => [eventId, performerName, field]), [
    ['2026-10-15-1600-audition-1st-east', 'ZAZY', 'qualifiedPerformers'],
    ['2026-10-19-1830-audition-1st-east', '烏骨鶏', 'qualifiedPerformers'],
    ['2026-10-20-1830-audition-1st-east', 'つつがないね', 'qualifiedPerformers'],
  ]);
  for (const rule of exceptions) {
    const ev = all.find(ev => ev.id === rule.eventId);
    assert.throws(() => checkEvents([ev], key), /出演者にいない合格者/);
    assert.doesNotThrow(() => checkEvents([ev], key, [rule]));
    assert.throws(() => checkEvents([ev], key, [{...rule, reason:''}]), /reasonが必要/);
    assert.throws(() => checkEvents([ev], key, [rule, rule]), /既知例外の重複/);
    const resolved = {...ev, performers:[...ev.performers, rule.performerName]};
    assert.throws(() => checkEvents([resolved], key, [rule]), /未使用の既知例外/);
  }
});
test('架空の新規合格者不一致は、既知例外と同じ公演でも別公演でもFAIL', () => {
  for (const eventId of [exceptions[0].eventId, '2026-10-15-1830-audition-1st-east']) {
    for (const field of ['qualifiedPerformers', 'additionalQualifiedPerformers']) {
      const fixture = structuredClone(all);
      fixture.find(ev => ev.id === eventId)[field] ??= [];
      fixture.find(ev => ev.id === eventId)[field].push('架空の未登録合格者_TEST_ONLY');
      assert.throws(() => checkEvents(fixture, key, exceptions), /出演者にいない合格者 架空の未登録合格者_TEST_ONLY/);
    }
  }
  const rule = exceptions[0];
  const original = all.find(ev => ev.id === rule.eventId);
  assert.throws(() => checkEvents([{...original, id:'different-event'}], key, [rule]), /出演者にいない合格者 ZAZY/);
  assert.throws(() => checkEvents([{...original, qualifiedPerformers:['zazy']}], key, [rule]), /出演者にいない合格者 zazy/);
  assert.throws(() => checkEvents([{...original, qualifiedPerformers:[], additionalQualifiedPerformers:[rule.performerName]}], key, [rule]), /出演者にいない合格者 ZAZY/);
  const overlap = {...original, additionalQualifiedPerformers:[rule.performerName]};
  assert.throws(() => checkEvents([overlap], key, [rule]), /通常・追加合格の重複/);
});
