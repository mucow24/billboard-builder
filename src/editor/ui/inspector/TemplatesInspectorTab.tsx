import { collectLeafItems } from '../../document/sceneGraph';
import { summarizeTemplateNodes } from '../../document/templateLibrary';

import type { TemplatesInspectorTabProps } from './types';

function buildKindSummary(templatesLeafKinds: string[]) {
  const kindCounts = new Map<string, number>();

  for (const kind of templatesLeafKinds) {
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
  }

  return Array.from(kindCounts.entries())
    .map(([kind, count]) => `${count} ${kind}`)
    .join(' · ');
}

export function TemplatesInspectorTab({
  onDeleteTemplate,
  onInsertTemplate,
  templates,
}: TemplatesInspectorTabProps) {
  if (templates.length === 0) {
    return (
      <section className="empty-panel-inner">
        <span className="eyebrow">No templates yet</span>
        <p>Save a selection as a template to reuse it later from this library.</p>
      </section>
    );
  }

  return (
    <div className="template-library-list">
      {templates.map((template) => {
        const leafItems = template.nodes.flatMap(collectLeafItems);
        const { previewColors } = summarizeTemplateNodes(template.nodes);
        const itemCount = leafItems.length;
        const kindSummary = buildKindSummary(leafItems.map((item) => item.kind));

        return (
          <article key={template.id} className="template-card">
            <button
              type="button"
              className="template-card-button"
              onClick={() => onInsertTemplate(template.id)}
              aria-label={`Insert ${template.name}`}
            >
              <span className="template-card-preview" aria-hidden="true">
                <span
                  className="template-card-swatch-strip"
                  data-testid={`template-preview-${template.id}`}
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(previewColors.length, 1)}, minmax(0, 1fr))`,
                  }}
                >
                  {(previewColors.length > 0 ? previewColors : ['#334155']).map((color, index) => (
                    <span
                      key={`${template.id}-${index}`}
                      className="template-card-swatch"
                      style={{ background: color }}
                    />
                  ))}
                </span>
              </span>
              <span className="template-card-copy">
                <strong>{template.name}</strong>
                <small>
                  {itemCount} item{itemCount === 1 ? '' : 's'}
                </small>
                <small>{kindSummary}</small>
              </span>
            </button>
            <button
              type="button"
              className="template-card-delete"
              aria-label={`Delete template ${template.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onDeleteTemplate(template.id);
              }}
            >
              ×
            </button>
          </article>
        );
      })}
    </div>
  );
}
