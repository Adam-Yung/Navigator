# Changelog

All notable changes to the Navigator browser extension are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [v3.1.0 → v3.1.1] — September 1, 2026

### Fixed

- Alt-hold helper overlay no longer gets stuck open when Alt-tabbing away from the browser or switching tabs. Added window blur, visibilitychange, and focus listeners to dismiss the overlay when the page loses focus.
- Key handler now dispatches a synthetic Alt keyup to all registered handlers on window blur, preventing any Alt-dependent state from getting stuck.

## [v3.0.0 → v3.1.0] — August 12–31, 2026

### Changed

- Rewrote scroll engine with 3-tier target resolution: last focused element (from picker/search/caret) → element under mouse cursor → page fallback. Each tier checks scroll boundaries before accepting.
- New velocity model: faster base speed (12 px/frame), reaches max in ~0.5s instead of 2.5s, 4x fast mode multiplier.

### Removed

- Removed magnetic scroll stops (snap-to-nearest-element on scroll stop).

### Fixed

- Safety timeout auto-stops scrolling if keyup event is lost (2s failsafe).
- Scroll stops automatically when tab loses focus or window blurs.
- Scroll no longer gets stuck on focused elements that are at their scroll boundary.

## [v2.6.0 → v3.0.0] — August 11–12, 2026

### Added

- Leader lines and multi-color label cycling for picker hint overlays
- Caret indicator zoom-in entry animation

### Fixed

- Spotlight rendering: single clip-path approach eliminates overlap artifacts; softer edge via SVG mask with 14px blur
- Spotlight gradient corrected; zone labels repositioned to element center
- Native `.click()` used for trusted event dispatch (fixes Gmail and apps checking `isTrusted`)
- Button activation reliability, label edge clustering, and outline artifacts resolved
- Search restricted to visible text only; false matches eliminated; off-screen results scroll into view
- Cursor gap resolved via CSS border; aura hides after caret search jump
- Options page styling unified — buttons and text inputs match dark theme
- Hint-chars input formatted with spaced characters for readability
- Help hints updated to show actual shortcuts (Alt+R, Alt+V, Esc)
- Number badges (1–9) removed from picker labels
- Caret indicator fully disappears on exit

### Changed

- Search simplified to visible-text-only matching with deprioritized metadata
- Scoring logic extracted; crash fixes; viewport handling standardized (P0/P1 audit)

## [v2.4.0 → v2.6.0] — August 10–11, 2026

### Added

- Caret mode: `n`/`N` repeat-search and `gg`/`G` jump motions
- Deterministic priority-based quick-pick scoring
- Shadow DOM text traversal for caret mode and search
- Picker modal repositions to top when bottom zones are selected
- Caret mode search integration with smart start position and regex toggle (Alt+V)

### Fixed

- Label positioning: always above element, viewport-clamped, no overlap with content
- Caret mode: blur focused editable on activate; `q` exits; bypass editable guard when mode is active
- Labels visible under `prefers-reduced-motion`; hint generation hardened
- Picker labels restored by tightening modal detection and fixing scope propagation
- Alt+1–9 quick-pick removed from picker inactive handler to prevent ghost bindings

### Performance

- `nodeCouldBeFocusable` descendant scan capped at 200 elements

### Changed

- `nodeCouldBeFocusable` optimized; modal detection consolidated into single utility

## [v2.2.0 → v2.4.0] — August 9–10, 2026

### Added

- Keyboard layout awareness with configurable hint characters and settings import/export
- Toggle feedback overlay with double-injection prevention
- 32px toolbar icon added to manifests
- Element scanning scoped to active modal/dialog
- Universal `prefers-reduced-motion` support across all animated components
- UI keybinding labels dynamically reflect user-configured settings
- Visible caret indicator with vim-like caret mode improvements
- Enhanced search mode: fuzzy matching, scope filters, multi-highlight, and text highlighting

### Fixed

- Magnetic scroll targets elements within active scroll container
- Search mode counter updates on navigation and clears on deactivation
- Welcome tooltip shows Alt+? shortcut; cheatsheet cursor follows text
- Scroll engine targets correct scrollable container
- `e.code` detection for Alt+? cheatsheet keybinding
- Alt-hold helper redesigned as single-row bar with essential shortcuts
- Viewport-spanning containers filtered from quick-pick targets

## [v2.0.0 → v2.2.0] — August 1–9, 2026

### Added

