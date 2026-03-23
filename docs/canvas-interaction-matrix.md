# Canvas Interaction Matrix and Test Contract

This document is the source of truth for user-facing canvas interaction coverage.

It exists to prevent a common failure mode in this repo:

- broad test count being mistaken for real user-flow proof
- prepared state being mistaken for coverage of the primary interaction path
- debug or support tests being mistaken for browser interaction coverage

For any interaction-heavy patch, use this matrix to decide what must be tested, what is already covered, and what still does not count as proof.

## Contract Rules

- A scenario only counts as primary interaction coverage if it starts from the same UI entrypoint the user uses.
- `Canvas` flows must begin from the canvas.
- `Layers` flows must begin from Layers.
- `Keyboard` flows must begin from real browser keyboard input.
- `Clipboard` flows must begin from browser clipboard events.
- Prepared state, store setup, or alternate UI entrypoints do not count as proof of the primary user path.
- Hook tests, mocked wiring tests, and debug-hook tests are support coverage only.
- Browser tests must assert visible user state first whenever practical:
  - selected layer row
  - properties panel state
  - toolbar enablement
  - visible handles, borders, and outlines
  - no stolen focus or browser text selection where relevant
- Use debug or render snapshots only to disambiguate geometry or affordance presence.
- For browser-mediated interactions, keep a small cross-browser semantic subset whenever practical.
- At the end of each interaction-focused patch, list:
  - user flows proven
  - user flows still unproven
  - indirect tests that exist but do not count as UI proof

## Execution Lanes

- `Lane A: Critical canvas semantics`
- `Lane B: Remaining user entrypoints`
- `Lane C: UI regression and stabilization`

## Must-Pass Core Pack

- canvas select item
- canvas select group
- canvas drill into child
- canvas switch to sibling child
- canvas pickup drag from an unselected item
- canvas pickup drag from an unselected group
- canvas child drag without parent movement
- escape climb
- blank-canvas clear
- no text selection or focus theft
- nested-group child manipulation without outer-group movement

## Failure Triage

- `semantic interaction failure`
- `rendering affordance failure`
- `geometry precision failure`
- `browser-specific event/focus failure`

## Matrix Columns

- `ID`: stable scenario id
- `Entry`: where the user starts
- `Preconditions`: selection, tool, hierarchy, or item state required before the flow
- `Steps`: exact user actions
- `Visible Result`: what the user should see
- `State Result`: what should happen to selection, document, tool, or history state
- `Class`: `user-flow`, `support/debug`, or `geometry/precision`
- `Scope`: browser scope expected for the scenario
- `Current Coverage`: direct test path(s) that currently cover it, or `missing`

## 1. Canvas Selection Flows

| ID | Entry | Preconditions | Steps | Visible Result | State Result | Class | Scope | Current Coverage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CS-01 | Canvas | Select tool, no selection | Click blank canvas | No selection affordances visible | Selection cleared | user-flow | Cross-browser subset | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts), [e2e/editor.shortcuts.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.shortcuts.spec.ts) |
| CS-02 | Canvas | Select tool, rectangle visible | Click rectangle | Rectangle handles visible, Properties shows rectangle | Rectangle selected | user-flow | Chromium | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| CS-03 | Canvas | Select tool, ellipse visible | Click ellipse | Ellipse handles visible, Properties shows ellipse | Ellipse selected | user-flow | Chromium | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| CS-04 | Canvas | Select tool, text visible | Click text | Text selection affordance visible, Properties shows text | Text selected | user-flow | Chromium | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| CS-05 | Canvas | Select tool, image visible | Click image | Image selection affordance visible, Properties shows image | Image selected | user-flow | Chromium | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| CS-06 | Canvas | Select tool, line visible | Click line | Line endpoint handles visible | Line selected | user-flow | Chromium | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| CS-07 | Canvas | Select tool, item already selected | Click selected item, drag, then mouse up | Selected item stays visibly selected through the gesture and its handles return after release | Item remains selected and the drag commits on mouse up | user-flow | Chromium | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| CS-08 | Canvas | Select tool, two sibling items visible | Shift-click second item after selecting first | Shared selection affordance visible | Multi-selection toggled | user-flow | Chromium | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| CS-09 | Canvas | Select tool, multiple items visible | Drag marquee across items | Shared selection affordance visible | Hit items selected | user-flow | Chromium | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| CS-10 | Canvas | Select tool, current selection exists | Shift-marquee across items | Shared selection updates | Hit items toggled | user-flow | Chromium | Deferred: blank-canvas `Shift` drag is currently the browser pan path covered by `VP-05`, so there is no honest browser toggle-marquee proof yet |
| CS-11 | Canvas | Select tool | Mouse down/up without marquee movement | No accidental marquee UI remains | No selection change from zero-distance marquee | user-flow | Chromium | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| CS-12 | Canvas | Locked item visible | Click locked item | No manipulation starts | No drag/resize/rotate session | user-flow | Chromium | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| CS-13 | Canvas | Hidden item in document | Attempt click at hidden item position | No hidden affordance | Hidden item not selected | user-flow | Chromium | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| CS-14 | Canvas | Select tool, a different item may already be selected, visible leaf item is unselected | Mouse down on item body, drag, then mouse up | Drag target selects and moves in one gesture | Pickup drag commits without needing a prior selection click | user-flow | Chromium + cross-browser subset | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| CS-15 | Canvas | Select tool, item is fully outside the canvas or partially beyond the canvas edge but still visible in the unclipped workspace | Click an off-canvas visible item region | Matching item affordance appears and inspector updates | Off-canvas item selected through the real canvas entrypoint | user-flow | Chromium | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| CS-16 | Canvas | Select tool, item is fully outside the canvas but visible in the unclipped workspace | Drag marquee entirely outside the canvas | Matching item affordance appears | Fully off-canvas items are selected by marquee | user-flow | Chromium | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| CS-17 | Canvas | Select tool, one item partially overlaps canvas and another is fully outside | Drag marquee across the canvas edge | Both matching affordances appear | Edge-crossing marquee includes both partially visible and fully off-canvas items | user-flow | Chromium | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| CS-18 | Canvas | Select tool, off-canvas item is unselected | Mouse down on off-canvas item body, drag, then mouse up | Drag target selects and moves in one gesture | Off-canvas pickup drag commits without needing a prior selection click | user-flow | Chromium | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |

