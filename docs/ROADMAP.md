# Navigator — Improvement Roadmap

Guiding principle: **keyboard users should be able to navigate any page as fast as possible with minimal friction.** Every item here targets either faster navigation, clearer feedback, or reduced latency. Items are ranked by impact on daily keyboard-first workflows.

---

## Critical — Blocks Core Navigation Speed

### 1. Arrow key support as alternative directional input

**Category:** UX  
**Location:** `src/content/key-handler.ts` → `keyToDirection()`

**Problem:** Only `h/j/k/l` are recognized as directional keys. Many keyboard-heavy users who aren't Vim veterans (screen reader users, accessibility-focused power users, people on non-QWERTY layouts) default to arrow keys. Currently, arrow presses are swallowed silently in navigation mode.

**Fix:** Add arrow key mappings inside `keyToDirection`. Optionally, make directional keys configurable in settings.

---

### 2. Count prefix for repeated navigation (`3j` = jump 3 down)

**Category:** UX  
**Location:** `src/content/key-handler.ts`, `src/content/nav-queue.ts`

**Problem:** Reaching a target 7 elements away requires pressing `j` 7 times. Vim's count-prefix pattern (`3j`, `5l`) would allow O(1) keypress targeting by distance, dramatically reducing time-to-target on dense pages.

**Fix:** Buffer digit keypresses before a directional key. On direction key, repeat the enqueue by the count. Clear the count buffer on any non-digit, non-direction key.

---

### 3. Hint label overflow — pages with >81 elements show "undefined" labels

**Category:** Bug  
**Location:** `src/content/hint-mode.ts` → `generateLabels()`, `activateHintMode()`

**Problem:** `HINT_CHARS` has 9 characters, supporting at most 81 two-character labels. On dense pages (news feeds, GitHub, search results with 100+ links), elements beyond index 80 get `undefined` as their label. This breaks hint mode on the pages where it's most useful.

**Fix:** Extend `generateLabels` to support 3+ character labels when needed. Expand `HINT_CHARS` to the full home row plus common reach keys (`qwertyuiopasdfghjklzxcvbnm`) for shorter labels.

---

### 4. No "activate and stay" — clicking always exits navigation mode

**Category:** UX  
**Location:** `src/content/mode-manager.ts` → `activateElement()`

**Problem:** After clicking a button (like/save/expand/collapse), the mode resets to Normal. Users working through a list of actions (starring emails, checking todos, toggling settings) must re-enter navigation mode after every single activation. This doubles keypresses for batch operations.

**Fix:** Add a "sticky activation" keybinding (e.g. `Shift+Enter`) that activates without leaving mode. For elements that trigger page navigation (links), always return to Normal. For buttons, checkboxes, and interactive elements, remain in the current mode by default.

---

### 5. No jump stack / navigation history (go-back shortcut)

**Category:** UX  
**Location:** `src/content/index.ts`

**Problem:** After navigating far from a starting point (e.g. jumping to a header then back to the sidebar), there's no way to return to the previous position. Users must manually navigate back, which is slow on complex layouts.

