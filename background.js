importScripts('shared.js');

const SESSION_LIFETIME = 5 * 60 * 1000;
const POPUP_START_TIMEOUT = 4000;
let mruStack = [];
let session = null;
let settings = AltTab.normalizeSettings({});
let gestureEpochs = {};
let queue = Promise.resolve();
let ready;
let startupFailed = false;
let lastCommand = null;

// Listeners register synchronously; mutations wait for initialization and run
// in order, including commands that wake a suspended worker.
function run(operation) {
  const result = queue.then(async () => {
    await ready;
    if (startupFailed) throw new Error('Switcher initialization failed');
    if (session && session.expiresAt <= Date.now()) await closeSession();
    return operation();
  });
  queue = result.catch(() => console.warn('Alt-Tab: operation failed.'));
  return result;
}
function enqueue(operation) {
  // Event APIs do not consume returned promises. run logs the error; consume
  // its rejection here so failures do not become unhandled rejections.
  void run(operation).catch(() => {});
}
async function persist() {
  await chrome.storage.session.set({ mruStack, switchSession: session, gestureEpochs, lastCommand });
}
function touch(tabId) {
  mruStack = [tabId, ...mruStack.filter(id => id !== tabId)];
}
async function initialize() {
  const [saved, preferences, tabs] = await Promise.all([
    chrome.storage.session.get({ mruStack: [], switchSession: null, gestureEpochs: {}, lastCommand: null }),
    chrome.storage.local.get(AltTab.DEFAULTS), chrome.tabs.query({})
  ]);
  settings = AltTab.normalizeSettings(preferences);
  lastCommand = saved.lastCommand;
  const ids = new Set(tabs.map(tab => tab.id));
  const restored = Array.isArray(saved.mruStack) ? saved.mruStack : [];
  mruStack = [...new Set(restored.filter(id => ids.has(id)))];
  const recent = [...tabs].sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  mruStack.push(...recent.map(tab => tab.id).filter(id => !mruStack.includes(id)));
  gestureEpochs = saved.gestureEpochs || {};
  const previous = saved.switchSession;
  if (previous && previous.expiresAt > Date.now() && ids.has(previous.ownerTabId)) {
    const owner = tabs.find(tab => tab.id === previous.ownerTabId);
    if (owner.active && owner.url === previous.ownerUrl) session = previous;
  }
  if (session && !session.embedded) {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ['POPUP'],
      documentUrls: [chrome.runtime.getURL('switcher.html')] });
    if (!contexts.length) session = null;
  }
  // Retire obsolete durable tab IDs while preserving existing preferences.
  await chrome.storage.local.remove('mruStack');
  await persist();
}
async function topMessage(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
}
async function broadcastState() {
  // runtime broadcasts reach extension contexts, not page content scripts.
  await chrome.runtime.sendMessage({ type: 'SESSION_STATE', sessionId: session?.id || null }).catch(() => {});
}
async function closeSession() {
  const old = session;
  session = null;
  await persist();
  if (!old) return;
  await Promise.allSettled([
    chrome.tabs.sendMessage(old.ownerTabId, { type: 'END_SESSION', sessionId: old.id }),
    chrome.runtime.sendMessage({ type: 'SESSION_CLOSED', sessionId: old.id })
  ]);
}
async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}
async function activate(tabId) {
  const tab = await chrome.tabs.get(tabId);
  await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  touch(tabId);
  await persist();
}
async function commit(tabId = session?.selectedTabId) {
  if (!session || !session.candidateIds.includes(tabId)) return { ok: false };
  try { await chrome.tabs.get(tabId); }
  catch {
    await refreshCandidates();
    return { ok: false, error: 'That tab has closed. Choose another tab.' };
  }
  await closeSession();
  await activate(tabId);
  return { ok: true };
}
async function refreshCandidates(liveTabs) {
  if (!session) return;
  const tabs = liveTabs || await chrome.tabs.query({});
  const ids = new Set(tabs.map(tab => tab.id));
  const before = session.candidateIds.length;
  session.candidateIds = session.candidateIds.filter(id => ids.has(id));
  if (!session.candidateIds.length) return closeSession();
  if (!session.candidateIds.includes(session.selectedTabId)) return closeSession();
  if (before !== session.candidateIds.length) { await persist(); await broadcastState(); }
}
async function switchWithoutOverlay() {
  if (!session) return;
  const target = session.selectedTabId;
  await closeSession(); await activate(target);
}
async function popupStartTimedOut(sessionId) {
  // Only the pending session may fall back. Dismissed/replaced popups must
  // never activate a tab later when their startup timer fires.
  if (session?.id === sessionId && !session.embedded && !session.uiReady) await switchWithoutOverlay();
}
async function showToolbarSwitcher() {
  if (!session) return;
  session.embedded = false;
  session.uiReady = false;
  session.uiDocumentId = null;
  const sessionId = session.id;
  await persist();
  // Internal browser pages cannot host content scripts. Keep the keyboard
  // session intact while moving its UI into a browser-owned action popup.
  setTimeout(() => enqueue(() => popupStartTimedOut(sessionId)), POPUP_START_TIMEOUT);
  try { await chrome.action.openPopup({ windowId: session.ownerWindowId }); }
  catch { if (session?.id === sessionId) await switchWithoutOverlay(); }
}
async function startSession(tab, { embedded = true, direction = 1, instant = false } = {}) {
  if (!tab) return null;
  await closeSession();
  const tabs = await chrome.tabs.query({});
  const available = tabs.filter(candidate => candidate.incognito === tab.incognito &&
    (settings.windowScope === 'all' || candidate.windowId === tab.windowId));
  const ids = new Set(available.map(candidate => candidate.id));
  const allIds = new Set(tabs.map(candidate => candidate.id));
  mruStack = mruStack.filter(id => allIds.has(id));
  for (const candidate of tabs) if (!mruStack.includes(candidate.id)) mruStack.push(candidate.id);
  touch(tab.id);
  const candidateIds = mruStack.filter(id => ids.has(id));
  if (instant) {
    if (candidateIds.length > 1) await activate(candidateIds[1]);
    return null;
  }
  const commands = await chrome.commands.getAll();
  const commandName = direction < 0 ? 'cycle-backward' : 'toggle-tab';
  const binding = AltTab.parseShortcut(commands.find(command => command.name === commandName)?.shortcut);
  session = {
    id: crypto.randomUUID(), ownerTabId: tab.id, ownerWindowId: tab.windowId,
    ownerUrl: tab.url, ownerDocumentId: null, uiDocumentId: null,
    candidateIds, selectedTabId: candidateIds[direction < 0 ? candidateIds.length - 1 : 1] ?? tab.id,
    embedded, keyboardInitiated: embedded,
    modifier: embedded && settings.switchMode === 'hold' ? binding.modifier : null,
    binding, createdAt: Date.now(), expiresAt: Date.now() + SESSION_LIFETIME,
    uiReady: false, searchMode: !embedded
  };
  await persist();
  if (!embedded) return session;
  if (candidateIds.length < 2) { await closeSession(); return null; }
  if (!/^(https?|file):/i.test(tab.url || '')) {
    await showToolbarSwitcher();
    return session;
  }
  try {
    try { await topMessage(tab.id, { type: 'PING' }); }
    catch {
      await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['content.js'] });
    }
    const response = await topMessage(tab.id, {
      type: 'SHOW_SWITCHER', sessionId: session.id, modifier: session.modifier,
      binding: session.binding, expiresAt: session.expiresAt
    });
    if (!response?.ok) throw new Error('Overlay unavailable');
    await chrome.tabs.sendMessage(tab.id, {
      type: 'ARM_SESSION', sessionId: session.id, modifier: session.modifier,
      binding: session.binding, expiresAt: session.expiresAt
    });
  } catch {
    await switchWithoutOverlay();
  }
  return session;
}
async function handleCommand(command, invokedTab) {
  if (!['toggle-tab', 'cycle-backward', 'quick-switch'].includes(command)) return;
  let tab;
  if (invokedTab?.id !== undefined) {
    try { tab = await chrome.tabs.get(invokedTab.id); } catch { /* Tab may have closed. */ }
  }
  tab ||= await currentTab();
  if (!tab) return;
  const direction = command === 'cycle-backward' ? -1 : 1;
  if (command === 'quick-switch' || settings.switchMode === 'instant') {
    await startSession(tab, { instant: true });
  } else if ((session?.embedded || session?.keyboardInitiated) && session.ownerTabId === tab.id) {
    const index = session.candidateIds.indexOf(session.selectedTabId);
    session.selectedTabId = session.candidateIds[(index + direction + session.candidateIds.length) % session.candidateIds.length];
    await persist(); await broadcastState();
  } else await startSession(tab, { direction });
}
function isUI(sender) {
  try {
    const source = new URL(sender.url);
    const extension = new URL(chrome.runtime.getURL('/'));
    return sender.id === chrome.runtime.id && source.pathname === '/switcher.html' &&
      source.protocol === extension.protocol && source.host === extension.host;
  } catch { return false; }
}
async function isToolbarPopup(sender) {
  if (!isUI(sender)) return false;
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['POPUP'], documentUrls: [chrome.runtime.getURL('switcher.html')]
  });
  return contexts.some(context => sender.documentId
    ? context.documentId === sender.documentId
    : !sender.tab || sender.tab.id === -1);
}
async function ownsUI(message, sender) {
  const active = session;
  return isUI(sender) && active && message.sessionId === active.id &&
    (active.embedded ? sender.tab?.id === active.ownerTabId : await isToolbarPopup(sender)) &&
    session === active && (!active.uiDocumentId || active.uiDocumentId === sender.documentId);
}
function ownsPopupCancellation(message, sender) {
  // pagehide may reach the worker after the browser has removed the POPUP
  // context. Allow this bound document to cancel, but never read/activate tabs.
  return isUI(sender) && session && !session.embedded && message.sessionId === session.id &&
    (session.uiDocumentId ? session.uiDocumentId === sender.documentId : !sender.tab || sender.tab.id === -1);
}
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'toolbar-switcher' || !isUI(port.sender)) return;
  let popupSessionId;
  let disconnected = false;
  async function clearPopup() {
    if (disconnected && popupSessionId && session?.id === popupSessionId && !session.embedded) await closeSession();
  }
  port.onMessage.addListener(message => { enqueue(async () => {
    if (ownsPopupCancellation(message, port.sender)) popupSessionId = message.sessionId;
    await clearPopup();
  }); });
  port.onDisconnect.addListener(() => {
    disconnected = true;
    enqueue(clearPopup);
  });
});
function ownsBridge(message, sender) {
  return sender.id === chrome.runtime.id && sender.tab?.id === session?.ownerTabId && message.sessionId === session?.id;
}
async function snapshot() {
  const tabs = await chrome.tabs.query({});
  await refreshCandidates(tabs);
  if (!session) return null;
  const byId = new Map(tabs.map(tab => [tab.id, tab]));
  return {
    sessionId: session.id, selectedTabId: session.selectedTabId,
    modifier: session.modifier, embedded: session.embedded, expiresAt: session.expiresAt,
    searchMode: session.searchMode,
    settings, tabs: session.candidateIds.map(id => {
      const tab = byId.get(id);
      return { id, title: tab.title || 'New Tab', url: tab.url || '',
        dataIcon: /^data:image\/(?:png|jpeg|gif|webp|x-icon|vnd.microsoft.icon);base64,/i.test(tab.favIconUrl || '')
          && tab.favIconUrl.length < 128000 ? tab.favIconUrl : null,
        pinned: tab.pinned, audible: tab.audible, muted: tab.mutedInfo?.muted,
        discarded: tab.discarded, windowId: tab.windowId, otherWindow: tab.windowId !== session.ownerWindowId };
    })
  };
}
async function onMessage(message, sender) {
  if (!message || sender.id !== chrome.runtime.id) return { ok: false };
  if (message.type === 'OPEN_POPUP' && await isToolbarPopup(sender)) {
    const tab = await currentTab();
    const pending = session && !session.embedded && session.keyboardInitiated && !session.uiReady &&
      session.ownerTabId === tab?.id && session.ownerUrl === tab?.url;
    if (!pending) await startSession(tab, { embedded: false });
    if (!session) return { ok: false };
    session.uiDocumentId = sender.documentId; session.uiReady = true;
    await persist();
    return { ok: true, state: await snapshot() };
  }
  if (message.type === 'UI_READY' && await ownsUI(message, sender)) {
    session.uiDocumentId = sender.documentId; session.uiReady = true;
    await persist();
    return { ok: true, state: await snapshot() };
  }
  if (message.type === 'UI_CANCEL' && ownsPopupCancellation(message, sender)) {
    await closeSession(); return { ok: true };
  }
  if (message.type === 'GET_SESSION' && await ownsUI(message, sender)) return { ok: true, state: await snapshot() };
  if (await ownsUI(message, sender)) {
    if (message.type === 'UI_COMMIT') return commit(message.tabId);
    if (message.type === 'UI_CANCEL') { await closeSession(); return { ok: true }; }
    if (message.type === 'UI_SELECT' && session.candidateIds.includes(message.tabId)) {
      session.selectedTabId = message.tabId; await persist(); return { ok: true };
    }
    if (message.type === 'UI_SEARCH') {
      session.searchMode = Boolean(message.active); await persist(); return { ok: true };
    }
    if (message.type === 'UI_RELEASE' && message.key === session.modifier && !session.searchMode) return commit();
  }
  if (!ownsBridge(message, sender)) return { ok: false };
  if (message.type === 'HOST_READY' && sender.frameId === 0) {
    session.ownerDocumentId = sender.documentId; await persist(); return { ok: true };
  }
  if (message.type === 'BRIDGE_CANCEL') {
    if (message.reason === 'escape' || (sender.frameId === 0 &&
      (!session.ownerDocumentId || session.ownerDocumentId === sender.documentId))) await closeSession();
    return { ok: true };
  }
  if (message.type === 'OVERLAY_TIMEOUT' && sender.frameId === 0 && !session.uiReady) {
    await switchWithoutOverlay(); return { ok: true };
  }
  if (message.type === 'KEY_RELEASE' || message.type === 'KEY_SNAPSHOT') {
    const key = `${sender.tab.id}:${sender.frameId}:${sender.documentId}`;
    const gesture = message.gesture;
    const fresh = gesture && gesture.at > (gestureEpochs[key] || 0) &&
      gesture.at >= session.createdAt - 1500 && gesture.at <= Date.now() && AltTab.matchesBinding(gesture, session.binding);
    if (fresh) { gestureEpochs[key] = gesture.at; await persist(); }
    if (message.key === session.modifier && !session.searchMode && (message.type === 'KEY_RELEASE' || fresh) &&
      message.releasedAt >= (gesture?.at || session.createdAt) && Date.now() - message.releasedAt < 2000) return commit();
    return { ok: true };
  }
  return { ok: false };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'OPEN_OPTIONS') {
    // Keep opening settings in the worker: closing a popup/removing its frame
    // destroys the UI's context and any subsequent API call from that context.
    // A genuine toolbar popup can open settings even if startup failed.
    (async () => {
      if (!await ownsUI(message, sender) && !await isToolbarPopup(sender)) return { ok: false };
      const previousSessionId = session?.id;
      await chrome.runtime.openOptionsPage();
      if (previousSessionId && !startupFailed) await run(async () => {
        if (session?.id === previousSessionId) await closeSession();
      });
      return { ok: true };
    })().then(respond, () => respond({ ok: false, error: 'Settings could not be opened. Try again.' }));
    return true;
  }
  if (message?.type === 'DIAGNOSTICS' && sender.id === chrome.runtime.id && sender.url === chrome.runtime.getURL('options.html')) {
    Promise.resolve(ready).then(() => respond({ ok: true, version: chrome.runtime.getManifest().version,
      startupFailed, lastCommand, surface: session ? (session.embedded ? 'overlay' : 'toolbar') : null }));
    return true;
  }
  run(() => onMessage(message, sender)).then(respond, () => respond({ ok: false, error: 'The switcher could not complete that action.' }));
  return true;
});
chrome.commands.onCommand.addListener((command, tab) => { enqueue(async () => {
  lastCommand = { name: command, at: Date.now(), result: 'received' };
  await persist();
  try {
    await handleCommand(command, tab);
    lastCommand.result = session ? (session.embedded ? 'overlay' : 'toolbar') : 'completed';
  } catch (error) { lastCommand.result = 'failed'; throw error; }
  finally { await persist(); }
}); });
chrome.tabs.onActivated.addListener(info => { enqueue(async () => {
  if (session && info.windowId === session.ownerWindowId && info.tabId !== session.ownerTabId) await closeSession();
  touch(info.tabId); await persist();
}); });
chrome.tabs.onCreated.addListener(tab => { enqueue(async () => {
  if (!mruStack.includes(tab.id)) mruStack.push(tab.id);
  await persist();
}); });
chrome.tabs.onRemoved.addListener(tabId => { enqueue(async () => {
  mruStack = mruStack.filter(id => id !== tabId);
  for (const key of Object.keys(gestureEpochs)) if (key.startsWith(`${tabId}:`)) delete gestureEpochs[key];
  if (session?.ownerTabId === tabId) await closeSession();
  else if (session) await refreshCandidates();
  await persist();
}); });
chrome.tabs.onUpdated.addListener((tabId, change) => { enqueue(async () => {
  if (session?.ownerTabId === tabId && (change.status === 'loading' || change.url)) await closeSession();
  else if (session?.candidateIds.includes(tabId) && (change.title || change.favIconUrl || change.url)) await broadcastState();
}); });
chrome.tabs.onReplaced.addListener((added, removed) => { enqueue(async () => {
  mruStack = mruStack.map(id => id === removed ? added : id);
  if (session?.ownerTabId === removed) await closeSession();
  else if (session) await refreshCandidates();
  await persist();
}); });
chrome.tabs.onDetached.addListener(tabId => { enqueue(async () => {
  if (session?.candidateIds.includes(tabId)) await closeSession();
}); });
chrome.windows.onFocusChanged.addListener(windowId => { enqueue(async () => {
  // The browser manages popup dismissal. A transient lack of window focus
  // while opening the Extensions menu must not dismiss its popup ourselves.
  if (session && windowId !== session.ownerWindowId &&
    (session.embedded || windowId !== chrome.windows.WINDOW_ID_NONE)) await closeSession();
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab) { touch(tab.id); await persist(); }
  }
}); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && Object.keys(changes).some(key => key in AltTab.DEFAULTS)) enqueue(async () => {
    settings = AltTab.normalizeSettings(await chrome.storage.local.get(AltTab.DEFAULTS)); await closeSession();
  });
});
ready = initialize().catch(() => { startupFailed = true; console.warn('Alt-Tab: initialization failed. Reload the extension.'); });