## 2. Group and Drill-In Flows

| ID | Entry | Preconditions | Steps | Visible Result | State Result | Class | Scope | Current Coverage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GD-01 | Canvas | Select tool, grouped content visible | Click grouped content | Group overlay visible, group controls shown | Group selected | user-flow | Chromium + cross-browser subset | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| GD-02 | Canvas | Group selected | Double-click child inside group | Child affordance visible, group-only controls hidden | Child selected | user-flow | Chromium + cross-browser subset | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| GD-03 | Canvas | Child selected inside group | Click sibling child | Sibling child affordance visible | Sibling child selected | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| GD-04 | Canvas | Outer group selected | Double-click inner group content | Inner group affordance visible | Inner group selected | user-flow | Chromium + cross-browser subset | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| GD-05 | Canvas | Inner group selected | Double-click leaf in inner group | Leaf affordance visible | Leaf selected | user-flow | Chromium + cross-browser subset | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| GD-06 | Keyboard | Drilled into child | Press Escape repeatedly | Selection affordance climbs visibly | Child -> parent group -> outer group -> clear | user-flow | Chromium + cross-browser subset | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| GD-07 | Canvas | Drilled into child | Click blank canvas | Selection clears | No selected nodes | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| GD-08 | Canvas | Group contains text child | Double-click into text child | Text selected, no DOM text selection, no toolbar focus theft | Child selected | user-flow | Chromium + cross-browser subset | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| GD-09 | Canvas | Selected group, double-click resolves to real item hit | Double-click child content | Correct drill-in | Correct descendant selected | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| GD-10 | Canvas | Selected group, double-click resolves to stage-surface fallback | Double-click child content through surface path | Correct drill-in | Correct descendant selected | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| GD-11 | Canvas + Keyboard | Mixed-parent selection | Try Group button or shortcut | Group remains disabled or no-op | No grouping | user-flow | Chromium | Covered in [e2e/editor.groups.layers.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.layers.spec.ts) |
| GD-12 | Canvas + Keyboard | Single node selected | Try Group button or shortcut | Group remains disabled or no-op | No grouping | user-flow | Chromium | Covered in [e2e/editor.shortcuts.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.shortcuts.spec.ts) |
| GD-13 | Canvas + Keyboard | Non-group selection | Try Ungroup button or shortcut | Ungroup disabled or no-op | No ungrouping | user-flow | Chromium | Covered in [e2e/editor.shortcuts.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.shortcuts.spec.ts) |
| GD-14 | Canvas | Grouped child is visible only in the off-canvas overflow preview | Click grouped content once, then double-click the same child | Group affordance yields to child affordance | Off-canvas child drill-in follows the direct item-hit path | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| GD-15 | Canvas | Group selected | Single-click grouped content | Group affordance remains active | Selection remains on the group | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |

## 3. Nested Editing Invariants

These are first-class invariants. Drilled-in editing must not silently fall back to ancestor-group manipulation.

