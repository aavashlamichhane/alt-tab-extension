const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./fixture.cjs');

test('cold commands wait for initialization and simultaneous commands share one overlay', async () => {
  let release;
  const f = fixture({ startupGate: new Promise(resolve => { release = resolve; }) });
  f.chrome.commands.onCommand.emit('toggle-tab', f.tabs[0]);
  f.chrome.commands.onCommand.emit('toggle-tab', f.tabs[0]);
  release(); await f.flush();
  assert.equal(f.calls.pageMessages.filter(message => message.type === 'SHOW_SWITCHER').length, 1);
  assert.equal(f.state().selectedTabId, 3);
});

test('snapshot exposes metadata only to the extension UI, never the page bridge', async () => {
  const f = fixture(); await f.command('toggle-tab');
  const id = f.state().id;
  const result = await f.message({ type: 'UI_READY', sessionId: id });
  assert.deepEqual(result.state.tabs.map(tab => tab.id), [1, 2, 3]);
  assert.equal(result.state.selectedTabId, 2);
  assert.ok(f.calls.pageMessages.every(message => !('tabs' in message) && !('url' in message) && !('title' in message)));
  assert.ok(f.calls.broadcasts.every(message => !('tabs' in message)));
});

test('closing the highlighted tab cancels rather than activating another tab', async () => {
  const f = fixture(); await f.command('toggle-tab'); const id = f.state().id;
  f.tabs.splice(f.tabs.findIndex(tab => tab.id === 2), 1);
  f.chrome.tabs.onRemoved.emit(2); await f.flush();
  const result = await f.message({ type: 'UI_COMMIT', sessionId: id, tabId: 2 });
  assert.equal(result.ok, false); assert.equal(f.state(), null); assert.deepEqual(f.calls.updates, []);
});

test('removing an earlier row preserves selection identity', async () => {
  const f = fixture(); await f.command('toggle-tab'); await f.command('toggle-tab'); const id = f.state().id;
  f.tabs.splice(f.tabs.findIndex(tab => tab.id === 2), 1); f.chrome.tabs.onRemoved.emit(2); await f.flush();
  assert.equal(f.state().selectedTabId, 3);
  const result = await f.message({ type: 'UI_COMMIT', sessionId: id, tabId: 3 });
  assert.equal(result.ok, true); assert.equal(f.calls.updates[0].id, 3);
});

test('only the owner and bound extension document can commit', async () => {
  const f = fixture(); await f.command('toggle-tab'); const sessionId = f.state().id;
  await f.message({ type: 'UI_READY', sessionId });
  const impostors = [f.bridge(), { ...f.ui(), tab: { id: 9 } }, { ...f.ui(), url: 'chrome-extension://other/switcher.html' }, f.ui('stale-document')];
  for (const sender of impostors) assert.equal((await f.message({ type: 'UI_COMMIT', sessionId, tabId: 2 }, sender)).ok, false);
  assert.equal((await f.message({ type: 'UI_COMMIT', sessionId: 'stale', tabId: 2 })).ok, false);
  assert.deepEqual(f.calls.updates, []);
  assert.equal((await f.message({ type: 'UI_COMMIT', sessionId, tabId: 2 })).ok, true);
});

test('an Alt release from an editor child frame commits', async () => {
  const f = fixture(); await f.command('toggle-tab');
  await f.message({ type: 'KEY_RELEASE', sessionId: f.state().id, key: 'Alt', releasedAt: Date.now() }, f.bridge(2));
  assert.equal(f.calls.updates[0].id, 2); assert.equal(f.state(), null);
});

test('fast release snapshots commit once and old snapshots cannot commit a later session', async () => {
  const f = fixture(); const at = Date.now(); await f.command('toggle-tab');
  const event = { type: 'KEY_SNAPSHOT', sessionId: f.state().id, key: 'Alt', releasedAt: at,
    gesture: { key: 'q', modifier: 'Alt', shift: false, at } };
  await f.message(event, f.bridge(2)); assert.equal(f.calls.updates.length, 1);
  await f.command('toggle-tab'); const newId = f.state().id;
  await f.message({ ...event, sessionId: newId }, f.bridge(2));
  assert.equal(f.calls.updates.length, 1); assert.ok(f.state());
});

