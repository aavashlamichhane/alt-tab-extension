# Edge Alt-Tab improvement review

Reviewed on October 11, 2026, against local manifest version 1.3 and commit `06f1bbb`.

## Scope and evidence

The extension provides an MRU (most recently used) tab switcher. `background.js` tracks tab activation and stores an ordered list of tab IDs. A browser command opens a Shadow DOM overlay in the current webpage, highlights the previous tab, and advances the highlight on subsequent commands. `content.js` commits on Alt release or a row click, and cancels on Escape or a backdrop click. The settings page controls the visual theme and accent color. Restricted pages use an immediate previous-tab fallback.

This review covers every tracked source/configuration/documentation file, current browser-extension documentation, controlled browser checks of the actual content script, and Node VM checks of the actual background script with mocked browser APIs. JavaScript syntax checks passed for the three runtime scripts.

The tests did not run this extension inside an authenticated Google Docs/Sheets editor or validate the currently published Edge Add-ons package. The Docs/Sheets diagnosis is a strong inference from the event architecture and controlled iframe tests. The store listing URL is not present in the repository; the README badge points to the general store.

No runtime source or manifest changes were made during this review. This document records recommendations for implementation.

## Recommended release order

1. **Reliability and privacy patch:** iframe-aware Alt release, stable selection by tab ID, serialized session transitions, safe overlay cleanup, local favicon fallbacks, and isolation of other-tab information from webpage scripts.
2. **Compatibility and usability release:** restart-safe MRU, explicit window scope, configurable-shortcut behavior, accessible keyboard navigation, restricted-page fallback, responsive layout, and honest settings/documentation.
3. **Product expansion:** title/domain search, reverse cycling, optional instant switching, useful tab metadata, onboarding, and a repeatable release process.

Avoid coupling the first patch to a framework migration, thumbnails, or a large visual redesign. The existing vanilla JavaScript implementation is small enough to improve directly.

## Priority 1: reliability and privacy

### R1. Capture Alt release reliably in editors and frames

**Evidence:** `content.js:162` registers bubbling `keyup`/`keydown` listeners on the top window only after rendering. `manifest.json` omits `all_frames` and related-frame matching. The overlay does not take focus. The controlled checks produced no commit when Alt release occurred in an iframe or when an input handler stopped propagation; a top-window Alt release did commit.

**Impact:** focus inside an editor frame or aggressive website keyboard handling can leave the switcher open until the user clicks. This is consistent with the reported Google Docs/Sheets failure on releasing Alt.

**Recommendation:** use a lightweight keyboard/session bridge in eligible frames, including matching `about:blank` and origin-related frames where appropriate. Use capture-phase listeners registered early. Forward relevant events through extension messaging, and render the overlay only in the top frame. Target UI messages to that frame explicitly so an `all_frames` change cannot create duplicate overlays. Keep keyboard handling in the isolated world.

Focus the switcher intentionally and restore the editor's prior focus on cancellation. Handle Escape and Enter reliably. Do not suppress unrelated typing when no switcher session is active. Capture listeners alone cannot receive events from a different document, and frame injection alone does not solve the race described below.

**Validate:** release Alt while editing in Docs/Sheets; use ordinary inputs, contenteditable, same-origin/cross-origin/about:blank frames, and pages that stop event propagation. Verify editing shortcuts and focus restoration.

### R2. Handle a fast press/release before the overlay is ready

**Evidence:** `background.js:101` awaits tab queries, individual tab lookups, settings, PING, and possibly injection before requesting the overlay. The release listeners do not exist until `showOverlay()` finishes.

**Impact:** a short Alt+Q gesture can release Alt before the listener is installed, even on a simple webpage.

**Recommendation:** track relevant key transitions before rendering, with timestamps and a session handshake. Reconcile a release observed during startup with the newly selected target. Make the first-command path fast and test cold worker startup separately. Where key state cannot be observed, provide a predictable Enter-confirm mode or an instant previous-tab command. Browser commands do not supply a general global modifier-release event.

### R3. Commit the displayed tab by ID, never by a mutable list index

**Evidence:** `content.js:199` sends an index, and `background.js:183` resolves that index against the current `mruStack`. A VM check opened `[1, 2, 3]`, highlighted tab 2, removed tab 2, and then committed index 1. The extension activated tab 3.

