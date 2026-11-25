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

**Library** — Canvases are kept in a local library in the browser, each with a preview. Canvas > Save stores the open canvas. Canvas > Make a copy saves the open canvas as a new one named "<name> Copy" and switches to it. Starting or loading another canvas over unsaved changes asks first whether to save or discard them. A dot beside the name marks unsaved changes, and Canvas > Revert goes back to the last saved version. Rename, delete, or export any saved canvas from Canvas > Load > From library.

**File I/O** — Export to PNG with configurable resolution, to SVG, or to a JSON project file, and open JSON project files. Upload images and custom fonts.

**Persistence** — Auto-saves the canvas being edited, the library, favorites, and uploaded fonts to local storage.

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
| `npm run e2e` | Run E2E tests |
| `npm run e2e:headed` | Run E2E tests with visible browser |

## Adding Fonts

Place `.ttf`, `.otf`, `.woff`, or `.woff2` files in `src/assets/fonts/`. The app automatically loads every supported font file in that directory at startup and adds it to the font picker.

Users can also add fonts at runtime from the font menu: "Import font from file…" takes a font file, and "Import font from Google…" finds a family on Google Fonts by name and downloads the styles that are ticked. Imported fonts are stored in the browser (IndexedDB).

A canvas that uses fonts the browser does not have (it was made on another computer, or its stored fonts are gone) gets them back by itself: when such a canvas is opened, each missing font is looked up on Google Fonts by name, and the ones found there are downloaded and stored like an imported font, with no action from the user. A font that is not on Google Fonts stays listed under "Missing fonts".

Both use the Google Fonts Developer API, which needs an API key. The build reads it from `VITE_GOOGLE_FONTS_API_KEY` (for local development, in a git-ignored `.env.local`); a build without it leaves the "Import font from Google…" menu item out and does not look missing fonts up.

### Rich text

Part of a text layer's text can be styled with tags typed into the text itself:

| Tag | Effect |
|---|---|
| `<b>…</b>` | Bold |
| `<i>…</i>` | Italic |
| `<color=red>…</color>` | Solid colour: `#RGB`, `#RGBA`, `#RRGGBB`, `#RRGGBBAA` or a CSS colour name |
| `<gradient start=red end=blue angle=90>…</gradient>` | Gradient across the tagged text, starting over on each line; `angle` is optional and 0 (top to bottom) by default |
| `<noparse>…</noparse>` | Shown as typed, tags included |

Tag names ignore case. Tags may nest and overlap; a closing tag closes only its own tag, and a tag left open runs to the end of the text. Anything that is not one of these tags, well formed, is ordinary text (`a < b`, `<3`). Tagged text exports to PNG and SVG as it looks on the canvas. See `src/editor/document/richText.ts`.

### Emoji

Emoji that a text's font does not have are drawn from the bundled Noto Emoji (`NotoEmoji-Regular.ttf`), a black-and-white emoji font, instead of the system's colour emoji font, so they take the text's fill, gradient, shadow and outline and export to SVG like any glyph. Noto Emoji is used for no ASCII character: its space, digits, `#` and `*` are as wide as an emoji, so a font that lacks them gets them from the system as before. Keycaps (such as 1️⃣) start with a digit, `#` or `*`, so they reach Noto Emoji another way: before drawing, each keycap is swapped for a private-use character (U+100000 to U+10000B), which the bundled font maps straight to its keycap picture. See `src/editor/fonts/emojiFallback.ts`.

Noto Emoji is not listed in the font picker: every font falls back to it already, and as a text's own font it would draw no letters.

Known limit: Firefox still draws an emoji with a skin tone (such as 👍🏽) from the system's colour emoji font, so there it stays in colour and SVG export does not match it. Chromium and WebKit draw it from Noto Emoji.

The bundled `NotoEmoji-Regular.ttf` is made from Google's by `scripts/patch-noto-emoji-keycaps.py`, which makes two changes. It fixes the weight at 400, the only weight the app uses, which keeps the same outlines and halves the file. It also adds those 12 characters to the font's character map. When updating the font, start from Google's `NotoEmoji[wght].ttf` and run the script on it (needs Python with `fonttools`):

```bash
python scripts/patch-noto-emoji-keycaps.py path/to/NotoEmoji[wght].ttf src/assets/fonts/NotoEmoji-Regular.ttf
```

`src/editor/fonts/emojiKeycapFont.test.ts` fails if the bundled file lacks the patch.

## Testing

### Unit tests

```bash
npm test              # run once with coverage
npm run test:watch    # watch mode
```

Uses Vitest with jsdom and React Testing Library. Coverage is reported with V8.

### E2E tests

```bash
npm run e2e           # run E2E tests
npm run e2e:headed    # run with visible browser
```

E2E tests use Playwright against a production build served locally. Each run builds the checkout it is started from and serves it on a free port chosen by the operating system, so runs in several checkouts can overlap.

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
    io/                 # PNG/SVG/JSON export, project file reading
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
| Ctrl+B | Bold the selected text, or unbold it when all of it is bold |
| Ctrl+I | Italicize the selected text, or straighten it when all of it is italic |
| Ctrl+A | Select all |
| Ctrl+S | Save to the library |
| Alt+Click | Select through the items under the cursor: each click steps to the next one down, including locked and covered items |
| Drag over a covered selected item | Moves the selection, even when another item is on top; a click there selects the top item |
| Ctrl+G | Group |
| Ctrl+Shift+G | Ungroup |
| Delete / Backspace | Delete selected |
| Escape | Select parent / deselect |
| Arrow keys | Nudge (1px) |
| Shift+Arrow keys | Nudge (10px) |
| Ctrl+Arrow keys | Reorder z-index |
