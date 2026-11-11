export const BOOT_SHELL_ID = 'boot-shell';

/** Removes the boot spinner that `index.html` shows until the editor is ready. */
export function removeBootShell(doc: Document = document): void {
  doc.getElementById(BOOT_SHELL_ID)?.remove();
}
