# Alt-Tab

A keyboard-first tab switcher for **Microsoft Edge and Google Chrome**. Move through tabs in the order you last used them, search by title or address, and switch without reaching for the mouse.

Published in the Microsoft Edge Add-ons store as **Edge Alt-Tab**. Chrome users can load the same source folder in Developer mode; the Edge store link below is for installation in Edge.

[Install Edge Alt-Tab from Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/dfkilmdlljlgppagklljonbngphbhkho)

Current source version: **1.4.6**. Supports Chromium 121+, with Chromium 127+ recommended for the internal-page toolbar chooser. Store updates may become available later than repository updates while Microsoft reviews them.

## Quick start

1. Visit at least two tabs in the same window.
2. Hold **Alt** and press **Q** to highlight your previous tab.
3. Keep holding Alt and press Q again to cycle through recently used tabs. Use **Alt+Shift+Q** to cycle backwards.
4. Release Alt to activate the highlighted tab.

Click the extension's toolbar icon to open a searchable tab list. Use its Settings button to change appearance, window scope, and shortcut behavior. These shortcuts and your chosen switching mode apply to both ordinary webpages and internal Edge/Chrome pages.

**Internal pages use a toolbar popup.** A very fast Alt+Q tap can finish before that popup receives keyboard focus. If it stays open, press **Enter** or click the selected tab. See [Known limitations](#known-limitations) for details and options for immediate switching.

## Features

- Recently used tabs in the current window, or across windows with automatic window focus.
- Hold-to-switch, Enter-to-confirm, and immediate previous-tab interaction modes.
- Consistent forward/reverse shortcuts and switching modes across webpages and internal browser pages.
- Keyboard handling in eligible editor frames, including Google Docs and Sheets.
- Other-tab titles and addresses displayed inside an extension-origin document.
- Browser-local favicons with a bundled fallback icon.
- Search by title/address, arrow navigation, Enter confirmation, Escape cancellation, and mouse selection.
- A subtle centered panel with Simple as the default style, optional Fluent blur, system/light/dark appearance, compact spacing, custom accents, and reduced-motion/high-contrast support.
- Assigned-shortcut display, automatic preference saving, appearance preview, and reset defaults.
- Recent-tab order that survives background-worker suspension and is reconstructed after a browser restart or extension reload where browser access times are available.
- No analytics or remotely loaded code.

## Controls

| Action | Default control |
| --- | --- |
| Open / cycle forward | Alt+Q |
| Cycle backward | Alt+Shift+Q |
| Switch | Release the shortcut modifier in release mode; Enter or click also works |
| Choose a row | Up/Down; Home/End outside search |
| Search | Search button, Ctrl+F / Command+F, or / |
| Cancel | Escape; click the backdrop on webpages |
| Open settings | Settings button in the chooser, or the extension's options menu |
| Immediate previous tab | Optional command; assign in browser shortcuts |

Search always uses Enter/click confirmation. Escape clears a nonempty search first, then cancels. Change assignments in `edge://extensions/shortcuts` or `chrome://extensions/shortcuts`; settings show the actual assignment. Browser/OS shortcuts may take priority. Missing modifier bindings use Enter confirmation.

In settings, **Shortcut behavior** applies to every tab:

| Setting | Behavior |
| --- | --- |
| Release modifier to switch | Show the chooser and activate the selected tab when the shortcut modifier is released. |
| Press Enter to switch | Show the chooser and wait for Enter or a click. |
| Switch immediately to previous tab | Switch directly to the previous tab without opening a chooser. |

You can also assign the optional **Switch immediately to the previous tab** command separately, while keeping Alt+Q for the chooser.

## Installation and updates

### Microsoft Edge store

Open the [Microsoft Edge Add-ons listing](https://microsoftedge.microsoft.com/addons/detail/dfkilmdlljlgppagklljonbngphbhkho), click **Get**, and confirm installation. Store installations receive approved store updates; editing or pulling this repository does not update that installed copy.

### Load the source in Edge or Chrome

For Chrome, or to test the source version in Edge, download and extract this repository or clone it:

```sh
git clone https://github.com/aavashlamichhane/alt-tab-extension.git
```

No build or npm installation is needed to use the extension. Both browsers load the same folder containing `manifest.json`.

| Browser | Extensions page | Keyboard shortcut assignments |
| --- | --- | --- |
| Microsoft Edge | `edge://extensions` | `edge://extensions/shortcuts` |
| Google Chrome | `chrome://extensions` | `chrome://extensions/shortcuts` |

1. Open your browser's Extensions page from the table above and temporarily disable any older Edge Alt-Tab copy, so it does not claim the same shortcuts.
2. Enable **Developer mode**, choose **Load unpacked**, and select the downloaded or cloned `alt-tab-extension` folder containing `manifest.json`.
3. Check that the new extension card shows **1.4.6**, its enable toggle is on, and it has no loading errors. If this exact folder is already loaded, click **Reload** on its card instead.
4. Open your browser's shortcut assignments page from the table above. Assign **Alt+Q** to **Cycle through recently used tabs** and **Alt+Shift+Q** to **Cycle backwards through recently used tabs**. Check assignments even when the manifest supplies defaults: another installed copy can prevent registration.
5. Reload existing webpages, especially Google Docs and Sheets, so they receive the updated keyboard handling.

Follow [Quick start](#quick-start) to try the extension, or use the [manual release check](#manual-release-check) to test an update.

After subsequent edits, click the extension card's **Reload**, then reload your test webpages. Chrome uses the same `manifest.json` and runtime assets as Edge; no separate Chrome build is needed. See Google's [unpacked installation guide](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

Microsoft's [sideloading guide](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/getting-started/extension-sideloading) describes loading and reloading unpacked extensions in Edge.

Existing appearance preferences and the global switching mode are retained when updating. Changes between releases are documented in [CHANGELOG.md](CHANGELOG.md).

## Known limitations

### Very fast shortcuts on internal pages

Internal browser pages cannot receive the extension's page keyboard listeners. Alt-Tab opens a toolbar popup instead. It retains release events received while that popup starts, but **a complete press-and-release before the popup receives focus can be missed**. The chooser may remain open and need Enter or a click to finish switching.

The browser's [shortcut command event](https://developer.chrome.com/docs/extensions/reference/api/commands#event-onCommand) provides the command name and an optional tab, but no modifier-release event or current keyboard state. A delay alone cannot safely tell whether you tapped the shortcut or are still holding Alt to cycle.

For reliable use:

- In release mode, keep Alt held until the chooser appears, then release it. If a rapid tap leaves it open, press Enter or click a row.
- For direct switching, select **Shortcut behavior → Switch immediately to previous tab**. This setting applies to **all tabs**, including ordinary webpages.
- To keep the chooser and also have a direct shortcut, assign the separate **Switch immediately to the previous tab** command on your browser's shortcut assignments page.

Alt+Q and Alt+Shift+Q retain their forward/backward meanings everywhere; there is no separate internal-page shortcut policy. Search and Enter-confirm mode intentionally require confirmation.

### Popup placement and protected pages

- **Internal pages:** `edge://` and `chrome://` pages cannot host the centered webpage overlay. They use the toolbar popup, whose position is controlled by the browser. Arrows, search, Enter/click, Escape, and Settings work in this chooser.
- **Older browsers or popup failures:** Programmatically opening a toolbar popup requires Chromium 127+ for ordinary installations ([action API documentation](https://developer.chrome.com/docs/extensions/reference/api/action#method-openPopup)). On older supported browsers, or when opening/initializing the popup fails, the shortcut falls back to switching directly to the selected tab.
- **Other protected pages:** Store pages and PDF viewers that reject overlay injection use direct switching. Internal tabs can still be selected from the chooser on another tab.
- **Local files:** Enable **Allow access to file URLs** to use the extension on local file pages.
- **Editor frames:** Some sandboxed or nonmatching frames cannot receive keyboard handling. Reload Docs/Sheets after an extension update and allow site access.
- **Favicons:** If the browser has no cached favicon, the extension shows its bundled generic icon.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Extension looks greyed out or does nothing | Check the extension card's enable toggle, version, and loading errors. A greyed-out toolbar entry alone does not identify the cause. |
| Toolbar popup works but Alt+Q does nothing | Check shortcut assignments, duplicate installations, and browser/OS conflicts. Open at least two tabs in the selected window scope. |
| Overlay opens but releasing Alt does not switch | Select **Release modifier to switch** in settings. Search and Enter-confirm mode require Enter or a click. |
| Ordinary webpages work but Docs/Sheets do not | Reload the editor after updating, check extension site access, and test with keyboard focus inside the document or spreadsheet cell. |
| Overlay is absent on an internal browser page | Look for the toolbar popup. Both shortcuts use their usual chooser controls. Internal pages cannot host the centered overlay. Chromium 127+ supports the popup; older versions or popup failures use direct switching. |
| Internal-page popup stays open after releasing Alt | The browser may have delivered the release before popup focus. Press Enter or click a row. Search and Enter-confirm mode also require confirmation. |
| Both the popup and shortcut fail | In settings, use **Troubleshooting → Check extension status** after trying the shortcut. An unchanged command timestamp suggests an assignment conflict; a failed operation calls for checking the extension's Errors or service-worker console. |

A sleeping extension service worker is normal by itself.

## Privacy

Alt-Tab uses open-tab titles, addresses, and favicon information to display the chooser. Website access supports the overlay and modifier-release handling in page frames. Other-tab metadata is rendered inside an extension-origin document. Normal and private tabs remain separate when you enable private browsing access.

The extension does not use analytics, external favicon services, or remote code. See [PRIVACY.md](PRIVACY.md) for the full data, storage, and permission details.

## Development and testing

The runtime uses vanilla JavaScript, HTML, and CSS with no downloaded dependencies. Node.js 22+ is used for development checks.

```sh
npm run check
npm test
npm run package
```

Packaging writes `dist/edge-alt-tab-1.4.6.zip`. It includes only runtime assets and the license, with deterministic ZIP timestamps. CI runs validation, unit regressions, browser checks, and packaging.

For isolated-browser checks:

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run test:browser
```

The browser script uses a temporary profile, creates test editor frames, and writes screenshots to ignored `test-results/`. Existing Playwright installations can be used through `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_EXECUTABLE_PATH`; `EXTENSION_PATH` selects an extracted package for the same checks. Headless automation may need to invoke the command handler directly because it does not always dispatch native extension shortcuts.

`generate_icons.html` is a developer-only icon generator and is excluded from store packages, along with repository documentation, tests, and development tools.

Automated checks exercise webpage overlays and real internal-page toolbar choosers in Chromium and Edge, including navigation, search, settings, modifier release, and cancellation during delayed startup. Google Chrome's native shortcut dispatch, authenticated Docs/Sheets, and alternate keyboard layouts still require manual verification; automated browser checks do not cover those cases fully.

### Manual release check

Load the extracted release ZIP, verify its version, and test in each target browser:

1. Open two ordinary webpages and check Alt+Q, repeated cycling, Alt+Shift+Q, and modifier release.
2. Test inside a Google Docs document and a Google Sheets cell after reloading those pages.
3. On `edge://settings` or `chrome://settings`, test both a held shortcut and a rapid tap. Confirm that Enter/click can finish a missed release and Escape cancels.
4. Test search, toolbar opening, Settings, window scope, and direct-switch mode on ordinary and internal pages.

## Support and license

Report problems through [GitHub issues](https://github.com/aavashlamichhane/alt-tab-extension/issues), including browser version, shortcut, switching mode, and reproducible steps. Avoid sharing private document titles or URLs. You can also leave a review on the [Microsoft Edge Add-ons listing](https://microsoftedge.microsoft.com/addons/detail/dfkilmdlljlgppagklljonbngphbhkho).

Licensed under [MIT](LICENSE).
