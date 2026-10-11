# Load and test Edge Alt-Tab

The updated local version is **1.4.2**. Saving project files does not update a store-installed copy. The packaged release is `dist/edge-alt-tab-1.4.2.zip`; this guide tests the project folder directly.

## Load the current code in Edge

1. Open `edge://extensions` in Edge's address bar.
2. Temporarily disable any older Edge Alt-Tab installation. Keep only the copy you are testing enabled, to avoid duplicate shortcut assignments. You can re-enable the store copy after testing.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select:

   ```text
   C:\Aavash Files\Projects\alt-tab-extension
   ```

   This folder directly contains `manifest.json`. Do not select `dist` or the ZIP. You do not need Node.js, npm, or a build step to load the extension.
5. Confirm that the new extension card shows **Edge Alt-Tab**, version **1.4.2**, and an enabled toggle. Check for an **Errors** link or warning. If the same project folder was already loaded, click its **Reload** control instead of loading another copy.
6. Open `edge://extensions/shortcuts` and check the assignments for the copy you just loaded:

   | Command | Assignment |
   | --- | --- |
   | Cycle through recently used tabs | Alt+Q |
   | Cycle backwards through recently used tabs | Alt+Shift+Q |
   | Switch immediately to the previous tab | Optional; leave unassigned for the initial tests |

   Another extension can prevent default shortcuts from being assigned. Disable the conflicting copy and explicitly assign the shortcut to this one. Choose **In Microsoft Edge** if the shortcut scope selector is available.
7. Use the toolbar's Extensions menu to show/pin Edge Alt-Tab in the toolbar. Click it to open the tab-search popup. The popup uses Enter or a mouse click to confirm selection.
8. Reload existing webpages, including Docs and Sheets, after loading or reloading the extension. This replaces old content scripts and installs listeners in eligible editor frames.

For Chrome, use `chrome://extensions` and `chrome://extensions/shortcuts` instead. Microsoft's [sideloading documentation](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/getting-started/extension-sideloading) covers Edge's installation, reload, and error controls. The [Chromium commands documentation](https://developer.chrome.com/docs/extensions/reference/api/commands) describes shortcut registration and collisions.

## Test ordinary webpages first

Start with the default settings: **Current window** and **Release modifier to switch**. Use normal browsing for these initial tests. Open three distinct webpages in one Edge window and call them A, B, and C. Visit A, then B, then C, so C is active and B is the previous tab.

| Test | Steps | Expected result |
| --- | --- | --- |
| Open and select previous tab | On C, hold Alt, press and release Q, keep Alt held. | The overlay opens and highlights B. |
| Release to switch | Release Alt. | B activates and the overlay closes without a mouse click. |
| MRU toggle | From B, repeat Alt+Q and release Alt. | C activates. |
| Cycle | Visit A, B, C again. Hold Alt and press/release Q twice. Release Alt. | The highlight advances from B to A; A activates. |
| Cancel | Open the overlay while holding Alt, press Escape, then release Alt. | The overlay closes and the source tab remains active. |
| Enter confirmation | Open the overlay and press Enter. | The highlighted tab activates. |
| Search | Click the toolbar icon, type part of a tab title, choose a result, press Enter. | The matching tab activates. Alt release does not confirm a search. |
| Icons | Inspect icons on pages whose favicons have loaded in the browser. | Cached site icons appear; unavailable icons use the bundled generic icon. |

## Test Google Docs and Sheets

1. Keep another webpage open in the same window.
2. Open a Google document or spreadsheet and reload it after updating the extension.
3. Visit the other tab, then return to the editor.
4. Click into the document text or a spreadsheet cell so the editor has keyboard focus.
5. Hold Alt, press and release Q, keep Alt held long enough to see the highlighted tab, then release Alt.
6. Confirm that the other tab activates without using the mouse.
7. Repeat with a quick press/release, while actively editing a cell or document, and after returning to the editor several times.
8. Check Escape cancellation and title search through the toolbar popup.

Authenticated Docs/Sheets and the browser's native shortcut dispatch require this manual pass. Automated checks simulate editor frames and trusted modifier-release events, but headless Edge does not dispatch the native Alt+Q command reliably.

## Test internal Edge pages

Visit an ordinary webpage, then visit `edge://settings` in another tab of the same window. Press Alt+Q. The original flow applies: the previously visited tab activates immediately. Repeat on `edge://version` or `edge://history`. Browser pages can also be selected as targets in the overlay on ordinary webpages.

## If the extension looks greyed out or does nothing

A greyed-out toolbar entry alone does not identify the cause. Use the extension card and these checks:

| Symptom | Check / action |
| --- | --- |
| Version is older than 1.4.2 | Load the project folder above, or reload the unpacked copy that points to it. A store installation does not read this folder. |
| Extension is disabled | Enable its toggle on `edge://extensions` and read any warning shown there. |
| Edge refuses to load the folder | Select the folder containing `manifest.json`; check the displayed loading error. |
| Toolbar popup works but Alt+Q does nothing | Check `edge://extensions/shortcuts`, duplicate copies, keyboard layout, and OS/browser conflicts. Try assigning a different available shortcut and releasing its modifier. |
| Shortcut has nothing to switch to | Open at least two tabs in the same window, or deliberately change the window scope in settings. |
| Overlay does not appear on a settings/new-tab/store/PDF page | These pages cannot host the overlay. Alt+Q switches directly to the previous eligible tab. Test overlay appearance/centering on an ordinary webpage. |
| Ordinary pages work but an editor does not | Reload the editor, check the extension's site access in **Details**, and allow it on the sites being tested. Then repeat with focus inside the editor. |
| Local file does not show an overlay | Enable **Allow access to file URLs** in the extension's Details page. |
| Overlay opens but Alt release does not switch | In extension settings, select **Release modifier to switch**. Search and **Press Enter to switch** mode require Enter/click. Check the actually assigned shortcut modifier. |
| Both popup and shortcut fail | Open the extension's settings and choose **Troubleshooting → Check extension status** after trying Alt+Q. If the last-shortcut timestamp does not advance, check the browser assignment/collision. If it reports a failed operation/startup, inspect **Errors** and the **service worker** Console on the **Edge Alt-Tab** card. A sleeping/inactive worker is normal by itself. |

If a problem persists, report the loaded extension version, Edge version from `edge://settings/help`, whether the toolbar popup works, the assigned shortcut, and the first error. Avoid sharing private document titles or URLs.

Inspect the service worker for **Edge Alt-Tab**, rather than another extension's `background.js`. Alt-Tab's diagnostic messages start with `Alt-Tab:`; it does not use WASM, Bitwarden, autofill, or SignalR. Redact access tokens and private addresses before sharing console logs.

## After another code change

1. Save the files.
2. Click **Reload** on this unpacked extension's card.
3. Reload the webpages you will test.
4. Repeat the ordinary-page and editor tests above.

Unpacked testing is local. Publishing the ZIP to Edge Add-ons is a separate release step.
