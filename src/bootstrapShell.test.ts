import { describe, expect, it, vi } from 'vitest';

import {
  BOOT_SHELL_ID,
  removeBootShell,
  scheduleBootShellRemoval,
} from './bootstrapShell';

describe('bootstrap shell helpers', () => {
  it('removes the boot shell when asked directly', () => {
    document.body.innerHTML = `
      <div id="${BOOT_SHELL_ID}"></div>
      <div id="root"></div>
    `;

    removeBootShell(document);

    expect(document.getElementById(BOOT_SHELL_ID)).not.toBeInTheDocument();
  });

  it('removes the boot shell on the next animation frame', () => {
    document.body.innerHTML = `
      <div id="${BOOT_SHELL_ID}"></div>
      <div id="root"></div>
    `;
    const raf = vi.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    scheduleBootShellRemoval(document, raf as typeof requestAnimationFrame);

    expect(raf).toHaveBeenCalledTimes(1);
    expect(document.getElementById(BOOT_SHELL_ID)).not.toBeInTheDocument();
  });
});
