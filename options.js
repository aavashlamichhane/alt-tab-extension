(() => {
  const fields = Object.keys(AltTab.DEFAULTS);
  const status = document.getElementById('status');
  let saveQueue = Promise.resolve();
  function showStatus(text, error = false) { status.textContent = text; status.classList.toggle('error', error); }
  function values() {
    return AltTab.normalizeSettings(Object.fromEntries(fields.map(key => [key, document.getElementById(key).value])));
  }
  function preview() {
    const preferences = values();
    document.getElementById('internalPageMode').disabled = preferences.switchMode !== 'hold';
    document.getElementById('manualColorRow').hidden = preferences.accentMode !== 'manual';
    const sample = document.getElementById('preview');
    sample.style.setProperty('--preview-accent', preferences.accentMode === 'manual' ? preferences.manualAccentColor : AltTab.DEFAULTS.manualAccentColor);
    sample.style.padding = preferences.density === 'compact' ? '9px 12px' : '14px';
    sample.style.background = preferences.appearance === 'light' ? '#fff' : preferences.appearance === 'dark' ? '#252830' : '';
    sample.style.color = preferences.appearance === 'light' ? '#202124' : preferences.appearance === 'dark' ? '#eef0f4' : '';
    sample.style.borderRadius = preferences.theme === 'fluent' ? '12px' : '6px';
  }
  function populate(preferences) {
    for (const key of fields) document.getElementById(key).value = preferences[key];
    preview();
  }
  function save() {
    const preferences = values();
    preview(); showStatus('Saving…');
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      await chrome.storage.local.set(preferences); showStatus('Settings saved');
    }).catch(() => showStatus('Settings could not be saved. Try again.', true));
  }
  async function loadShortcuts() {
    const commands = await chrome.commands.getAll();
    const container = document.getElementById('shortcuts'); container.replaceChildren();
    const labels = { 'toggle-tab': 'Cycle forward', 'cycle-backward': 'Cycle backward', 'quick-switch': 'Immediate previous tab' };
    for (const [name, label] of Object.entries(labels)) {
      const term = document.createElement('dt'); term.textContent = label;
      const value = document.createElement('dd'); value.textContent = commands.find(command => command.name === name)?.shortcut || 'Unassigned';
      container.append(term, value);
    }
  }
  document.getElementById('preferences').addEventListener('submit', event => event.preventDefault());
  for (const key of fields) document.getElementById(key).addEventListener('change', save);
  document.getElementById('manualAccentColor').addEventListener('input', preview);
  document.getElementById('reset').addEventListener('click', () => { populate(AltTab.DEFAULTS); save(); });
  document.getElementById('checkStatus').addEventListener('click', async () => {
    const output = document.getElementById('diagnostics');
    output.textContent = 'Checking…';
    try {
      const result = await chrome.runtime.sendMessage({ type: 'DIAGNOSTICS' });
      if (!result?.ok) throw new Error('Status unavailable');
      if (result.startupFailed) { output.textContent = `Version ${result.version}: startup failed. Reload the extension and check its service worker Console.`; return; }
      const command = result.lastCommand;
      output.textContent = `Version ${result.version}: background is ready. ` + (command
        ? `Last shortcut: ${command.name} at ${new Date(command.at).toLocaleTimeString()}; result: ${command.result}.`
        : 'No shortcut has been recorded. Try your assigned shortcut, then check again.');
    } catch { output.textContent = 'Background did not respond. Reload the extension and reopen settings.'; }
  });
  document.getElementById('openShortcuts').addEventListener('click', async () => {
    try { await chrome.tabs.create({ url: navigator.userAgent.includes('Edg/') ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts' }); }
    catch { showStatus('Open your browser extensions page to change shortcuts.', true); }
  });
  window.addEventListener('focus', () => { void loadShortcuts().catch(() => showStatus('Shortcuts could not be read.', true)); });
  void Promise.all([
    chrome.storage.local.get(AltTab.DEFAULTS).then(saved => populate(AltTab.normalizeSettings(saved))), loadShortcuts()
  ]).catch(() => showStatus('Settings could not be loaded. Reload this page.', true));
})();
