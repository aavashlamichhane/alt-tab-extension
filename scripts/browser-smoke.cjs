const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
async function until(read, predicate = Boolean, timeout = 7000) {
  const deadline = Date.now() + timeout;
  do {
    const value = await read(); if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  throw new Error('Timed out waiting for browser state');
}
const server = http.createServer((req, res) => {
  const port = server.address().port;
  res.setHeader('Content-Type', 'text/html');
  const title = req.url === '/reference' ? 'Reference tab' : req.url === '/child' ? 'Editor frame' : 'Editor tab';
  res.end(`<!doctype html><html><head><title>${title}</title><link rel="icon" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jf9kAAAAASUVORK5CYII="></head><body><h1>${title}</h1><input id="input"><script>document.addEventListener('keyup',event=>event.stopPropagation());</script>${req.url === '/editor' ? `<iframe id="editorFrame" src="http://localhost:${port}/child"></iframe><iframe id="blankFrame" srcdoc="<input id='blankInput'>"></iframe>` : ''}</body></html>`);
});
let context;
let profile;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  profile = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'edge-alt-tab-test-'));
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}),
    args: [`--disable-extensions-except=${process.env.EXTENSION_PATH || root}`, `--load-extension=${process.env.EXTENSION_PATH || root}`]
  });
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  const extensionId = worker.url().split('/')[2];
  await worker.evaluate(() => ready);
  await worker.evaluate(() => { globalThis.nativeCommandCount = 0; chrome.commands.onCommand.addListener(() => { globalThis.nativeCommandCount++; }); });
  const externalIcons = [];
  const errors = [];
  context.on('request', request => { if (/google\.com\/s2\/favicons/.test(request.url())) externalIcons.push(request.url()); });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const reference = await context.newPage(); await reference.goto(`${origin}/reference`);
  const editor = await context.newPage(); await editor.goto(`${origin}/editor`);
  const ids = await worker.evaluate(async () => Object.fromEntries((await chrome.tabs.query({})).filter(tab => tab.url?.startsWith('http://127.0.0.1')).map(tab => [new URL(tab.url).pathname, tab.id])));
  await worker.evaluate(async tabId => {
    for (let i = 0; i < 2; i++) await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
  }, ids['/editor']);
  async function open() {
    await reference.bringToFront(); await editor.bringToFront();
    await worker.evaluate(async () => { await run(() => handleCommand('toggle-tab')); });
    const frame = await until(() => Promise.resolve(editor.frames().find(frame => frame.url().startsWith(`chrome-extension://${extensionId}/switcher.html`))));
    await frame.waitForSelector('[role="option"]');
    await frame.waitForFunction(() => document.getAnimations().every(animation => animation.playState === 'finished'));
    return frame;
  }
  async function assertCentered(frame) {
    const center = await frame.evaluate(() => {
      const rect = document.getElementById('switcher').getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: innerWidth, height: innerHeight };
    });
    assert.ok(Math.abs(center.x - center.width / 2) < 2, `Panel not horizontally centered: ${JSON.stringify(center)}`);
    assert.ok(Math.abs(center.y - center.height / 2) < 2, `Panel not vertically centered: ${JSON.stringify(center)}`);
    const bounds = await editor.locator('#edge-alt-tab-overlay-container').boundingBox();
    const viewport = await editor.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    assert.ok(Math.abs(bounds.x) < 2 && Math.abs(bounds.y) < 2);
    assert.ok(Math.abs(bounds.width - viewport.width) < 2 && Math.abs(bounds.height - viewport.height) < 2);
  }
  let frame = await open();
  await assertCentered(frame);
  assert.equal(await frame.locator('[aria-selected=true] .tab-title').textContent(), 'Reference tab');
  assert.equal(await editor.evaluate(() => document.getElementById('edge-alt-tab-overlay-container').shadowRoot), null);
  assert.equal(await editor.evaluate(() => document.querySelector('.tab-title')), null);
  assert.equal(await editor.locator('#edge-alt-tab-overlay-container').count(), 1);
  assert.ok(await frame.locator('.tab-icon').first().evaluate(image => image.src.startsWith('chrome-extension://') || image.src.startsWith('data:image/')));
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  await editor.screenshot({ path: path.join(root, 'test-results', 'switcher.png') });
  await frame.locator('#switcher').screenshot({ path: path.join(root, 'test-results', 'switcher-panel.png') });
  console.log('PASS: private extension frame, local icons, initial MRU selection, and safe reinjection');
  await editor.keyboard.press('Tab');
  assert.equal(await frame.evaluate(() => document.activeElement.id), 'searchButton');
  await editor.keyboard.press('Shift+Tab');
  assert.equal(await frame.evaluate(() => document.activeElement.id), 'list');
  console.log('PASS: Tab navigation stays within the modal');

  const optionsURL = `chrome-extension://${extensionId}/options.html`;
  async function waitForSettings() {
    const page = await until(() => Promise.resolve(context.pages().find(candidate => candidate.url() === optionsURL)));
    await page.waitForSelector('#switchMode');
    await until(() => worker.evaluate(async () => { await queue; return session; }), value => value === null);
    await until(() => editor.locator('#edge-alt-tab-overlay-container').count(), count => count === 0);
    assert.equal(await worker.evaluate(async url => (await chrome.tabs.query({ url })).length, optionsURL), 1);
    return page;
  }
  await frame.locator('#settingsButton').click();
  let openedSettings = await waitForSettings();
  assert.equal(await worker.evaluate(async id => (await chrome.tabs.get(id)).active, ids['/reference']), false);
  await openedSettings.close();
  frame = await open();
  await frame.locator('#settingsButton').focus(); await editor.keyboard.press('Enter');
  openedSettings = await waitForSettings();
  assert.equal(await worker.evaluate(async id => (await chrome.tabs.get(id)).active, ids['/reference']), false);
  await openedSettings.close();
  frame = await open();
  console.log('PASS: overlay Settings opens options by mouse and Enter without switching tabs');

  // Force focus into the original editor frame while the overlay is open to
  // exercise the frame bridge, rather than only the extension UI listener.
  await editor.frameLocator('#editorFrame').locator('#input').focus();
  await editor.keyboard.down('Alt'); await editor.keyboard.up('Alt');
  await until(() => worker.evaluate(async () => { await queue; return session; }), value => value === null);
  assert.equal(await worker.evaluate(async id => (await chrome.tabs.get(id)).active, ids['/reference']), true);
  assert.equal(await editor.locator('#edge-alt-tab-overlay-container').count(), 0);
  console.log('PASS: Alt release from cross-origin editor frame despite stopped bubbling');

  frame = await open();
  await editor.frameLocator('#blankFrame').locator('#blankInput').focus();
  await editor.keyboard.down('Alt'); await editor.keyboard.up('Alt');
  await until(() => worker.evaluate(async () => { await queue; return session; }), value => value === null);
  console.log('PASS: Alt release from about:blank editor frame');

  frame = await open();
  await frame.locator('#searchButton').click(); await frame.locator('#search').fill('Reference');
  assert.equal(await frame.locator('[role="option"]').count(), 1);
  await assertCentered(frame);
  await editor.keyboard.press('Enter');
  await until(() => worker.evaluate(async () => { await queue; return session; }), value => value === null);
  console.log('PASS: search by title and Enter confirmation');

  frame = await open();
  await editor.keyboard.press('Escape');
  await until(() => editor.locator('#edge-alt-tab-overlay-container').count(), count => count === 0);
  assert.equal(await editor.evaluate(() => document.activeElement.tagName), 'IFRAME');
  console.log('PASS: Escape removes overlay and restores editor frame focus');

  await editor.evaluate(() => {
    document.documentElement.style.transform = 'translate(130px, 95px)';
    document.body.style.minHeight = '2500px';
    window.scrollTo(0, 600);
  });
  frame = await open(); await assertCentered(frame);
  assert.equal(await editor.evaluate(() => document.getElementById('edge-alt-tab-overlay-container').matches(':popover-open')), true);
  await editor.keyboard.press('Escape');
  await until(() => editor.locator('#edge-alt-tab-overlay-container').count(), count => count === 0);
  await editor.evaluate(() => { document.documentElement.style.transform = ''; document.body.style.minHeight = ''; window.scrollTo(0, 0); });
  console.log('PASS: centered top-layer overlay on transformed, scrolled pages');

  frame = await open();
  const cdp = await context.newCDPSession(editor);
  const { targetInfos } = await cdp.send('Target.getTargets');
  const workerTarget = targetInfos.find(target => target.type === 'service_worker' && target.url === worker.url());
  assert.ok(workerTarget);
  const oldWorker = worker;
  await oldWorker.evaluate(() => { globalThis.recoveryMarker = 'old-worker'; });
  await cdp.send('Target.closeTarget', { targetId: workerTarget.targetId });
  await frame.locator('#list').focus(); await editor.keyboard.press('ArrowUp');
  worker = await until(async () => {
    const candidate = context.serviceWorkers().find(item => item.url() === oldWorker.url());
    if (!candidate) return null;
    try { return await candidate.evaluate(() => globalThis.recoveryMarker === undefined) ? candidate : null; }
    catch { return null; }
  });
  await worker.evaluate(() => ready);
  await worker.evaluate(() => { globalThis.nativeCommandCount = 0; chrome.commands.onCommand.addListener(() => { globalThis.nativeCommandCount++; }); });
  await until(() => worker.evaluate(async () => { await queue; return session.selectedTabId; }), value => value === ids['/editor']);
  await editor.keyboard.press('ArrowDown'); await editor.keyboard.press('Enter');
  await until(() => worker.evaluate(async () => { await queue; return session; }), value => value === null);
  assert.equal(await worker.evaluate(async id => (await chrome.tabs.get(id)).active, ids['/reference']), true);
  await cdp.detach();
  console.log('PASS: real worker termination restores an open session on the next input');

  await reference.bringToFront(); await editor.bringToFront();
  await editor.frameLocator('#editorFrame').locator('#input').focus();
  await editor.keyboard.down('Alt'); await editor.keyboard.press('q'); await editor.keyboard.up('Alt');
  const nativeDispatch = await worker.evaluate(() => (globalThis.nativeCommandCount || 0) > 0);
  // Native command dispatch varies with headless automation. Feed the command
  // handler only if no command was dispatched, retaining real key events.
  await worker.evaluate(async () => {
    await queue;
    if (!session) {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab.url.endsWith('/editor')) await run(() => handleCommand('toggle-tab', tab));
    }
  });
  await until(() => worker.evaluate(async () => { await queue; return session; }), value => value === null);
  assert.equal(await worker.evaluate(async id => (await chrome.tabs.get(id)).active, ids['/reference']), true);
  console.log(`PASS: fast Alt gesture reconciled (native headless dispatch observed: ${nativeDispatch})`);

  frame = await open(); await reference.close();
  await until(() => editor.locator('#edge-alt-tab-overlay-container').count(), count => count === 0);
  assert.equal(await worker.evaluate(async id => (await chrome.tabs.get(id)).active, ids['/editor']), true);
  console.log('PASS: closing selected tab cancels without switching elsewhere');

  const restriction = await context.newPage(); await restriction.goto('chrome://version');
  await restriction.bringToFront();
  await worker.evaluate(async () => { await run(() => handleCommand('toggle-tab')); });
  assert.equal(await worker.evaluate(() => session), null);
  assert.equal(await worker.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ['POPUP'] })).length), 0);
  assert.equal(await worker.evaluate(async id => (await chrome.tabs.get(id)).active, ids['/editor']), true);

  // Check Edge's actual settings page, not only the shared Chromium version UI.
  const internalPrefix = process.env.PLAYWRIGHT_EXECUTABLE_PATH?.toLowerCase().includes('msedge') ? 'edge' : 'chrome';
  await restriction.goto(`${internalPrefix}://settings/`); await restriction.bringToFront();
  await worker.evaluate(() => run(() => handleCommand('toggle-tab')));
  assert.equal(await worker.evaluate(() => session), null);
  assert.equal(await worker.evaluate(async id => (await chrome.tabs.get(id)).active, ids['/editor']), true);
  assert.equal(await worker.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ['POPUP'] })).length), 0);
  await restriction.close();
  console.log('PASS: internal version/settings pages switch immediately without opening a popup');

  const options = await context.newPage(); await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.locator('#windowScope').selectOption('all');
  await options.waitForFunction(() => document.getElementById('status').textContent === 'Settings saved');
  assert.equal(await worker.evaluate(async () => (await chrome.storage.local.get('windowScope')).windowScope), 'all');
  await options.screenshot({ path: path.join(root, 'test-results', 'settings.png'), fullPage: true });
  assert.equal(await options.locator('#shortcuts dd').count(), 3);
  await options.locator('#checkStatus').click();
  await options.waitForFunction(() => document.getElementById('diagnostics').textContent.includes('background is ready'));
  console.log('PASS: settings save and assigned-shortcut display');
  await editor.bringToFront();
  await worker.evaluate(async () => { await chrome.action.openPopup(); });
  await until(() => worker.evaluate(async () => { await queue; return session; }), value => value && !value.embedded && value.uiReady);
  const popupContexts = await worker.evaluate(() => chrome.runtime.getContexts({ contextTypes: ['POPUP'] }));
  assert.equal(popupContexts.length, 1);
  // Toolbar popups are native browser targets outside Playwright's page list.
  // Attach directly to click the real popup rather than simulate a UI message.
  const popupCDP = await context.newCDPSession(editor);
  const popupTarget = (await popupCDP.send('Target.getTargets')).targetInfos.find(target => target.url === popupContexts[0].documentUrl);
  assert.ok(popupTarget);
  let attached = await popupCDP.send('Target.attachToTarget', { targetId: popupTarget.targetId, flatten: false });
  let popupMessageId = 0;
  const popupPending = new Map();
  popupCDP.on('Target.receivedMessageFromTarget', event => {
    if (event.sessionId !== attached.sessionId) return;
    const message = JSON.parse(event.message);
    const request = popupPending.get(message.id);
    if (!request) return;
    clearTimeout(request.timer); popupPending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
  });
  async function popupCommand(method, params = {}) {
    const id = ++popupMessageId;
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { popupPending.delete(id); reject(new Error(`Popup command timed out: ${method}`)); }, 7000);
      popupPending.set(id, { resolve, reject, timer });
    });
    await popupCDP.send('Target.sendMessageToTarget', { sessionId: attached.sessionId, message: JSON.stringify({ id, method, params }) });
    return response;
  }
  async function popupEvaluate(expression) {
    const result = await popupCommand('Runtime.evaluate', { expression, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined);
    return result.result.value;
  }
  const popupLayout = await until(() => popupEvaluate(`(() => {
    const rect = document.getElementById('switcher').getBoundingClientRect();
    return { count: document.querySelectorAll('[role="option"]').length, width: rect.width,
      height: rect.height, search: !document.getElementById('searchRow').hidden };
  })()`), value => value.count > 0);
  assert.equal(popupLayout.width, 400); assert.ok(popupLayout.height > 100); assert.equal(popupLayout.search, true);
  const point = await popupEvaluate(`(() => { const rect = document.getElementById('settingsButton').getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; })()`);
  await popupCommand('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
  await popupCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  openedSettings = await waitForSettings();
  assert.equal(openedSettings, options);
  await until(() => worker.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ['POPUP'] })).length), value => value === 0);
  console.log('PASS: real toolbar popup renders its search/tab list and Settings reuses the options tab');

  const popupSource = await context.newPage(); await popupSource.goto(`${internalPrefix}://settings/`);
  await popupSource.bringToFront(); await worker.evaluate(() => chrome.action.openPopup());
  await until(() => worker.evaluate(async () => { await queue; return session; }), value => value && !value.embedded && value.uiReady);
  const internalPopupTarget = (await popupCDP.send('Target.getTargets')).targetInfos.find(target => target.url === `chrome-extension://${extensionId}/switcher.html`);
  assert.ok(internalPopupTarget);
  attached = await popupCDP.send('Target.attachToTarget', { targetId: internalPopupTarget.targetId, flatten: false });
  await until(() => popupEvaluate('document.querySelectorAll("[role=option]").length'), value => value > 0);
  await popupEvaluate('window.close(); true');
  await until(() => worker.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ['POPUP'] })).length), value => value === 0);
  await until(() => worker.evaluate(async () => { await queue; return session; }), value => value === null);
  await popupSource.close(); await popupCDP.detach();
  console.log('PASS: toolbar popup works on an internal settings page and dismissal clears its session');

  await editor.bringToFront();
  await worker.evaluate(async () => {
    for (let i = 0; i < 60; i++) await chrome.tabs.create({ url: 'about:blank', active: false });
    await run(() => null);
    await run(() => handleCommand('toggle-tab'));
  });
  await editor.setViewportSize({ width: 340, height: 540 });
  await editor.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce', forcedColors: 'active' });
  frame = await until(() => Promise.resolve(editor.frames().find(candidate => candidate.url().startsWith(`chrome-extension://${extensionId}/switcher.html`))));
  await frame.waitForSelector('[role="option"]');
  await assertCentered(frame);
  assert.ok(await frame.locator('[role="option"]').count() >= 60);
  assert.equal(await frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await frame.locator('#list').focus(); await editor.keyboard.press('End');
  assert.equal(await frame.evaluate(() => {
    const list = document.getElementById('list'); const selected = list.querySelector('[aria-selected="true"]');
    return selected.getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom + 1;
  }), true);
  assert.equal(await frame.evaluate(() => document.getAnimations().length), 0);
  await editor.screenshot({ path: path.join(root, 'test-results', 'switcher-narrow.png') });
  await editor.keyboard.press('Escape');
  console.log('PASS: 60+ tabs, narrow layout, last-row scrolling, reduced motion, and forced colors');
  assert.deepEqual(externalIcons, []); assert.deepEqual(errors, []);
  console.log('PASS: no external favicon proxy requests or page errors');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (context) await context.close();
  await new Promise(resolve => server.close(resolve));
  if (profile) {
    const resolved = path.resolve(profile);
    const tempRoot = path.resolve(require('node:os').tmpdir());
    if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith('edge-alt-tab-test-')) {
      throw new Error('Refusing to remove a profile outside the test temporary directory');
    }
    fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
