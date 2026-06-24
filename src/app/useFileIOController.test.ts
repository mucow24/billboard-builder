import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDefaultProjectDocument } from '../editor/document/documentDefaults';
import type { ProjectDocument } from '../editor/document/documentTypes';
import type { SvgExportWarning } from '../editor/io/svg/svgExportTypes';
import { runSvgExport } from '../editor/io/svg/browserSvgExport';
import { downloadSvg } from '../editor/io/svg/downloadSvg';
import { useFileIOController } from './useFileIOController';

vi.mock('../editor/io/svg/browserSvgExport', () => ({ runSvgExport: vi.fn() }));
vi.mock('../editor/io/svg/downloadSvg', () => ({ downloadSvg: vi.fn() }));

const runSvgExportMock = vi.mocked(runSvgExport);
const downloadSvgMock = vi.mocked(downloadSvg);

// useFileIOController is a plain factory (no React hooks), so it can be called directly.
function makeController(document: ProjectDocument) {
  const setErrorMessage = vi.fn();
  // useFileIOController is a plain factory despite its name — it calls no React hooks.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const controller = useFileIOController({
    document,
    addImageItem: vi.fn(),
    loadDocument: vi.fn(),
    resetDocument: vi.fn(),
    setActiveTool: vi.fn(),
    setErrorMessage,
  });
  return { controller, setErrorMessage };
}

const warning: SvgExportWarning = {
  kind: 'unvectorizable-text',
  itemId: 't',
  itemName: 'Headline',
  fontFamily: 'Arial',
  reason: 'system-font',
};

describe('handleExportSvg', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('downloads a .svg named from the document when there are no warnings', async () => {
    runSvgExportMock.mockResolvedValue({ svg: '<svg/>', warnings: [] });
    const { controller, setErrorMessage } = makeController({
      ...createDefaultProjectDocument(),
      name: 'banner',
    });

    const ok = await controller.handleExportSvg();

    expect(ok).toBe(true);
    expect(downloadSvgMock).toHaveBeenCalledWith('<svg/>', 'banner.svg');
    expect(setErrorMessage).toHaveBeenCalledWith(null);
  });

  it('blocks the download and surfaces a warning naming the offending layers', async () => {
    runSvgExportMock.mockResolvedValue({ svg: '<svg/>', warnings: [warning] });
    const { controller, setErrorMessage } = makeController(createDefaultProjectDocument());

    const ok = await controller.handleExportSvg();

    expect(ok).toBe(false);
    expect(downloadSvgMock).not.toHaveBeenCalled();
    expect(setErrorMessage).toHaveBeenCalledWith(expect.stringContaining('Headline'));
  });

  it('reports an error when export throws', async () => {
    runSvgExportMock.mockRejectedValue(new Error('boom'));
    const { controller, setErrorMessage } = makeController(createDefaultProjectDocument());

    const ok = await controller.handleExportSvg();

    expect(ok).toBe(false);
    expect(setErrorMessage).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });
});
