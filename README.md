# Billboard Builder

A canvas-based design editor for creating billboards, digital signage, and graphic layouts. Built with React, Konva, and TypeScript.

## Features

**Canvas tools** — Select, pan, zoom, and draw with rectangle, ellipse, line, and text tools. Multi-select with Shift/Ctrl, alignment guides, and snap-to-grid.

**Text editing** — Full typography controls: font family, size, weight, style, alignment, line height, letter spacing, padding, color, gradients, and shadows. Upload custom fonts (TTF, OTF, WOFF, WOFF2).

**Shapes and images** — Rectangles, ellipses, and lines with fill, stroke, gradients, corner radius, and shadow effects. Images support cropping, brightness/contrast, tint, and mirroring.

**Procedural generators** — Nine built-in pattern generators (bands, burst, zigzags, flat grid, perspective grid, scanlines, noise, vignette, scattered shapes) with configurable parameters for creating dynamic backgrounds and textures.

**Layers and groups** — Full layer panel with visibility, locking, z-ordering, and hierarchical grouping/ungrouping.

**Favorites** — Save selections as reusable components. Rename, recolor, reorder, and re-insert saved designs.

**Undo/redo** — Transaction-based history with unlimited undo/redo.

**File I/O** — Save and open projects as JSON. Export to PNG with configurable resolution. Upload images and custom fonts.

**Persistence** — Auto-saves canvas state, favorites, and uploaded fonts to local storage.

## Tech Stack

| Layer | Technology |
|---|---|
| UI framework | React 19 |
| Canvas rendering | Konva + react-konva |
| State management | Zustand |
| Validation | Zod |
| Build tool | Vite |
| Language | TypeScript (strict mode) |
| Unit tests | Vitest + React Testing Library |
| E2E tests | Playwright |

## Getting Started

**Prerequisites:** Node.js 22+

```bash
npm install
npm run dev
```

The dev server starts at `http://localhost:5173` with hot module replacement.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with HMR |
| `npm start` | Start dev server in optimized mode |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit tests with coverage |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run e2e` | Run functional E2E tests |
| `npm run e2e:headed` | Run E2E tests with visible browser |
| `npm run e2e:screenshots` | Run visual regression tests only |
| `npm run e2e:screenshots:update` | Regenerate screenshot baselines |
| `npm run e2e:all` | Run all E2E tests (functional + visual) |

## Adding Fonts

Place `.ttf`, `.otf`, `.woff`, or `.woff2` files in `src/assets/fonts/`. The app automatically loads every supported font file in that directory at startup and adds it to the font picker.

Users can also upload fonts at runtime through the editor UI. Uploaded fonts are persisted in local storage.

## Testing

### Unit tests

```bash
npm test              # run once with coverage
npm run test:watch    # watch mode
```

Uses Vitest with jsdom and React Testing Library. Coverage is reported with V8.

### E2E tests

```bash
npm run e2e           # functional tests (excludes visual)
npm run e2e:headed    # functional tests with visible browser
npm run e2e:all       # functional + visual regression
```

E2E tests use Playwright against a production build served locally. On Windows, tests automatically delegate to WSL via the `scripts/run-e2e.mjs` wrapper. **Never run `npx playwright test` directly on Windows.**

### Visual regression

Screenshot tests are excluded from the default `npm run e2e` run because snapshots are environment-sensitive (WSL vs CI rendering differences).

```bash
npm run e2e:screenshots         # run visual tests
npm run e2e:screenshots:update  # regenerate baselines
```

## Architecture

The editor follows a strict layered architecture with enforced dependency boundaries (via ESLint restricted-imports rules):

```
document  -->  core  -->  state  -->  rendering  -->  ui  -->  app
```

- **document** — Pure data types, schema validation, normalization, and defaults. No UI or rendering imports.
- **core** — Reducer, actions, transactions, selection logic, and selectors. Depends only on document.
- **state** — Zustand store hosting and wiring. Depends on core and document.
- **rendering** — Konva integration, geometry, snapping, and interaction orchestration. Depends on document and core.
- **ui** — React components for toolbar, inspector, and layer panel. May depend on all lower layers.
- **app** — Top-level composition, bootstrap, persistence, and keyboard shortcuts.

See [ARCHITECTURE.md](ARCHITECTURE.md) for invariant rules and refactor guidelines.

## Project Structure

```
src/
  app/                  # App bootstrap, persistence, shortcuts
  editor/
    core/               # Reducer, actions, selectors
    document/           # Types, schema, normalization, defaults
    rendering/          # Konva canvas, geometry, snapping
    ui/                 # Toolbar, inspector, layer panel
    generators/         # 9 procedural pattern generators
    fonts/              # Font loading and management
    color/              # Color utilities
    io/                 # PNG export, project file save/load
    persistence/        # LocalStorage/IndexedDB services
    state/              # Zustand store setup
  styles/               # CSS modules
  assets/fonts/         # Bundled font files
  test/                 # Test utilities and setup
e2e/                    # Playwright E2E tests
scripts/                # Helper scripts (E2E runner, lint checks)
docs/                   # Interaction test coverage matrix
```

## Keyboard Shortcuts

### Tools

| Key | Tool |
|---|---|
| V | Select |
| H | Pan |
| Z | Zoom |
| T | Text |
| R | Rectangle |
| O | Ellipse |
| L | Line |

### Editing

| Shortcut | Action |
|---|---|
| Ctrl+Z | Undo |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| Ctrl+C | Copy |
| Ctrl+X | Cut |
| Ctrl+V | Paste |
| Ctrl+D | Duplicate |
| Ctrl+A | Select all |
| Ctrl+G | Group |
| Ctrl+Shift+G | Ungroup |
| Delete / Backspace | Delete selected |
| Escape | Select parent / deselect |
| Arrow keys | Nudge (1px) |
| Shift+Arrow keys | Nudge (10px) |
| Ctrl+Arrow keys | Reorder z-index |
