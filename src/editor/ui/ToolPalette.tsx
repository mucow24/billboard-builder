import { useEffect, useRef, useState } from 'react';

import { getAllGenerators } from '../generators';
import type { CanvasTool } from '../document/documentTypes';
import { GENERATOR_ICONS } from './ToolbarMenus';

const TOOLS: Array<{ id: CanvasTool; label: string; hotkey: string; icon: string }> = [
  { id: 'select', label: 'Select', hotkey: 'V', icon: '↖' },
  { id: 'pan', label: 'Hand', hotkey: 'H', icon: '✋' },
  { id: 'zoom', label: 'Zoom', hotkey: 'Z', icon: '⌕' },
  { id: 'text', label: 'Text', hotkey: 'T', icon: 'T' },
  { id: 'rectangle', label: 'Rect', hotkey: 'R', icon: '▭' },
  { id: 'ellipse', label: 'Ellipse', hotkey: 'O', icon: '◯' },
  { id: 'ngon', label: 'Polygon', hotkey: 'G', icon: '⬡' },
  { id: 'line', label: 'Line', hotkey: 'L', icon: '／' },
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
          <span className="tool-button-icon" aria-hidden="true">
            {tool.icon}
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
        <span className="tool-button-icon tool-button-svg-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20">
            <rect x="3.5" y="4.5" width="13" height="11" rx="1.5" />
            <path d="m6 12 2.4-2.5 2.3 2.2 2.8-3 2.5 3.3" />
            <path d="M7 8h.01" />
          </svg>
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
          <span className="tool-button-icon tool-button-svg-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20">
              <path d="M10 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
            </svg>
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
