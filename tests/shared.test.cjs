const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const context = vm.createContext({ URL });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../shared.js'), 'utf8'), context);
const { AltTab } = context;
const runtime = { getURL: name => `chrome-extension://audit/${name.replace(/^\//, '')}` };

test('settings reject malformed values and preserve valid legacy preferences', () => {
  const result = AltTab.normalizeSettings({ theme: 'simple', manualAccentColor: 'red; background:url(https://bad.test)', windowScope: 'invalid' });
  assert.equal(result.theme, 'simple'); assert.equal(result.manualAccentColor, '#0078d4'); assert.equal(result.windowScope, 'current');
  assert.equal(AltTab.normalizeSettings({ manualAccentColor: '#abcdef' }).manualAccentColor, '#abcdef');
});
test('favicon resources stay local and retain complete page identity', () => {
  const docs = AltTab.faviconURL({ url: 'https://docs.google.com/document/d/1?x=a&y=b' }, runtime);
  const sheets = AltTab.faviconURL({ url: 'https://docs.google.com/spreadsheets/d/2' }, runtime);
  assert.notEqual(docs, sheets); assert.ok(docs.startsWith('chrome-extension://audit/_favicon/'));
  assert.equal(new URL(docs).searchParams.get('pageUrl'), 'https://docs.google.com/document/d/1?x=a&y=b');
  for (const url of ['http://localhost:3000/', 'https://private.test', 'file:///tmp/example.html', 'edge://settings', 'not a URL']) {
    assert.ok(AltTab.faviconURL({ url }, runtime).startsWith('chrome-extension://audit/'));
  }
});
test('assigned shortcut parsing supports modifier changes and reverse cycling', () => {
  assert.equal(AltTab.parseShortcut('Alt+Q').modifier, 'Alt');
  assert.equal(AltTab.parseShortcut('Ctrl+Shift+Y').modifier, 'Control');
  assert.equal(AltTab.parseShortcut('Command+Q').modifier, 'Meta');
  assert.equal(AltTab.parseShortcut('').modifier, null);
  assert.ok(AltTab.matchesBinding({ key: 'q', modifier: 'Alt', shift: true }, AltTab.parseShortcut('Alt+Shift+Q')));
  assert.equal(AltTab.matchesBinding({ key: 'q', modifier: 'Alt', shift: false }, AltTab.parseShortcut('Alt+Shift+Q')), false);
});
