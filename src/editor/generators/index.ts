import type { GeneratorParams } from '../document/documentTypes';

import { bandsGeneratorSpec } from './bandsGenerator';

export interface GeneratorFieldSpec {
  key: string;
  label: string;
  type: 'color' | 'range' | 'optionalNumber';
  min?: number;
  max?: number;
  step?: number;
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
};

export function getGenerator(type: string): GeneratorSpec | undefined {
  return generators[type];
}

export function getAllGenerators(): GeneratorSpec[] {
  return Object.values(generators);
}
