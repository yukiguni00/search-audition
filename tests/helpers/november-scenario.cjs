// Replay the November 24 release for tests of specific search, schedule and favorite interactions.
// Reuse the real lineup/ticket fields so their original proofreading checks still exercise the files.
const {loadApp, readJSON} = require('./app.cjs');
const {agariResults, baselineIds, resultFields} = require('./results-audit.cjs');
const ids = new Set(baselineIds);
const ranksById = new Map(require('../fixtures/2026-11-24-ranks.json').map(([day, time, winner, second, third]) =>
  [day + '-' + time.replace(':', '') + '-agari-stage', [[winner], [].concat(second), third]]));
const schedule = {
  nextDate: '2026-11-27', nextTime: '17:00', nextVenue: '歌舞伎町Sparkle',
  nextTicket: {url:'https://ticket.fany.lol/reception/70947/55946', linkLabel:'FANYチケット',
    saleInfo:'※FANY一般発売：11月20日(金)10:00〜', purchaseNote:'出演者への取り置きも可能です', streamingNote:'※配信はありません'},
};
function scenarioEvents(file = 'data/events.json') {
  const events = readJSON(file).filter(event => ids.has(event.id));
  for (const event of events) {
    if (event.eventType === 'agari-stage') {
      const ranks = ranksById.get(event.id);
      event.stageResults = agariResults(ranks, ranks ? schedule : {});
    } else if (event.eventType === 'audition-1st-east' && event.date >= '2026-11-24') {
      for (const field of resultFields) delete event[field];
      if (event.id === '2026-11-24-1600-audition-1st-east') {
        event.qualifiedPerformers = ['サクラダ前線'];
        event.qualifiedNextStageDate = '2026-12-23';
      }
    }
  }
  return events;
}
const loadScenarioApp = () => loadApp(scenarioEvents());
module.exports = {scenarioEvents, loadScenarioApp};
