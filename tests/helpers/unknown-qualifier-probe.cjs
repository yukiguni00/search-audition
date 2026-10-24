// Intentionally exits nonzero: demonstrate rejection without writing production JSON.
const { readJSON, loadApp } = require('./app.cjs');
const { checkEvents } = require('./integrity.cjs');
const fixture = readJSON('data/events.json');
const exceptions = readJSON('tests/fixtures/known-qualifier-exceptions.json');
const { context } = loadApp();
fixture.find(ev => ev.id === exceptions[0].eventId)
  .qualifiedPerformers.push('架空の未登録合格者_TEST_ONLY');
checkEvents(fixture, context.normalizeText, exceptions);
