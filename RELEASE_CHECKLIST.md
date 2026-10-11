# Release 1.4.2

## Automated checks

- `npm run check`: manifest, version consistency, runtime assets, JavaScript syntax, icon dimensions, and local favicon invariants.
- `npm test`: startup serialization, selection identity, child-frame releases, quick release reconciliation, shortcut remapping, UI/sender validation, session restoration, window focus, private-tab separation, restricted-page fallback, and settings/favicon helpers.
- `npm run test:browser`: unpacked extension in a temporary Chromium profile; cross-origin and blank editor frames, stopped propagation, privacy isolation, search, Enter/Escape, focus restoration, quick releases, selected-tab closure, internal pages, toolbar popup, and settings. Headless automation may not dispatch browser accelerator commands; the script then invokes the extension command handler while retaining real keyboard input.
- `npm run package`: validates assets and builds a deterministic runtime-only ZIP in `dist/`.

The browser script requires `npm ci --ignore-scripts` and `npx playwright install chromium`, or existing Playwright module/binary paths via `PLAYWRIGHT_MODULE` and `PLAYWRIGHT_EXECUTABLE_PATH`. `EXTENSION_PATH` can point at an extracted store ZIP to verify the actual upload contents. The temporary test profile is removed after the run.

The local implementation passed 26 unit regressions and isolated Chromium/Microsoft Edge browser runs, including actual worker termination/recovery, reinjection, private UI isolation, frame releases, direct switching on internal version/settings pages, centering on transformed/scrolled pages, diagnostics, and narrow layouts with more than 60 tabs. Native accelerator dispatch and authenticated Google editors remain manual acceptance items.

## Manual Edge acceptance

1. Load unpacked 1.4.2 in a separate test profile. Also test an update from 1.3 with existing Fluent/Simple and custom-color settings.
2. In Google Docs, type in a document, hold Alt, press Q, then release Alt. Repeat in a selected/editing Sheets cell. Confirm the highlighted tab activates without a mouse.
3. Repeat rapid taps, multiple Q presses, Alt+Shift+Q, Escape, Enter, and both Alt keys. Confirm normal editor typing and selection still work after cancelling.
4. Reassign the command to a Ctrl shortcut, then release Ctrl. Check unassigned/conflicting shortcuts, alternate layouts, and AltGr without claiming every layout is supported.
5. Open current-window/all-window modes and verify cross-window focus. Close the highlighted tab and confirm no unrelated tab activates. Navigate or close the source while open.
6. Leave the worker idle or stop it using extension developer tools, then use the switcher again. Restart the browser and inspect reconstructed MRU order.
7. Check Docs versus Sheets icons, localhost, missing/changing icons, offline pages, and restricted image/frame policies. Generic icons are expected where the browser has none.
8. Try Edge internal/new-tab/store/PDF pages and files with file access disabled. Verify Alt+Q switches immediately to the previous eligible tab, matching the original flow. Browser pages remain available as overlay targets on ordinary webpages. If enabling InPrivate access, confirm its candidate separation.
9. Check narrow windows, high DPI, zoom, long titles, large tab counts, screen-reader announcements, reduced motion, and system high contrast. Verify the overlay is centered on long/scrolled pages and pages with transforms on the root element.
10. Unzip the release artifact and load that folder in Edge. Confirm version, icons, popup, settings, and existing preference migration.

## Store submission

- Upload `dist/edge-alt-tab-1.4.2.zip` after the manual acceptance pass.
- Update screenshots and release notes to match the shipped UI.
- Keep the public privacy-policy URL and store disclosures consistent with `PRIVACY.md`, including browser-session storage and website access.
- Replace the generic README store link with the actual listing URL once available.
- This repository prepares the package; it does not submit to Partner Center automatically.
