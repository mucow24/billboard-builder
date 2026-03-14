import { expect, type Locator, type Page } from '@playwright/test';

interface ClientRectJson {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StageDebugJson {
  stageSize: {
    width: number;
    height: number;
  };
  activeAnchor: string | null;
  documentItem: Record<string, unknown> | null;
  previewItem: Record<string, unknown> | null;
  nodeClientRect: ClientRectJson | null;
  anchorClientRects: Record<string, ClientRectJson | null> | null;
  lineHandleRects:
    | {
        start: ClientRectJson;
        end: ClientRectJson;
      }
    | null;
}

function getRectCenter(rect: ClientRectJson) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}

export class EditorPage {
  readonly stage: Locator;
  readonly stageShell: Locator;
  readonly canvasFrame: Locator;
  readonly layerRows: Locator;

  constructor(readonly page: Page) {
    this.stage = page.locator('.konvajs-content');
    this.stageShell = page.getByTestId('canvas-transform-debug');
    this.canvasFrame = page.locator('.canvas-frame');
    this.layerRows = page.locator('.layer-row');
  }

  async goto() {
    await this.page.goto('/');
    await expect(this.stage).toBeVisible();
    await this.stage.scrollIntoViewIfNeeded();
  }

  async getStageDebug() {
    const raw = await this.page.getByTestId('stage-debug').textContent();
    if (!raw) {
      throw new Error('Expected stage debug JSON to be present');
    }
    return JSON.parse(raw) as StageDebugJson;
  }

  async getSelectedItemDebug() {
    const raw = await this.page.getByTestId('selected-item-debug').textContent();
    if (!raw) {
      throw new Error('Expected selected item debug JSON to be present');
    }
    return JSON.parse(raw) as StageDebugJson;
  }

  async stageBox() {
    const box = await this.stage.boundingBox();
    if (!box) {
      throw new Error('Missing stage bounds');
    }
    return box;
  }

  async createItem(buttonName: 'Rect' | 'Text' | 'Ellipse' | 'Line') {
    await this.page.locator('.tool-palette').getByRole('button', { name: new RegExp(buttonName) }).click();
  }

  async clickCanvasBackground() {
    const stageBox = await this.stageBox();
    await this.page.mouse.click(stageBox.x + 8, stageBox.y + 8);
  }

  async clickSelectedItemOnCanvas() {
    const debug = await this.getSelectedItemDebug();
    if (!debug.nodeClientRect) {
      throw new Error('Missing selected item bounds');
    }
    const center = getRectCenter(debug.nodeClientRect);
    const stageBox = await this.stageBox();
    await this.page.mouse.click(stageBox.x + center.x, stageBox.y + center.y);
  }

  async dragSelectedItemBy(deltaX: number, deltaY: number) {
    const debug = await this.getSelectedItemDebug();
    if (!debug.nodeClientRect) {
      throw new Error('Missing selected item bounds');
    }
    const center = getRectCenter(debug.nodeClientRect);
    const stageBox = await this.stageBox();

    await this.page.mouse.move(stageBox.x + center.x, stageBox.y + center.y);
    await this.page.mouse.down();
    await this.page.mouse.move(stageBox.x + center.x + deltaX, stageBox.y + center.y + deltaY, {
      steps: 16,
    });
    await this.page.mouse.up();
  }

  async dragSelectedAnchor(anchorName: string, deltaX: number, deltaY: number) {
    const debug = await this.getSelectedItemDebug();
    const anchorRect = debug.anchorClientRects?.[anchorName];
    if (!anchorRect) {
      throw new Error(`Missing ${anchorName} anchor bounds`);
    }
    const center = getRectCenter(anchorRect);
    const stageBox = await this.stageBox();

    await this.page.mouse.move(stageBox.x + center.x, stageBox.y + center.y);
    await this.page.mouse.down();
    await this.page.mouse.move(stageBox.x + center.x + 2, stageBox.y + center.y + 2, {
      steps: 2,
    });
    await this.page.mouse.move(stageBox.x + center.x + deltaX, stageBox.y + center.y + deltaY, {
      steps: 20,
    });
    await this.page.mouse.up();
  }

  async startSelectedAnchorDrag(anchorName: string) {
    const debug = await this.getSelectedItemDebug();
    const anchorRect = debug.anchorClientRects?.[anchorName];
    if (!anchorRect) {
      throw new Error(`Missing ${anchorName} anchor bounds`);
    }
    const center = getRectCenter(anchorRect);
    const stageBox = await this.stageBox();

    await this.page.mouse.move(stageBox.x + center.x, stageBox.y + center.y);
    await this.page.mouse.down();
    await this.page.mouse.move(stageBox.x + center.x + 2, stageBox.y + center.y + 2, {
      steps: 2,
    });

    return {
      stageBox,
      center,
    };
  }

  async moveActiveDragBy(
    dragStart: { stageBox: { x: number; y: number }; center: { x: number; y: number } },
    deltaX: number,
    deltaY: number,
    steps = 1
  ) {
    await this.page.mouse.move(
      dragStart.stageBox.x + dragStart.center.x + deltaX,
      dragStart.stageBox.y + dragStart.center.y + deltaY,
      { steps }
    );
  }

  async finishActiveDrag() {
    await this.page.mouse.up();
  }

  async setCanvasPreset(value: string) {
    await this.page.getByLabel('Canvas preset').selectOption(value);
  }

  async uploadImage(file: { name: string; mimeType: string; buffer: Buffer }) {
    await this.page.getByTestId('image-upload-input').setInputFiles(file);
  }

  async uploadFont(file: { name: string; mimeType: string; buffer: Buffer } | string) {
    await this.page.getByTestId('font-upload-input').setInputFiles(file);
  }

  async openProject(file: { name: string; mimeType: string; buffer: Buffer } | string) {
    await this.page.getByTestId('project-open-input').setInputFiles(file);
  }
}