| ID | Entry | Preconditions | Steps | Visible Result | State Result | Class | Scope | Current Coverage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| NI-01 | Canvas | Group selected | Double-click child, then drag child body | Child manipulator visible, group overlay handles inactive | Only child moves | user-flow | Chromium + cross-browser subset | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| NI-02 | Canvas | Group selected | Double-click child, then rotate child | Child rotater visible, parent group not rotating | Only child rotates | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| NI-03 | Canvas | Group selected | Double-click child, then resize child | Child resize handles visible, parent group overlay inactive | Only child resizes | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| NI-04 | Canvas | Group selected, line child exists | Double-click line child, then drag line start handle | Line handle visible, parent group not moving | Only line start endpoint changes | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| NI-05 | Canvas | Group selected, line child exists | Double-click line child, then drag line body | Line affordance visible, parent group not moving | Only line moves | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| NI-06 | Canvas | Outer group selected | Double-click inner group, then drag inner group | Inner group selected, outer subgroup outline remains correct | Only inner group moves | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| NI-07 | Canvas | Outer group selected | Double-click inner group, then rotate inner group | Inner group rotation affordance visible | Only inner group rotates | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| NI-08 | Canvas | Outer group selected | Double-click inner group, then resize inner group | Inner group handles visible | Only inner group resizes | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| NI-09 | Canvas | Child selected inside group | Click sibling child | Sibling child handles visible | Sibling child selected directly | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| NI-10 | Canvas | Inner group selected inside outer group | Double-click descendant leaf | Leaf handles visible, outer outline state still correct | Leaf selected, ancestor hierarchy preserved | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| NI-11 | Keyboard | Child or inner group manipulated | Undo, then redo | Visible affordances restore to correct hierarchy | Document and selection restore correctly | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| NI-12 | Keyboard | Child manipulated inside group | Escape after manipulation | Parent affordance restored | Selection climbs correctly | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |

## 4. Single-Item Transform Flows

| ID | Entry | Preconditions | Steps | Visible Result | State Result | Class | Scope | Current Coverage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ST-01 | Canvas | Rectangle selected | Drag body | Live preview and handles follow | Rectangle moves | user-flow | Chromium | Covered in [e2e/editor.transforms.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.transforms.spec.ts) |
| ST-02 | Canvas | Rectangle selected | Drag resize handle | Resize preview visible | Rectangle resizes | user-flow | Chromium | Covered in [e2e/editor.transforms.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.transforms.spec.ts) |
| ST-03 | Canvas | Rectangle selected | Drag rotater | Rotation preview visible | Rectangle rotates | user-flow | Chromium | Covered in [e2e/editor.transforms.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.transforms.spec.ts) |
| ST-04 | Canvas | Text selected | Drag body | Text selection affordance follows | Text moves | user-flow | Chromium | Covered in [e2e/editor.transforms.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.transforms.spec.ts) |
| ST-05 | Canvas | Text selected | Drag resize handle | Text resize preview visible | Text resizes | user-flow | Chromium | Covered in [e2e/editor.transforms.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.transforms.spec.ts) |
| ST-06 | Canvas | Text selected | Drag rotater | Text rotation preview visible | Text rotates | user-flow | Chromium | Covered in [e2e/editor.transforms.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.transforms.spec.ts) |
| ST-07 | Canvas | Image selected | Drag body | Image selection affordance follows | Image moves | user-flow | Chromium | Covered in [e2e/editor.transforms.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.transforms.spec.ts) |
| ST-08 | Canvas | Image selected | Drag resize handle | Image resize preview visible | Image resizes | user-flow | Chromium | Covered in [e2e/editor.transforms.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.transforms.spec.ts) |
| ST-09 | Canvas | Image selected | Drag rotater | Image rotation preview visible | Image rotates | user-flow | Chromium | Covered in [e2e/editor.transforms.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.transforms.spec.ts) |
| ST-10 | Canvas | Line selected | Drag body | Line selection affordance follows | Line moves | user-flow | Chromium | Covered in [e2e/editor.transforms.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.transforms.spec.ts) |
| ST-11 | Canvas | Line selected | Drag start endpoint | Line start handle follows | Start endpoint changes only | user-flow | Chromium | Covered in [e2e/editor.transforms.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.transforms.spec.ts) |
| ST-12 | Canvas | Line selected | Drag end endpoint | Line end handle follows | End endpoint changes only | user-flow | Chromium | Covered in [e2e/editor.transforms.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.transforms.spec.ts) |
| ST-13 | Canvas | Selected item, snap candidate exists | Ctrl-drag | No snapping guides | Snapping disabled | user-flow | Chromium | Covered in [e2e/editor.transforms.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.transforms.spec.ts) |
| ST-14 | Canvas | Selected item | Shift-drag | Constrained preview visible | Axis-constrained drag where implemented | user-flow | Chromium | Covered in [e2e/editor.transforms.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.transforms.spec.ts) |
| ST-15 | Canvas | Rectangle selected, resize handle is off-canvas but visible in the unclipped workspace | Drag the off-canvas resize handle | Resize affordance stays live | Off-canvas handle resize commits like the on-canvas case | user-flow | Chromium | Covered in [e2e/editor.transforms.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.transforms.spec.ts) |
| ST-16 | Canvas | Single item selected | Change zoom with the HUD | Selection hooks keep the same visible size and rotater offset | Overlay geometry stays viewport-invariant across zoom changes | support/debug | Chromium + Firefox | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |

