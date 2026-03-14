import '@testing-library/jest-dom';
import { vi } from 'vitest';

class TestFontFace {
  family: string;
  source: string | ArrayBuffer;

  constructor(family: string, source: string | ArrayBuffer) {
    this.family = family;
    this.source = source;
  }

  async load() {
    return this;
  }
}

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: {
    add: vi.fn(),
  },
});

vi.stubGlobal('FontFace', TestFontFace);