test('Ctrl remapping commits on Ctrl release and ignores Alt release', async () => {
  const f = fixture(); f.chrome.commands.bindings[0].shortcut = 'Ctrl+Shift+Y'; await f.command('toggle-tab');
  const sessionId = f.state().id; assert.equal(f.state().modifier, 'Control');
  await f.message({ type: 'KEY_RELEASE', sessionId, key: 'Alt', releasedAt: Date.now() }, f.bridge());
  assert.deepEqual(f.calls.updates, []);
  await f.message({ type: 'KEY_RELEASE', sessionId, key: 'Control', releasedAt: Date.now() }, f.bridge());
  assert.equal(f.calls.updates.length, 1);
});

test('search and Enter-confirm mode do not commit on modifier release', async () => {
  const f = fixture(); await f.command('toggle-tab'); const sessionId = f.state().id;
  await f.message({ type: 'UI_READY', sessionId }); await f.message({ type: 'UI_SEARCH', sessionId, active: true });
  await f.message({ type: 'UI_RELEASE', sessionId, key: 'Alt' }); assert.deepEqual(f.calls.updates, []);
  await f.message({ type: 'UI_COMMIT', sessionId, tabId: 2 }); assert.equal(f.calls.updates.length, 1);
  const confirm = fixture({ preferences: { switchMode: 'confirm' } }); await confirm.command('toggle-tab');
  assert.equal(confirm.state().modifier, null);
});

test('all-window mode focuses target window and never includes private tabs', async () => {
  const f = fixture({ preferences: { windowScope: 'all' } }); await f.command('toggle-tab');
  assert.deepEqual(f.state().candidateIds, [1, 4, 2, 3]);
  await f.message({ type: 'UI_COMMIT', sessionId: f.state().id, tabId: 4 });
  assert.deepEqual(f.calls.windows, [{ id: 20, focused: true }]);
});

test('reverse command starts at the end and instant mode creates no overlay', async () => {
  const f = fixture(); await f.command('cycle-backward'); assert.equal(f.state().selectedTabId, 3);
  await f.command('cycle-backward'); assert.equal(f.state().selectedTabId, 2);
  const instant = fixture({ preferences: { switchMode: 'instant' } }); await instant.command('toggle-tab');
  assert.equal(instant.state(), null); assert.equal(instant.calls.updates[0].id, 2); assert.deepEqual(instant.calls.pageMessages, []);
});

test('restricted-page fallback switches immediately without opening a popup', async () => {
  const f = fixture(); f.restrict(); await f.command('toggle-tab');
  assert.equal(f.state(), null); assert.equal(f.calls.updates[0].id, 2); assert.deepEqual(f.calls.popups, []);
});

test('internal pages switch immediately without attempting script injection', async () => {
  const f = fixture(); f.tabs[0].url = 'edge://settings/'; f.restrict(); await f.command('cycle-backward');
  assert.equal(f.state(), null); assert.equal(f.calls.updates[0].id, 3);
  assert.deepEqual(f.calls.scripts, []); assert.deepEqual(f.calls.popups, []);
  assert.equal(f.calls.pageMessages.some(message => ['PING', 'SHOW_SWITCHER', 'ARM_SESSION'].includes(message.type)), false);
});

test('internal-page tabs remain available as switch targets on normal webpages', async () => {
  const f = fixture(); f.tabs[1].url = 'edge://history/'; await f.command('toggle-tab');
  const result = await f.message({ type: 'UI_READY', sessionId: f.state().id });
  assert.equal(result.state.tabs[1].url, 'edge://history/');
  await f.message({ type: 'UI_COMMIT', sessionId: f.state().id, tabId: 2 });
  assert.equal(f.calls.updates[0].id, 2);
});

test('commands resolve partial associated tabs before filtering candidates', async () => {
  const f = fixture(); f.chrome.commands.onCommand.emit('toggle-tab', { id: 1 }); await f.flush();
  assert.deepEqual(f.state().candidateIds, [1, 2, 3]); assert.equal(f.state().selectedTabId, 2);
});

test('status reports the last native command only to the options page', async () => {
  const f = fixture(); await f.command('toggle-tab');
  const sender = { id: 'audit', url: 'chrome-extension://audit/options.html' };
  const result = await f.message({ type: 'DIAGNOSTICS' }, sender);
  assert.equal(result.startupFailed, false); assert.equal(result.lastCommand.name, 'toggle-tab');
  assert.equal(result.lastCommand.result, 'overlay'); assert.equal('tabs' in result, false);
  assert.equal((await f.message({ type: 'DIAGNOSTICS' }, f.bridge())).ok, false);
  const restored = fixture({ saved: f.sessionData }); await restored.flush();
  assert.equal((await restored.message({ type: 'DIAGNOSTICS' }, sender)).lastCommand.at, result.lastCommand.at);
});