## 5. Image Crop Flows

| ID | Entry | Preconditions | Steps | Visible Result | State Result | Class | Scope | Current Coverage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| IC-01 | Canvas | Group with image child selected | Double-click grouped image content | Group affordance yields to the image leaf selection, not crop mode | Drill-in selects the image leaf only | user-flow | Cross-browser subset | Covered in [e2e/editor.image-crop.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.image-crop.spec.ts) |
| IC-02 | Canvas | Image leaf already selected | Double-click selected image | Crop affordance appears and normal single-selection handles disappear | Image crop session starts | user-flow | Cross-browser subset | Covered in [e2e/editor.image-crop.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.image-crop.spec.ts) |
| IC-03 | Canvas | Crop mode active | Observe crop mode | Black crop frame stays visible while the full image extent remains visible behind it | Crop session exposes crop and full-image frames together | user-flow | Chromium | Covered in [e2e/editor.image-crop.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.image-crop.spec.ts) |
| IC-04 | Canvas | Crop mode active | Drag a black crop handle | Crop bounds visibly change while crop mode remains active | Persisted crop rect changes on commit | user-flow | Chromium | Covered in [e2e/editor.image-crop.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.image-crop.spec.ts) |
| IC-05 | Canvas | Crop mode active | Drag inside the image | Image pans under the crop frame | Persisted crop source translation changes on commit | user-flow | Chromium | Covered in [e2e/editor.image-crop.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.image-crop.spec.ts) |
| IC-06 | Canvas | Crop mode active | Click blank canvas | Crop affordance disappears and normal selection state exits | Crop session commits and selection clears | user-flow | Cross-browser subset | Covered in [e2e/editor.image-crop.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.image-crop.spec.ts) |
| IC-07 | Canvas | Crop mode active, another selectable item visible | Click another item | Crop affordance disappears and the other item becomes selected | Crop session commits and selection switches | user-flow | Chromium | Covered in [e2e/editor.image-crop.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.image-crop.spec.ts) |
| IC-08 | Keyboard | Crop mode active | Press Escape | Crop affordance disappears and the original image appearance returns | Crop session cancels with no document mutation | user-flow | Cross-browser subset | Covered in [e2e/editor.image-crop.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.image-crop.spec.ts) |
| IC-09 | Canvas | Crop mode active | Drag a blue full-image resize handle | Blue full-image frame resizes while the black crop frame stays fixed | Committed source scale changes under a fixed crop frame | user-flow | Chromium | Covered in [e2e/editor.image-crop.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.image-crop.spec.ts) |
| IC-10 | Canvas | Crop mode active | Drag the blue full-image rotater | Blue full-image frame rotates while the black crop frame stays fixed | Committed source rotation persists under a fixed crop frame | user-flow | Chromium | Covered in [e2e/editor.image-crop.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.image-crop.spec.ts) |
| IC-11 | Canvas | Crop mode active | Double-click anywhere on the image, inside or outside the crop | Crop affordance disappears while the image remains selected | Crop session commits and exits without clearing selection | user-flow | Chromium | Covered in [e2e/editor.image-crop.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.image-crop.spec.ts) |
| IC-12 | Canvas | Crop mode active, snap candidate visible | Drag a crop boundary near a guide, then repeat with Ctrl held | Guides appear for the snapped drag and stay absent for the Ctrl drag | Crop boundary snapping matches normal guide behavior and Ctrl disables it | user-flow | Chromium | Covered in [e2e/editor.image-crop.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.image-crop.spec.ts) |
| IC-13 | Canvas | Crop mode active | Change zoom with the HUD | Crop hooks keep the same visible size and full-image rotater offset | Crop overlay geometry stays viewport-invariant across zoom changes | support/debug | Chromium | Covered in [e2e/editor.image-crop.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.image-crop.spec.ts) |

## 6. Group and Multi-Selection Transform Flows

