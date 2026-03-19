Project notes for Codex and other agents working in this repo:

- Prefer TDD whenever possible. Start with or extend tests before implementing behavior changes when the workflow is practical.
- For changes that affect user-facing interaction or browser behavior, add top-level browser-based tests whenever practical. Do not rely only on hook tests or mocked component wiring for gestures, focus/selection behavior, keyboard shortcuts, clipboard flows, drag/drop, or other browser-mediated UI interactions.
- Interaction-heavy features need stricter browser-test discipline:
  - Treat `docs/canvas-interaction-matrix.md` as the source of truth for interaction scenario coverage. Update it when interaction behavior changes or when coverage status meaningfully changes.
  - Interaction-heavy patch summaries should reference the matrix IDs for newly proven `user-flow` scenarios and must call out remaining gaps explicitly.
  - Primary acceptance tests must use the same UI entrypoint the user uses. Canvas interactions must start from the canvas, Layers interactions must start from Layers, and keyboard flows must start from real browser keyboard input.
  - Do not count preselected state, store setup, or alternate entrypoints as proof of the main user interaction path.
  - Prefer spec-first browser tests for the critical user path, and make that path go red before implementation whenever practical.
  - Do not count hook tests, mocked wiring tests, debug-hook tests, or prepared-state browser tests as sufficient coverage for primary UI behavior. They are support coverage only and may supplement browser tests, not replace them.
  - Distinguish tests by purpose: `user-flow`, `support/debug`, and `geometry/precision`. Only `user-flow` tests satisfy the user-interaction acceptance bar.
  - Browser interaction tests should assert visible UI state first whenever practical: selection state, inspector state, layer state, toolbar enablement, manipulators, borders, outlines, and other visible affordances. Use debug/test hooks only as supplemental precision checks.
  - For browser-mediated interactions, include a small critical cross-browser semantic subset whenever practical, especially for click or double-click behavior, focus or selection behavior, keyboard shortcuts, clipboard flows, and drag or drop semantics.
  - Close each interaction-focused patch with a short coverage honesty summary: exact user flows proven, exact user flows still unproven, and any indirect tests that exist but do not count as UI proof.
- Always stage newly created files as part of the same change when you create them.
- Respect the layer boundaries documented in `ARCHITECTURE.md`; in particular, `src/editor/document` is the canonical home for document invariants and must not depend upward on UI, rendering, state, or app layers.
- Keep rendering interaction session state, resolution, and commit math in pure helpers under `src/editor/rendering`; do not grow that logic back into React hooks or stage components.
