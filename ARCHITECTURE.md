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

## Invariant rules

- Document normalization has one source of truth in `src/editor/document/documentNormalizer.ts`.
- Schema validation and normalization are separate responsibilities.
- Reducer updates, persistence loads, and file imports must pass through the same canonical document normalization path.

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
