let overlayRoot = null;
let currentHighlightIndex = 0;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ ok: true });
  } else if (message.type === "SHOW_OVERLAY") {
    showOverlay(message.tabs, message.highlightIndex);
  } else if (message.type === "UPDATE_HIGHLIGHT") {
    updateHighlight(message.highlightIndex);
  }
});

function showOverlay(tabs, initialHighlightIndex) {
  if (overlayRoot) removeOverlay();

  overlayRoot = document.createElement("div");
  overlayRoot.id = "edge-alt-tab-overlay-container";
  const shadow = overlayRoot.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    .overlay-container {
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.4);
      display: flex; justify-content: center; align-items: center;
      z-index: 2147483647;
      font-family: 'Segoe UI', sans-serif;
    }
    .modal {
      background: #2b2b2b;
      border-radius: 12px;
      padding: 12px;
      min-width: 450px;
      max-width: 700px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 15px 40px rgba(0,0,0,0.6);
      border: 1px solid #444;
    }
    .modal::-webkit-scrollbar {
      width: 8px;
    }
    .modal::-webkit-scrollbar-track {
      background: transparent;
    }
    .modal::-webkit-scrollbar-thumb {
      background: #555;
      border-radius: 4px;
    }
    .modal::-webkit-scrollbar-thumb:hover {
      background: #666;
    }
    .tab-item {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      border-radius: 6px;
      color: #ccc;
      margin-bottom: 4px;
      transition: background 0.1s;
    }
    .tab-item.active {
      background: #444;
      color: #fff;
      outline: 2px solid #0078d4;
    }
    .tab-icon {
      width: 24px;
      height: 24px;
      margin-right: 16px;
      flex-shrink: 0;
      border-radius: 4px;
    }
    .tab-title {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 15px;
    }
  `;

  const container = document.createElement("div");
  container.className = "overlay-container";
  const modal = document.createElement("div");
  modal.className = "modal";

  tabs.forEach((tab, index) => {
    const item = document.createElement("div");
    item.className = `tab-item ${index === initialHighlightIndex ? "active" : ""}`;
    
    const icon = document.createElement("img");
    icon.className = "tab-icon";
    // Fallback for favicons
    icon.src = tab.faviconUrl || "https://www.google.com/s2/favicons?sz=64&domain=microsoft.com";
    icon.onerror = () => icon.src = "https://www.google.com/s2/favicons?sz=64&domain=microsoft.com";

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
  // If user releases Alt, commit
  if (e.key === "Alt") {
    commitSwitch();
  }
}

function handleKeyDown(e) {
  if (e.key === "Escape") {
    cancelSwitch();
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
    overlayRoot.remove();
    overlayRoot = null;
  }
  window.removeEventListener("keyup", handleKeyUp);
  window.removeEventListener("keydown", handleKeyDown);
}
