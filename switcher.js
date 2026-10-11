(() => {
  const embedded = window !== window.top;
  let sessionId = location.hash.slice(1);
  let state = null;
  let visible = [];
  let searching = !embedded;
  let finished = false;
  let pendingRelease = null;
  let refreshing = false;
  let refreshAgain = false;
  let expiryTimer;
  const list = document.getElementById('list');
  const search = document.getElementById('search');
  const status = document.getElementById('status');
  const surface = embedded ? 'embedded' : 'popup';
  document.body.classList.add(surface);
  if (embedded) document.getElementById('switcher').setAttribute('aria-modal', 'true');

  async function send(type, extra = {}) {
    return chrome.runtime.sendMessage({ type, sessionId, ...extra });
  }
  function fail(text) {
    status.classList.remove('sr-only');
    status.textContent = text;
  }
  function domain(url) {
    try { const parsed = new URL(url); return parsed.hostname || (parsed.protocol === 'file:' ? 'Local file' : parsed.protocol.replace(':', '')); }
    catch { return 'Browser tab'; }
  }
  function render() {
    if (!state || finished) return;
    const preferences = AltTab.normalizeSettings(state.settings);
    document.body.className = `${surface} ${preferences.theme} ${preferences.appearance} ${preferences.density}`;
    document.documentElement.style.setProperty('--accent', preferences.accentMode === 'manual' ? preferences.manualAccentColor : AltTab.DEFAULTS.manualAccentColor);
    const query = search.value.trim().toLocaleLowerCase();
    visible = state.tabs.filter(tab => `${tab.title} ${tab.url}`.toLocaleLowerCase().includes(query));
    if (visible.length && !visible.some(tab => tab.id === state.selectedTabId)) select(visible[0].id);
    list.replaceChildren();
    for (const tab of visible) {
      const row = document.createElement('div');
      row.className = 'tab-item'; row.id = `tab-${tab.id}`;
      row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(tab.id === state.selectedTabId));
      row.title = `${tab.title}\n${domain(tab.url)}`;
      row.addEventListener('click', event => { if (event.isTrusted) void commit(tab.id); });
      const icon = document.createElement('img');
      icon.className = 'tab-icon'; icon.alt = ''; icon.referrerPolicy = 'no-referrer';
      icon.src = AltTab.faviconURL(tab, chrome.runtime);
      icon.onerror = () => { icon.onerror = null; icon.src = chrome.runtime.getURL('fallback.svg'); };
      const copy = document.createElement('div'); copy.className = 'tab-copy';
      const title = document.createElement('div'); title.className = 'tab-title'; title.textContent = tab.title;
      const address = document.createElement('div'); address.className = 'tab-domain'; address.textContent = domain(tab.url);
      copy.append(title, address);
      const badges = document.createElement('div'); badges.className = 'badges';
      for (const label of [tab.pinned && 'Pinned', tab.muted ? 'Muted' : tab.audible && 'Playing', tab.discarded && 'Sleeping', tab.otherWindow && 'Window']) {
        if (!label) continue;
        const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = label; badges.appendChild(badge);
      }
      row.append(icon, copy, badges); list.appendChild(row);
    }
    document.getElementById('empty').hidden = visible.length !== 0;
    document.getElementById('count').textContent = `${visible.length} ${visible.length === 1 ? 'tab' : 'tabs'}`;
    document.getElementById('hint').textContent = state.modifier && !searching
      ? `Release ${state.modifier === 'Control' ? 'Ctrl' : state.modifier === 'Meta' ? 'Command' : state.modifier} to switch · ↑↓ · Esc cancels`
      : '↑↓ to choose · Enter to switch · Esc cancels';
    updateSelection();
  }
  function updateSelection() {
    for (const row of list.children) row.setAttribute('aria-selected', String(row.id === `tab-${state.selectedTabId}`));
    const selected = document.getElementById(`tab-${state.selectedTabId}`);
    if (selected) {
      list.setAttribute('aria-activedescendant', selected.id);
      search.setAttribute('aria-activedescendant', selected.id);
      selected.scrollIntoView({ block: 'nearest' });
    } else { list.removeAttribute('aria-activedescendant'); search.removeAttribute('aria-activedescendant'); }
  }
  function select(tabId) {
    if (!state || !state.tabs.some(tab => tab.id === tabId)) return;
    state.selectedTabId = tabId;
    void send('UI_SELECT', { tabId }).catch(() => fail('Selection could not be saved. Try again.'));
    updateSelection();
  }
  function move(direction) {
    if (!visible.length) return;
    const index = visible.findIndex(tab => tab.id === state.selectedTabId);
    select(visible[(index + direction + visible.length) % visible.length].id);
  }
  async function commit(tabId = state?.selectedTabId) {
    if (finished || !visible.some(tab => tab.id === tabId)) return;
    try {
      const result = await send('UI_COMMIT', { tabId });
      if (result?.ok) finish();
      else { fail(result?.error || 'That tab is unavailable.'); await refresh(); }
    } catch { fail('The extension changed. Close the switcher and try again.'); }
  }
  async function cancel() {
    if (finished) return;
    try { await send('UI_CANCEL'); } catch { /* Extension may be updating. */ }
    finish();
  }
  function finish() {
    finished = true; clearTimeout(expiryTimer);
    if (!embedded) window.close();
  }
  function toggleSearch(active) {
    searching = active;
    document.getElementById('searchRow').hidden = !active;
    document.getElementById('searchButton').setAttribute('aria-expanded', String(active));
    search.setAttribute('role', 'combobox'); search.setAttribute('aria-controls', 'list'); search.setAttribute('aria-expanded', String(active));
    void send('UI_SEARCH', { active }).catch(() => fail('Search could not start. Try again.'));
    if (!active) search.value = '';
    render();
    (active ? search : list).focus();
  }
  async function refresh() {
    if (!sessionId || finished) return;
    if (refreshing) { refreshAgain = true; return; }
    refreshing = true;
    try {
      do {
        refreshAgain = false;
        const result = await send('GET_SESSION');
        if (!result?.state) { finish(); return; }
        state = result.state; render();
      } while (refreshAgain);
    } finally { refreshing = false; }
  }
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== chrome.runtime.id || message.sessionId !== sessionId) return;
    if (message.type === 'SESSION_CLOSED') finish();
    if (message.type === 'SESSION_STATE') void refresh().catch(() => fail('Tabs could not be refreshed.'));
  });
  document.getElementById('searchButton').addEventListener('click', event => { if (event.isTrusted) toggleSearch(!searching); });
  document.getElementById('settingsButton').addEventListener('click', async event => {
    if (!event.isTrusted) return;
    await cancel(); await chrome.runtime.openOptionsPage();
  });
  search.addEventListener('input', event => { if (event.isTrusted) render(); });
  document.body.addEventListener('click', event => { if (embedded && event.target === document.body && event.isTrusted) void cancel(); });
  window.addEventListener('keydown', event => {
    if (!event.isTrusted || finished || event.isComposing) return;
    if (event.key === 'Tab' && embedded && !event.ctrlKey && !event.altKey && !event.metaKey) {
      const controls = [...document.querySelectorAll('button, input, [tabindex="0"]')].filter(element => element.getClientRects().length);
      const index = controls.indexOf(document.activeElement);
      const next = (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
      event.preventDefault(); controls[next]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (searching && search.value) { search.value = ''; render(); }
      else void cancel();
    } else if (event.key === 'Enter') { event.preventDefault(); void commit(); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1); }
    else if (event.key === 'Home' && !searching && visible.length) { event.preventDefault(); select(visible[0].id); }
    else if (event.key === 'End' && !searching && visible.length) { event.preventDefault(); select(visible.at(-1).id); }
    else if ((event.key.toLowerCase() === 'f' && (event.ctrlKey || event.metaKey)) || (event.key === '/' && !searching)) {
      event.preventDefault(); toggleSearch(true);
    }
    // Browser commands perform Q cycling. Do not also cycle here: that would
    // advance twice for one native shortcut dispatch.
  }, true);
  window.addEventListener('keyup', event => {
    if (!event.isTrusted || finished || !['Alt', 'Control', 'Meta'].includes(event.key)) return;
    pendingRelease = { key: event.key, at: Date.now() };
    if (state?.modifier === event.key && !searching) {
      event.preventDefault();
      void send('UI_RELEASE', { key: event.key }).catch(() => fail('Switch failed. Press Enter to retry.'));
    }
  }, true);
  window.addEventListener('pagehide', () => { if (!finished && sessionId) void send('UI_CANCEL').catch(() => {}); });
  async function initialize() {
    const result = embedded ? await send('UI_READY') : await send('OPEN_POPUP');
    if (!result?.state) { fail('No switcher session is available. Use the toolbar or your assigned shortcut.'); return; }
    state = result.state; sessionId = state.sessionId;
    expiryTimer = setTimeout(() => { void cancel(); }, Math.max(0, state.expiresAt - Date.now()));
    render();
    if (searching) toggleSearch(true); else list.focus();
    if (pendingRelease && pendingRelease.key === state.modifier && !searching && Date.now() - pendingRelease.at < 2000) {
      await send('UI_RELEASE', { key: pendingRelease.key });
    }
  }
  void initialize().catch(() => fail('Tabs could not be loaded. Close the switcher and try again.'));
})();
