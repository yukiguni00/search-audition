const assert = require('node:assert/strict');
const normalize = name => name.trim().replace(/\s+/g, ' ').normalize('NFKC').replace(/[〜～~∼]/g, '〜').toLowerCase();
function checkNames(names, label, key = normalize) {
  assert.ok(Array.isArray(names), `${label}: 配列が必要`);
  const seen = new Set();
  for (const name of names) {
    assert.ok(typeof name === 'string' && name.trim(), `${label}: 空または不正な名前`);
    const normalized = key(name);
    assert.ok(!seen.has(normalized), `${label}: 出演者名重複 ${name}`);
    seen.add(normalized);
  }
  return seen;
}
function checkEvents(events, key = normalize, exceptions = []) {
  assert.ok(Array.isArray(exceptions), '既知例外は配列が必要');
  const exceptionKeys = new Set();
  const usedExceptions = new Set();
  for (const rule of exceptions) {
    for (const field of ['eventId', 'performerName', 'field', 'reason', 'evidence']) {
      assert.ok(typeof rule?.[field] === 'string' && rule[field].trim(), `既知例外に${field}が必要`);
    }
    assert.ok(['qualifiedPerformers', 'additionalQualifiedPerformers'].includes(rule.field), '既知例外の合格区分が不正');
    const identity = JSON.stringify([rule.eventId, rule.performerName, rule.field]);
    assert.ok(!exceptionKeys.has(identity), `既知例外の重複 ${identity}`);
    exceptionKeys.add(identity);
  }
  const ids = new Set();
  for (const ev of events) {
    assert.ok(typeof ev.id === 'string' && ev.id, '公演IDが必要');
    assert.ok(!ids.has(ev.id), `公演ID重複 ${ev.id}`);
    ids.add(ev.id);
    const lists = ['performers', 'qualifiedPerformers', 'additionalQualifiedPerformers'];
    for (const field of lists) if (ev[field] !== undefined) checkNames(ev[field], `${ev.id}.${field}`, key);
    for (const [i, session] of (ev.sessions || []).entries()) {
      if (session.performers) checkNames(session.performers, `${ev.id}.sessions[${i}]`, key);
    }
    for (const [i, result] of (ev.stageResults || []).entries()) {
      if (result.performers) checkNames(result.performers, `${ev.id}.stageResults[${i}]`, key);
    }
    const regular = new Set((ev.qualifiedPerformers || []).map(key));
    for (const name of ev.additionalQualifiedPerformers || []) {
      assert.ok(!regular.has(key(name)), `${ev.id}: 通常・追加合格の重複 ${name}`);
    }
    const entrants = new Set((ev.performers || []).map(key));
    for (const field of ['qualifiedPerformers', 'additionalQualifiedPerformers']) {
      for (const name of ev[field] || []) {
        if (!entrants.size || entrants.has(key(name))) continue;
        // Exact IDs, original names and qualifier fields only; never exempt other checks.
        const rule = exceptions.find(rule => rule.eventId === ev.id && rule.performerName === name && rule.field === field);
        assert.ok(rule, `${ev.id}: 出演者にいない合格者 ${name} (${field})`);
        usedExceptions.add(rule);
      }
    }
  }
  for (const rule of exceptions) {
    assert.ok(usedExceptions.has(rule), `未使用の既知例外: ${rule.eventId} / ${rule.performerName} / ${rule.field} を再確認してください`);
  }
  // A performer may legitimately appear in different dates, events, and sessions.
}
module.exports = { checkNames, checkEvents, normalize };
