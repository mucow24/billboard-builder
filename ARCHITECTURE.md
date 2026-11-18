# Architecture

This editor is organized around a small set of ownership boundaries.

## Layer ownership

- `src/editor/document`
  - Owns document types, schema validation, normalization, defaults, and pure data helpers.
  - Must not import `ui`, `rendering`, `state`, or `app`.
- `src/editor/core`
  - Owns reducer, editor actions, transactions, selection logic, and selectors.
  - May depend on `document` only.
- `src/editor/state`
  - Owns store hosting and convenience wiring.
  - Hosts `editor: EditorState` directly.
  - May depend on `core` and `document`, but must not add duplicate business rules.
- `src/editor/rendering`
  - Owns Konva integration, geometry, snapping, and interaction orchestration.
  - May depend on `document` and `core`, but not `ui` or `app`.
- `src/editor/ui`
  - Owns React controls and inspector/toolbar composition.
  - May depend on lower layers but should keep domain logic out of JSX-heavy modules.
- `src/app`
  - Owns top-level composition, bootstrap, persistence wiring, and app-shell concerns.
  - Hosts the document-library session store (see "Document library").

## Invariant rules

- Document normalization has one source of truth in `src/editor/document/documentNormalizer.ts`.
- Schema validation and normalization are separate responsibilities.
- Reducer updates, persistence loads, and file imports must pass through the same canonical document normalization path.
- A line is not a kind of its own: it is a `kind: 'polygon'` item with `closed: false` (`isLineItem` in `src/editor/document/polygonVertices.ts`). The Line tool creates one with two vertices; anything that names or labels an item asks `getItemDisplayKind`, which reports `'line'` for it.
- The old saved shape of a line (`kind: 'line'` with `startX`/`startY`/`endX`/`endY`) is still accepted by the schema and is converted to an open polygon in exactly one place, `documentNormalizer.ts`. Nothing past normalization ever sees it.
- A two-vertex line is a "straight line" (`isStraightLine`) and keeps the behaviour lines had before they could be bent: no transform box, no vertex sub-selection (enforced in the reducer, so Delete and the arrow keys act on the whole line), and a padded-box hit area when drilling into a group. Every one of those rules goes through `isStraightLine`.
- Emoji a text's font lacks are drawn from the bundled Noto Emoji (`src/editor/fonts/emojiFallback.ts`), and the canvas, its measurements and SVG export must agree on every character:
  - Anything that lays out, measures or draws a text item's text uses `drawnText(item.text)`, never `item.text` itself. Text with tags (see rich text below) applies `drawnText` to each run's text instead (`drawnRichTextRuns`), so a keycap or other sequence that a tag splits in two is not joined.
  - Every canvas font declaration for a text item comes from `getRenderableCanvasFontDeclaration` (or `textFontFamilies`, which it uses), so it names the emoji fallback after the item's own family.
  - The fallback's faces are used only for `EMOJI_FALLBACK_UNICODE_RANGE`. SVG export routes characters to the fallback by the same range (`isInEmojiFallbackRange`, through `emojiFallbackOutline`), so the two change together.
  - Keycaps are drawn as private-use characters (`KEYCAP_BASES`, `FIRST_KEYCAP_CODE_POINT`), which the bundled Noto Emoji maps to its keycap glyphs because `scripts/patch-noto-emoji-keycaps.py` patched its cmap. The script and the constants number them the same way; `emojiKeycapFont.test.ts` checks the bundled file against the constants.
  - Letter spacing is counted per grapheme (`rendering/graphemes.ts`), as Pixi counts it: an emoji with a skin tone, a flag or a family of joined emoji is one grapheme.
  - Known limit: Firefox draws an emoji with a skin tone from the system's colour emoji font whatever the text names, so there the canvas and SVG export disagree on it.
