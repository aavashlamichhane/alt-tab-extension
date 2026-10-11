(() => {
  // A stale listener can survive an extension update in an existing document.
  // Reinjection replaces it instead of trusting a marker from an old context.
  globalThis.__edgeAltTabBridge?.dispose?.();
  let active = null;
  let host = null;
  let gesture = null;
  let release = null;
  let previousFocus = null;
  let expiryTimer;
  let readyTimer;
  const isTop = window === window.top;
  function send(message) {
    try { return chrome.runtime.sendMessage(message).catch(() => { remove(); }); }
    catch { remove(); return Promise.resolve(); }
  }
  function remove() {
    const old = host;
    host = null; active = null;
    clearTimeout(expiryTimer); clearTimeout(readyTimer);
    old?.remove();
    if (old && previousFocus?.isConnected) {
      try { previousFocus.focus({ preventScroll: true }); } catch { /* Frame may have navigated. */ }
    }
    previousFocus = null;
  }
  function arm(message) {
    if (active?.sessionId !== message.sessionId) {
      active = { sessionId: message.sessionId, modifier: message.modifier };
      clearTimeout(expiryTimer);
      expiryTimer = setTimeout(() => {
        void send({ type: 'BRIDGE_CANCEL', sessionId: active?.sessionId }); remove();
      }, Math.max(0, message.expiresAt - Date.now()));
    }
    if (gesture && release) void send({ type: 'KEY_SNAPSHOT', sessionId: active.sessionId, gesture, key: release.key, releasedAt: release.at });
  }
  function show(message) {
    remove();
    previousFocus = document.activeElement;
    arm(message);
    const root = document.createElement('div');
    root.id = 'edge-alt-tab-overlay-container';
    // The top layer escapes transformed/contained page ancestors, which can
    // otherwise make a fixed overlay move with the document instead of the viewport.
    root.setAttribute('popover', 'manual');
    document.getElementById(root.id)?.remove();
    const shadow = root.attachShadow({ mode: 'closed' });
    const frame = document.createElement('iframe');
    frame.title = 'Recently used tabs';
    frame.src = `${chrome.runtime.getURL('switcher.html')}#${message.sessionId}`;
    frame.style.cssText = 'display:block;border:0;width:100%;height:100%;background:transparent;color-scheme:normal;';
    // Page DOM contains an opaque extension frame, never other-tab metadata.
    for (const [property, value] of Object.entries({ all: 'initial', position: 'fixed', inset: '0',
      width: '100vw', height: '100vh', display: 'block', 'z-index': '2147483647',
      margin: '0', padding: '0', border: '0', opacity: '1', visibility: 'visible' })) {
      root.style.setProperty(property, value, 'important');
    }
    shadow.appendChild(frame); host = root;
    (document.fullscreenElement || document.documentElement).appendChild(root);
    root.showPopover();
    frame.addEventListener('load', () => { if (host === root) frame.focus({ preventScroll: true }); }, { once: true });
    void send({ type: 'HOST_READY', sessionId: message.sessionId });
    readyTimer = setTimeout(() => {
      if (active?.sessionId === message.sessionId) void send({ type: 'OVERLAY_TIMEOUT', sessionId: message.sessionId });
    }, 2000);
  }
  function onRuntimeMessage(message, sender, respond) {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === 'PING' && isTop) respond({ ok: true });
    else if (message.type === 'SHOW_SWITCHER' && isTop) {
      try { show(message); respond({ ok: true }); }
      catch { remove(); respond({ ok: false }); }
    } else if (message.type === 'ARM_SESSION') { arm(message); respond({ ok: true }); }
    else if (message.type === 'END_SESSION' && message.sessionId === active?.sessionId) { remove(); respond({ ok: true }); }
  }
  function onKeyDown(event) {
    if (!event.isTrusted) return;
    const modifier = event.altKey ? 'Alt' : event.ctrlKey ? 'Control' : event.metaKey ? 'Meta' : null;
    if (modifier && !['Alt', 'Control', 'Meta', 'Shift'].includes(event.key) && !event.repeat && !event.getModifierState('AltGraph')) {
      gesture = { key: event.key.toLowerCase(), modifier, shift: event.shiftKey, at: Date.now() }; release = null;
    }
    if (active && event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation();
      void send({ type: 'BRIDGE_CANCEL', sessionId: active.sessionId, reason: 'escape' }); remove();
    }
  }
  function onKeyUp(event) {
    if (!event.isTrusted || !['Alt', 'Control', 'Meta'].includes(event.key)) return;
    release = { key: event.key, at: Date.now() };
    if (active && event.key === active.modifier) {
      event.preventDefault(); event.stopImmediatePropagation();
      void send({ type: 'KEY_RELEASE', sessionId: active.sessionId, key: event.key, gesture, releasedAt: release.at });
    }
  }
  function onPageHide() {
    if (active && isTop) void send({ type: 'BRIDGE_CANCEL', sessionId: active.sessionId }); remove();
  }
  function dispose() {
    remove();
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('pagehide', onPageHide);
    try { chrome.runtime.onMessage.removeListener(onRuntimeMessage); } catch { /* Old context has been invalidated. */ }
  }
  globalThis.__edgeAltTabBridge = { dispose };
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('pagehide', onPageHide);
})();