**Recommendation:** freeze the ordered candidates for a switcher session and store the selected tab ID. Send `{sessionId, tabId}` on commit. Validate that the target belongs to the session and still exists; refresh selection or cancel if it closes. Keep title/favicon updates independent of selection identity. Continue maintaining MRU while a session is open; session candidates and live MRU should be separate state.

### R4. Serialize startup and switcher transitions

**Evidence:** `init()` is started without being awaited by event handlers. `overlayActive` is set after asynchronous work has begun. Two concurrent `startOverlay()` calls generated two SHOW messages. A command before initialization finished generated neither an overlay nor a switch.

**Recommendation:** retain an initialization promise and await it in handlers while registering listeners synchronously. Serialize commands and commit/cancel transitions. Use explicit idle/opening/open/closing state and a session ID, with a defined policy for repeated commands during opening. Wrap transitions in error handling that always returns to a recoverable state. A missing/failed overlay response must not leave the worker believing a menu is open.

### R5. Fix closing-animation cleanup

**Evidence:** `content.js:213` schedules removal through the mutable global `overlayRoot`. Showing an overlay twice yielded two roots immediately; after 150 ms, the new root had been removed and the old closing root remained.

**Recommendation:** capture the particular root being removed, clear the active reference and input handlers immediately, and let the delayed callback remove only that root. Make removal and commit/cancel idempotent. Add a singleton guard for script installation and cleanup for extension invalidation.

### R6. Keep worker state and the visible overlay synchronized

**Evidence:** `overlayActive`, `highlightIndex`, and the icon cache exist only in worker globals. There is no owner tab/document, expiry, or recovery handshake. `cycleHighlight()` messages whichever tab is active at that moment. `onActivated` ignores all activations while an overlay is open.

**Impact:** worker termination, page navigation, switching tabs/windows by mouse, closing the source tab, or a missed cancel can leave the UI and worker in different states. Cycling may go to a page that never displayed the menu.

**Recommendation:** associate each session with its source tab, window, and document. Route updates to that owner. Cancel or reconcile when the source navigates/closes, the user changes tabs, or focus leaves the browser. Use session-scoped storage and expiry/recovery checks for state that must survive worker suspension; do not rely on a worker timer alone. Keep unrelated tab activations in MRU. Await activation success before recording a successful commit.

### R7. Repair favicon cache timing and stale results

**Evidence:** `background.js:21` starts cache warming without awaiting it. `cacheIcon()` returns before the FileReader callback writes the cache; the controlled check confirmed that even `await cacheIcon()` leaves the cache empty until the reader completes. A second check completed the newer read first and the older read last; the cache ended with the old icon. `SHOW_OVERLAY` receives a one-time cache snapshot, with no later update.

**Recommendation:** prefer the browser's favicon endpoint built with `chrome.runtime.getURL()` and URL search parameters. Direct content-script use requires the documented `_favicon/*` web-accessible resource declaration; the current manifest's absence of that declaration is not itself a defect for its worker-fetch/data-URL design. If retaining proxy conversion, return a promise that includes conversion completion; check response success and image type/size; associate requests with page URL/version; deduplicate in-flight work; and ignore stale completions. Send later icon updates to the owning overlay when needed.

Use `tab.favIconUrl` as a source of the tab's actual icon when appropriate, especially for icons that vary by page/application. Resolve it in a suitable extension context with safe handling of URLs and failures. Keep a bundled neutral fallback. FileReader itself is supported in Chromium workers; its availability is not the diagnosed bug.

### R8. Remove external favicon fallbacks and retry loops

**Evidence:** `content.js:21` requests Google's favicon service with a tab's origin. There is no actual public-host filter: localhost and local-file URLs also reach this branch. Docs and Sheets URLs both become the same `docs.google.com` origin, losing application identity. `content.js:143` assigns a remote Microsoft-site icon on every error, without disabling the error handler.

**Impact:** incorrect icons, third-party requests containing site origins, unusable private/offline fallbacks, and repeated failures when the fallback is blocked. The current privacy policy and README promise local-only behavior/no third-party services and universal icons, which this implementation does not support.

**Recommendation:** remove Google requests and use browser-provided icons plus a bundled generic icon or local initial. Make fallback one-shot. Test pages with restrictive image policies and offline use; an extension-origin UI can give more predictable resource loading. Update privacy disclosures and add the missing favicon/website-access explanations. Reconcile any new diagnostics or persistence with those disclosures before publishing.

### R9. Isolate the tab list from webpage scripts