- Global mode arbiter with repeat-last-action and ARIA live announcements
- Zone-based picker with CSS zoom for reduced visual clutter
- Progressive visual hierarchy for picker elements
- Comprehensive UX improvements across all UI components

### Fixed

- Spotlight soft edges, alt-hold flash suppression, and zone assignment logic
- Zone picker grid lines, zoom origin, and mini-map persistence
- Picker scope detection unblocked on GitHub and Ticketmaster
- Tab picker, alt-hold badges, and cheatsheet rendering issues resolved

### Changed

- CSS zoom replaced with spotlight zones for spatial orientation

## [v1.3.0 → v2.0.0] — June 15 – August 1, 2026

**Major architectural rewrite**: replaced the modal navigation system with a modeless Alt-layer architecture. All features now activate via Alt+key chords without mode switching.

### Added

- Modeless Alt-layer architecture — every feature accessible via Alt+key without changing modes
- Physics-based smooth scroll engine (Alt+HJKL)
- Element picker rewrite: Alt+F activation, viewport-only scanning, modal awareness, live ring tracking
- Tab picker overlay (Alt+T) with fuzzy filter and numbered shortcuts
- Element text search (Alt+/) with live matching, count display, and keyboard navigation
- Scoped caret/visual mode (Alt+V) for text selection with HJKL movement
- Page marks (Alt+M to set, Alt+' to jump) with session persistence
- Quick actions palette (Alt+Space) with fuzzy filter and command execution
- URL navigation: Alt+[ back, Alt+] forward, Alt+U up, Alt+Shift+U root, Alt+G focus address bar
- Section jumping (Alt+Shift+[/] for headings and landmarks)
- Clipboard operations (Alt+Y yank mode, Alt+P open from clipboard)
- Bidirectional focus history cycling (Alt+I/O)
- Multi-select (Shift+key), smart re-entry, and Alt+1–9 quick-pick in element picker
- Shortcut cheatsheet overlay (press ?)
- Alt-hold helper overlay (hold Alt 200ms shows reference bar)
- Magnetic scroll stops (snaps to nearest element when scroll velocity decays)
- Contextual action label below ring (shows intent: open link, click, toggle)
- Ring trail/afterimage effect on element transitions
- Shared UI design tokens for consistent overlay styling
- Reveal hover-hidden elements and remember last focus position
- Picker visual polish: staggered labels, match highlight, scroll-to-reveal, tooltip

### Fixed

- Hover manager: prevent visibility flashing on forced elements; add style-override fallback for CSS `:hover` controls
- SVG icon enlargement on state-exit transition prevented

### Performance

- Hover manager: debounced reveal (100ms) and hide (1500ms)
- Indicator uses non-overshooting easing and GPU compositing hints
- Aura ring: smoother easing and paused breathe animation during transitions

### Changed

- Settings UI updated for modeless Alt-layer architecture
- Hint mode fade duration increased from 150ms to 200ms

## [v1.1.0 → v1.3.0] — May 18 – June 15, 2026

### Added

- Biome linter integration
- ARIA attributes on injected UI and options page
- Vitest unit tests for core algorithms
- Adaptive repeat-rate acceleration for held direction keys
- Current mode shown as badge on toolbar icon
- Glassmorphic styling for hint labels
- `gg`/`G` jump-to-top/bottom and passthrough key
- Smart element prioritization with configurable toggle
- Arrow key support, scalable hints, sticky activate, jump stack, collapsible settings

### Fixed

- All keys pass through when extension is disabled
- Firefox manifest updated
- Keybindings updated

### Performance

- Single `getComputedStyle` call per element in `isVisible`
- Continuous rAF loop replaced with event-driven scroll tracking
- Expensive `querySelector` removed from mutation observer

### Changed

- Magic numbers extracted into named constants
- Shared utilities extracted; code duplication eliminated
- Bloated icon assets replaced with properly-sized PNGs

## [v0.2.0 → v1.1.0] — May 17–18, 2026

### Fixed

- Indicator animation, edge scrolling, toolbar icon, and keybind click issues resolved
- New extension icons

## [v0.1.0 → v0.2.0] — May 17, 2026

### Added

- Hint/label mode for quick-jump navigation
- Duplicate keybinding detection on options page

### Fixed

- Stale rects resolved; scroll tracking added; bump animation improved
- Key handling and spatial navigation fixes
- Remaining high-priority audit items addressed

## [v0.1.0] — May 17, 2026

### Added

- Initial release of Navigator browser extension
- Vim-style spatial keyboard navigation with glowing animated focus ring
