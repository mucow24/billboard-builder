# Billboard Builder

Refactored toward a lean editor architecture while keeping user-facing behavior stable.

Current status: **Patch 12 complete (final consolidation)**.

## Final architecture shape
- `src/app/` — app shell/controller hooks
- `src/editor/core/` — pure editor state, actions, reducer, selectors
- `src/editor/document/` — document types, defaults, normalization, schema, codec
- `src/editor/fonts/` — font model, registry, browser loader, font style helpers
- `src/editor/persistence/` — IndexedDB store + persistence service
- `src/editor/rendering/` — Konva/rendering + interaction helpers
- `src/editor/ui/` — UI components and UI-only helpers

## Final consolidation in this patch
- Removed old transitional compatibility layers and dead files.
- Moved files into intent-based folders (`ui`, `rendering`, etc.).
- Updated imports to target the real architecture directly.
- Consolidated duplicate tests into the document layer and removed obsolete wrapper tests.

## Validation
- `npm run typecheck`
- All 28 Vitest test files passed with `--maxWorkers=1` (run individually because the environment can hang on the full-suite CLI invocation)
