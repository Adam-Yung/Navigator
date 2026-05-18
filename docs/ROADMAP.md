# Navigator — Improvement Roadmap

This document is the comprehensive improvement roadmap for the Navigator browser extension. It catalogs bugs, performance issues, missing edge cases, accessibility concerns, UX improvements, architecture improvements, and feature gaps discovered through a full audit of the source code.

Items are organized by priority and include specific references to the codebase.

---

## Critical Priority

### 1. Stale `rect` data causes incorrect navigation after scroll/resize

**Category:** Bug  
**Location:** `src/content/spatial-nav.ts` → `IndexedElement.rect`, `src/content/index.ts`

**Problem:** `IndexedElement` stores a `rect: DOMRect` captured at scan time. After a scroll or resize event, the `rect` values (which are viewport-relative) become stale. The mutation observer (`mutation-observer.ts:55`) rescans on scroll/resize with a 100ms debounce, but during that 100ms window, any navigation keystroke uses outdated coordinates. Worse, `transitionTo()` in `aura-ring.ts:39` uses `target.rect` directly, so the aura ring jumps to the wrong position until the next rescan.

**Suggested fix:**  
In `handleNavigationResult()` and `transitionTo()`, recompute `getBoundingClientRect()` fresh from `target.el` rather than relying on the cached `target.rect`. Reserve the cached rect for distance calculations during the spatial search only (where relative positions still hold within a single scan batch).

---

### 2. Key handler blocks ALL keypresses in active mode — breaks accessibility and expected behavior

**Category:** Bug / Accessibility  
**Location:** `src/content/key-handler.ts:92-96`

**Problem:** Lines 92-96 catch all remaining key events (that aren't directional, mode switches, or modifier combos) with a blanket `e.preventDefault(); e.stopPropagation()`. This means Tab, Space (for scrolling or activating checkboxes), digits, F-keys, and browser keyboard shortcuts (Ctrl+T, Ctrl+W, Ctrl+L) are all swallowed when modifiers aren't present. In practice:
- Users can't type numbers or use Space to scroll
- Browser shortcuts without Ctrl (like F5 refresh) are blocked
- Screen reader shortcuts are completely broken

**Suggested fix:**  
Replace the blanket block with a targeted allowlist/denylist approach:
1. Allow unmodified F-keys (F1–F12) through unconditionally
2. Allow Space and Tab (or make them configurable — e.g., Space = activate, Tab = next-in-DOM-order)
3. Never block Ctrl/Cmd+key combos that aren't explicitly bound (the current check at line 92 is correct but happens *after* the directional/activation checks, so it's fine — the issue is the else-clause)
4. Consider a passthrough mode or a `passthrough` key that disables interception for the next keystroke

---

### 3. No iframe support — elements inside iframes are invisible

**Category:** Bug / Feature Gap  
**Location:** `src/content/spatial-nav.ts:8` → `document.querySelectorAll()`

**Problem:** `scanElements()` only queries the top-level `document`. Any focusable elements inside same-origin iframes (common on YouTube, Google Docs, and embedded widgets) are completely invisible to the extension. Cross-origin iframes are inaccessible by design, but same-origin ones should be supported.

**Suggested fix:**  
Recursively query same-origin iframes. For each `<iframe>` on the page, attempt to access `iframe.contentDocument`; if accessible, run the selector query within it. Offset the resulting rects by the iframe's own viewport position. Store a reference to the containing document so `el.click()` / `el.focus()` work correctly.

---

### 4. `openInNewTab` fails silently for relative URLs and non-anchor elements

**Category:** Bug  
**Location:** `src/content/mode-manager.ts:73-78`

**Problem:** `openInNewTab()` reads `el.getAttribute('href')` which returns the raw attribute value (potentially relative like `/about`). Passing a relative URL to `window.open()` works in some cases but is unreliable. More importantly, if the focused element is not an anchor (e.g., a `role="link"` div that uses `onclick` for navigation), this function does nothing — no fallback, no user feedback.

**Suggested fix:**  
1. For `<a>` elements, use `(el as HTMLAnchorElement).href` (the resolved absolute URL property) instead of `getAttribute('href')`
2. For non-anchor elements, check for `data-href`, or fallback to simulating Ctrl+click
3. Provide visual feedback (brief flash of the aura ring or a toast) when the action has no effect

