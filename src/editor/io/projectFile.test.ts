import { describe, expect, it, vi } from 'vitest';

import { createDefaultProjectDocument, createRectangleItem } from '../document/documentDefaults';
import { normalizeProjectDocument } from '../document/documentNormalizer';
import { downloadProject, readProjectFile } from './projectFile';

describe('project file helpers', () => {

  it('parses saved project files from uploaded JSON', async () => {
    const projectDocument = createDefaultProjectDocument();
    projectDocument.nodes = [createRectangleItem()];
    const expectedDocument = normalizeProjectDocument(projectDocument);
    const file = new File([JSON.stringify(projectDocument)], 'billboard-project.json', {
      type: 'application/json',
    });
    Object.defineProperty(file, 'text', {
      configurable: true,
      value: () => Promise.resolve(JSON.stringify(projectDocument)),
    });

    await expect(readProjectFile(file)).resolves.toEqual(expectedDocument);
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
