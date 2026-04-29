# Konva → PixiJS Migration Plan

## Why

Canvas2D (Konva) antialiases each shape edge independently. At shared edges
between adjacent shapes, this produces a visible 1px seam. No Canvas2D
workaround fully solves this for semi-transparent/gradient fills.

WebGL (PixiJS) uses GPU rasterization with MSAA. The GPU's top-left rule
guarantees complementary coverage at shared edges — every subsample belongs
to exactly one shape. Coverage sums to 1.0. No seam. No workarounds.

**Validated**: `poc/pixi-seam-test.html` confirms zero seams at all zoom
levels, with rotation, for both solid semi-transparent and gradient fills.

## Scope

~25 files import from `konva` or `react-konva`. The migration replaces the
rendering layer while keeping the document model, interaction state machine,
and business logic unchanged.

### Files to replace (rendering layer)

| File | Role | PixiJS equivalent |
|------|------|-------------------|
| `CanvasScene.tsx` | Stage/Layer/Group root | `<Application>` + `<Container>` |
| `CanvasItemLayer.tsx` | Item dispatcher + seam grouping | Simple item map (no seam logic needed) |
| `ShapeItemView.tsx` | Rect/Ellipse/Ngon/Text rendering | `Graphics` + `Text` components |
| `LineItemView.tsx` | Line rendering | `Graphics` line |
| `ImageItemNode.tsx` | Image + filters + caching | `Sprite` + filters |
| `CanvasSurface.tsx` | Background/checkerboard | `Graphics` |
| `SingleSelectionOverlay.tsx` | Selection handles | `Graphics` + `Container` |
| `GroupSelectionOverlay.tsx` | Group selection | `Graphics` + `Container` |
| `ImageCropOverlay.tsx` | Crop UI | `Graphics` + `Container` |
| `CanvasGuidesLayer.tsx` | Guide lines | `Graphics` lines |
| `CanvasPreviewLayer.tsx` | Marquee/text preview | `Graphics` |
| `seamExpansion.ts` | Fill expansion hack | **DELETE** |
| `gradientFill.ts` | Gradient math | Replace with `FillGradient` |
| `useBlurEffect.ts` | Custom blur filter | `BlurFilter` |
| `imageAdjustments.ts` | Brightness/contrast/tint | `ColorMatrixFilter` / `AdjustmentFilter` |
| `exportPng.ts` | PNG export | `renderer.extract` |

### Files to keep (renderer-agnostic)

| File | Role | Changes needed |
|------|------|----------------|
| `interactionHitTesting.ts` | Custom hit testing | Minimal — already pure math |
| `useCanvasInteractionSession.ts` | Drag/resize/rotate state machine | Event type changes only |
| `itemPointerHandlers.ts` | Event delegation | Adapt event types |
| `stageHandlers.ts` | Stage-level events | Adapt event types |
| `useCanvasViewport.ts` | Zoom/pan math | None |
| `snapping.ts` | Snap/alignment | None |
| `interactionGeometry.ts` | Selection geometry | None |
| `overlayGeometry.ts` | Handle positions | None |
| `transformGeometry.ts` | Bounding boxes | None |
| `renderAdapter.ts` | Document → renderable | None |
| `renderConstants.ts` | Colors/sizes | None |
| `selectionGeometry.ts` | AABB/intersection | None |
| `textMeasurement.ts` | Text sizing | None |
| `groupTransforms.ts` | Multi-item transforms | None |

## Migration strategy

**Incremental, component-by-component.** Not a big-bang rewrite.

### Phase 1: Scaffold (1-2 days)
1. `npm install pixi.js @pixi/react`
2. Replace `CanvasScene.tsx`: swap Konva `Stage`/`Layer` for PixiJS `Application`/`Container`
3. Get an empty PixiJS canvas rendering in the app
4. Verify zoom/pan still works via container transform

### Phase 2: Shape rendering (3-5 days)
1. Replace `ShapeItemView.tsx` — rectangles, ellipses, ngons, text
2. Replace `gradientFill.ts` with `FillGradient`
3. Replace `CanvasItemLayer.tsx` — simple item map, no seam logic
4. **DELETE** `seamExpansion.ts`
5. Verify: shapes render correctly, gradients work, no seams

### Phase 3: Images and effects (2-3 days)
1. Replace `ImageItemNode.tsx` with `Sprite` + texture loading
2. Replace `useBlurEffect.ts` with `BlurFilter`
3. Replace `imageAdjustments.ts` with PixiJS color filters
4. Replace `CanvasSurface.tsx` (background, checkerboard)
5. Verify: images display, blur/shadow/brightness work

### Phase 4: Overlays and interaction (2-3 days)
1. Replace selection overlays (Single, Group, Crop)
2. Replace guide lines and preview layers
3. Adapt event handlers (`KonvaEventObject` → PixiJS `FederatedPointerEvent`)
4. Verify: select, drag, resize, rotate, crop all work

### Phase 5: Export and cleanup (1-2 days)
1. Replace `exportPng.ts` with `renderer.extract`
2. Remove `konva` and `react-konva` from `package.json`
3. Run full test suite, update tests
4. Run e2e tests

## Key decisions

- **React binding**: Use `@pixi/react` (official v8 bindings)
- **Text**: Use PixiJS `Text` (Canvas-rasterized). Upgrade to MSDF/BitmapText later if needed.
- **Gradients**: Use `FillGradient` (native). Fall back to Canvas2D texture if API issues.
- **Events**: PixiJS `FederatedPointerEvent` maps cleanly to our existing pointer handlers.
- **Export**: `renderer.extract.canvas()` → `canvas.toDataURL()`. Same flow, different API.

## What gets simpler

- **No seam expansion** — `seamExpansion.ts` deleted entirely
- **No seam-safe grouping** — `buildSeamRuns`, `SeamSafeGroup`, `hasSemiTransparentFill` all deleted
- **No custom sceneFunc** — no `rectSceneFunc`, `ellipseSceneFunc`, `ngonSceneFunc`
- **No composite operation hacks** — no `lighter`, no `compositeOperation` prop threading
- **No custom blur filter** — no `nativeBlur`, no canvas pooling, no throttled caching
- **Gradients are declarative** — `FillGradient` replaces `buildGradientFillProps` math
- **Blur/shadow are one-liners** — `new BlurFilter()`, `new DropShadowFilter()`

## Estimated effort

4-6 weeks total. Can be done incrementally — the app stays functional between phases.
