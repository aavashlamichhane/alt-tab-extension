# Alt-Tab

A lightweight most-recently-used tab switcher designed for **Microsoft Edge and Google Chrome**, using Chromium 121 or newer.

Published in the Microsoft Edge Add-ons store as **Edge Alt-Tab**. Chrome users can load the same source folder in Developer mode; the Edge store link below is for installation in Edge.

[Install Edge Alt-Tab from Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/dfkilmdlljlgppagklljonbngphbhkho)

Hold **Alt**, press **Q** to select your previous tab, press Q again to cycle, then release Alt to switch. **Alt+Shift+Q** cycles backwards. Internal Edge and Chrome pages use a toolbar popup with the same tab order and selection controls. Click the toolbar icon to search tabs.

## Features

- Current-window MRU by default, with an optional all-window mode that focuses the chosen window.
- Hold-to-switch, Enter-to-confirm, and immediate previous-tab interaction modes.
- Keyboard bridges in eligible editor frames, including matching blank/related frames, with fast-release reconciliation.
- An extension-origin switcher: other-tab titles and addresses are not rendered in the website's DOM.
- Browser-local favicon resources and a bundled fallback, with no Google favicon proxy.
- Search by title/address, arrow navigation, Enter confirmation, Escape cancellation, and mouse selection.
- A subtle centered panel with Simple as the default style, optional Fluent blur, system/light/dark appearance, compact spacing, custom accents, and reduced-motion/high-contrast support.
- Assigned-shortcut display, automatic preference saving, appearance preview, and reset defaults.
- Session history that survives background-worker suspension. After a browser restart or extension reload, order is reconstructed from the browser's tab access times where available.

## Controls

| Action | Default control |
| --- | --- |
| Open / cycle forward | Alt+Q |
| Cycle backward | Alt+Shift+Q |
| Switch | Release shortcut modifier, Enter, or click a tab |
| Choose a row | Up/Down; Home/End outside search |
| Search | Search button, Ctrl+F / Command+F, or / |
| Cancel | Escape or click the backdrop |
| Immediate previous tab | Optional command; assign in browser shortcuts |

Search always uses Enter/click confirmation. Escape clears a nonempty search first, then cancels. Change assignments in `edge://extensions/shortcuts` or `chrome://extensions/shortcuts`; settings show the actual assignment. Browser/OS shortcuts may take priority. Missing modifier bindings use Enter confirmation.

## Installation and updates

