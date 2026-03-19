Project notes for Codex and other agents working in this repo:

- Prefer TDD whenever possible. Start with or extend tests before implementing behavior changes when the workflow is practical.
- For changes that affect user-facing interaction or browser behavior, add top-level browser-based tests whenever practical. Do not rely only on hook tests or mocked component wiring for gestures, focus/selection behavior, keyboard shortcuts, clipboard flows, drag/drop, or other browser-mediated UI interactions.
- Always stage newly created files as part of the same change when you create them.
- Respect the layer boundaries documented in `ARCHITECTURE.md`; in particular, `src/editor/document` is the canonical home for document invariants and must not depend upward on UI, rendering, state, or app layers.
- Keep rendering interaction session state, resolution, and commit math in pure helpers under `src/editor/rendering`; do not grow that logic back into React hooks or stage components.
