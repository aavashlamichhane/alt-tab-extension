// Options page logic
const themeSelect = document.getElementById('theme');
const accentModeSelect = document.getElementById('accentMode');
const manualColorInput = document.getElementById('manualAccentColor');
const manualColorRow = document.getElementById('manualColorRow');
const status = document.getElementById('status');
const openShortcuts = document.getElementById('openShortcuts');

// Load settings
function loadSettings() {
  chrome.storage.local.get({
    theme: 'fluent',
    accentMode: 'auto',
    manualAccentColor: '#0078d4'
  }, (items) => {
    themeSelect.value = items.theme;
    accentModeSelect.value = items.accentMode;
    manualColorInput.value = items.manualAccentColor;
    updateManualRowVisibility();
  });
}

// Save settings
function saveSettings() {
  chrome.storage.local.set({
    theme: themeSelect.value,
    accentMode: accentModeSelect.value,
    manualAccentColor: manualColorInput.value
  }, () => {
    status.classList.add('show');
    setTimeout(() => status.classList.remove('show'), 2000);
  });
}

function updateManualRowVisibility() {
  manualColorRow.style.display = accentModeSelect.value === 'manual' ? 'flex' : 'none';
}

themeSelect.onchange = saveSettings;
accentModeSelect.onchange = () => {
  updateManualRowVisibility();
  saveSettings();
};
manualColorInput.onchange = saveSettings;

openShortcuts.onclick = (e) => {
  e.preventDefault();
  const isEdge = navigator.userAgent.includes("Edg/");
  const url = isEdge ? "edge://extensions/shortcuts" : "chrome://extensions/shortcuts";
  chrome.tabs.create({ url });
};

document.addEventListener('DOMContentLoaded', loadSettings);