| ID | Entry | Preconditions | Steps | Visible Result | State Result | Class | Scope | Current Coverage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GT-01 | Canvas | Multi-selection active | Drag selected item | Shared overlay follows | All selected items move | user-flow | Chromium | Covered in grouped regression suites |
| GT-02 | Canvas | Multi-selection active | Drag group resize handle | Shared resize preview visible | All selected items resize coherently | user-flow | Chromium | Covered in grouped regression suites |
| GT-03 | Canvas | Multi-selection active | Drag group rotater | Shared rotate preview visible | All selected items rotate coherently | user-flow | Chromium | Covered in rotated/grouped regression suites |
| GT-04 | Canvas | Real group node selected | Drag group | Group overlay follows | Group descendants move as a unit | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| GT-05 | Canvas | Real group node selected | Resize group | Group resize preview visible | Group descendants resize as a unit | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| GT-06 | Canvas | Real group node selected | Rotate group | Group rotate preview visible | Group descendants rotate as a unit | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| GT-07 | Canvas | Group already rotated | Drag again | Overlay stays coherent | Rotated group drags correctly | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| GT-08 | Canvas | Group already rotated | Resize again | Overlay and items stay coherent | Rotated group resizes correctly | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| GT-09 | Canvas | Group with line + shape | Transform group | Handles, preview, and result stay coherent | Mixed descendants transform correctly | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| GT-10 | Canvas | Real group node is unselected | Mouse down on grouped content, drag, then mouse up | Group overlay appears and the group moves in one gesture | Group pickup drag commits without needing a prior selection click | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| GT-11 | Canvas | Real group node selected | Single-click grouped content, drag grouped content, then double-click grouped content | Group affordance stays active through single-click and drag, then yields to child affordance on double-click | Single-click is a no-op, drag moves descendants as a unit, and double-click drills into the target descendant | user-flow | Chromium | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |

## 7. Viewport and Navigation Flows

| ID | Entry | Preconditions | Steps | Visible Result | State Result | Class | Scope | Current Coverage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| VP-01 | Canvas | Any state | Mouse wheel over canvas | Zoom readout changes | Viewport zoom changes | user-flow | Cross-browser subset | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| VP-02 | Canvas | Zoom tool active | Click canvas | Zoom readout increases | Zoom in at click point | user-flow | Cross-browser subset | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| VP-03 | Canvas | Zoom tool active | Alt-click canvas | Zoom readout decreases | Zoom out at click point | user-flow | Cross-browser subset | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| VP-04 | Canvas | Hand tool active | Drag canvas | Cursor and viewport move | Pans viewport | user-flow | Cross-browser subset | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| VP-05 | Canvas | Select tool, no active session | Shift-drag canvas | Cursor and viewport move | Pans viewport | user-flow | Cross-browser subset | Covered in [e2e/editor.smoke.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.smoke.spec.ts) |
| VP-06 | Canvas | Any non-editable state | Middle-mouse drag | Cursor and viewport move | Pans viewport | user-flow | Cross-browser subset | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| VP-07 | HUD | Any state | Click zoom in/out buttons | Zoom readout updates | Zoom changes | user-flow | Chromium | Covered in [e2e/editor.smoke.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.smoke.spec.ts) |
| VP-08 | HUD | Any state | Click 100% | Zoom readout becomes 100% | Zoom set to 1 | user-flow | Chromium | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| VP-09 | HUD | Any state | Click Fit | Canvas fits viewport | Zoom/pan recomputed | user-flow | Chromium | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |
| VP-10 | Canvas/HUD | Tool changes | Change tool or modifier state | Cursor changes correctly | No document mutation | user-flow | Chromium | Covered in [e2e/editor.entrypoints.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.entrypoints.spec.ts) |

## 8. Layers Flows

| ID | Entry | Preconditions | Steps | Visible Result | State Result | Class | Scope | Current Coverage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LY-01 | Layers | Any state | Open Layers tab | Layers visible | No document mutation | user-flow | Chromium | Covered in multiple browser specs |
| LY-02 | Layers | Top-level item exists | Click row | Active row changes | Node selected | user-flow | Chromium | Covered in [e2e/editor.groups.layers.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.layers.spec.ts) |
| LY-03 | Layers | Group exists | Click group row | Group row active | Group selected | user-flow | Chromium | Covered in [e2e/editor.groups.layers.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.layers.spec.ts) |
| LY-04 | Layers | Expanded group exists | Click child row | Child row active | Child selected | user-flow | Chromium | Covered in [e2e/editor.groups.layers.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.layers.spec.ts) |
| LY-05 | Layers | Row visible | Double-click row | Properties tab opens | Node selected | user-flow | Chromium | Covered in [e2e/editor.groups.layers.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.layers.spec.ts) |
| LY-06 | Layers | Expanded group visible | Collapse group | Child rows hidden | Collapse state updated | user-flow | Chromium | Covered in [e2e/editor.groups.layers.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.layers.spec.ts) |
| LY-07 | Layers | Collapsed group visible | Expand group | Child rows visible | Collapse state updated | user-flow | Chromium | Covered in [e2e/editor.groups.layers.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.layers.spec.ts) |
| LY-08 | Layers | Descendant selected | Inspect ancestor row | Ancestor shows contains-selection styling | No document mutation | user-flow | Chromium | Covered in [e2e/editor.groups.layers.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.layers.spec.ts) |
| LY-09 | Layers | Row visible | Click delete button | Row disappears | Node deleted | user-flow | Chromium | Covered in [e2e/editor.groups.layers.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.layers.spec.ts) |
| LY-10 | Layers | Selection exists | Use Bring front / Forward / Backward / Send back | Row order changes | Node(s) reordered | user-flow | Chromium | Covered in [e2e/editor.groups.layers.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.layers.spec.ts) |
| LY-11 | Layers | Group selected | Reorder group row | Group moves as unit | Group node reordered as a unit | user-flow | Chromium | Covered in [e2e/editor.groups.layers.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.layers.spec.ts) |
| LY-12 | Layers | Any state | Edit canvas background | Background swatch/value updates | Canvas background changes | user-flow | Chromium | Covered in [e2e/editor.groups.layers.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.layers.spec.ts) |