- Where a text item's lines break is decided in one place, `breakLinesLikePixi` (`src/editor/rendering/textLineBreaking.ts`), for everything that is not Pixi's own wrapping: the measured text height (vertical alignment, the smallest box height), SVG export, and text with tags on the canvas.
  - It is a port of Pixi's `wordWrap` for the style `PixiItemLayer` draws text with: `whiteSpace: 'pre'`, no `breakWords`. It breaks the tokens of `tokenizeLikePixi`, a port of Pixi's `tokenize`. A token takes up the larger of its advance and its ink width, plus one letter spacing per grapheme (`pixiTokenWidth`).
  - Text without tags reaches it through `wrapLikePixi` and `layoutWrappedText` (`textMeasurement.ts`), text with tags through `layoutRichText` (see rich text below). Neither has a wrap rule of its own.
  - The lines laid out differ from Pixi's in one way, on purpose (`withBlankLastParagraph`): a line break at the end of the text, followed by nothing but spaces, still starts a blank line that Pixi does not draw. The measured height counts it, so middle- and bottom-aligned text that ends in a line break sits that line higher, as it always has. Any other difference from what Pixi draws is a bug.
  - Callers hand it both widths (`TextWidths`) and nothing else; they do not add letter spacing or pick the larger width themselves.
  - Changing that style, or upgrading Pixi, means two tests must still pass: `textMeasurement.test.ts` runs `wrapLikePixi` and Pixi's own `wordWrap` on the same random texts, and `richTextLayout.test.ts` checks that random texts break the same with colour tags as without.
- Rich text is tags typed into a text item's text (`<b>`, `<i>`, `<color=…>`, `<gradient start=… end=… angle=…>`, `<noparse>`):
  - The tags live in-band in `item.text`. Their syntax has one owner, `src/editor/document/richText.ts`. There is no schema change, no migration and no per-item toggle.
  - `parseRichText(item.text).hasMarkup` is the only gate. Text without a recognised tag takes the plain path (Pixi's own wrapping on the canvas, `layoutWrappedText` elsewhere) exactly as before; text with one takes the rich path everywhere.
  - Anything that shows or measures a text item's text to the user uses `.plain` or the runs of `parseRichText`, never raw `item.text`. The two exceptions are the inspector's text field, which edits the tags, and the favourites key (`favoriteLibrary.ts`), which identifies the text as typed.
  - The canvas, auto-height and SVG export all take the lines of tagged text from `layoutRichText` (`rendering/richTextLayout.ts`), given the runs of `drawnRichTextRuns`. It cuts the text of all the runs into Pixi's tokens as if it had no tags and breaks them with `breakLinesLikePixi`, so tagging a text does not re-wrap it; a word that changes font part-way is one token, measured piece by piece as it is drawn. What breaks a line and what a line ends in is defined once, in `rendering/textLineBreaking.ts`, for plain text, rich text and SVG export alike; so is where a block of lines and each line sit in the item's box (`textBlockTop`, `alignedLineLeft`).
  - The canvas draws one Pixi text per fragment (a piece of one run on one line), not Pixi's `tagStyles`: Pixi's tag parser cannot show a `<` ahead of a tag, and it shifts a gradient by the position of every run. A drop shadow is a second Pixi text per fragment, all of them under all of the fills.
  - A tagged gradient runs across its fragment's own box (the fragment's width, its line box top to bottom) and starts over on each line; an untagged fragment takes the item's fill, across the item's box.
  - Known limits: lines align by their advance width, not the wider of advance and ink as plain lines do, so adding a tag can move a centred or right-aligned line by a pixel or two; nothing kerns or joins across a fragment boundary; a tagged item costs one or two Pixi texts and textures per fragment, and its layout is recomputed on every render; Firefox's smeared fake bold is implemented for tagged runs but has no browser test; a literal `<b>` or `<i>` in a document saved before rich text is now read as a tag (`<noparse>` is the escape).

## Document library

The editor edits one document at a time; the library holds the others.

