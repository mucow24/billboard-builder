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

## Document library

The editor edits one document at a time; the library holds the others.

- **Working copy and saved version.** The document in the editor is the *working copy*. It is autosaved shortly after every change and survives a reload, unsaved changes included. A *saved version* is what the library holds for a document; it is written only by Canvas > Save, or when the user answers "Save" on leaving a document. A working copy that differs from its saved version has unsaved changes (`hasUnsavedChanges` in `src/editor/document/documentComparison.ts`).
- **`documentLibrarySession`** (`src/app/documentLibrarySession.ts`) is a second Zustand store, next to the editor store. It holds what ties the two together:
  - `currentId`: the id of the document in the editor. The library has an entry for it only once it was saved.
  - `savedDocument`: the saved version of that document, or `null` if it was never saved. A never-saved document has unsaved changes as soon as it is not blank.
  - `entries`, `entriesKnown`, `previews`: what the library lists, whether that list is complete, and the preview images read so far.
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