## 9. Properties and Inspector Flows

| ID | Entry | Preconditions | Steps | Visible Result | State Result | Class | Scope | Current Coverage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PI-01 | Properties | Nothing selected | Open Properties | Empty state visible | No mutation | user-flow | Chromium | Covered in [e2e/editor.properties.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.properties.spec.ts) |
| PI-02 | Properties | Group selected | Inspect panel | Group-only controls visible | No mutation | user-flow | Chromium | Covered in [e2e/editor.groups.layers.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.layers.spec.ts) |
| PI-03 | Properties | Group selected | Edit Group Opacity | Slider/value updates | Group opacity changes and persists | user-flow | Chromium | Covered in [e2e/editor.groups.layers.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.layers.spec.ts) |
| PI-04 | Properties | Multi-selection active | Inspect panel | Multi-selection heading and exact shared controls visible | No mutation | user-flow | Chromium | Covered in [e2e/editor.groups.layers.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.layers.spec.ts), [e2e/editor.properties.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.properties.spec.ts) |
| PI-05 | Properties | Multi-selection active | Edit shared opacity | Value updates | Selected items opacity changes | user-flow | Chromium | Covered in [e2e/editor.properties.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.properties.spec.ts) |
| PI-06 | Properties | Text selected | Edit content/font/style/alignment/advanced text | Visible text controls update | Text item updates | user-flow | Chromium | Covered in [e2e/editor.properties.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.properties.spec.ts) |
| PI-07 | Properties | Shape selected | Edit fill/stroke/main controls | Visible controls update | Shape item updates | user-flow | Chromium | Covered in [e2e/editor.properties.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.properties.spec.ts) |
| PI-08 | Properties | Line selected | Edit stroke and endpoints | Visible controls update | Line item updates | user-flow | Chromium | Covered in [e2e/editor.properties.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.properties.spec.ts) |
| PI-09 | Properties | Image selected | Edit opacity/preserve aspect/adjustments | Visible controls update | Image item updates | user-flow | Chromium | Covered in [e2e/editor.properties.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.properties.spec.ts) |
| PI-10 | Properties | Any item selected | Edit geometry fields | Values update | Item geometry updates | user-flow | Chromium | Covered in [e2e/editor.properties.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.properties.spec.ts) |
| PI-11 | Properties | Any item selected | Edit shadow fields | Values update | Item shadow updates | user-flow | Chromium | Covered in [e2e/editor.properties.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.properties.spec.ts) |

## 10. Favorite Library Flows

| ID | Entry | Preconditions | Steps | Visible Result | State Result | Class | Scope | Current Coverage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TL-01 | Properties | Any node selected | Click Save as favorite | `Favorite added` pop-up appears and favorite card appears in Favorites | Favorite stored in local library | user-flow | Chromium | Covered in [e2e/editor.favorites.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.favorites.spec.ts) |
| TL-02 | Favorites | Saved favorite exists | Open Favorites tab | Saved favorite card visible | No document mutation | user-flow | Chromium | Covered in [e2e/editor.favorites.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.favorites.spec.ts) |
| TL-03 | Favorites | Saved favorite exists | Click favorite card | New content appears on canvas and in Layers | Favorite nodes inserted and selected | user-flow | Chromium | Covered in [e2e/editor.favorites.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.favorites.spec.ts) |
| TL-04 | Favorites + Browser reload | Saved favorite exists | Reload, delete favorite, reload | Favorite persists across reload and then disappears after deletion | Local favorite library round-trips | user-flow | Chromium | Covered in [e2e/editor.favorites.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.favorites.spec.ts) |
| TL-05 | Favorites + Browser reload | Saved favorite references an uploaded font but current canvas no longer does | Reload, verify current canvas font menu, then insert favorite | Uploaded family is absent before insertion, then inserted text shows the uploaded family with no missing-font warning | Favorite insertion lazily rehydrates the retained uploaded font from local storage | user-flow | Cross-browser subset | Covered in [e2e/editor.favorites.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.favorites.spec.ts) |

## 11. Keyboard Flows

