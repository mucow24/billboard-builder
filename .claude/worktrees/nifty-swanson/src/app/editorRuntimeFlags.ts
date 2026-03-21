export interface EditorRuntimeFlags {
  debugMode: boolean;
  enableCanvasTestHooks: boolean;
  useStrictMode: boolean;
}

interface ResolveEditorRuntimeFlagsArgs {
  mode?: string;
  search?: string;
}

function normalizeSearch(search = '') {
  return search.startsWith('?') ? search.slice(1) : search;
}

export function resolveEditorRuntimeFlags({
  mode,
  search,
}: ResolveEditorRuntimeFlagsArgs): EditorRuntimeFlags {
  const params = new URLSearchParams(normalizeSearch(search));
  const isTestHarnessMode = mode === 'test' || params.get('bb-test') === '1';

  return {
    debugMode: isTestHarnessMode,
    enableCanvasTestHooks: isTestHarnessMode,
    useStrictMode: mode !== 'optimized',
  };
}

export function readEditorRuntimeFlags(): EditorRuntimeFlags {
  return resolveEditorRuntimeFlags({
    mode: import.meta.env.MODE,
    search: typeof window === 'undefined' ? '' : window.location.search,
  });
}