For everyday use in Edge, open the [Microsoft Edge Add-ons listing](https://microsoftedge.microsoft.com/addons/detail/dfkilmdlljlgppagklljonbngphbhkho), click **Get**, and confirm installation. Store releases become available after Microsoft's review; the repository may contain a newer version while an update is being reviewed.

For Chrome, or to test the source version in Edge, download and extract this repository or clone it:

```sh
git clone https://github.com/aavashlamichhane/alt-tab-extension.git
```

Changes to a local copy do not update an installed store copy. To load version 1.4.4 locally:

| Browser | Extensions page | Keyboard shortcut assignments |
| --- | --- | --- |
| Microsoft Edge | `edge://extensions` | `edge://extensions/shortcuts` |
| Google Chrome | `chrome://extensions` | `chrome://extensions/shortcuts` |

1. Open your browser's Extensions page from the table above and temporarily disable any older Edge Alt-Tab copy, so it does not claim the same shortcuts.
2. Enable **Developer mode**, choose **Load unpacked**, and select the downloaded or cloned `alt-tab-extension` folder containing `manifest.json`. No build or npm installation is needed to load the project.
3. Check that the new extension card shows **1.4.4**, its enable toggle is on, and it has no loading errors. If this exact folder is already loaded, click **Reload** on its card instead.
4. Open your browser's shortcut assignments page from the table above. Assign **Alt+Q** to **Cycle through recently used tabs** and **Alt+Shift+Q** to **Cycle backwards through recently used tabs**. Check assignments even when the manifest supplies defaults: another installed copy can prevent registration.
5. Reload the webpages you will test, especially Google Docs/Sheets, to install the updated frame bridge.
6. Open at least two ordinary webpages in the same browser window, visit both, then hold Alt, press and release Q, and release Alt. The highlighted previous tab should activate. The toolbar icon opens a searchable popup with click/Enter confirmation.
7. Open `edge://settings` in Edge or `chrome://settings` in Chrome. Hold Alt and press Q: a toolbar popup should appear. Release Alt after it opens, or press Enter, to switch. Try Alt+Shift+Q, arrows, Escape, search, and the Settings button too. If Alt was already released before the popup received focus, use Enter or click a tab.

After subsequent edits, click the extension card's **Reload**, then reload your test webpages. Chrome uses the same `manifest.json` and runtime assets as Edge; no separate Chrome build is needed. See Google's [unpacked installation guide](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

Microsoft's [sideloading guide](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/getting-started/extension-sideloading) describes loading and reloading unpacked extensions in Edge.

The manifest version is 1.4.4. Existing Fluent/Simple and custom-accent preferences are retained. “Automatic” accent from older versions becomes accurately labelled default blue. The old durable tab-ID history is retired because IDs are specific to a browser session.

## Compatibility and privacy

Internal pages (`edge://` and `chrome://`, including settings, version, and extensions) cannot host an extension's page overlay. The shortcut opens the browser's toolbar popup instead; its position is controlled by the browser. It preserves forward/reverse selection, supports arrows, search, Enter/click, Escape, and Settings, and switches on modifier release when the popup receives that event. If you release Alt before the popup receives focus, press Enter or click to confirm. Search and Enter-confirm mode always require confirmation.

Programmatic toolbar popups require Chromium 127 or newer for ordinary installations ([Chrome action API](https://developer.chrome.com/docs/extensions/reference/api/action#method-openPopup)). On older supported browsers, or if the browser rejects the popup or it fails to initialize, the shortcut switches directly to the selected tab. Explicit instant mode always switches directly. Store/PDF pages that reject script injection retain direct switching. Browser pages remain selectable from other tabs. Local files require **Allow access to file URLs**. Some sandboxed/nonmatching frames cannot receive a bridge. A browser without a cached icon displays a generic icon.

Normal and private tabs are kept separate when private access is enabled by the user. Website access is needed to detect modifier release in page frames; tab metadata is displayed only in an extension-origin document. The extension does not use external favicon services, analytics, or remote code. See [PRIVACY.md](PRIVACY.md) for data and permission details.

Automated checks exercise normal-page overlays and real toolbar popups on internal version/settings/extensions/history/new-tab pages in Chromium and Edge. They cover modifier release, reverse selection, arrows, confirmation, cancellation, search, and Settings. Headless checks invoke the command handler when native shortcuts are unavailable; Google Chrome's native shortcut dispatch, authenticated Docs/Sheets behavior, and alternate keyboard layouts still need a manual release pass in each target browser.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Extension looks greyed out or does nothing | Check the extension card's enable toggle, version, and loading errors. A greyed-out toolbar entry alone does not identify the cause. |
| Toolbar popup works but Alt+Q does nothing | Check shortcut assignments, duplicate installations, and browser/OS conflicts. Open at least two tabs in the selected window scope. |
| Overlay opens but releasing Alt does not switch | Select **Release modifier to switch** in settings. Search and Enter-confirm mode require Enter or a click. |
| Ordinary webpages work but Docs/Sheets do not | Reload the editor after updating, check extension site access, and test with keyboard focus inside the document or spreadsheet cell. |
| Overlay is absent on an internal browser page | Look for the toolbar popup. Internal pages cannot host the centered overlay. Chromium 127+ supports the popup; older versions or popup failures use direct switching. |
| Internal-page popup stays open after releasing Alt | The browser may have delivered the release before popup focus. Press Enter or click a row. Search and Enter-confirm mode also require confirmation. |
| Both the popup and shortcut fail | In settings, use **Troubleshooting → Check extension status** after trying the shortcut. An unchanged command timestamp suggests an assignment conflict; a failed operation calls for checking the extension's Errors or service-worker console. |

Before a release, manually test modifier release in Docs/Sheets, rapid cycling, reverse cycling, search, cancellation, internal pages, and window switching in each target browser. Also load the extracted store ZIP to verify the actual package. A sleeping service worker is normal by itself.

## Development

The runtime uses vanilla JavaScript, HTML, and CSS with no downloaded dependencies. Node.js 22+ is used for development checks.

```sh
npm run check
npm test
npm run package
```

Packaging writes `dist/edge-alt-tab-1.4.4.zip`. It includes only runtime assets and the license, with deterministic ZIP timestamps. CI runs validation, unit regressions, browser checks, and packaging.

For isolated-browser checks:

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run test:browser
```

The browser script uses a temporary profile, creates test editor frames, and writes screenshots to ignored `test-results/`. Existing Playwright installations can be used through `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_EXECUTABLE_PATH`; `EXTENSION_PATH` selects an extracted package for the same checks. Headless automation may need to invoke the command handler directly because it does not always dispatch native extension shortcuts.

`generate_icons.html` is a developer-only icon generator and is excluded from store packages. Version history is in [CHANGELOG.md](CHANGELOG.md). The store ZIP contains only runtime assets and the license; repository documentation, tests, and development tools are excluded.

## Support and license

Report problems through [GitHub issues](https://github.com/aavashlamichhane/alt-tab-extension/issues), including browser version, shortcut, switching mode, and reproducible steps. Avoid sharing private document titles or URLs. You can also leave a review on the [Microsoft Edge Add-ons listing](https://microsoftedge.microsoft.com/addons/detail/dfkilmdlljlgppagklljonbngphbhkho).

Licensed under [MIT](LICENSE).
