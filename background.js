let mruStack = [];
let overlayActive = false;
let highlightIndex = 1;

// Load stack from storage on initialization
async function init() {
  const result = await chrome.storage.local.get("mruStack");
  const savedStack = result.mruStack || [];
  
  // Get all current tabs
  const allTabs = await chrome.tabs.query({});
  const activeIds = new Set(allTabs.map(t => t.id));

  // Filter out closed tabs from saved stack
  let filteredStack = savedStack.filter(id => activeIds.has(id));

  // Add any new tabs that weren't in the saved stack
  const inStack = new Set(filteredStack);
  const newTabs = allTabs.filter(t => !inStack.has(t.id)).map(t => t.id);
  
  mruStack = [...filteredStack, ...newTabs];

  // Move current active tab to top
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab) {
    updateStack(activeTab.id);
  } else {
    saveStack();
  }
}

init();

function saveStack() {
  chrome.storage.local.set({ mruStack });
}

function updateStack(tabId) {
  mruStack = mruStack.filter(id => id !== tabId);
  mruStack.unshift(tabId);
  saveStack();
}

// Update MRU stack on activation
chrome.tabs.onActivated.addListener((info) => {
  if (overlayActive) return; 
  updateStack(info.tabId);
});

// Add to stack on tab creation
chrome.tabs.onCreated.addListener((tab) => {
  if (!mruStack.includes(tab.id)) {
    mruStack.push(tab.id);
    saveStack();
  }
});

// Remove from stack on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  mruStack = mruStack.filter(id => id !== tabId);
  saveStack();
});

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

  // Final check: filter out any dead tabs that might have sneaked in
  const allTabs = await chrome.tabs.query({});
  const activeIds = new Set(allTabs.map(t => t.id));
  mruStack = mruStack.filter(id => activeIds.has(id));

  if (mruStack.length < 2) return;

  overlayActive = true;
  highlightIndex = 1;

  // Get metadata for the top tabs
  const tabsInfo = [];
  for (const id of mruStack) {
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

  // Load current settings
  const settings = await chrome.storage.local.get({
    theme: 'fluent',
    accentMode: 'auto',
    manualAccentColor: '#0078d4'
  });

  // Send SHOW_OVERLAY
  try {
    await chrome.tabs.sendMessage(currentTab.id, {
      type: "SHOW_OVERLAY",
      tabs: tabsInfo,
      highlightIndex,
      settings
    });
  } catch (e) {
    quickSwitch();
    overlayActive = false;
  }
}

function cycleHighlight() {
  const max = mruStack.length;
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