---

## High Priority

### 5. Content script has no cleanup — accumulates on SPA navigation

**Category:** Performance / Bug  
**Location:** `src/content/index.ts:125`

**Problem:** `init()` is called once at `document_idle` and never cleaned up. On SPAs (GitHub, YouTube, Gmail) that don't trigger full page reloads, the content script persists correctly. However, if the extension is reloaded or updated mid-session, the old content script remains attached alongside the new one (duplicate listeners, duplicate shadow DOM hosts). There's no mechanism to detect this and self-destruct.

**Suggested fix:**  
1. On init, check for the existence of `#navigator-aura-host` — if present, the old instance is still alive. Remove it and re-initialize.
2. Listen for a "ping" message from the background script that the new instance can respond to; old instances that don't respond can be presumed dead.
3. Expose `destroy()` functions (already partially written: `destroyKeyHandler`, `destroyAuraRing`, `destroyIndicator`) and wire them to a lifecycle tear-down.

---

### 6. `scanElements` only finds viewport-visible elements — no scroll exploration

**Category:** UX / Feature Gap  
**Location:** `src/content/spatial-nav.ts:16` → `isInViewport()` filter

**Problem:** Elements outside the current viewport are excluded from candidates. This means pressing `j` at the bottom of the visible area finds nothing, even though there are clearly more elements below. The user must manually scroll, then re-enter the mode. The `autoScroll` feature only scrolls *to* an already-found target; it doesn't help discover off-screen targets.

**Suggested fix:**  
When navigation in a given direction yields `null` from the in-viewport candidates:
1. Perform a limited off-screen scan (query elements whose rects are within 1–2 viewport heights in the requested direction)
2. If a candidate is found, scroll to it and focus it
3. Cap the off-screen search to prevent scanning the entire DOM on huge pages (use `IntersectionObserver` or a bounded rect check)

---

### 7. Aura ring position drifts during page scroll (fixed positioning without updates)

**Category:** Bug  
**Location:** `src/content/aura-ring.ts:48-51`

**Problem:** The aura ring uses `position: fixed` and sets `top`/`left` based on `getBoundingClientRect()` values at transition time. This is correct for the moment of transition, but if the user scrolls the page *without* moving focus (e.g., with a trackpad or mouse wheel while in navigation mode), the aura ring stays visually anchored while the target element scrolls away.

**Suggested fix:**  
Add a scroll event listener (throttled, ~60fps via `requestAnimationFrame`) that re-positions the ring relative to the currently focused element's live `getBoundingClientRect()`. Alternatively, switch to `position: absolute` within the document flow, but this is harder to isolate in Shadow DOM.

---

### 8. No duplicate keybinding detection in options page

**Category:** UX / Bug  
**Location:** `src/options/options.ts:158-167`

**Problem:** When recording a keybinding, there's no check for conflicts. A user can accidentally bind "Enter" to both `activate` and `returnToNormal`, causing undefined behavior. The last-written binding "wins" in the key handler (first match), but the user gets no warning.

**Suggested fix:**  
After recording a new combo, check all other keybinding values. If a conflict exists, highlight both fields in red and show an inline warning message. Optionally offer to clear the conflicting binding.

---

### 9. `getComputedStyle()` called twice per element during scan — expensive on large DOMs

**Category:** Performance  
**Location:** `src/content/spatial-nav.ts:127-140` → `isVisible()`

**Problem:** `isVisible()` calls `getComputedStyle(el)` once for the `offsetParent` check (line 129) and once for the display/visibility/opacity check (line 135). On a page with 500+ focusable elements (GitHub issue list, YouTube feed), this results in 1000+ forced style recalculations during scan. Combined with the 100ms debounce on mutation/scroll, this can cause visible jank.

**Suggested fix:**  
1. Call `getComputedStyle` only once, reuse the result
2. Check `offsetParent === null` first (cheap) and only call `getComputedStyle` if needed
3. Consider using `IntersectionObserver` as a pre-filter to avoid scanning off-screen elements entirely
4. Add a size threshold (skip elements smaller than 4x4px)

