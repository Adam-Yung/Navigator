# Navigator

Navigate any web page with your keyboard. Vim-style spatial navigation with a glowing animated focus ring.

<p align="center">
  <img src="src/assets/icons/demo.gif" alt="Navigator demo — spatial keyboard navigation with aura ring" width="720">
</p>

## Why Navigator?

Keyboard-first browsing shouldn't require memorizing tab order. Navigator lets you move **directionally** — press `j` to go down, `l` to go right — and a cone-based search algorithm finds the most intuitive next element on any layout. Works on grids, sidebars, masonry, flex-wrap, anything.

**Zero dependencies. ~14KB. Runs on every page.**

## Quick Start

```bash
git clone "https://github.com/Adam-Yung/Navigator.git"
cd Navigator && npm install && npm run build
```

Then load `dist/chromium` as an unpacked extension (Chrome/Edge/Brave) or `dist/firefox` as a temporary add-on (Firefox).

## Keybindings

| Key | Action |
|-----|--------|
| `Ctrl+Alt+N` | Enter Navigation mode |
| `Ctrl+Alt+E` | Enter Editing mode (inputs only) |
| `h` `j` `k` `l` or Arrows | Move focus directionally |
| `f` | Hint mode (jump to any element by label) |
| `Enter` | Activate focused element |
| `Shift+Enter` | Activate without leaving mode |
| `Ctrl+Enter` | Open in new tab |
| `gg` / `G` | Jump to first / last element |
| `Ctrl+O` | Go back (jump stack) |
| `Escape` | Return to Normal mode |

All keybindings are fully configurable in the options page.

> Global shortcuts `Alt+Shift+N` / `Alt+Shift+E` also work via the browser commands API.

## How It Works

From the focused element, a direction key casts a **cone** in that direction. Elements within the cone are scored by distance and angular alignment. The best match gets focus. If nothing is found, the cone widens progressively up to 180 degrees.

Smart prioritization gives slight preference to larger elements, buttons/links, and elements inside `<nav>` or `<main>` landmarks.

<p align="center">
  <img src="src/assets/icons/screenshot.png" alt="Navigator settings page" width="480">
</p>

## Configuration

Right-click the extension icon and select **Options** to configure:

- **Keybindings** — click a field and press your desired combo
- **Animation duration** — 0ms (instant) to 500ms (cinematic)
- **Aura intensity** — Subtle, Normal, or Vibrant glow
- **Cone angle** — 60° (precise) to 120° (forgiving)
- **Auto-scroll** — scroll off-screen elements into view
- **Disabled sites** — URL patterns where Navigator won't activate

## Browser Support

| Browser | Minimum Version |
|---------|-----------------|
| Chrome / Edge / Brave | 88+ |
| Opera | 74+ |
| Firefox | 140+ |

## Development

```bash
npm run dev        # Watch mode with rebuilds
npm run build      # Production build (chromium + firefox)
npm run test       # Unit tests (vitest)
npm run lint       # Biome linter
```

## Architecture

```
Content Script (14KB)          Background (2KB)         Options Page
├── Mode Manager               ├── Command Handler      ├── Keybinding Recorder
├── Key Handler                └── Storage Init         ├── Live Preview
├── Nav Queue (batching)                                └── Settings UI
├── Spatial Nav (cone search)
├── Aura Ring (Shadow DOM)
├── Hint Mode (label jump)
├── Indicator Chip
└── Mutation Observer
```

All visual elements are rendered in isolated Shadow DOM — no CSS conflicts with host pages.

## License

MIT