**Evidence:** `content.js:35` creates an open shadow root. The controlled browser check read the title of another tab using ordinary page-side DOM access. Tab rows also accept synthetic clicks, and keyboard handlers do not distinguish trusted user input. The worker accepts commit/cancel messages without checking the session owner.

**Recommendation:** consider rendering the sensitive list in an extension-origin iframe or extension-owned popup, and test its focus/keyboard behavior before choosing the architecture. A closed shadow root reduces casual DOM access but should not be treated as a complete security boundary. Minimize the data exposed to the page, use trusted-input checks where appropriate, and validate sender tab/frame/document plus session membership in privileged handlers. The page cannot directly call the extension's internal message handler through the normal webpage API; the current exposed DOM callbacks are the relevant interaction surface.

## Priority 2: compatibility and usability

### R10. Define current-window versus all-window switching

`background.js` gathers tabs from every window, but activating a target does not focus its window. Window focus changes are not tracked. Offer a scope setting; I recommend current-window MRU as the default and all-window MRU as an explicit option. In all-window mode, activate the target and focus its window, show a window indicator, and track changes to the focused window. Handle tab movement, replacement, window closure, and the private-browsing mode intentionally.

### R11. Rebuild MRU correctly after browser restart

The saved list consists of browser tab IDs. IDs are unique within a browser session, so the README claim that order survives browser restart is not established by this storage scheme. Use `storage.session` for same-session identity, and reconstruct a new browser session from live tab metadata such as supported `lastAccessed` values. Confirm availability/behavior in the minimum Edge version and fall back gracefully. Persisting URLs to reconstruct old sessions would introduce duplicate-tab ambiguity and new privacy considerations; avoid it unless needed. Keep user preferences in local storage or, optionally, sync only those preferences.

### R12. Support the user's actual configured shortcut

`options.html:90` always displays Alt+Q, while `content.js` only recognizes Alt release and Q keydown. Users can configure a Ctrl-based shortcut but then cannot commit by releasing its modifier. Read `chrome.commands.getAll()` to display the assigned shortcut and unassigned state. Adapt supported modifier handling, or explicitly offer an Enter-confirm interaction for configurations whose release cannot be handled reliably. Explain conflicts without claiming to identify every conflicting extension. Consider an optional reverse command and a separate instant previous-tab command.

### R13. Make the switcher accessible and fully keyboard usable

The rows are clickable divs without dialog/listbox semantics, focus management, screen-reader selection state, Enter confirmation, or arrow navigation. Add an accessible name, intentional focus, a suitable listbox/option or equivalent interaction model, announced selection, Up/Down, Enter, and Escape. Restore focus on cancel, including an originating editor frame. Respect reduced motion, forced colors, and readable contrast. Label settings controls using associated labels and announce save/failure status. Do not remove focus outlines without a replacement.

### R14. Improve layout and visual settings

The fixed 480 px minimum width can overflow narrow windows. Use viewport-aware sizing and explicit box sizing. Give title flex children `min-width: 0` so ellipsis is reliable. Scroll the initial selection into view, not just later updates. Test long titles, zoom, high DPI, and many tabs. Isolate/reset the overlay host against page styles and test fullscreen/top-layer interactions. Offer system/light/dark appearance and compact/comfortable density. Keep reduced-motion handling separate from theme choice.

The current “Automatic (Browser Theme)” accent is always `#0078d4`. Rename it to an accurate default/system option unless a supported API can actually provide the promised accent. Validate stored theme/accent values and set CSS variables through safe, validated values.

### R15. Keep restricted pages usable

The quick-switch fallback is a useful start. Verify behavior on Edge internal pages, new-tab pages, store pages, PDF viewers, browser error pages, other extensions, and files with access disabled. Some pages cannot host content scripts. Preserve instant switching there, or provide an extension-owned popup fallback that uses Enter/click confirmation. Add a toolbar action to open the switcher/settings and expose this fallback. Explain file-access/private-window settings accurately.

### R16. Reduce command latency and unnecessary work

Build a map from the existing `tabs.query()` result instead of issuing sequential `tabs.get()` calls for every tab. Load settings once and update the cache on storage changes. Render the UI before optional favicon work completes. Avoid fetching every icon whenever the worker starts; use demand-driven, bounded caching and in-flight deduplication. Serialize or coalesce MRU persistence so writes cannot overwrite newer state. For large tab counts, measure before introducing virtualization or a capped recent list. Set explicit latency targets and measure first-open versus warm-open separately.

### R17. Review permissions and failure reporting

