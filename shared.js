(() => {
  const DEFAULTS = Object.freeze({ theme: 'simple', appearance: 'system', density: 'comfortable',
    accentMode: 'auto', manualAccentColor: '#0078d4', windowScope: 'current', switchMode: 'hold', internalPageMode: 'quick' });
  const choice = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
  function normalizeSettings(value = {}) {
    return {
      theme: choice(value.theme, ['fluent', 'simple'], DEFAULTS.theme),
      appearance: choice(value.appearance, ['system', 'dark', 'light'], DEFAULTS.appearance),
      density: choice(value.density, ['comfortable', 'compact'], DEFAULTS.density),
      accentMode: choice(value.accentMode, ['auto', 'manual'], DEFAULTS.accentMode),
      manualAccentColor: /^#[0-9a-f]{6}$/i.test(value.manualAccentColor || '') ? value.manualAccentColor : DEFAULTS.manualAccentColor,
      windowScope: choice(value.windowScope, ['current', 'all'], DEFAULTS.windowScope),
      switchMode: choice(value.switchMode, ['hold', 'confirm', 'instant'], DEFAULTS.switchMode),
      internalPageMode: choice(value.internalPageMode, ['quick', 'popup'], DEFAULTS.internalPageMode)
    };
  }
  function parseShortcut(shortcut = '') {
    const parts = shortcut.split('+').map(part => part.trim());
    const modifier = parts.includes('Alt') || parts.includes('Option') ? 'Alt'
      : parts.includes('Ctrl') || parts.includes('MacCtrl') ? 'Control'
      : parts.includes('Command') ? 'Meta' : null;
    return { modifier, key: parts.at(-1)?.toLowerCase() || '', shift: parts.includes('Shift') };
  }
  function matchesBinding(gesture, binding) {
    return Boolean(binding?.modifier && gesture?.key === binding.key && gesture.modifier === binding.modifier && gesture.shift === binding.shift);
  }
  function faviconURL(tab, runtime) {
    if (tab.dataIcon) return tab.dataIcon;
    try {
      const page = new URL(tab.url);
      if (!['http:', 'https:', 'file:'].includes(page.protocol)) return runtime.getURL('fallback.svg');
      const endpoint = new URL(runtime.getURL('/_favicon/'));
      endpoint.searchParams.set('pageUrl', page.href); endpoint.searchParams.set('size', '32');
      return endpoint.href;
    } catch { return runtime.getURL('fallback.svg'); }
  }
  globalThis.AltTab = Object.freeze({ DEFAULTS, normalizeSettings, parseShortcut, matchesBinding, faviconURL });
})();
