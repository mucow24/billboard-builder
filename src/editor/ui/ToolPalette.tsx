import { useEffect, useRef, useState } from 'react';
import {
  CircleIcon,
  Component1Icon,
  CursorArrowIcon,
  HandIcon,
  ImageIcon,
  MagnifyingGlassIcon,
  MixIcon,
  SlashIcon,
  SquareIcon,
  TextIcon,
  VercelLogoIcon,
} from '@radix-ui/react-icons';

import { getAllGenerators } from '../generators';
import type { CanvasTool } from '../document/documentTypes';
import { GENERATOR_ICONS } from './ToolbarMenus';

type IconComponent = typeof CursorArrowIcon;

const TOOLS: Array<{ id: CanvasTool; label: string; hotkey: string; Icon: IconComponent }> = [
  { id: 'select', label: 'Select', hotkey: 'V', Icon: CursorArrowIcon },
  { id: 'pan', label: 'Hand', hotkey: 'H', Icon: HandIcon },
  { id: 'zoom', label: 'Zoom', hotkey: 'Z', Icon: MagnifyingGlassIcon },
  { id: 'text', label: 'Text', hotkey: 'T', Icon: TextIcon },
  { id: 'rectangle', label: 'Rect', hotkey: 'R', Icon: SquareIcon },
  { id: 'ellipse', label: 'Ellipse', hotkey: 'O', Icon: CircleIcon },
  { id: 'ngon', label: 'N-gon', hotkey: 'G', Icon: VercelLogoIcon },
  { id: 'polygon', label: 'Polygon', hotkey: 'P', Icon: Component1Icon },
  { id: 'line', label: 'Line', hotkey: 'L', Icon: SlashIcon },
];

interface ToolPaletteProps {
  activeTool: CanvasTool;
  onChange: (tool: CanvasTool) => void;
  onImageUpload: () => void;
  onAddGenerator: (generatorType: string) => void;
}

export function ToolPalette({ activeTool, onChange, onImageUpload, onAddGenerator }: ToolPaletteProps) {
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const generatorRef = useRef<HTMLDivElement | null>(null);
  const generatorTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!generatorOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node) || generatorRef.current?.contains(event.target)) return;
      setGeneratorOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setGeneratorOpen(false);
        window.requestAnimationFrame(() => generatorTriggerRef.current?.focus());
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [generatorOpen]);

  return (
    <div className="tool-palette" role="toolbar" aria-label="Tools">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          className={tool.id === activeTool ? 'tool-button active' : 'tool-button'}
          type="button"
          onClick={() => {
            onChange(tool.id);
          }}
          aria-label={`${tool.label} (${tool.hotkey})`}
          title={`${tool.label} (${tool.hotkey})`}
          aria-pressed={tool.id === activeTool}
        >
          <span className="tool-button-icon tool-button-radix-icon" aria-hidden="true">
            <tool.Icon width={20} height={20} />
          </span>
          <span className="sr-only">{tool.label}</span>
        </button>
      ))}

      <div className="tool-palette-divider" aria-hidden="true" />

      <button
        type="button"
        className="tool-button"
        aria-label="Add image"
        title="Add image"
        onClick={onImageUpload}
      >
        <span className="tool-button-icon tool-button-radix-icon" aria-hidden="true">
          <ImageIcon width={20} height={20} />
        </span>
      </button>

      <div className="tool-palette-divider" aria-hidden="true" />

      <div ref={generatorRef} className="tool-palette-popover">
        <button
          ref={generatorTriggerRef}
          type="button"
          className={generatorOpen ? 'tool-button active' : 'tool-button'}
          aria-label="Add generator"
          title="Add generator"
          aria-expanded={generatorOpen}
          onClick={() => setGeneratorOpen((open) => !open)}
        >
          <span className="tool-button-icon tool-button-radix-icon" aria-hidden="true">
            <MixIcon width={20} height={20} />
          </span>
        </button>
        {generatorOpen ? (
          <div className="tool-palette-popup" role="group" aria-label="Generator types">
            {getAllGenerators().map((spec) => (
              <button
                key={spec.type}
                type="button"
                className="tool-palette-popup-item"
                onClick={() => {
                  onAddGenerator(spec.type);
                  setGeneratorOpen(false);
                }}
              >
                <span className="tool-palette-popup-icon" aria-hidden="true">
                  <svg viewBox="0 0 20 20">
                    {GENERATOR_ICONS[spec.type]}
                  </svg>
                </span>
                <span>{spec.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