test('event errors are consumed and reported by diagnostics', async () => {
  const f = fixture(); f.chrome.commands.getAll = async () => { throw Error('commands unavailable'); };
  await f.command('toggle-tab');
  const result = await f.message({ type: 'DIAGNOSTICS' }, { id: 'audit', url: 'chrome-extension://audit/options.html' });
  assert.equal(result.lastCommand.result, 'failed'); assert.equal(f.calls.warnings.length, 1);
});

test('diagnostics can explain failed initialization without needing a working queue', async () => {
  const f = fixture({ startupGate: Promise.reject(Error('storage unavailable')) });
  const result = await f.message({ type: 'DIAGNOSTICS' }, { id: 'audit', url: 'chrome-extension://audit/options.html' });
  assert.equal(result.startupFailed, true); assert.equal(result.lastCommand, null);
});

test('worker restart restores an open session and can commit without reopening', async () => {
  const first = fixture(); await first.command('toggle-tab'); await first.message({ type: 'UI_READY', sessionId: first.state().id });
  const second = fixture({ saved: first.sessionData }); await second.flush();
  assert.equal(second.state().id, first.state().id);
  await second.message({ type: 'UI_COMMIT', sessionId: second.state().id, tabId: 2 });
  assert.equal(second.calls.updates[0].id, 2); assert.deepEqual(second.calls.pageMessages.filter(message => message.type === 'SHOW_SWITCHER'), []);
});

test('new browser sessions reconstruct order from access times and retire old IDs', async () => {
  const f = fixture({ preferences: { mruStack: [77, 88], theme: 'simple' } }); await f.flush();
  assert.deepEqual(Array.from(f.evaluate('mruStack')), [5, 1, 4, 2, 3]);
  assert.equal(f.localData.mruStack, undefined); assert.equal(f.localData.theme, 'simple');
});

test('navigation, owner closure, expiry, and mouse tab changes cancel safely', async () => {
  const cases = [f => f.chrome.tabs.onUpdated.emit(1, { status: 'loading' }), f => f.chrome.tabs.onRemoved.emit(1),
    f => f.chrome.tabs.onActivated.emit({ tabId: 3, windowId: 10 }), f => f.chrome.windows.onFocusChanged.emit(-1),
    f => f.evaluate('session.expiresAt = 0')];
  for (const operation of cases) {
    const f = fixture(); await f.command('toggle-tab'); operation(f); await f.flush();
    assert.equal(f.state(), null); assert.deepEqual(f.calls.updates, []);
  }
});

test('a blocked iframe times out to immediate switching but a ready UI does not', async () => {
  const f = fixture(); await f.command('toggle-tab');
  await f.message({ type: 'OVERLAY_TIMEOUT', sessionId: f.state().id }, f.bridge());
  assert.equal(f.state(), null); assert.equal(f.calls.updates[0].id, 2); assert.deepEqual(f.calls.popups, []);
  const ready = fixture(); await ready.command('toggle-tab'); const sessionId = ready.state().id;
  await ready.message({ type: 'UI_READY', sessionId });
  await ready.message({ type: 'OVERLAY_TIMEOUT', sessionId }, ready.bridge());
  assert.deepEqual(ready.calls.updates, []);
});

test('only a toolbar popup can initialize a standalone session', async () => {
  const f = fixture(); await f.flush();
  assert.equal((await f.message({ type: 'OPEN_POPUP' })).ok, false);
  const sender = f.popup();
  const result = await f.message({ type: 'OPEN_POPUP' }, sender);
  assert.equal(result.ok, true); assert.equal(result.state.modifier, null); assert.equal(result.state.embedded, false);
});

test('toolbar popup survives transient menu focus loss and still selects a tab', async () => {
  const f = fixture(); const sender = { ...f.popup(), tab: { id: -1 } };
  const result = await f.message({ type: 'OPEN_POPUP' }, sender);
  assert.equal(result.ok, true);
  f.chrome.windows.onFocusChanged.emit(-1); await f.flush();
  assert.equal(f.state().id, result.state.sessionId);
  assert.equal((await f.message({ type: 'UI_COMMIT', sessionId: result.state.sessionId, tabId: 2 }, sender)).ok, true);
  assert.equal(f.calls.updates[0].id, 2);
});

