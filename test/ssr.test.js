const vm = require('vm');
const path = require('path');
const fs = require('fs');
const test = require('ava');

test('can be evaluated in a node vm', t => {
  const file = fs.readFileSync(path.resolve(__dirname, '..', 'dist/confetti.browser.js'), 'utf8');
  t.is(typeof file, 'string');

  const context = vm.createContext({
    window: {},
    URL: Object.assign(class {}, { createObjectURL: () => '' }),
    Blob: class {},
    Worker: class {}
  });
  vm.runInContext(file, context);

  t.is(typeof context.window.confetti, 'function');
  t.is(typeof context.window.confetti.create, 'function');
});