---

### 10. MutationObserver watches the entire `document.body` subtree

**Category:** Performance  
**Location:** `src/content/mutation-observer.ts:20-24`

**Problem:** Observing `childList + subtree + attributes` on `document.body` fires on virtually every DOM change. On dynamic pages (React/Vue apps, Twitter feed, YouTube comments), this triggers hundreds of mutation batches per second. The 100ms debounce helps, but the observer callback itself still runs for every batch, creating GC pressure from the MutationRecord arrays.

**Suggested fix:**  
1. Disconnect the observer during the debounce period (reconnect after rescan completes)
2. Use `requestIdleCallback` instead of `setTimeout` for non-urgent rescans
3. Inspect mutation records to determine if the change could affect focusable elements (e.g., added/removed nodes containing anchor/button tags) rather than always doing a full rescan
4. Consider a two-tier approach: immediate rescan for large structural changes, deferred for attribute-only changes

---

## Medium Priority

### 11. No visual feedback when navigation reaches a dead end

**Category:** UX  
**Location:** `src/content/nav-queue.ts:65`

**Problem:** When `findNext()` returns `null` (no element found in the requested direction), the `flush()` function simply does nothing — `target !== currentElement` is false, so `onFlush` is never called. The user gets zero feedback that their keypress was recognized but found nothing.

**Suggested fix:**  
Add a subtle "bump" animation to the aura ring (brief scale pulse or directional nudge of 2-3px in the pressed direction, then back). This gives haptic-like feedback that the boundary was reached. Expose a `bumpDirection(direction)` function from `aura-ring.ts`.

---

### 12. `activateElement()` always returns to Normal mode — unintuitive for sequential actions

**Category:** UX  
**Location:** `src/content/mode-manager.ts:52-71`

**Problem:** After activating any element (link click, button click), the mode unconditionally resets to `'normal'`. When a user wants to click multiple buttons in a toolbar or navigate through a list clicking items, they must re-enter navigation mode after every activation. This is tedious for power users.

**Suggested fix:**  
1. For links that trigger navigation, returning to normal is correct
2. For buttons and other non-navigating elements, remain in the current mode after click (let the mutation observer handle any DOM changes)
3. Add a "sticky mode" option in settings that keeps the mode active after activation
4. Consider a "quick-click" variant (e.g., Shift+Enter) that activates without leaving mode

---

### 13. `buildComboString` uses `e.code` — layout-independent but confusing for non-QWERTY users

**Category:** UX / Accessibility  
**Location:** `src/content/key-handler.ts:111-118`, `src/options/options.ts:170-177`

**Problem:** Using `e.code` (physical key position) means keybindings are QWERTY-layout-specific. A user with a Dvorak or AZERTY layout will see "KeyN" displayed and need to press the physical N position regardless of what character that key produces. The display in options (`comboToKeycaps`) strips the "Key" prefix showing the letter, but for non-QWERTY users this is misleading.

**Suggested fix:**  
1. Store both `e.code` and `e.key` in the keybinding definition
2. Match on `e.code` for consistency (correct behavior) but *display* the character from `e.key` (user-friendly)
3. Add a note in the options UI explaining that bindings are position-based

---

### 14. No way to disable the extension on specific sites

**Category:** Feature Gap  
**Location:** Manifests, `src/content/index.ts`

**Problem:** The content script runs on `<all_urls>`. Some sites (Google Docs, VS Code Web, Figma) have their own extensive keyboard shortcuts that conflict heavily. There's no mechanism to disable the extension per-site or add a blocklist.

**Suggested fix:**  
1. Add a `disabledSites: string[]` field to `Settings` containing URL patterns (e.g., `*://docs.google.com/*`)
2. In `init()`, check `window.location.href` against the pattern list before proceeding
3. Add a "Disabled Sites" section in the options page with an editable list
4. Consider a quick-toggle via the background script (toolbar icon click toggles for current tab)

---

### 15. Aura ring breathe animation conflicts with CSS `opacity` visibility toggle

**Category:** Bug (cosmetic)  
**Location:** `src/content/aura-ring.ts:138-141`

