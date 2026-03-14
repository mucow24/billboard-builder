import { expect, test as base } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, runPage) => {
    const failures: string[] = [];

    page.on('pageerror', (error) => {
      failures.push(`pageerror: ${error.message}`);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') {
        failures.push(`console.error: ${message.text()}`);
      }
    });

    await runPage(page);

    expect(failures).toEqual([]);
  },
});

export { expect };
