// Readability rules (see test/style_rules.js for what each rule means and why).
// To list every violation: node test/style_rules.js [path ...]
'use strict';
const { checkAll } = require('./style_rules');

module.exports = (T) => {
  T.test('js/ follows the readability rules', () => {
    const v = checkAll();
    const shown = v.slice(0, 40).map((x) => `${x.rule.padEnd(16)} ${x.at}${x.detail ? '  ' + x.detail : ''}`);
    T.ok(v.length === 0, v.length + ' violations (node test/style_rules.js lists them all):\n    ' + shown.join('\n    '));
  });
};
