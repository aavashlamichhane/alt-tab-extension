(() => {
  // Install the release listener before styles and UI scripts finish loading.
  // Internal pages have no content-script bridge to retain these early events.
  const pendingReleases = [];
  let handleRelease = null;
  let cancelRequested = false;
  window.addEventListener('keydown', event => {
    if (!event.isTrusted || event.isComposing) return;
    // A new held gesture supersedes release evidence from an earlier tap.
    if (['Alt', 'Control', 'Meta'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) pendingReleases.length = 0;
    if (!handleRelease && event.key === 'Escape') {
      event.preventDefault(); cancelRequested = true;
    }
  }, true);
  window.addEventListener('keyup', event => {
    if (!event.isTrusted || event.isComposing) return;
    pendingReleases.push({ key: event.key, altKey: event.altKey, ctrlKey: event.ctrlKey,
      metaKey: event.metaKey, at: Date.now() });
    if (pendingReleases.length > 8) pendingReleases.shift();
    handleRelease?.(event);
  }, true);
  document.addEventListener('DOMContentLoaded', () => {
    let sessionId = location.hash.slice(1);
    // Embedded switchers carry their session in the URL. Toolbar popup placement
    // is browser-controlled and must not determine which initialization we send.
    const embedded = Boolean(sessionId);
    let state = null;
    let visible = [];
    let searching = false;
    let startupSearch = null;
    let finished = false;
    let openingSettings = false;
    let refreshing = false;
    let refreshAgain = false;
    let expiryTimer;
    let popupPort = null;
    let closedDuringStartup = null;
    let changedDuringStartup = false;
    const list = document.getElementById('list');
    const search = document.getElementById('search');
    const status = document.getElementById('status');
    const surface = embedded ? 'embedded' : 'popup';
    document.body.classList.add(surface);
    if (embedded) document.getElementById('switcher').setAttribute('aria-modal', 'true');

    async function send(type, extra = {}) {
      if (!embedded && sessionId && !finished && !popupPort) {
        popupPort = chrome.runtime.connect({ name: 'toolbar-switcher' });
        popupPort.onDisconnect.addListener(() => { void chrome.runtime.lastError; popupPort = null; });
        popupPort.postMessage({ sessionId });
      }
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
        ? `Release ${state.modifier === 'Control' ? 'Ctrl' : state.modifier === 'Meta' ? 'Command' : state.modifier}${embedded ? '' : ' or press Enter'} to switch · ↑↓ · Esc cancels`
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
      // Wait for the startup reply to identify the session being canceled. A
      // popup must not disappear and leave an unbound session behind.
      if (!sessionId) { cancelRequested = true; return; }
      try { await send('UI_CANCEL'); } catch { /* Extension may be updating. */ }
      finish();
    }
    function finish() {
      finished = true; clearTimeout(expiryTimer);
      if (!embedded) window.close();
    }
    function toggleSearch(active) {
      if (!state) startupSearch = active;
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
      if (sender.id !== chrome.runtime.id) return;
      if (!embedded && !sessionId) {
        // A navigation or cycle may finish while OPEN_POPUP is returning its
        // snapshot. Reconcile after binding rather than revive a closed UI.
        if (message.type === 'SESSION_CLOSED') closedDuringStartup = message.sessionId;
        if (message.type === 'SESSION_STATE') changedDuringStartup = true;
        return;
      }
      if (message.sessionId !== sessionId) return;
      if (message.type === 'SESSION_CLOSED') finish();
      if (message.type === 'SESSION_STATE') void refresh().catch(() => fail('Tabs could not be refreshed.'));
    });
    document.getElementById('searchButton').addEventListener('click', event => { if (event.isTrusted) toggleSearch(!searching); });
    document.getElementById('settingsButton').addEventListener('click', async event => {
      if (!event.isTrusted || openingSettings) return;
      openingSettings = true;
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const result = await send('OPEN_OPTIONS');
        if (!result?.ok) throw new Error('Settings unavailable');
        finish();
      } catch {
        openingSettings = false;
        button.disabled = false;
        fail('Settings could not be opened. Try again.');
      }
    });
    search.addEventListener('input', event => { if (event.isTrusted) render(); });
    document.body.addEventListener('click', event => { if (embedded && event.target === document.body && event.isTrusted) void cancel(); });
    window.addEventListener('keydown', event => {
      if (!event.isTrusted || finished || openingSettings || event.isComposing) return;
      if (event.key === 'Tab' && embedded && !event.ctrlKey && !event.altKey && !event.metaKey) {
        const controls = [...document.querySelectorAll('button, input, [tabindex="0"]')].filter(element => element.getClientRects().length);
        const index = controls.indexOf(document.activeElement);
        const next = (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
        event.preventDefault(); controls[next]?.focus();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        if (searching && search.value) { search.value = ''; render(); }
        else void cancel();
      } else if (event.key === 'Enter' && !event.target.closest?.('button')) { event.preventDefault(); void commit(); }
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1); }
      else if (event.key === 'Home' && !searching && visible.length) { event.preventDefault(); select(visible[0].id); }
      else if (event.key === 'End' && !searching && visible.length) { event.preventDefault(); select(visible.at(-1).id); }
      else if ((event.key.toLowerCase() === 'f' && (event.ctrlKey || event.metaKey)) || (event.key === '/' && !searching)) {
        event.preventDefault(); toggleSearch(true);
      }
      // Browser commands perform Q cycling. Do not also cycle here: that would
      // advance twice for one native shortcut dispatch.
    }, true);
    function releasedModifier(event) {
      if (!state?.modifier || searching) return false;
      if (event.key === state.modifier) return true;
      const flag = { Alt: 'altKey', Control: 'ctrlKey', Meta: 'metaKey' }[state.modifier];
      // A shortcut-key release with the modifier already up is also evidence of
      // release. This covers Alt being released before Q or a remapped key.
      return Boolean(flag && event.key.toLowerCase() === state.binding?.key && event[flag] === false);
    }
    handleRelease = event => {
      if (finished || openingSettings) return;
      if (releasedModifier(event)) {
        event.preventDefault();
        void send('UI_RELEASE', { key: state.modifier }).catch(() => fail('Switch failed. Press Enter to retry.'));
      }
    };
    window.addEventListener('pagehide', () => { if (!finished && sessionId) void send('UI_CANCEL').catch(() => {}); });
    async function initialize() {
      const result = embedded ? await send('UI_READY') : await send('OPEN_POPUP');
      if (!result?.state) {
        if (cancelRequested) finish();
        else fail('No switcher session is available. Use the toolbar or your assigned shortcut.');
        return;
      }
      state = result.state; sessionId = state.sessionId;
      if (closedDuringStartup === sessionId) { finish(); return; }
      if (cancelRequested) { await cancel(); return; }
      searching = startupSearch ?? Boolean(state.searchMode);
      expiryTimer = setTimeout(() => { void cancel(); }, Math.max(0, state.expiresAt - Date.now()));
      render();
      // Bind the popup lifetime even when keyboard mode starts without search.
      // Native popup dismissal does not reliably dispatch pagehide.
      toggleSearch(searching);
      if (changedDuringStartup) await refresh();
      const modifierFlag = { Alt: 'altKey', Control: 'ctrlKey', Meta: 'metaKey' }[state.modifier];
      if (!finished && !openingSettings && pendingReleases.at(-1)?.[modifierFlag] !== true &&
        pendingReleases.some(event => releasedModifier(event) && Date.now() - event.at < 2000)) {
        await send('UI_RELEASE', { key: state.modifier });
      }
    }
    void initialize().catch(() => fail('Tabs could not be loaded. Close the switcher and try again.'));
  }, { once: true });
})();
