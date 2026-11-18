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
  - The canvas draws one Pixi text per fragment (a piece of one run on one line), not Pixi's `tagStyles`: Pixi's tag parser cannot show a `<` ahead of a tag, and it shifts a gradient by the position of every run. A drop shadow is one image cast from all of the fragments together (`stage/richTextShadow.ts`), under all of the fills; an outline (see below) is one image per fragment, between the two.
  - A tagged gradient runs across its fragment's own box (the fragment's width, its line box top to bottom) and starts over on each line; an untagged fragment takes the item's fill, across the item's box.
  - Known limits: lines align by their advance width, not the wider of advance and ink as plain lines do, so adding a tag can move a centred or right-aligned line by a pixel or two; nothing kerns or joins across a fragment boundary; a tagged item costs a Pixi text and texture per fragment, an outline image per fragment and one shadow image, and its layout is recomputed on every render; Firefox's smeared fake bold is implemented for tagged runs but has no browser test; a literal `<b>` or `<i>` in a document saved before rich text is now read as a tag (`<noparse>` is the escape).
- A text item's outline is a stroke centred on the edge of its glyphs and drawn under their fill:
  - The model is two fields on the text item, `stroke` (a colour, alpha included) and `strokeWidth`, where 0 means none and is what new and older documents have. `textStrokeOf` (`src/editor/rendering/textStroke.ts`) is the only gate: it returns null for no width or a colour that shows nothing, and otherwise the width, the opaque colour and its alpha. Canvas and SVG export both ask it; neither reads the two fields itself.
  - The inner half of the stroke is under the fill, so it shows through a see-through fill. That is on purpose: nothing knocks it out.
  - Joins and caps are round (`TEXT_STROKE_JOIN`), so the outline reaches exactly half its width past the ink and no further. Everything that makes room for it (`measureInkOverhang`, the SVG ink areas) relies on that.
  - On the canvas (`buildTextLayers`, `buildRichTextFragments` in `PixiItemLayer.tsx`) an outlined text is up to three things, lowest first: a shadow sprite, an outline sprite (one per fragment for tagged text) and the fill, a Pixi text exactly as it is drawn without an outline. Without an outline there is one Pixi text, which casts its own shadow, as before.
  - The outline is not drawn with the 2D canvas's `strokeText` (which is what a Pixi text's stroke is), because that gets two things wrong (measured in Chromium on Windows; details in `textStroke.ts`). Where a family has no bold file the browser fakes one, and the path it strokes then holds rings inside every stem, which show through a see-through fill. And below a certain size the browser grid-fits filled glyphs but not stroked ones, so the stroke sits up to 2 px off the fill.
  - Instead the outline is worked out from the image of the filled text. `stage/textEdgeField.ts` rasterises the text filled, with Pixi's own text generator, and `rendering/alphaOutline.ts` turns its alpha into an edge field: how far each texel is from the edge of the glyphs. The outline is the band of texels within half the stroke's width of that edge (`stage/textOutlineImage.ts`, shown by `TextOutline`). It follows the glyphs exactly as the fill shows them, faked bold and grid-fitting included, and its joins are round.
  - Padding rule: the filled text is rasterised with the fill's padding plus half the stroke plus one texel (the outline's soft edge), rounded up to whole blocks of 16 texels (`snapPaddingToTexels`), at the fill's resolution. Its glyphs are then on the same texels as the fill's, and the outline sprite goes exactly where Pixi puts the fill's texture.
  - The shadow of an outlined text is not cast by Pixi, which knows nothing of the outline. `stage/richTextShadow.ts` casts it, for plain text as for tagged text: each fragment is grown by half the stroke from the same edge field the outline is drawn from, all of them are put into one silhouette, and the 2D canvas's own shadow is drawn from that. So a see-through shadow is flat where outline and fill overlap, and where fragments do.
  - Cost: the edge field is worked out in JavaScript on the main thread, texel by texel: about 30 ns per texel for a line of glyphs, where the browser's own stroke took a few milliseconds. It is worked out again whenever the text, its font, its style or the outline's width changes, and on every zoom step, as the fill's own texture is. To bound it:
    - The outline images of one item are together no larger than `OUTLINE_TEXEL_BUDGET` (`stage/rasterCaps.ts`, 4 million texels, about 100 ms). `outlineResolutionCap` gives the resolution at which they reach it. Under that cap an outline is rasterised at the fill's resolution; at the cap it is rasterised there whatever the zoom and shown scaled up, so it turns soft at deep zoom before the fill does, and further zoom steps draw nothing anew. The shadow of an outlined text is drawn no finer than its outline.
    - Only the box of the ink, grown by the outline's reach, is looked at, and distances are worked out only as far as that reach. The field holds 2 bytes per texel, and working it out 5.
    - One field serves the outline and the shadow of the same fragment; `textEdgeField` keeps the last few, up to 8 million texels.
    - The outline image is white and tinted with the outline's colour by its sprite, so a change of colour or opacity draws nothing anew.
  - A see-through outline or shadow is painted opaque and made see-through as a whole (the sprite's `alpha`; a `<g opacity>` in SVG), so that strokes that overlap are no darker where they do.
  - SVG export (`svgText.ts`) strokes the glyph contours, closed for the purpose, in a `<path fill="none">` under every fill path; contours have neither of `strokeText`'s problems. Where bold is faked by a stroke the outline is wider by that stroke, so that its outer edge is where the canvas has it. The item's filter casts the shadow from outline and fill together; its region is measured from the text's ink area (`itemFilterDef` with `inkArea`), not from the glyphs' bounding box, which has no room for the outline.
  - Around faked bold that stroke also covers the inside of the glyphs: the inner part of the widened stroke where bold is faked by growing, the strokes of the inner copies where it is faked by smearing (Firefox). Under an opaque fill neither shows and nothing is added. Where the fill is see-through, a mask cuts the stroke back to the outline of the bold shape: `boldOutlineMask` hides the regular glyphs grown or shrunk to half the stroke inside the bold's edge, `smearOutlineMask` hides one copy shrunk by half the stroke, at every place the glyph is smeared to.
  - Known limits:
    - Tagged text with a see-through outline colour: the outlines of neighbouring fragments are separate images, so they are darker where they overlap.
    - SVG, smeared bold: in a stem thinner than the outline is wide, a sliver narrower than the smear stays in the outline's colour.
    - Canvas and SVG do not agree to the pixel. The canvas outlines the glyphs as the browser fills them, grid-fitted, and a tagged fragment on whole texels; the SVG strokes the contours where the layout puts them. A row or column of an edge can fall either way (`e2e/editor.text-stroke.spec.ts` allows 40 such pixels per case; 16 was the most seen).
    - The canvas outlines the union of an item's (a fragment's) filled glyphs, the SVG every contour: where glyphs overlap, under a see-through fill, the SVG shows the outline of each glyph inside the other and the canvas does not.
    - At deep zoom the outline of a large text is softer than its fill (the texel budget above).
  - Every SVG filter (blur, drop shadow) gets a region measured from the item, since a filter paints nothing outside its region and the default one is measured from the geometry alone, strokes left out: `itemFilterDef` takes an `inkArea` in the item's own coordinates and grows it by the reach of the blur and the shadow. For text the area comes from the laid-out fragments and the outline; for shapes, lines, images and generators `itemInkArea` (`documentToSvg.ts`) gives the box grown by half the stroke, and by the miter limit for the corners of an n-gon. Without it a wide stroke or a shadow longer than half the item is cut off, and a horizontal or vertical line with a shadow is not drawn at all.
  - The SVG's blurs are Gaussians fitted to what the canvas draws, measured on Export > PNG (constants and method in `svgPrimitives.ts`): `blurRadius` is a standard deviation of 1.355 times the radius (Pixi's BlurFilter), a shape's shadow blur one of 0.905 times the blur plus 1.5 px, and 0 for a blur of 0 (the Kawase blur of DropShadowFilter). Text shadows are drawn by the canvas 2D text style, whose blur is a standard deviation of half the value. Change a filter on the canvas (quality, kernel, the halving of the shadow blur) and these have to be measured again; `e2e/editor.export-svg-filter.spec.ts` fails when they drift apart.
  - An n-gon's corners are mitred up to Pixi's default limit of 10 on the canvas, so the SVG sets `stroke-miterlimit="10"` on it (`NGON_MITER_LIMIT`).

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
