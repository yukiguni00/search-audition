const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
process.env.TZ = 'Asia/Tokyo';
const root = path.resolve(__dirname, '../..');
const readJSON = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
function loadApp() {
  const storage = new Map();
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: id === 'nameQuery' ? '' : 'all', innerHTML: '', hidden: false,
      querySelectorAll: () => [], appendChild() {}, addEventListener() {},
      setAttribute() {}, classList: { toggle() {} },
    });
    return elements.get(id);
  };
  const context = vm.createContext({ console, URL, Date, Set, Map,
    localStorage: { getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value) },
    document: { getElementById: element, querySelectorAll: () => [] },
  });
  const source = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
  // Keep all production functions intact; suppress only the final browser bootstrap.
  assert.match(source, /\ninit\(\);\s*$/);
  vm.runInContext(source.replace(/\ninit\(\);\s*$/, '\n'), context);
  vm.runInContext('todayString = () => "2026-10-24"', context);
  context.inputEvents = readJSON('data/events.json');
  context.aliasData = readJSON('data/performer-aliases.json');
  vm.runInContext('events = inputEvents; performerRenameAliases = buildPerformerAliasMap(aliasData)', context);
  return { context, element, run: code => vm.runInContext(code, context),
    set: (key, value) => { context[key] = value; } };
}
module.exports = { root, readJSON, loadApp };
