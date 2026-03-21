export const BOOT_SHELL_ID = 'boot-shell';

export function removeBootShell(doc: Document = document): void {
  doc.getElementById(BOOT_SHELL_ID)?.remove();
}

export function scheduleBootShellRemoval(
  doc: Document = document,
  raf: typeof requestAnimationFrame = requestAnimationFrame,
): void {
  raf(() => {
    removeBootShell(doc);
  });
}