- **Working copy and saved version.** The document in the editor is the *working copy*. It is autosaved shortly after every change and survives a reload, unsaved changes included. A *saved version* is what the library holds for a document; it is written only by Canvas > Save, by answering "Save" on leaving a document, by Canvas > Make a copy, and by Duplicate in the library; the last two write the saved version of a new document. A working copy that differs from its saved version has unsaved changes (`hasUnsavedChanges` in `src/editor/document/documentComparison.ts`).
- **`documentLibrarySession`** (`src/app/documentLibrarySession.ts`) is a second Zustand store, next to the editor store. It holds what ties the two together:
  - `currentId`: the id of the document in the editor. The library has an entry for it only once it was saved.
  - `savedDocument`: the saved version of that document, or `null` if it was never saved. A never-saved document has unsaved changes as soon as it is not blank.
  - `entries`, `entriesKnown`, `previews`: what the library lists, whether that list is complete, and the preview images read so far.
- **Make a copy.** Canvas > Make a copy saves the working copy, unsaved changes included, as a new library document and switches `currentId` to it. The original is left like any other document: its unsaved changes are asked about first.
- **`useDocumentLibraryController`** (`src/app`) is the only writer of the library and of that store after startup. The editor store knows nothing about the library.

### Storage layout

Everything lives in the `canvas` object store of the `billboard-builder` IndexedDB database:

| Key | Value |
| --- | --- |
| `current` | The working copy, serialized. |
| `current-library-id` | `currentId` for that working copy. |
| `library-entry:<id>` | Name, dates and fonts of a library document. Small, read at startup. |
| `library-document:<id>` | The saved version, serialized. Read when the document is opened or exported. |
| `library-preview:<id>` | The preview image. Read when the library dialog opens. |

The library shares the store with the working copy on purpose. A store of its own would need a new database version, and a build that still opens the old version cannot open the database at all.

### Invariants

- `current` and `current-library-id` are written, and cleared, in one transaction. A working copy is never stored beside another document's id.
- Unsaved changes are never dropped, and never saved over the saved version, without the user saying so. Before another document replaces one that has them, the user is asked: Save, Discard or Cancel. A failed save calls the switch off.
- Library operations are exclusive. While one runs (`busy`), the others do nothing and the editor takes no input other than the answer to that question.
- The entry's name is authoritative. Renaming is immediate, is written straight to the entry, and is not an unsaved change; the name inside a stored document is ignored.
- Stored uploaded fonts are pruned only when the library is fully known (`entriesKnown`). An entry that cannot be read is left out of the list, but its document may be the only user of a font.
- Startup reads the library before the editor is shown (`runEditorStartup`), because the editor autosaves and prunes fonts from its first render.

## Shell rules

- App, stage, and inspector shells should orchestrate rather than own large amounts of behavior.
- Extract pure logic before splitting JSX when refactoring large modules.
- Interaction session state, resolution, and commit math belong in pure rendering helpers, not in React hooks.
- Inspector derivation, labeling, and edit-payload helpers belong in pure UI helper modules, not in `PropertiesPanel`.
- `PropertiesPanel` is a shell-only entrypoint that owns tab and scroll wiring while internal inspector modules own layers and selection editing behavior.
- `CanvasStage` is a shell-only entrypoint that composes viewport state, scene rendering, and test/debug helpers.
- Stage viewport math belongs in `src/editor/rendering/stage/viewportMath.ts` and `useCanvasViewport.ts`, not inline in `CanvasStage`.
- Konva scene rendering, DOM test hooks, and debug snapshot plumbing must live in separate stage modules rather than a single mixed file.
- Avoid optional fallback APIs that duplicate behavior across hooks or layers.

## Refactor stop conditions

- Remove duplicate implementations instead of leaving compatibility copies behind.
- If a module becomes a behavior sink, split it before adding more responsibility.
- If a new helper does not reduce duplication or clarify ownership, do not add it.
