const assert = require('node:assert/strict');
const baselineIds = require('../fixtures/2026-11-24-event-ids.json');
const baseline = new Set(baselineIds);
const resultFields = ['qualifiedPerformers', 'additionalQualifiedPerformers', 'qualifiedResult', 'qualifiedNextStageDate', 'stageResults'];

function agariResults(ranks, schedule = {}) {
  if (ranks) {
    assert.equal(ranks.length, 3, '最優秀・2位・3位');
    for (const rank of ranks) assert.ok(Array.isArray(rank) && rank.length, '各順位の受賞者が必要');
  }
  const results = ['最優秀者', '2位', '3位'].map((label, index) => ({
    status: ranks ? 'ranked' : 'pending', displayStyle: 'qualified', performers: ranks?.[index] ?? [], label,
  }));
  results.push({
    status: ranks ? 'advanced' : 'pending', displayStyle: 'next-stage', performers: ranks?.[0] ?? [],
    nextEventType: 'sarani-agari-stage', label: ranks ? 'サラに！アガり！ステージ出場権' : 'サラに！への進出',
    ...(ranks && {nextEventTitle: 'サラに！アガり！ステージ'}), ...schedule,
  });
  return results;
}

function auditAnnouncements(events, audit) {
  const expectedIds = new Set([...baselineIds, ...Object.keys(audit.events)]);
  const publishedIds = new Set(events.map(event => event.id));
  for (const id of expectedIds) assert.ok(publishedIds.has(id), id + ' 既存公演の欠落');
  for (const id of publishedIds) assert.ok(expectedIds.has(id), id + ' 監査に未登録の公演');
  for (const event of events) {
    const {show, ...entry} = audit.events[event.id] ?? {};
    if (!baseline.has(event.id) || show) {
      for (const field of ['eventType', 'date', 'time', 'title']) {
        assert.ok(Object.hasOwn(show ?? {}, field), event.id + ' 公演情報 ' + field);
      }
      for (const [field, value] of Object.entries(show)) {
        assert.deepEqual(event[field], value, event.id + ' ' + field);
      }
    }
    // Older audition results are independently protected by the historical full-record checksums.
    if (baseline.has(event.id) && event.id < '2026-11-24' && event.eventType !== 'agari-stage' && !Object.hasOwn(audit.events, event.id)) continue;
    let expected = entry;
    if (event.eventType === 'agari-stage') {
      const {ranks, schedule, ...extra} = entry;
      assert.deepEqual(extra, {}, event.id + ' 監査項目');
      if (schedule) assert.ok(ranks && Object.hasOwn(audit.schedules, schedule), event.id + ' 進出日程');
      expected = {stageResults: agariResults(ranks, audit.schedules[schedule])};
    }
    const actual = Object.fromEntries(resultFields.filter(k => Object.hasOwn(event, k)).map(k => [k, event[k]]));
    assert.deepEqual(actual, expected, event.id + ' 公式発表');
  }
}
module.exports = {auditAnnouncements, agariResults, baselineIds, resultFields};
