const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const clone = value => structuredClone(value);
const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); }, emit(...args) { for (const fn of this.listeners) fn(...args); } });

function fixture({ saved = {}, preferences = {}, startupGate = Promise.resolve(), tabs: customTabs } = {}) {
  const tabs = clone(customTabs || [
    { id: 1, windowId: 10, active: true, incognito: false, title: 'Current', url: 'https://one.test/', lastAccessed: 300 },
    { id: 2, windowId: 10, active: false, incognito: false, title: 'Recent', url: 'https://two.test/', lastAccessed: 200 },
    { id: 3, windowId: 10, active: false, incognito: false, title: 'Older', url: 'https://three.test/', lastAccessed: 100 },
    { id: 4, windowId: 20, active: true, incognito: false, title: 'Other window', url: 'https://four.test/', lastAccessed: 250 },
    { id: 5, windowId: 30, active: true, incognito: true, title: 'Private', url: 'https://private.test/', lastAccessed: 400 }
  ]);
  const calls = { pageMessages: [], broadcasts: [], updates: [], windows: [], scripts: [], warnings: [], popups: [], options: [] };
  const extensionContexts = [];
  const sessionData = clone(saved);
  const localData = clone(preferences);
  let focusedWindow = 10;
  let injectionFails = false;
  let messagingFails = false;
  const storageArea = data => ({
    async get(defaults) { await startupGate; return { ...clone(defaults), ...clone(data) }; },
    async set(value) { Object.assign(data, clone(value)); },
    async remove(key) { delete data[key]; }
  });
  const chrome = {
    action: { async openPopup(options) { calls.popups.push(clone(options)); } },
    runtime: { id: 'audit', getURL: name => `chrome-extension://audit/${name.replace(/^\//, '')}`, getManifest: () => JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'))), onMessage: event(), onConnect: event(),
      async getContexts(filter) { return clone(extensionContexts.filter(context =>
        (!filter.contextTypes || filter.contextTypes.includes(context.contextType)) &&
        (!filter.documentUrls || filter.documentUrls.includes(context.documentUrl)))); },
      async openOptionsPage() { calls.options.push({ session: clone(evaluate('session')) }); },
      async sendMessage(message) { calls.broadcasts.push(clone(message)); } },
    storage: { local: storageArea(localData), session: storageArea(sessionData), onChanged: event() },
    commands: { onCommand: event(), async getAll() { return clone(chrome.commands.bindings); }, bindings: [
      { name: 'toggle-tab', shortcut: 'Alt+Q' }, { name: 'cycle-backward', shortcut: 'Alt+Shift+Q' }, { name: 'quick-switch', shortcut: '' }
    ] },
    scripting: { async executeScript(options) { calls.scripts.push(clone(options)); if (injectionFails) throw Error('restricted'); } },
    windows: { WINDOW_ID_NONE: -1, onFocusChanged: event(), async update(id, options) { focusedWindow = id; calls.windows.push({ id, ...options }); } },
    tabs: {
      onActivated: event(), onCreated: event(), onRemoved: event(), onUpdated: event(), onReplaced: event(), onDetached: event(),
      async query(query) { return clone(tabs.filter(tab => (!query.active || tab.active) &&
        (!query.lastFocusedWindow || tab.windowId === focusedWindow) && (query.windowId === undefined || query.windowId === tab.windowId))); },
      async get(id) { const tab = tabs.find(item => item.id === id); if (!tab) throw Error('closed'); return clone(tab); },
      async update(id, properties) {
        const tab = tabs.find(item => item.id === id); if (!tab) throw Error('closed');
        if (properties.active) for (const item of tabs) if (item.windowId === tab.windowId) item.active = item.id === id;
        Object.assign(tab, properties); calls.updates.push({ id, ...properties }); return clone(tab);
      },
      async sendMessage(id, message, options) { calls.pageMessages.push({ id, ...clone(message), options });
        if (messagingFails) throw Error('no receiver'); return { ok: true }; }
    }
  };
  const context = vm.createContext({ chrome, crypto: webcrypto, URL, Date, setTimeout, clearTimeout,
    console: { warn: message => calls.warnings.push(message) },
    importScripts: name => vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context) });
  vm.runInContext(fs.readFileSync(path.join(root, 'background.js'), 'utf8'), context);
  const evaluate = code => vm.runInContext(code, context);
  const flush = async () => { await evaluate('run(() => null)'); await evaluate('queue'); };
  const command = async name => { chrome.commands.onCommand.emit(name, clone(tabs.find(tab => tab.active && tab.windowId === focusedWindow))); await flush(); };
  const state = () => clone(evaluate('session'));
  const bridge = (frameId = 0) => ({ id: 'audit', tab: { id: 1 }, frameId, documentId: `document-${frameId}`, url: 'https://one.test/' });
  const ui = (documentId = 'ui-document') => ({ id: 'audit', tab: { id: 1 }, frameId: 6, documentId, url: 'chrome-extension://audit/switcher.html' });
  const popup = (documentId = 'popup-document') => {
    const url = 'chrome-extension://audit/switcher.html';
    extensionContexts.push({ contextType: 'POPUP', documentId, documentUrl: url });
    return { id: 'audit', documentId, url };
  };
  const popupPort = sender => {
    const port = { name: 'toolbar-switcher', sender, onMessage: event(), onDisconnect: event() };
    chrome.runtime.onConnect.emit(port); return port;
  };
  const message = (payload, sender = ui()) => new Promise(resolve => chrome.runtime.onMessage.emit(payload, sender, response => resolve(clone(response))));
  return { chrome, tabs, calls, context, evaluate, command, state, bridge, ui, popup, popupPort, extensionContexts, message, flush, sessionData, localData,
    restrict() { injectionFails = true; messagingFails = true; } };
}
module.exports = { fixture, root };
