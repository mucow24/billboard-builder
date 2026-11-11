import { describe, expect, it } from 'vitest';

import { BOOT_SHELL_ID, removeBootShell } from './bootstrapShell';

describe('bootstrap shell helpers', () => {
  it('removes the boot shell when asked directly', () => {
    document.body.innerHTML = `
      <div id="${BOOT_SHELL_ID}"></div>
      <div id="root"></div>
    `;

    removeBootShell(document);

    expect(document.getElementById(BOOT_SHELL_ID)).not.toBeInTheDocument();
  });
});
