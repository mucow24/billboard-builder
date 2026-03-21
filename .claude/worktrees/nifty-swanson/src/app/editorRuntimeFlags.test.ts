import { describe, expect, it } from 'vitest';

import { resolveEditorRuntimeFlags } from './editorRuntimeFlags';

describe('resolveEditorRuntimeFlags', () => {
  it('disables debug mode by default', () => {
    expect(resolveEditorRuntimeFlags({ mode: 'development', search: '' })).toEqual({
      debugMode: false,
      enableCanvasTestHooks: false,
      useStrictMode: true,
    });
  });

  it('enables debug mode in test runtime', () => {
    expect(resolveEditorRuntimeFlags({ mode: 'test', search: '' })).toEqual({
      debugMode: true,
      enableCanvasTestHooks: true,
      useStrictMode: true,
    });
  });

  it('enables debug mode from the explicit query parameter', () => {
    expect(
      resolveEditorRuntimeFlags({
        mode: 'development',
        search: '?bb-test=1',
      }),
    ).toEqual({
      debugMode: true,
      enableCanvasTestHooks: true,
      useStrictMode: true,
    });
  });

  it('disables strict mode and test hooks in optimized runtime', () => {
    expect(resolveEditorRuntimeFlags({ mode: 'optimized', search: '' })).toEqual({
      debugMode: false,
      enableCanvasTestHooks: false,
      useStrictMode: false,
    });
  });

  it('keeps the test harness available when explicitly requested in optimized runtime', () => {
    expect(
      resolveEditorRuntimeFlags({
        mode: 'optimized',
        search: '?bb-test=1',
      }),
    ).toEqual({
      debugMode: true,
      enableCanvasTestHooks: true,
      useStrictMode: false,
    });
  });
});