test('closing a popup cancels after its browser context disappears and shortcuts reopen the overlay', async () => {
  const f = fixture(); const sender = { ...f.popup(), documentId: undefined, tab: { id: -1 } };
  const result = await f.message({ type: 'OPEN_POPUP' }, sender);
  f.extensionContexts.length = 0;
  assert.equal((await f.message({ type: 'GET_SESSION', sessionId: result.state.sessionId }, sender)).ok, false);
  assert.equal((await f.message({ type: 'UI_CANCEL', sessionId: result.state.sessionId }, sender)).ok, true);
  assert.equal(f.state(), null);
  await f.command('toggle-tab');
  assert.equal(f.state().embedded, true);
  assert.equal((await f.message({ type: 'UI_CANCEL', sessionId: result.state.sessionId }, sender)).ok, false);
  // Recover even if a browser does not deliver pagehide when dismissing a popup.
  await f.message({ type: 'OPEN_POPUP' }, f.popup());
  await f.command('toggle-tab'); assert.equal(f.state().embedded, true);
});

test('popup connection disconnect clears only its bound session even without pagehide', async () => {
  const f = fixture(); const sender = f.popup();
  await f.message({ type: 'OPEN_POPUP' }, sender);
  const port = f.popupPort(sender); port.onMessage.emit({ sessionId: f.state().id });
  f.extensionContexts.length = 0; port.onDisconnect.emit(); await f.flush();
  assert.equal(f.state(), null);
  await f.command('toggle-tab');
  port.onDisconnect.emit(); await f.flush(); assert.equal(f.state().embedded, true);
  const impostor = f.popupPort(f.bridge());
  impostor.onMessage.emit({ sessionId: f.state().id }); impostor.onDisconnect.emit(); await f.flush();
  assert.equal(f.state().embedded, true);
});

test('standalone switcher tabs and stale popup documents cannot access the live popup', async () => {
  const f = fixture(); const sender = f.popup();
  const result = await f.message({ type: 'OPEN_POPUP' }, sender);
  const impostors = [f.ui('separate-tab'), { ...sender, documentId: 'stale-popup' }, f.bridge()];
  for (const impostor of impostors) {
    assert.equal((await f.message({ type: 'OPEN_POPUP' }, impostor)).ok, false);
    assert.equal((await f.message({ type: 'UI_COMMIT', sessionId: result.state.sessionId, tabId: 2 }, impostor)).ok, false);
    assert.equal((await f.message({ type: 'OPEN_OPTIONS', sessionId: result.state.sessionId }, impostor)).ok, false);
  }
  assert.equal(f.state().id, result.state.sessionId);
  assert.deepEqual(f.calls.updates, []); assert.deepEqual(f.calls.options, []);
});

test('settings open before closing the embedded switcher or toolbar popup', async () => {
  for (const embedded of [true, false]) {
    const f = fixture(); let sender;
    if (embedded) { await f.command('toggle-tab'); sender = f.ui(); }
    else { sender = f.popup(); await f.message({ type: 'OPEN_POPUP' }, sender); }
    const sessionId = f.state().id;
    const result = await f.message({ type: 'OPEN_OPTIONS', sessionId }, sender);
    assert.equal(result.ok, true); assert.equal(f.calls.options.length, 1);
    assert.equal(f.calls.options[0].session.id, sessionId);
    assert.equal(f.state(), null); assert.deepEqual(f.calls.updates, []);
  }
});

test('failed settings navigation keeps the switcher usable for retry', async () => {
  const f = fixture(); await f.command('toggle-tab'); const sessionId = f.state().id;
  f.chrome.runtime.openOptionsPage = async () => { throw Error('navigation failed'); };
  const result = await f.message({ type: 'OPEN_OPTIONS', sessionId });
  assert.equal(result.ok, false); assert.equal(f.state().id, sessionId);
  assert.equal((await f.message({ type: 'UI_COMMIT', sessionId, tabId: 2 })).ok, true);
});

test('toolbar settings remain accessible before tab initialization and after startup failure', async () => {
  let release;
  const cold = fixture({ startupGate: new Promise(resolve => { release = resolve; }) });
  assert.equal((await cold.message({ type: 'OPEN_OPTIONS' }, cold.popup())).ok, true);
  release(); await cold.flush();
  const failed = fixture({ startupGate: Promise.reject(Error('storage unavailable')) });
  assert.equal((await failed.message({ type: 'OPEN_OPTIONS' }, failed.popup())).ok, true);
  assert.equal(failed.calls.options.length, 1);
});
