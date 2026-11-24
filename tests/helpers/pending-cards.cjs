// Independent DOM expectation: work from the published result fields and lineups.
const {normalize} = require('./integrity.cjs');
const aliases = new Map(require('../../data/performer-aliases.json').aliases.flatMap(group =>
  group.aliases.map(alias => [normalize(alias), normalize(group.currentName)])));
const key = name => aliases.get(normalize(name)) ?? normalize(name);

function expectedPendingIDs(events, today) {
  const pending = new Set();
  for (const event of events) {
    const qualifiers = [event.qualifiedResult === 'none' ? [] : event.qualifiedPerformers, event.additionalQualifiedPerformers];
    const advances = event.stageResults ?? qualifiers.map(performers => ({
      status:'advanced', nextEventType:'audition-2nd-east', nextDate:event.qualifiedNextStageDate, performers,
    }));
    for (const result of advances) {
      const {nextEventType, nextDate, performers} = result;
      const end = result.nextDateEnd || nextDate;
      if (result.status !== 'advanced' || !nextEventType || !performers?.length || (end && end < today)) continue;
      const assigned = new Set(events.filter(slot => nextDate && slot.eventType === nextEventType &&
        slot.date <= end && (slot.dateEnd || slot.date) >= nextDate).flatMap(slot =>
        [slot, ...(slot.sessions ?? [])].flatMap(part => (part.performers ?? []).map(key))));
      if (!performers.every(name => assigned.has(key(name)))) {
        pending.add(`event-pending-${nextEventType}-${nextDate || 'undecided'}-${end || 'undecided'}`);
      }
    }
  }
  return [...pending].sort();
}
module.exports = {expectedPendingIDs};
