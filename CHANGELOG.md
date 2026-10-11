# Changelog

## 1.4.3

- Keep the toolbar popup open through transient Extensions-menu focus changes and verify its browser popup context.
- Clear dismissed popup sessions and let the next keyboard shortcut open a fresh overlay.
- Open settings from the background worker before dismissing either the toolbar popup or page overlay. Settings remain available from the toolbar if tab-list startup fails.
- Allow Enter to activate focused switcher buttons instead of switching tabs.
- Add real-browser checks for toolbar content and settings navigation from both switcher surfaces.

## 1.4.2

- Restore immediate switching on internal/restricted pages, matching the original flow. Keep the simpler centered overlay on ordinary webpages.
- Detect browser-page URLs directly and skip script injection there. Browser tabs remain available as switch targets.
- Resolve command-associated tab IDs to current tab metadata before choosing candidates.
- Add an extension-specific status check in settings to show startup readiness and the last browser-dispatched command without exposing tab metadata.
- Consume event-handler promise rejections and report failed commands through the status check.

## 1.4.1

- Center the overlay in the browser's top layer so transformed or scrolled pages cannot offset it.
- Simplify the layout with a smaller panel, quieter selection, smaller icons, icon buttons, softer backdrop, and Simple as the default style. Preserve existing visual preferences.
- Open the toolbar popup when a browser page or another restricted page cannot host an overlay. Preserve forward/reverse selection and include browser tabs in the list; confirm using Enter or a click.
- Keep immediate switching as a compatibility fallback if programmatic popups are unavailable. The explicit instant mode still switches immediately.
- Add regression coverage for popup ownership/selection and browser checks for viewport centering and internal-page popup behavior.

## 1.4.0

- Capture shortcut modifier release in eligible editor frames, including related blank frames; reconcile quick releases during startup.
- Move tab titles, addresses, and icons into an extension-origin UI isolated from the webpage.
- Use browser-local favicon resources and a bundled fallback; remove external Google favicon requests.
- Serialize worker operations and persist switcher sessions across worker suspension. Commit by tab ID and cancel when the selected tab closes.
- Add reverse cycling, an optional immediate previous-tab command, and hold/Enter-confirm/instant switching modes.
- Add a toolbar popup with title/address search, arrow navigation, Enter confirmation, and Escape cancellation.
- Default to the current window; optionally include all windows and focus the selected window. Keep normal/private candidates separate.
- Add system/light/dark themes, compact spacing, custom accents, responsive layout, reduced motion, and high-contrast support.
- Show assigned shortcuts accurately and add settings previews, save failures, and reset defaults.
- Reconstruct history from browser access times after a new browser session; migrate legacy visual preferences.
- Add regression/browser checks, runtime validation, CI, and deterministic store ZIP packaging.

## 1.3

- Previous published implementation with MRU switching, Fluent/Simple styles, and favicon proxy caching.