**Problem:** The `aura-breathe` keyframe animation oscillates opacity between 1.0 and 0.75. But when the ring is hidden, `.aura-ring:not(.visible)` sets `animation: none` *while* the base class has `opacity: 0`. However, when showing, the `.visible` class sets `opacity: 1` via the transition — but the `aura-breathe` animation also sets opacity, creating a potential flash or conflict on the first frame of show/hide transitions.

**Suggested fix:**  
Use `transform: scale()` instead of `opacity` for the breathe effect (e.g., `scale(1)` → `scale(0.97)` → `scale(1)`). This avoids conflicting with the opacity-based visibility transition entirely and is also more performant (compositor-only property).

---

### 16. Navigation queue collapses multi-directional input into a single result

**Category:** UX  
**Location:** `src/content/nav-queue.ts:56-61`

**Problem:** The nav queue batches all keypresses within 16ms and processes them sequentially against the *same candidate set*. This means rapid "j j j" moves 3 elements down (correct), but rapid "j l" computes from the final intermediate target's perspective using potentially stale candidates. Since candidates aren't recomputed between queued moves, intermediate positions may not accurately reflect actual element positions if the page is scrolling.

**Suggested fix:**  
For single-direction repeated presses, the current behavior is fine. For direction changes within a batch, flush the queue at the direction change boundary (animate to the intermediate target, then re-scan, then continue). Alternatively, just make the queue single-directional: flush immediately on direction change.

---

### 17. No TypeScript strict mode — potential null safety issues

**Category:** Code Quality  
**Location:** Project-wide (no `tsconfig.json` found in source files)

**Problem:** The project uses TypeScript but there's no visible `tsconfig.json` with `strict: true`. The code uses non-null assertions (`!`) in multiple places (e.g., `options.ts:49`, `indicator.ts:52-53`) which could throw at runtime if DOM queries return null (e.g., on future HTML changes).

**Suggested fix:**  
1. Add a `tsconfig.json` with `"strict": true`
2. Replace non-null assertions with proper null checks or early returns
3. Consider using a DOM query helper that logs warnings in development when selectors miss

---

### 18. Shadow DOM hosts are never removed if the extension encounters an error during init

**Category:** Bug  
**Location:** `src/content/aura-ring.ts:25`, `src/content/indicator.ts:32`

**Problem:** Both `initAuraRing()` and `initIndicator()` append elements to `document.documentElement` before the full init completes. If `getSettings()` or `onModeChange` throws during init, the shadow DOM hosts remain orphaned in the page with no way to clean them up (no references held externally). On extension reload, duplicates accumulate.

**Suggested fix:**  
1. Wrap the init in try/catch with cleanup in the catch path
2. Check for existing hosts by ID before creating new ones (`document.getElementById('navigator-aura-host')`)
3. Add a global error handler that calls all destroy functions

---

## Low Priority

### 19. Options page `setInterval` in preview leaks when navigating away

**Category:** Code Quality  
**Location:** `src/options/options.ts:220-223`

**Problem:** `setupPreview()` creates a `setInterval` that toggles the preview ring position every 2 seconds. This interval is never cleared. While this only matters in the options page tab (not a content script), it's still a resource leak if the options page is opened in a long-lived tab.

**Suggested fix:**  
Store the interval ID and clear it on `window.onbeforeunload` or use a `visibilitychange` listener to pause/resume the animation when the tab is hidden.

---

### 20. No keyboard shortcut for cycling through modes (Nav → Edit → Normal → Nav)

**Category:** Feature Gap  
**Location:** `src/content/key-handler.ts`

**Problem:** Switching between Navigation and Editing modes requires returning to Normal first (Escape), then pressing the other mode's keybinding. This is two keypresses for a common operation.

**Suggested fix:**  
Add a configurable "cycle mode" binding (e.g., `Tab` while in a modal mode) that rotates through the active modes. Also consider allowing direct Navigation↔Editing switches (already partially implemented — lines 78-90 allow entering the other mode while in a mode, but the keybinding is multi-key).

---

### 21. No hint/label mode for quick-jump (like Vimium's `f` key)

**Category:** Feature Gap  
**Location:** N/A (new feature)