Broad website access supports persistent frame listeners, but it should have a clear user-facing reason. Evaluate an `activeTab`/on-demand design or optional site access only against the keyboard timing and frame requirements; do not remove access blindly and break editor support. Remove unused manifest/source assets such as the empty stylesheet when appropriate. Preserve the current safe use of `textContent` for tab titles. Handle failed queries, injection, storage, image reads, and activation instead of swallowing exceptions or producing unhandled rejections. Record sanitized local diagnostic categories rather than full browsing URLs.

## Priority 3: product improvements

- **Search by title and domain:** useful with many tabs. Make it a deliberate searchable mode so typing does not conflict with hold-to-cycle behavior. Preserve selection by tab ID while filtering.
- **Reverse cycling and instant previous-tab mode:** give users a quick two-tab toggle and a way to recover after overshooting. Define repeated-key/autorepeat behavior and verify browser shortcut dispatch.
- **Better tab identification:** show domain beneath the title, tooltip for long titles, and optional indicators for pinned, audible/muted, discarded/loading, group, and window. Avoid thumbnails by default because they add permissions, latency, and exposure of page content.
- **Selectable scope and exclusions:** current window/all windows, recent-list length, and optional exclusion of specific sites or pinned tabs. Define what happens when the selected tab becomes excluded.
- **Settings preview and reset:** show theme/accent/density changes immediately, report save failures accurately, and provide reset defaults. If adding export/import, keep it to validated preferences.
- **Useful onboarding and support:** display the actual shortcut, explain hold Alt / press Q / release Alt, show fallback controls and conflicts, and link to the real store listing and a clear issue/support channel.
- **Localization:** externalize interface strings when expanding beyond the current audience; declare only languages actually supported.

## Testing and publishing improvements

There is no automated test, packaging, or CI setup in the repository. Add focused tests for MRU ordering and the session protocol, then controlled DOM/browser tests for the confirmed failures. Keep a manual Edge editor test because mocked API tests and synthetic events cannot prove native shortcut behavior in Docs/Sheets.

| Area | Minimum regression scenarios |
| --- | --- |
| Input | Docs and Sheets edit mode; inputs/contenteditable; iframe focus; fast Alt release; repeated Q; reverse command; Escape/Enter; remapped shortcut; keyboard layouts/AltGr |
| State | Cold start; worker suspension; rapid commands; close highlighted/source tabs; navigate/reload source; mouse tab switch while open; multiple windows; tab move/replacement |
| Icons | Docs versus Sheets; missing/changing favicon; redirects; localhost; offline; private sites; file URLs; slow/out-of-order fetches; restrictive image policy |
| UI | Narrow window; zoom/high DPI; long titles; 100+ tabs; screen reader; keyboard focus; forced colors; reduced motion; fullscreen |
| Privacy | No extension-initiated external icon requests; webpage cannot read other-tab titles from rendered UI; synthetic page interactions cannot commit; logs omit sensitive URLs |
| Release | Fresh install; update from current version; existing settings migration; unassigned shortcut; file/private access disabled; packaged ZIP loaded in Edge |

Use a small CI workflow for syntax/lint checks, relevant tests, manifest/version validation, icon-size verification, and a deterministic ZIP. Package only runtime files: manifest, scripts/styles actually used, options assets, and icons. Keep the icon generator, tests, reports, and Git metadata outside the upload. Add a changelog and validate updates against the previously published version. Choose a minimum Edge/Chromium version based on APIs actually used and test that version where practical.

Replace the general store badge with the exact listing link. Add representative screenshots and document tested limitations rather than promising native/universal behavior. Keep permission descriptions, privacy policy, README, and store answers consistent with the packaged implementation. A staged validation group before store submission will reduce regressions; publication itself still needs the normal store submission process.

## Documentation consulted

- [Content scripts: frames and related-frame injection](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Browser favicon API and content-script resource declaration](https://developer.chrome.com/docs/extensions/how-to/ui/favicons)
- [Commands: assigned shortcuts and command callback](https://developer.chrome.com/docs/extensions/reference/api/commands)
- [Tabs: session IDs, lastAccessed, and window focus behavior](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- [Extension service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Storage areas and asynchronous initialization](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [activeTab permission](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Chromium FileReader interface exposure](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/fileapi/file_reader.idl)
- [Microsoft Edge Add-ons developer policies](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)

Context7 was used to retrieve current Chrome extension guidance. Microsoft store policy guidance supports checking disclosures and necessary permissions; this review does not establish whether the live listing passes certification.
