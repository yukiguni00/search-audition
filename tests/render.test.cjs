const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, readJSON } = require('./helpers/app.cjs');
const all = readJSON('data/events.json');
const stages = all.filter(e => e.date === '2026-10-30' && e.eventType === 'audition-2nd-east');

test('全公演: カード会場・発売情報・チケットURLを元データから描画', () => {
  const a = loadApp();
  for (const ev of all) {
    a.set('ev', ev);
    const html = a.run('buildEventCardHTML(ev, "results", [])');
    const escaped = s => a.context.escapeHTML(s);
    assert.ok(html.includes(`会場：${escaped(ev.venueDisplayName || ev.venue || '')}`), ev.id);
    const ticket = a.context.getTicketInfo(ev);
    if (ticket.saleInfo) assert.ok(html.includes(escaped(ticket.saleInfo)), ev.id);
    for (const url of [ticket.url, ...ticket.links.map(l => l.url)].filter(Boolean)) {
      // A links array takes precedence over the single-URL representation.
      if (ticket.links.length && url === ticket.url) continue;
      assert.ok(html.includes(`href="${escaped(url)}"`), `${ev.id}: ${url}`);
    }
  }
});
test('会場短縮名と未設定時の正式名がカード・お気に入りで一致', () => {
  for (const display of ["短い会場名", undefined, '']) {
    const a = loadApp();
    const ev = { ...stages[0], venueDisplayName: display };
    a.set('fixture', ev);
    a.run('events = [fixture]; saveFavorites([normalizeText(fixture.performers[0])]); renderFavoriteSchedule()');
    const expected = a.context.escapeHTML(display || ev.venue);
    assert.ok(a.run('buildEventCardHTML(fixture, "results", getFavorites())').includes(`会場：${expected}`));
    assert.ok(a.element('favoriteSchedule').innerHTML.includes(expected));
  }
});
test('10/30の70チップを個別確認: 追加17だけに「追加」、通常53はなし', () => {
  const a = loadApp();
  let badges = 0;
  const additional = new Set(all.filter(e => e.qualifiedNextStageDate === '2026-10-30').flatMap(e => e.additionalQualifiedPerformers || []).map(a.context.normalizeText));
  for (const ev of stages) {
    a.set('ev', ev);
    const keys = a.run('getAdditionalQualifiedKeysForSecondStage(ev)');
    for (const name of ev.performers) {
      const html = a.context.buildPerformerChipsHTML([name], [], keys);
      const present = html.includes('class="additional-qualified-badge" title="追加合格者">追加</abbr>');
      assert.equal(present, additional.has(a.context.normalizeText(name)), name);
      badges += Number(present);
    }
  }
  assert.equal(badges, 17);
  a.set('other', { ...stages[0], date: '2026-11-30' });
  assert.equal(a.run('getAdditionalQualifiedKeysForSecondStage(other).size'), 0, '別日へ漏らさない');
  a.set('other', { ...stages[0], eventType: 'standup' });
  assert.equal(a.run('getAdditionalQualifiedKeysForSecondStage(other).size'), 0, '別種別へ漏らさない');
});
test('開場非表示はtrueだけ。元時刻を残し、未指定/falseは従来表示', () => {
  const a = loadApp();
  for (const hideOpenTime of [true, false, undefined]) {
    const ev = { ...stages[0], hideOpenTime };
    const before = JSON.stringify(ev);
    const html = a.context.buildEventCardHTML(ev, 'results', []);
    assert.equal(html.includes(`開場${ev.openTime}`), hideOpenTime !== true);
    assert.equal(JSON.stringify(ev), before);
    assert.ok(html.includes(`開演${ev.time}`));
  }
});
test('検索: 名前・日付・時間・種別・お気に入りのAND、アーカイブ境界', () => {
  const a = loadApp();
  const filters = { nameQuery: a.context.normalizeText(stages[0].performers[0]), month:'10', day:'30', hour:'13', eventType:'audition-2nd-east' };
  assert.equal(a.context.eventMatchesFilters(stages[0], filters), true);
  for (const delta of [{nameQuery:'存在しない出演者'}, {day:'29'}, {hour:'14'}, {eventType:'standup'}]) {
    assert.equal(a.context.eventMatchesFilters(stages[0], {...filters, ...delta}), false);
  }
  a.set('selected', filters.nameQuery);
  a.run('favoritesOnlyMode = true; saveFavorites([selected])');
  assert.equal(a.context.eventMatchesFilters(stages[0], filters), true);
  a.run('saveFavorites([])');
  assert.equal(a.context.eventMatchesFilters(stages[0], filters), false);
  const past = {...stages[0], date:'2026-10-23', day:23};
  a.run('favoritesOnlyMode = false');
  assert.equal(a.context.eventMatchesFilters(past, filters), false);
  assert.equal(a.context.eventMatchesFilters(past, {...filters, day:"23"}, true), true);
});
test('セッション内の名前と日時を同じ公演として検索、お気に入り保存の正規化', () => {
  const a = loadApp();
  const ev = { date:'2026-11-01', eventType:'standup', sessions:[
    {date:'2026-11-01', time:'13:00', performers:['Ａ']},
    {date:'2026-11-02', time:'19:00', performers:['B']},
  ] };
  const filters = {nameQuery:'a', month:'11',day:'1',hour:'13',eventType:'all'};
  assert.equal(a.context.eventMatchesFilters(ev, filters), true);
  assert.equal(a.context.eventMatchesFilters(ev, {...filters,day:'2'}), false);
  a.run('saveFavorites(["Ａ", "a", " B "]);');
  assert.deepEqual(Array.from(a.context.getFavorites()), ['a','b']);
  a.set('aliasData', readJSON('data/performer-aliases.json'));
  for (const group of a.context.aliasData.aliases) for (const oldName of group.aliases) {
    assert.equal(a.context.normalizeText(oldName), a.context.normalizeText(group.currentName));
  }
});