**Problem:** For pages with many elements, spatial navigation can require many keypresses to reach a distant target. A hint-label overlay (showing 1-2 character labels on each element) would allow O(1) targeting for any visible element.

**Suggested fix:**  
Implement a "hint mode" activated by a configurable key (e.g., `f` in navigation mode):
1. Generate short labels (a, s, d, f, ... then aa, as, ...) for all visible elements
2. Render labels in a Shadow DOM overlay near each element
3. As the user types characters, filter to matching labels
4. On unique match, focus/activate that element
5. Escape or unmatched key cancels hint mode

---

### 22. No persistence of focused element across re-scans

**Category:** UX  
**Location:** `src/content/index.ts:86-98` → `handleElementsInvalidation()`

**Problem:** When elements are invalidated and the focused element is still in the DOM, its `IndexedElement` is updated correctly. But the reference equality check (`elements.find(e => e.el === focused!.el)`) can fail if the element was removed and re-added to the DOM (common in React virtual DOM reconciliation), because `el` is a new DOM node at the same position.

**Suggested fix:**  
Fall back to a positional heuristic: if the exact element reference isn't found, search for the element nearest to the previous focused element's last known `cx`/`cy` coordinates. This preserves focus continuity through React re-renders.

---

### 23. `webextension-polyfill` dependency is unused

**Category:** Code Quality  
**Location:** `package.json:18`

**Problem:** The project lists `webextension-polyfill` as a production dependency, but the actual code uses a manual `(globalThis as any).browser || (globalThis as any).chrome` pattern everywhere (storage.ts:4, background/index.ts:2, options.ts:4). The polyfill is never imported.

**Suggested fix:**  
Either:
1. Remove the dependency (saves bundle size and simplifies) — the manual pattern works fine
2. Or actually import and use the polyfill consistently to get proper Promise-based APIs in Firefox

---

### 24. No test infrastructure

**Category:** Testing  
**Location:** Project-wide

**Problem:** There are zero tests — no unit tests for the spatial navigation algorithm, no integration tests for the key handler, no end-to-end tests for the extension. The spatial nav algorithm (`scoreInCone`, `angleDifference`, `findNext`) is pure logic that's highly testable.

**Suggested fix:**  
1. Add `vitest` or `jest` for unit testing
2. Priority test targets:
   - `spatial-nav.ts`: `findNext()` with various element layouts, `angleDifference()` edge cases (wraparound at ±180°), cone widening behavior
   - `nav-queue.ts`: batching behavior, flush timing
   - `mode-manager.ts`: state machine transitions
   - `key-handler.ts`: `buildComboString()` for various platforms
3. Add Playwright + `web-ext` for E2E testing of the loaded extension

---

### 25. No ARIA announcements for mode changes — screen reader users get no feedback

**Category:** Accessibility  
**Location:** `src/content/indicator.ts`, `src/content/mode-manager.ts`

**Problem:** When the mode changes, only a visual indicator chip is shown. Screen reader users receive no announcement of the mode change or the currently focused element. The aura ring is purely visual.

**Suggested fix:**  
1. Add a visually hidden `aria-live="polite"` region to the Shadow DOM (or the main document)
2. On mode change, update its text content with "Navigation mode" / "Editing mode" / "Normal mode"
3. On focus change, announce the focused element's accessible name
4. Consider adding `aria-label` to the focused element dynamically (or using `aria-activedescendant` on a container)

---

### 26. Options page has no keyboard accessibility for the keybinding recorder

**Category:** Accessibility  
**Location:** `src/options/options.ts:125-131`

**Problem:** The keybinding buttons can be focused with Tab and activated with Enter/Space, but once recording starts, the only way to cancel is to click outside or press Escape. There's no visible instruction telling the user how to cancel. The "..." placeholder gives no context to screen reader users about what's happening.

**Suggested fix:**  
1. Add `aria-label="Press a key combination to set binding, or Escape to cancel"` when recording
2. Add visible helper text below the recording button: "Press keys or Esc to cancel"
3. Add a timeout (e.g., 10 seconds) that auto-cancels recording

---

### 27. Background script doesn't handle tab discarding/freezing (Chrome MV3)

**Category:** Bug (Chrome-specific)  
**Location:** `src/background/index.ts:24-37`

