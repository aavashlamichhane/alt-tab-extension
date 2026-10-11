# Edge Alt-Tab

A lightweight most-recently-used tab switcher for Microsoft Edge and Chrome on Chromium 121 or newer.

[Install Edge Alt-Tab from Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/dfkilmdlljlgppagklljonbngphbhkho)

Hold **Alt**, press **Q** to select your previous tab, press Q again to cycle, then release Alt to switch. **Alt+Shift+Q** cycles backwards. On internal Edge pages, Alt+Q switches directly to the previous tab. Click the toolbar icon to search tabs wherever Edge permits opening the popup.

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

To try the source version locally, download and extract this repository or clone it:

```sh
git clone https://github.com/aavashlamichhane/alt-tab-extension.git
```

Changes to a local copy do not update an installed store copy. To load version 1.4.2 locally:

1. Open `edge://extensions` and temporarily disable any older Edge Alt-Tab copy, so it does not claim the same shortcuts.
2. Enable **Developer mode**, choose **Load unpacked**, and select the downloaded or cloned `alt-tab-extension` folder containing `manifest.json`. No build or npm installation is needed to load the project.
3. Check that the new extension card shows **1.4.2**, its enable toggle is on, and it has no loading errors. If this exact folder is already loaded, click **Reload** on its card instead.
4. Open `edge://extensions/shortcuts`. Assign **Alt+Q** to **Cycle through recently used tabs** and **Alt+Shift+Q** to **Cycle backwards through recently used tabs**. Check assignments even when the manifest supplies defaults: another installed copy can prevent registration.
5. Reload the webpages you will test, especially Google Docs/Sheets, to install the updated frame bridge.
6. Open at least two ordinary webpages in the same Edge window, visit both, then hold Alt, press and release Q, and release Alt. The highlighted previous tab should activate. The toolbar icon opens a searchable popup with click/Enter confirmation.

Chrome uses `chrome://extensions` and `chrome://extensions/shortcuts` with the same folder. After subsequent edits, click the extension card's **Reload**, then reload your test webpages.

See [BROWSER_TESTING.md](BROWSER_TESTING.md) for a full manual test sequence, expected results, and troubleshooting a greyed-out entry or inactive shortcut. Microsoft's [sideloading guide](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/getting-started/extension-sideloading) describes loading and reloading unpacked extensions.

The manifest version is 1.4.2. Existing Fluent/Simple and custom-accent preferences are retained. “Automatic” accent from older versions becomes accurately labelled default blue. The old durable tab-ID history is retired because IDs are specific to a browser session.

## Compatibility and privacy

Restricted pages such as browser settings and some store/PDF pages cannot host the overlay. There Alt+Q switches immediately to the previous eligible tab, as in the original flow. Browser pages remain selectable from the overlay on ordinary webpages. The toolbar popup is a separate search entry point where Edge permits opening it. Local files require the browser's **Allow access to file URLs** setting. Some sandboxed/nonmatching frames cannot receive a bridge. A browser without a cached icon displays a generic icon.

Normal and private tabs are kept separate when private access is enabled by the user. Website access is needed to detect modifier release in page frames; tab metadata is displayed only in an extension-origin document. The extension does not use external favicon services, analytics, or remote code. See [PRIVACY.md](PRIVACY.md) for data and permission details.

Browser-accelerator dispatch, authenticated Docs/Sheets behavior, alternate keyboard layouts, and browser-managed pages still need a manual Edge release pass. See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

## Development

The runtime uses vanilla JavaScript, HTML, and CSS with no downloaded dependencies. Node.js 22+ is used for development checks.

```sh
npm run check
npm test
npm run package
```

Packaging writes `dist/edge-alt-tab-1.4.2.zip`. It includes only runtime assets and the license, with deterministic ZIP timestamps. CI runs validation, unit regressions, browser checks, and packaging.

For isolated-browser checks:

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run test:browser
```

The browser script uses a temporary profile, creates test editor frames, and writes screenshots to ignored `test-results/`. Existing Playwright installations can be used through `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_EXECUTABLE_PATH`; `EXTENSION_PATH` selects an extracted package for the same checks. Headless automation may need to invoke the command handler directly because it does not always dispatch native extension shortcuts.

`generate_icons.html` is a developer-only icon generator and is excluded from store packages. The original review is in [IMPROVEMENT_REVIEW.md](IMPROVEMENT_REVIEW.md), and changes are in [CHANGELOG.md](CHANGELOG.md).

## Support and license

Report problems through [GitHub issues](https://github.com/aavashlamichhane/alt-tab-extension/issues), including browser version, shortcut, switching mode, and reproducible steps. Avoid sharing private document titles or URLs. You can also leave a review on the [Microsoft Edge Add-ons listing](https://microsoftedge.microsoft.com/addons/detail/dfkilmdlljlgppagklljonbngphbhkho).

Licensed under [MIT](LICENSE).
