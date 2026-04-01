import { useId, useState, type ReactNode } from 'react';

interface SectionBlockProps {
  children: ReactNode;
  defaultExpanded?: boolean;
  title: string;
}

export function SectionBlock({
  children,
  defaultExpanded = true,
  title,
}: SectionBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const sectionId = useId();

  return (
    <section className={expanded ? 'property-block expanded' : 'property-block collapsed'}>
      <button
        type="button"
        className="property-block-toggle"
        aria-controls={sectionId}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>{title}</span>
        <span className="property-block-toggle-icon" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      <div
        id={sectionId}
        className={expanded ? 'property-block-body' : 'property-block-body hidden'}
        hidden={!expanded}
      >
        {children}
      </div>
    </section>
  );
}
