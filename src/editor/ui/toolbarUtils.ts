export function joinClassNames(...classNames: Array<string | false | null | undefined>) {
  return classNames.filter(Boolean).join(' ');
}

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

export const modKey = isMac ? '⌘' : 'Ctrl';
