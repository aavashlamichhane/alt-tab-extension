# Privacy Policy: Edge Alt-Tab

**Effective date: October 12, 2026 · Version 1.4.6**

Edge Alt-Tab helps you switch between open Microsoft Edge tabs in most-recently-used order. This policy describes the extension's data handling, including its optional use in Chrome.

## Data used for switching

The extension reads open-tab IDs, window IDs, titles, addresses, browser-provided favicons, tab access times, and indicators such as pinned, audible/muted, discarded, and private-browsing status. This information supports the tab list, search, recent order, and window selection. It does not read document text, spreadsheet contents, passwords, or form values.

Page-frame listeners temporarily remember one recent modified key combination and modifier-release time to handle a shortcut released before the switcher is ready. Only recent shortcut/session information is sent to the extension worker for this purpose; the extension does not record an ongoing keystroke history.

The switcher displays tab information inside an extension-origin document. The surrounding website receives a frame and session identifier, rather than a list of other tabs' titles or addresses.

## Local storage and retention

- **Preferences:** visual choices, scope, and switching mode are saved in `chrome.storage.local` on this device until reset, removed, or the extension is uninstalled. They are not synced by the extension.
- **Browser-session state:** recent tab IDs, consumed shortcut-event timestamps, and temporary switcher state are held in `chrome.storage.session`. Switcher state includes its source tab/window/address, candidate IDs, selection, shortcut binding, and expiry. It is cleared on cancellation/completion or expiry processing; sessions expire after five minutes. Browser-session storage is also cleared when the extension is disabled/reloaded/updated or the browser restarts.
- **Display data:** titles, addresses, and icons are used in memory to render/search the open-tab list. No persistent browsing-history database is created.
- **Troubleshooting:** the last browser-dispatched extension command's name, time, and outcome are stored in browser-session storage and shown only in the extension's settings. This diagnostic record contains no tab titles or addresses and is cleared with browser-session storage.
- **Legacy migration:** the durable tab-ID list from older versions is removed. A new browser session reconstructs recent order from browser tab metadata where available.

Use **Reset defaults** in settings to reset preferences. Closing the switcher clears its session; restarting the browser clears browser-session state. Uninstalling removes the extension's stored data. Normal and private tab candidates are kept separate when you explicitly enable private-window access.

## Network and third parties

Version 1.4.6 does not request icons from Google or another external favicon proxy. It uses the browser's local favicon resource and a bundled fallback. Ordinary page loading and the browser's own favicon fetching/caching, extension updates, and store services remain governed by the browser/store and website policies.

The extension has no analytics, advertising, tracking services, remote code, or extension-operated external data service. It does not transmit tab metadata or shortcut-event information to the developer or third parties. Local diagnostic warnings identify failure categories without printing browsing URLs.

## Permissions

- **Tabs:** read open-tab metadata, track activation/access times, and activate the selected tab. Existing window IDs also let the extension focus a selected tab's window.
- **Storage:** save preferences locally and preserve recent order/session state across background-worker suspension.
- **Scripting:** install the keyboard bridge on an accessible page if the shortcut is used before its bridge is available.
- **Favicon:** display icons through the browser-provided favicon resource.
- **Website access (`<all_urls>`):** run a small bridge at page startup in eligible page frames, capture shortcut modifier release in editors, and host the isolated switcher frame. Restricted browser pages are not granted unrestricted access by this permission.
- **File/private access:** enabled separately by the user in browser extension settings when those features are desired.

## Changes and contact

This policy will be updated with material changes to extension behavior and reflected in the store listing. For questions or data-handling concerns, use the extension's store support channel or [GitHub issues](https://github.com/aavashlamichhane/alt-tab-extension/issues). Do not include private tab titles, document contents, or browsing addresses in public reports.
