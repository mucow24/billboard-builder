import type { GeneratorParams } from '../document/documentTypes';

import { bandsGeneratorSpec } from './bandsGenerator';
import { burstGeneratorSpec } from './burstGenerator';
import { flatGridGeneratorSpec } from './flatGridGenerator';
import { noiseGeneratorSpec } from './noiseGenerator';
import { perspectiveGridGeneratorSpec } from './perspectiveGridGenerator';
import { scanlinesGeneratorSpec } from './scanlinesGenerator';
import { shapesGeneratorSpec } from './shapesGenerator';
import { vignetteGeneratorSpec } from './vignetteGenerator';
import { zigzagsGeneratorSpec } from './zigzagsGenerator';

export interface ToggleOption {
  key: string;
  label: string;
  icon?: string;
}

/** Slider and text-box limits of a numeric field; anything left out keeps the field's fixed value. */
export interface GeneratorFieldBounds {
  min?: number;
  max?: number;
  textMin?: number;
  textMax?: number;
}

export interface GeneratorFieldBoundsContext {
  /** Size of the document canvas, which is the area a generator draws across. */
  canvasWidth: number;
  canvasHeight: number;
  params: GeneratorParams;
}

export interface GeneratorFieldSpec {
  key: string;
  label: string;
  /** One or two sentences explaining the field, shown when the pointer rests on its label. */
  tooltip?: string;
  /** Limits that depend on the canvas size or on the layer's other settings. */
  getBounds?: (context: GeneratorFieldBoundsContext) => GeneratorFieldBounds;
  type: 'color' | 'range' | 'optionalNumber' | 'toggleGroup';
  min?: number;
  max?: number;
  textMin?: number;
  textMax?: number;
  step?: number;
  options?: ToggleOption[];
}

export interface GeneratorSpec<TParams extends GeneratorParams = GeneratorParams> {
  type: TParams['generatorType'];
  label: string;
  fields: GeneratorFieldSpec[];
  createDefaultParams(): TParams;
  draw(ctx: CanvasRenderingContext2D, width: number, height: number, params: TParams, seed: number): void;
}

const generators: Record<string, GeneratorSpec> = {
  bands: bandsGeneratorSpec,
  burst: burstGeneratorSpec,
  zigzags: zigzagsGeneratorSpec,
  flatGrid: flatGridGeneratorSpec,
  perspectiveGrid: perspectiveGridGeneratorSpec,
  scanlines: scanlinesGeneratorSpec,
  noise: noiseGeneratorSpec,
  vignette: vignetteGeneratorSpec,
  shapes: shapesGeneratorSpec,
};

export function getGenerator(type: string): GeneratorSpec | undefined {
  return generators[type];
}

export function getAllGenerators(): GeneratorSpec[] {
  return Object.values(generators);
}
