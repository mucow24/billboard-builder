import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDefaultProjectDocument, createRectangleItem } from '../model/defaults';
import {
  AUTOSAVE_KEY,
  downloadProject,
  readAutosave,
  readProjectFile,
  saveAutosave,
} from './projectFile';

describe('project file helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips autosave documents through localStorage', () => {
    const projectDocument = createDefaultProjectDocument();
    projectDocument.items = [createRectangleItem()];

    saveAutosave(projectDocument);

    expect(readAutosave()).toEqual(projectDocument);
  });

  it('clears invalid autosave payloads instead of throwing', () => {
    localStorage.setItem(AUTOSAVE_KEY, '{oops');

    expect(readAutosave()).toBeNull();
    expect(localStorage.getItem(AUTOSAVE_KEY)).toBeNull();
  });

  it('parses saved project files from uploaded JSON', async () => {
    const projectDocument = createDefaultProjectDocument();
    projectDocument.items = [createRectangleItem()];
    const file = new File([JSON.stringify(projectDocument)], 'billboard-project.json', {
      type: 'application/json',
    });
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: () => Promise.resolve(JSON.stringify(projectDocument)),
    });

    await expect(readProjectFile(file)).resolves.toEqual(projectDocument);
  });

  it('downloads the current project as a JSON blob', async () => {
    const projectDocument = createDefaultProjectDocument();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn().mockReturnValue('blob:test'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    const click = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createElement = vi.spyOn(document, 'createElement');

    createElement.mockImplementation((tagName: string) => {
      if (tagName !== 'a') {
        return originalCreateElement(tagName);
      }
      return {
        click,
        download: '',
        href: '',
      } as unknown as HTMLAnchorElement;
    });

    downloadProject(projectDocument);

    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
});
