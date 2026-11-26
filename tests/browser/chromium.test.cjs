const { describe } = require('node:test');

// Each case opens its own context. Screenshot filenames are shared by cases at the same width.
const concurrency = process.env.TEST_SCREENSHOT_DIR ? 1 : 4;
describe('Chromium', { concurrency }, () => {
  require('./ui-cases.cjs');
});
