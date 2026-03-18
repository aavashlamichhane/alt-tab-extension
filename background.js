let mruStack = [];
let overlayActive = false;
let highlightIndex = 1;
let iconCache = {}; // tabId -> dataUrl (base64)

// Load stack from storage on initialization
async function init() {
  const result = await chrome.storage.local.get("mruStack");
  const savedStack = result.mruStack || [];
  
  const allTabs = await chrome.tabs.query({});
  const activeIds = new Set(allTabs.map(t => t.id));

  let filteredStack = savedStack.filter(id => activeIds.has(id));
  const inStack = new Set(filteredStack);
  const newTabs = allTabs.filter(t => !inStack.has(t.id)).map(t => t.id);
  
  mruStack = [...filteredStack, ...newTabs];

  // Warm up the icon cache for all existing tabs
  allTabs.forEach(tab => {
    if (tab.favIconUrl) cacheIcon(tab.id, tab.favIconUrl);
  });

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab) {
    updateStack(activeTab.id);
  } else {
    saveStack();
  }
}

async function cacheIcon(tabId, url) {
  if (!url) return;
  // If it's already a secure data URL or standard HTTPS, we can just store it
  if (url.startsWith('data:') || url.startsWith('https://')) {
    iconCache[tabId] = url;
    return;
  }

  // For localhost, http, or file:// URLs, we fetch and convert to base64 in the background
  // This avoids Private Network Access security prompts on the content script side
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const reader = new FileReader();
    reader.onloadend = () => {
      iconCache[tabId] = reader.result;
    };
    reader.readAsDataURL(blob);
  } catch (e) {
    console.log("Failed to cache icon:", url);
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.favIconUrl) {
    cacheIcon(tabId, changeInfo.favIconUrl);
  }
});

init();

function saveStack() {
  chrome.storage.local.set({ mruStack });
}

function updateStack(tabId) {
  mruStack = mruStack.filter(id => id !== tabId);
  mruStack.unshift(tabId);
  saveStack();
}

chrome.tabs.onActivated.addListener((info) => {
  if (overlayActive) return; 
  updateStack(info.tabId);
});

chrome.tabs.onCreated.addListener((tab) => {
  if (!mruStack.includes(tab.id)) {
    mruStack.push(tab.id);
    saveStack();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  mruStack = mruStack.filter(id => id !== tabId);
  delete iconCache[tabId];
  saveStack();
});

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

  const allTabs = await chrome.tabs.query({});
  const activeIds = new Set(allTabs.map(t => t.id));
  mruStack = mruStack.filter(id => activeIds.has(id));

  if (mruStack.length < 2) return;

  overlayActive = true;
  highlightIndex = 1;

  const tabsInfo = [];
  for (const id of mruStack) {
    try {
      const tab = await chrome.tabs.get(id);
      tabsInfo.push({ 
        id: tab.id, 
        title: tab.title, 
        url: tab.url, 
        cachedIcon: iconCache[id] || null 
      });
    } catch (e) {}
  }

  const settings = await chrome.storage.local.get({
    theme: 'fluent',
    accentMode: 'auto',
    manualAccentColor: '#0078d4'
  });

  try {
    await chrome.tabs.sendMessage(currentTab.id, { type: "PING" });
  } catch (e) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        files: ['content.js']
      });
    } catch (err) {
      quickSwitch();
      overlayActive = false;
      return;
    }
  }

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
