let mruStack = [];
let overlayActive = false;
let highlightIndex = 1;

// Initialize stack with current tabs
chrome.tabs.query({}, (tabs) => {
  mruStack = tabs.map(t => t.id);
});

// Update MRU stack on activation
chrome.tabs.onActivated.addListener((info) => {
  if (overlayActive) return; 
  updateStack(info.tabId);
});

// Add to stack on tab creation
chrome.tabs.onCreated.addListener((tab) => {
  if (!mruStack.includes(tab.id)) {
    mruStack.push(tab.id);
  }
});

// Remove from stack on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  mruStack = mruStack.filter(id => id !== tabId);
});

function updateStack(tabId) {
  mruStack = mruStack.filter(id => id !== tabId);
  mruStack.unshift(tabId);
}

// Handle Alt+Q Command
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-tab") {
    if (!overlayActive) {
      await startOverlay();
    } else {
      cycleHighlight();
    }
  }
});

async function startOverlay() {
  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!currentTab) return;

  if (mruStack.length < 2) return;

  overlayActive = true;
  highlightIndex = 1;

  // Clean the stack (remove dead tabs)
  const tabs = await chrome.tabs.query({});
  const activeIds = new Set(tabs.map(t => t.id));
  mruStack = mruStack.filter(id => activeIds.has(id));

  // Get metadata for the top tabs
  const tabsInfo = [];
  for (const id of mruStack.slice(0, 10)) {
    try {
      const tab = await chrome.tabs.get(id);
      tabsInfo.push({ id: tab.id, title: tab.title, faviconUrl: tab.favIconUrl });
    } catch (e) {}
  }

  // Attempt to inject content script if messaging fails
  try {
    await chrome.tabs.sendMessage(currentTab.id, { type: "PING" });
  } catch (e) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        files: ['content.js']
      });
    } catch (err) {
      console.error("Scripting failed, fallback to quick switch", err);
      quickSwitch();
      overlayActive = false;
      return;
    }
  }

  // Send SHOW_OVERLAY
  try {
    await chrome.tabs.sendMessage(currentTab.id, {
      type: "SHOW_OVERLAY",
      tabs: tabsInfo,
      highlightIndex
    });
  } catch (e) {
    quickSwitch();
    overlayActive = false;
  }
}

function cycleHighlight() {
  const max = Math.min(mruStack.length, 10);
  highlightIndex = (highlightIndex + 1) % max;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: "UPDATE_HIGHLIGHT",
        highlightIndex
      }).catch(() => {});
    }
  });
}

function quickSwitch() {
  if (mruStack.length >= 2) {
    const nextTabId = mruStack[1];
    chrome.tabs.update(nextTabId, { active: true });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "COMMIT_SWITCH") {
    const targetTabId = mruStack[message.index];
    if (targetTabId) {
      chrome.tabs.update(targetTabId, { active: true });
      updateStack(targetTabId);
    }
    overlayActive = false;
  } else if (message.type === "CANCEL_SWITCH") {
    overlayActive = false;
  } else if (message.type === "PONG") {
    sendResponse({ ok: true });
  }
});