| ID | Entry | Preconditions | Steps | Visible Result | State Result | Class | Scope | Current Coverage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| KB-01 | Keyboard | Any non-editable state | Press V/H/Z/T/R/O/L | Active tool changes | Tool state updated | user-flow | Cross-browser subset | Covered in [e2e/editor.shortcuts.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.shortcuts.spec.ts) |
| KB-02 | Keyboard | Selection exists | Press Delete/Backspace | Selected affordance disappears | Selection deleted | user-flow | Cross-browser subset | Covered in [e2e/editor.shortcuts.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.shortcuts.spec.ts) |
| KB-03 | Keyboard | Selection exists | Press Cmd/Ctrl+D | Clone appears and is selected | Selection duplicated | user-flow | Cross-browser subset | Covered in [e2e/editor.shortcuts.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.shortcuts.spec.ts) |
| KB-04 | Keyboard | Valid sibling selection | Press Cmd/Ctrl+G | Group affordance appears | Group created | user-flow | Cross-browser subset | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| KB-05 | Keyboard | Group selected | Press Shift+Cmd/Ctrl+G | Group affordance disappears | Group ungrouped | user-flow | Cross-browser subset | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts) |
| KB-06 | Keyboard | Selection exists | Press arrow keys | Visible position shifts | Selection nudged | user-flow | Cross-browser subset | Covered in [e2e/editor.shortcuts.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.shortcuts.spec.ts) |
| KB-07 | Keyboard | Selection exists | Press Shift+arrow | Visible position shifts by larger amount | Selection nudged by larger increment | user-flow | Chromium | Covered in [e2e/editor.shortcuts.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.shortcuts.spec.ts) |
| KB-08 | Keyboard | Selection exists | Press Cmd/Ctrl+ArrowUp/Down | Layer order or visible stacking changes | Selection reordered | user-flow | Cross-browser subset | Covered in [e2e/editor.shortcuts.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.shortcuts.spec.ts) |
| KB-09 | Keyboard | Selection exists | Press Shift+Cmd/Ctrl+ArrowUp/Down | Layer order changes to front/back | Selection reordered to edge | user-flow | Chromium | Covered in [e2e/editor.shortcuts.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.shortcuts.spec.ts) |
| KB-10 | Keyboard | Any non-editable state | Press Cmd/Ctrl+A | All top-level nodes visibly selected | Selection becomes all top-level selectable nodes | user-flow | Cross-browser subset | Covered in [e2e/editor.shortcuts.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.shortcuts.spec.ts) |
| KB-11 | Keyboard | Selection or drill-in state exists | Press Escape | Selection climbs or clears visibly | Parent selected or selection cleared | user-flow | Cross-browser subset | Covered in [e2e/editor.groups.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.groups.spec.ts), [e2e/editor.shortcuts.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.shortcuts.spec.ts) |
| KB-12 | Keyboard | History exists | Press undo/redo shortcuts | Visible state rewinds or reapplies | History changes applied | user-flow | Cross-browser subset | Covered in [e2e/editor.shortcuts.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.shortcuts.spec.ts) |

## 12. Clipboard Flows

| ID | Entry | Preconditions | Steps | Visible Result | State Result | Class | Scope | Current Coverage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CB-01 | Clipboard | Selection exists | Copy | No visible mutation | App clipboard payload written | user-flow | Cross-browser subset | Covered in [e2e/editor.shortcuts.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.shortcuts.spec.ts) |
| CB-02 | Clipboard | Selection exists | Cut | Selection disappears | Nodes removed and payload written | user-flow | Cross-browser subset | Covered in [e2e/editor.shortcuts.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.shortcuts.spec.ts) |
| CB-03 | Clipboard | Clipboard contains app payload | Paste | Clone appears and is selected | Nodes inserted | user-flow | Cross-browser subset | Covered in [e2e/editor.shortcuts.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.shortcuts.spec.ts) |
| CB-04 | Clipboard | Same payload pasted repeatedly | Paste twice or more | Clones offset each time | Cumulative offset increases | user-flow | Chromium | Covered in [e2e/editor.shortcuts.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.shortcuts.spec.ts) |
| CB-05 | Clipboard | Group selected | Copy/cut/paste | Group subtree appears correctly | Group subtree duplicated or restored | user-flow | Cross-browser subset | Covered in [e2e/editor.shortcuts.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.shortcuts.spec.ts) |
| CB-06 | Clipboard | App payload and stale image both exist | Paste | App content wins | App nodes inserted, image ignored | user-flow | Chromium | Covered in [e2e/editor.shortcuts.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.shortcuts.spec.ts) |
| CB-07 | Clipboard | Image file in clipboard | Paste | New image item appears | Image inserted | user-flow | Cross-browser subset | Covered in [e2e/editor.shortcuts.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.shortcuts.spec.ts) |
| CB-08 | Clipboard | Editable target focused | Copy/cut/paste | Editor does not hijack editable interaction | No editor mutation | user-flow | Chromium | Covered in [e2e/editor.shortcuts.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.shortcuts.spec.ts) |

## 13. File, Media, and Font Flows