**Fix:** Maintain a stack of previously focused elements (max depth ~20). Add a configurable "go back" keybinding (e.g. `Ctrl+O` / `Ctrl+I` mirroring Vim's jumplist) that pops the stack and transitions to the previous element.

---

## High — Significantly Improves Daily Workflow

### 6. Continuous rAF loop burns CPU while ring is visible

**Category:** Performance  
**Location:** `src/content/aura-ring.ts` → `trackPosition()`

**Problem:** `requestAnimationFrame` runs in a continuous loop the entire time the ring is visible, calling `getBoundingClientRect()` 60 times per second — even when nothing is scrolling and the element isn't moving. On battery-powered devices, this measurably increases power consumption.

**Fix:** Replace the continuous rAF loop with event-driven tracking: listen for `scroll` (throttled via rAF) and `ResizeObserver` on the tracked element. Only update position when movement actually occurs. Start rAF tracking only during the transition animation, then switch to passive observers.

---

### 7. Double `getComputedStyle` per element during scan

**Category:** Performance  
**Location:** `src/content/spatial-nav.ts` → `isVisible()`

**Problem:** `isVisible()` calls `getComputedStyle(el)` once for the `offsetParent` fallback path (line 207) and once unconditionally (line 212). On pages with 300+ focusable elements, this forces hundreds of style recalculations during each scan, causing visible frame drops on mutation-triggered rescans.

**Fix:** Call `getComputedStyle` only once per element and reuse the result. Check `offsetParent === null` first (cheap layout check) and skip the `getComputedStyle` call entirely for elements where `offsetParent` is non-null (most elements).

---

### 8. Scroll events trigger full DOM rescan

**Category:** Performance  
**Location:** `src/content/mutation-observer.ts` → `handleScroll()`

**Problem:** Every scroll event (debounced to 100ms) triggers `scanElements()` which queries all matching elements, calls `getComputedStyle` on each, and rebuilds the entire candidate list. On smooth-scroll pages, this fires repeatedly during scroll momentum, competing with the aura-ring's rAF for CPU time.

**Fix:** Differentiate scroll rescans from mutation rescans. On scroll, only recompute `getBoundingClientRect()` and the viewport-visibility filter on existing elements — don't re-query the DOM or re-check `getComputedStyle`. Only trigger a full rescan when actual DOM mutations occur.

---

### 9. Reduced-motion accessibility support

**Category:** Accessibility / UX  
**Location:** `src/content/aura-ring.ts`, `src/content/indicator.ts`

**Problem:** No `prefers-reduced-motion` media query is respected anywhere. Users who have enabled reduced motion in their OS see the full breathe animation, scale transitions, and sliding indicator. This is an accessibility requirement (WCAG 2.1 SC 2.3.3).

**Fix:** Add `@media (prefers-reduced-motion: reduce)` blocks that disable the breathe keyframe, set `animation: none`, and reduce transition durations to near-instant (e.g. 50ms). Expose a `reducedMotion` setting in options for manual override.

---

### 10. Smart element prioritization — rank targets by likely interaction intent

**Category:** UX  
**Location:** `src/content/spatial-nav.ts` → `scoreInCone()`

**Problem:** The cone search scores purely by distance and angular deviation. On visually complex pages, users typically want to reach primary interactive elements (nav links, action buttons, form fields) rather than minor elements (social share icons, footer links). All elements are weighted equally, making navigation feel "dumb" on cluttered pages.

**Fix:** Add a weight multiplier based on element characteristics: larger elements get a slight priority bonus, elements with specific roles (`main`, `navigation`, `article`) get context-based scoring, elements with visible text labels rank higher than icon-only elements. Keep the multiplier subtle (0.8x–1.2x) so spatial proximity still dominates.

---

### 11. Visual feedback when extension is toggled on/off

**Category:** UX  
**Location:** `src/content/index.ts` → `toggleExtension()`

**Problem:** Pressing the toggle keybinding enables or disables the extension with zero visual feedback. Users can't tell if the extension is on or off without attempting to enter a mode.

**Fix:** Show a brief full-screen overlay flash (like macOS keyboard brightness feedback) — a centered icon that fades in/out over 300ms showing "Navigator ON" or "Navigator OFF". Also update the toolbar badge text/color via message to background script.

---

### 12. Keyboard layout awareness for directional keys

**Category:** UX / Accessibility  
**Location:** `src/content/key-handler.ts` → `keyToDirection()`

**Problem:** `keyToDirection` matches on `e.key` ('h', 'j', 'k', 'l') which is logical-key based. This works correctly for QWERTY users but produces unintuitive physical positions on Dvorak (`h`=`d`, `j`=`h`, `k`=`t`, `l`=`n`) and Colemak. Users on these layouts must press physically scattered keys for directional navigation.

**Fix:** Add a "use physical key positions" option that matches `e.code` (`KeyH`, `KeyJ`, `KeyK`, `KeyL`) instead of `e.key`. Default to logical (`e.key`) for compatibility but allow the toggle for users who prefer QWERTY-position navigation regardless of layout. Also support arrow keys (item #1) as a universal alternative.

---

## Medium — Quality of Life for Power Users

### 13. `gg` / `G` jump-to-top / jump-to-bottom shortcuts

**Category:** UX  
**Location:** `src/content/key-handler.ts`

**Problem:** To reach the first or last element on a page, users must hold a directional key. There's no instant jump to page extremes — a fundamental Vim motion.

**Fix:** Implement key sequence support. Track the last key pressed and its timestamp. If `g` is pressed twice within 300ms, jump to the first element. If `G` (Shift+g) is pressed, jump to the last element. Expose these as configurable bindings.

---

### 14. Passthrough key — temporarily disable interception for one keystroke

**Category:** UX  
**Location:** `src/content/key-handler.ts`

**Problem:** In navigation mode, all unbound keys are swallowed. Users who need to press a single page-specific shortcut (e.g. `?` for help on GitHub, `c` for compose in Gmail) must exit navigation mode, press the key, then re-enter. Three keystrokes for one action.

**Fix:** Add a configurable "passthrough" binding (e.g. `'` or `` ` ``). When pressed, the next keystroke is allowed through to the page without interception. After that single key passes through, interception resumes.

---

### 15. Hint labels positioned at element center with smarter overlap avoidance

**Category:** UX  
**Location:** `src/content/hint-mode.ts` → `activateHintMode()`

**Problem:** Hint labels are pinned to the top-left corner of elements. For large elements (hero banners, full-width cards), the label is far from the visual center, making it hard to associate the label with its target. On dense UIs, labels stack on top of each other.

**Fix:** Position labels at the element's visual center (or the nearest unoccluded position). Implement basic overlap detection: if two labels would overlap, offset the later one down or right by the label's height. For very dense groups, fall back to a column layout.

---

### 16. Badge on toolbar icon showing current mode

**Category:** UX  
**Location:** `src/background/index.ts`, `src/content/index.ts`

**Problem:** The toolbar icon is static — users have no at-a-glance indicator of whether navigation mode is active, especially when the in-page indicator has faded to a dot.

**Fix:** Send a message from the content script to the background on every mode change. In the background, call `api.action.setBadgeText()` with a short label ("NAV", "EDT", or empty for normal) and `setBadgeBackgroundColor()` with the mode color.

---

### 17. Element text search — filter visible elements by content

**Category:** UX  
**Location:** `src/content/index.ts`, new module

**Problem:** On pages with many similar elements (list of links, table rows), spatial navigation is slow because the user must traverse element-by-element. Hint mode helps but requires memorizing random labels.

**Fix:** Add a "search and jump" mode (e.g. `/` key): shows a small input field, user types partial text, elements whose visible text matches are highlighted and filtered. Arrow keys or Tab cycle through matches. Enter jumps to the selected match. This mirrors Vim's `/` search and browser native Ctrl+F but scoped to navigable elements only.

---

### 18. `nodeCouldBeFocusable` runs expensive querySelector on subtree additions

**Category:** Performance  
**Location:** `src/content/mutation-observer.ts` → `nodeCouldBeFocusable()`

**Problem:** When a large DOM subtree is added (e.g. React rendering a list of 50 items), `nodeCouldBeFocusable` is called on the parent container, which triggers `el.querySelector(...)` scanning the entire subtree. For deeply nested components, this is quadratic in the worst case.

**Fix:** Remove the `querySelector` call. Instead, always return `true` for elements with children (optimistic approach — the subsequent `scanElements` will correctly filter). The debounce already prevents cascading rescans, so a false-positive here only costs one extra scan cycle.

---

### 19. Adaptive repeat rate — holding a direction key should accelerate

**Category:** UX  
**Location:** `src/content/nav-queue.ts`

**Problem:** Holding `j` navigates at a constant rate (one element per key-repeat event, ~30ms apart depending on OS settings). On a page with 50 elements in a vertical list, reaching element #40 requires holding `j` for over a second with no acceleration.

**Fix:** Track consecutive same-direction flushes. After 3 consecutive flushes in the same direction within 500ms, double the step count (skip every other element). After 6, triple. Reset the acceleration on direction change or pause. This mimics cursor acceleration in text editors.

---

### 20. Options page — import/export settings and cheat sheet

**Category:** UX  
**Location:** `src/options/options.ts`, `src/options/options.html`

**Problem:** No way to back up keybinding customizations. Users who reinstall the extension or switch machines lose their configuration. Additionally, new users have no quick-reference for what keys do what.

**Fix:** Add "Export JSON" / "Import JSON" buttons that serialize/deserialize the full settings object. Add a "Keyboard Shortcuts" card showing all current bindings in a formatted reference table (auto-generated from settings, not hardcoded).

---

### 21. Dialog and popover awareness — auto-scope to visible modal content

**Category:** UX  
**Location:** `src/content/mutation-observer.ts`, `src/content/index.ts`

**Problem:** When a modal dialog or popover opens, the navigation candidate list includes elements behind the modal (visually obscured). Users can navigate to invisible background elements, causing confusion.

**Fix:** Detect open `<dialog>`, `[popover]:popover-open`, and `[aria-modal="true"]` elements. When one is detected, scope `scanElements` to only search within that modal's DOM subtree. When the modal closes, restore full-page scanning.

---

### 22. Configurable hint characters and ordering

**Category:** UX  
**Location:** `src/content/hint-mode.ts`, `src/options/options.ts`

**Problem:** `HINT_CHARS = 'asdfghjkl'` is optimized for QWERTY home row but suboptimal for Dvorak (`aoeu`), Colemak (`arstne`), or users who prefer different finger patterns. Non-configurable.

**Fix:** Add a `hintChars` field to settings (string of characters to use for hint labels, in priority order). Default to `asdfghjkl` but allow customization from the options page.

---

### 23. Highlight target element during hint mode filtering

**Category:** UX  
**Location:** `src/content/hint-mode.ts`

**Problem:** As the user types characters in hint mode and the filtered set narrows, there's no preview of which element will be selected. The user must commit (Enter or full match) to see which element was targeted — only then does the aura ring move.

**Fix:** When `filteredHints.length` narrows to ≤5, highlight the first match by moving the aura ring to it as a preview (with a dimmed/pulsing style to indicate "pending, not confirmed"). On exact match or Enter, confirm the selection with normal ring style.

---

### 24. Prevent double injection on extension reload

**Category:** Bug  
**Location:** `src/background/index.ts`, `src/content/index.ts`

**Problem:** When the extension is reloaded during development or auto-updated, the background script's re-injection logic (`scripting.executeScript`) can inject a second instance of the content script alongside the still-running original. This causes duplicate event listeners, double shadow DOM hosts, and erratic behavior.

**Fix:** Before injection, send a "ping" message to the tab. If the content script responds, it's still alive — skip re-injection. In the content script's `init()`, respond to ping messages. Additionally, at startup, check for existing shadow DOM hosts by ID and clean up stale instances.

---

## Low — Polish and Robustness

### 25. Options page slider debounce — saves to storage on every pixel drag

**Category:** Performance  
**Location:** `src/options/options.ts`

**Problem:** The `input` event on range sliders fires dozens of times per second during a drag. Each fires `save()` which writes to `chrome.storage.sync`. This causes unnecessary storage write throttling and potential sync conflicts.

**Fix:** Debounce `save()` calls with a 300ms trailing debounce. The UI updates immediately (already does), but storage writes batch naturally.

---

### 26. `setInterval` in options preview leaks when tab is backgrounded

**Category:** Performance  
**Location:** `src/options/options.ts` → `setupPreview()`

**Problem:** The preview ring animation interval runs indefinitely, consuming CPU even when the options tab is hidden or the user is on another tab.

**Fix:** Use `document.addEventListener('visibilitychange', ...)` to pause the interval when the page is hidden and resume when visible again. Store the interval ID for proper cleanup.

---

### 27. Blurry toolbar icon — using 96px image for 16px slot

**Category:** UX  
**Location:** `manifests/v3.json`, `manifests/v2.json`

**Problem:** The manifests reference `favicon-96x96.png` for the 16px and 48px icon slots. Browsers downscale these, producing blurry toolbar icons especially on non-Retina displays.

**Fix:** Generate properly sized icons (16x16, 32x32, 48x48, 128x128) from the SVG source. Reference each at its correct size in the manifest. Add an npm script (e.g. using `sharp` or `svgexport`) to regenerate icons from the SVG.

---

### 28. Screen reader mode announcements via aria-live

**Category:** Accessibility  
**Location:** `src/content/indicator.ts`, `src/content/mode-manager.ts`

**Problem:** Mode changes and focus changes are only communicated visually. Screen reader users who rely on keyboard navigation get zero audio feedback about the extension's state.

**Fix:** Add a visually-hidden `aria-live="assertive"` region to the document. On mode change, update its text ("Navigation mode active — use h/j/k/l to move"). On focus change, announce the element's accessible name. Keep announcements terse for rapid navigation.

---

### 29. Firefox add-on signing — missing `browser_specific_settings`

**Category:** Bug  
**Location:** `manifests/v2.json`

**Problem:** Firefox requires `browser_specific_settings.gecko.id` for extension signing and update checks. Without it, the extension cannot be submitted to AMO or installed from a signed XPI.

**Fix:** Add `"browser_specific_settings": { "gecko": { "id": "navigator@extension", "strict_min_version": "109.0" } }` to the Firefox manifest.

---

### 30. Shared code duplication across bundles

**Category:** Performance (build)  
**Location:** `webpack.config.js`

**Problem:** `src/shared/constants.ts`, `src/shared/types.ts`, and `src/shared/storage.ts` are bundled into all three entry points (content, background, options). The `DEFAULT_SETTINGS` object and selector strings are duplicated, increasing total extension size.

**Fix:** Add `optimization.splitChunks` with a `shared` chunk for code imported by multiple entry points. For a browser extension this requires either dynamic `import()` or concatenating the shared chunk before each entry — evaluate whether the complexity is worth the ~2KB savings.

---

## Summary

| # | Priority | Category | Title |
|---|----------|----------|-------|
| 1 | Critical | UX | Arrow key support |
| 2 | Critical | UX | Count prefix (`3j`) |
| 3 | Critical | Bug | Hint label overflow >81 elements |
| 4 | Critical | UX | Activate and stay in mode |
| 5 | Critical | UX | Jump stack / go-back |
| 6 | High | Performance | rAF loop burns CPU |
| 7 | High | Performance | Double getComputedStyle |
| 8 | High | Performance | Scroll triggers full rescan |
| 9 | High | Accessibility | Reduced-motion support |
| 10 | High | UX | Smart element prioritization |
| 11 | High | UX | Toggle feedback |
| 12 | High | UX | Keyboard layout awareness |
| 13 | Medium | UX | `gg`/`G` top/bottom jump |
| 14 | Medium | UX | Passthrough key |
| 15 | Medium | UX | Hint label positioning |
| 16 | Medium | UX | Toolbar badge shows mode |
| 17 | Medium | UX | Element text search (`/`) |
| 18 | Medium | Performance | nodeCouldBeFocusable cost |
| 19 | Medium | UX | Adaptive repeat rate |
| 20 | Medium | UX | Import/export + cheat sheet |
| 21 | Medium | UX | Modal/dialog scoping |
| 22 | Medium | UX | Configurable hint characters |
| 23 | Medium | UX | Highlight during hint filter |
| 24 | Medium | Bug | Double injection prevention |
| 25 | Low | Performance | Slider save debounce |
| 26 | Low | Performance | Preview interval leak |
| 27 | Low | UX | Blurry toolbar icon |
| 28 | Low | Accessibility | Screen reader announcements |
| 29 | Low | Bug | Firefox signing metadata |
| 30 | Low | Performance | Shared code deduplication |