**Problem:** In Chrome's MV3, the service worker is ephemeral and tabs can be discarded/frozen. When `api.tabs.sendMessage()` is called on a discarded tab, it will fail silently or throw. There's no error handling around the `sendMessage` call, and no attempt to re-inject the content script into tabs that were discarded and then reloaded.

**Suggested fix:**  
1. Wrap `sendMessage` in a try/catch
2. On failure, attempt to re-inject the content script via `chrome.scripting.executeScript()` (MV3) then retry the message
3. Handle the `runtime.onConnect` event for a more robust content-script-alive detection

---

### 28. No dark/light mode detection for options page

**Category:** UX  
**Location:** `src/options/options.css`

**Problem:** The options page is hardcoded to a dark theme. Users with a system light mode preference, or those using light browser themes, get a jarring visual disconnect when opening the settings page.

**Suggested fix:**  
Add `@media (prefers-color-scheme: light)` overrides with appropriate light-mode colors. Or add a theme toggle to the options page. Consider also respecting the browser's built-in dark/light extension page theming.

---

### 29. Documentation: no CONTRIBUTING.md, no architecture decision records

**Category:** Documentation  
**Location:** Project root

**Problem:** The README is thorough for users but provides no guidance for contributors. Key architectural decisions (why cone-based nav vs. DOM-order, why Shadow DOM, why nav-queue batching) are not documented anywhere.

**Suggested fix:**  
1. Create `CONTRIBUTING.md` with development setup, testing instructions, PR guidelines
2. Create `docs/architecture.md` documenting key design decisions and their rationale
3. Add JSDoc comments to the main exported functions in each module

---

### 30. No telemetry or error reporting mechanism

**Category:** Feature Gap / Quality  
**Location:** Project-wide

**Problem:** When users encounter bugs in the wild, there's no way to collect diagnostic information. Silent failures (like storage unavailable, sendMessage errors) are swallowed without logging.

**Suggested fix:**  
1. Add a debug mode (settable in options) that logs to `console.debug` with a `[Navigator]` prefix
2. Optionally store recent errors in local storage for a "Copy debug info" button in options
3. Consider a lightweight opt-in anonymous error reporting to a Sentry-like service (be transparent about this)

---

## Summary Table

| # | Priority | Category | Title |
|---|----------|----------|-------|
| 1 | Critical | Bug | Stale rect data after scroll |
| 2 | Critical | Bug/A11y | Key handler blocks all keypresses |
| 3 | Critical | Bug | No iframe support |
| 4 | Critical | Bug | `openInNewTab` fails for relative URLs |
| 5 | High | Perf/Bug | No cleanup on SPA navigation |
| 6 | High | UX | No off-screen element discovery |
| 7 | High | Bug | Aura ring drifts during scroll |
| 8 | High | UX | No duplicate keybinding detection |
| 9 | High | Perf | Double `getComputedStyle` per element |
| 10 | High | Perf | MutationObserver on full subtree |
| 11 | Medium | UX | No dead-end feedback |
| 12 | Medium | UX | Activate always exits mode |
| 13 | Medium | UX/A11y | `e.code` confusing for non-QWERTY |
| 14 | Medium | Feature | No per-site disable |
| 15 | Medium | Bug | Breathe animation conflicts opacity |
| 16 | Medium | UX | Multi-direction queue issues |
| 17 | Medium | Quality | No TypeScript strict mode |
| 18 | Medium | Bug | Orphaned shadow DOM on init error |
| 19 | Low | Quality | Options preview interval leak |
| 20 | Low | Feature | No mode cycling shortcut |
| 21 | Low | Feature | No hint/label quick-jump |
| 22 | Low | UX | Focus lost on React re-renders |
| 23 | Low | Quality | Unused polyfill dependency |
| 24 | Low | Testing | No test infrastructure |
| 25 | Low | A11y | No ARIA announcements |
| 26 | Low | A11y | Options recorder not accessible |
| 27 | Low | Bug | Background script tab discarding |
| 28 | Low | UX | No light mode for options |
| 29 | Low | Docs | No contributing guide |
| 30 | Low | Quality | No error reporting |