| ID | Entry | Preconditions | Steps | Visible Result | State Result | Class | Scope | Current Coverage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FL-01 | Toolbar/File | Any state | Open project file | Layers/canvas update | Document loaded | user-flow | Chromium | Covered in [e2e/editor.files-and-persistence.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.files-and-persistence.spec.ts) |
| FL-02 | Toolbar/File | Any state | Save project file | Download occurs | Project serialized | user-flow | Chromium | Covered in [e2e/editor.files-and-persistence.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.files-and-persistence.spec.ts) |
| FL-03 | Toolbar | Any state | New project | Canvas clears | Document reset | user-flow | Chromium | Covered in [e2e/editor.files-and-persistence.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.files-and-persistence.spec.ts) |
| FL-04 | Toolbar | Any state | Export PNG | Download occurs | PNG exported | user-flow | Chromium | Covered in [e2e/editor.files-and-persistence.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.files-and-persistence.spec.ts) |
| FL-05 | Toolbar/File | Any state | Upload image | Image row and image item appear | Image node added | user-flow | Chromium | Covered in [e2e/editor.files-and-persistence.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.files-and-persistence.spec.ts) |
| FL-06 | Toolbar/File | Text selected | Upload font, select it, reload | Font picker keeps the uploaded family and no missing-font warning appears | Text font changes and persisted uploaded font rehydrates for reload | user-flow | Chromium | Covered in [e2e/editor.files-and-persistence.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.files-and-persistence.spec.ts) |
| FL-07 | File + Browser reload | Grouped project exists | Save, reopen, reload | Layers and group affordances restore | Grouped document round-trips | user-flow | Chromium | Covered in [e2e/editor.files-and-persistence.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.files-and-persistence.spec.ts) |
| FL-08 | IndexedDB | Persisted state exists | Reload app | Visible state restores, uploaded fonts rehydrate if still referenced, and unused uploaded fonts disappear after reload | Persisted state and retained uploaded-font assets load from local storage | user-flow | Chromium | Covered in [e2e/editor.files-and-persistence.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.files-and-persistence.spec.ts) |
| FL-09 | IndexedDB | Corrupt persisted state exists | Reload app | Safe empty state loads | Corrupt persistence cleared | user-flow | Chromium | Covered in [e2e/editor.files-and-persistence.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.files-and-persistence.spec.ts) |
| FL-10 | Toolbar | Any state | Hover or focus Export PNG | Workspace outside the canvas darkens while the canvas interior stays clear | Export bounds cue appears and clears with intent state | user-flow | Chromium | Covered in [e2e/editor.toolbar.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.toolbar.spec.ts) |

## 14. UI Regression Matrix

These are state snapshots and affordance checks, not just behavior checks.

| ID | State | Required Visible Assertions | Current Coverage |
| --- | --- | --- | --- |
| UI-01 | Top-level group selected | Group border visible, group handles visible, rotater visible, no child-only handles | Covered in [e2e/editor.visual.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.visual.spec.ts) |
| UI-02 | Drilled-in child selected | Child manipulator visible, parent group border or subgroup outline visible if intended, group handles inactive | Covered in [e2e/editor.visual.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.visual.spec.ts) |
| UI-03 | Nested group selected | Correct nested group affordance visible | Covered in [e2e/editor.visual.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.visual.spec.ts) |
| UI-04 | Nested drilled-in child selected | Correct child manipulator plus ancestor outline state | Covered in [e2e/editor.visual.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.visual.spec.ts) |
| UI-05 | Temporary multi-selection selected | Shared overlay visible, correct group handles/rotater visible | Covered in grouped regression and visual suites |
| UI-06 | Line selected | Line handles visible, no shape handles | Covered in [e2e/editor.visual.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.visual.spec.ts) |
| UI-07 | Text selected | Text item affordance visible, no group-only controls | Covered in [e2e/editor.visual.spec.ts](/home/mikek/src/billboard-builder/e2e/editor.visual.spec.ts) |
| UI-08 | Rotated group selected | Rotated group overlay remains coherent | Covered in rotated suites |
| UI-09 | Rotated group live drag/resize/rotate preview | Preview overlay remains coherent throughout gesture | Covered in rotated suites |

## Current Critical Gaps

No current critical matrix gaps remain in the planned rollout.

Non-critical deferred scenarios can still exist elsewhere in the matrix when the browser entrypoint conflicts with current product semantics, such as `CS-10`.

## Patch Closeout Template

For any interaction-heavy patch, include this in the final summary:

- `User flows proven:` list exact matrix IDs now covered by browser `user-flow` tests
- `Still unproven:` list exact matrix IDs still missing or only partially covered
- `Indirect only:` list tests that exist as support or geometry checks but do not count as UI proof

## Ownership Note

- Update this matrix whenever interaction behavior changes, browser coverage changes, or a scenario moves from `missing` to covered.
- Do not collapse this into a generic test checklist. Its purpose is to track real user flows and prevent false confidence.
