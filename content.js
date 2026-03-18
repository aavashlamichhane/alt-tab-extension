let overlayRoot = null;
let currentHighlightIndex = 0;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ ok: true });
  } else if (message.type === "SHOW_OVERLAY") {
    showOverlay(message.tabs, message.highlightIndex, message.settings);
  } else if (message.type === "UPDATE_HIGHLIGHT") {
    updateHighlight(message.highlightIndex);
  }
});

function getSecureFaviconUrl(tabUrl, cachedIcon) {
  // If we have a cached base64 icon from the background, use it directly.
  if (cachedIcon) return cachedIcon;
  
  // Fallback to Google proxy for public sites if cache is missing
  try {
    const url = new URL(tabUrl);
    return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url.origin)}`;
  } catch (e) {
    return "https://www.google.com/s2/favicons?sz=64&domain=microsoft.com";
  }
}

function showOverlay(tabs, initialHighlightIndex, settings) {
  if (overlayRoot) removeOverlay();

  const isFluent = settings.theme === 'fluent';
  const accentColor = settings.accentMode === 'manual' ? settings.manualAccentColor : '#0078d4';

  overlayRoot = document.createElement("div");
  overlayRoot.id = "edge-alt-tab-overlay-container";
  const shadow = overlayRoot.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    :host {
      --accent-color: ${accentColor};
    }
    .overlay-container {
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0, 0, 0, ${isFluent ? '0.45' : '0.6'});
      display: flex; justify-content: center; align-items: center;
      z-index: 2147483647;
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      transition: opacity 0.15s ease-out;
    }
    .overlay-container.closing {
      opacity: 0;
    }
    .modal {
      background: ${isFluent ? 'rgba(32, 33, 36, 0.75)' : '#252525'};
      ${isFluent ? 'backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%);' : ''}
      border-radius: 12px;
      padding: 12px;
      min-width: 480px;
      max-width: 720px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
      border: 1px solid ${isFluent ? 'rgba(255, 255, 255, 0.1)' : '#333'};
      ${isFluent ? 'animation: fadeInScale 0.15s cubic-bezier(0.1, 0.9, 0.2, 1);' : ''}
    }
    @keyframes fadeInScale {
      0% { opacity: 0; transform: scale(0.96); }
      100% { opacity: 1; transform: scale(1); }
    }
    .modal::-webkit-scrollbar {
      width: 6px;
    }
    .modal::-webkit-scrollbar-track {
      background: transparent;
    }
    .modal::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 10px;
    }
    .modal::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    .tab-item {
      display: flex;
      align-items: center;
      padding: 10px 14px;
      border-radius: 8px;
      color: rgba(255, 255, 255, 0.8);
      margin-bottom: 2px;
      transition: background 0.1s, transform 0.05s;
      cursor: pointer;
      border-left: 3px solid transparent;
    }
    .tab-item:hover {
      background: rgba(255, 255, 255, 0.05);
      color: #fff;
    }
    .tab-item.active {
      background: rgba(255, 255, 255, 0.12);
      color: #fff;
      border-left-color: var(--accent-color);
    }
    .tab-icon {
      width: 26px;
      height: 26px;
      margin-right: 14px;
      flex-shrink: 0;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.05);
    }
    .tab-title {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 14.5px;
      font-weight: 400;
    }
  `;

  const container = document.createElement("div");
  container.className = "overlay-container";
  container.onclick = () => cancelSwitch();

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.onclick = (e) => e.stopPropagation();

  tabs.forEach((tab, index) => {
    const item = document.createElement("div");
    item.className = `tab-item ${index === initialHighlightIndex ? "active" : ""}`;
    
    item.onclick = (e) => {
      e.stopPropagation();
      currentHighlightIndex = index;
      commitSwitch();
    };
    
    const icon = document.createElement("img");
    icon.className = "tab-icon";
    icon.src = getSecureFaviconUrl(tab.url, tab.cachedIcon);
    icon.onerror = () => {
      icon.src = "https://www.google.com/s2/favicons?sz=64&domain=microsoft.com";
    };

    const title = document.createElement("span");
    title.className = "tab-title";
    title.textContent = tab.title || "New Tab";

    item.appendChild(icon);
    item.appendChild(title);
    modal.appendChild(item);
  });

  container.appendChild(modal);
  shadow.appendChild(style);
  shadow.appendChild(container);
  document.body.appendChild(overlayRoot);

  currentHighlightIndex = initialHighlightIndex;
  
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("keydown", handleKeyDown);
}

function updateHighlight(index) {
  if (!overlayRoot) return;
  const shadow = overlayRoot.shadowRoot;
  const items = shadow.querySelectorAll(".tab-item");
  items.forEach((item, i) => {
    const isActive = i === index;
    item.classList.toggle("active", isActive);
    if (isActive) {
      item.scrollIntoView({ block: "nearest" });
    }
  });
  currentHighlightIndex = index;
}

function handleKeyUp(e) {
  if (e.key === "Alt") {
    e.preventDefault();
    e.stopPropagation();
    commitSwitch();
  }
}

function handleKeyDown(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    cancelSwitch();
  } else if (e.key === "q" || e.key === "Q") {
    e.stopPropagation();
  }
}

function commitSwitch() {
  chrome.runtime.sendMessage({ type: "COMMIT_SWITCH", index: currentHighlightIndex });
  removeOverlay();
}

function cancelSwitch() {
  chrome.runtime.sendMessage({ type: "CANCEL_SWITCH" });
  removeOverlay();
}

function removeOverlay() {
  if (overlayRoot) {
    const container = overlayRoot.shadowRoot.querySelector(".overlay-container");
    if (container) {
      container.classList.add("closing");
      setTimeout(() => {
        if (overlayRoot) {
          overlayRoot.remove();
          overlayRoot = null;
        }
      }, 150);
    } else {
      overlayRoot.remove();
      overlayRoot = null;
    }
  }
  window.removeEventListener("keyup", handleKeyUp);
  window.removeEventListener("keydown", handleKeyDown);
}
