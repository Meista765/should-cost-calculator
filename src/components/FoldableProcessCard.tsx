import { useId, type ReactNode } from 'react';

type Props = {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
};

export function FoldableProcessCard({ title, open, onToggle, children }: Props) {
  const bodyId = useId();
  return (
    <section className={`foldable-card${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="foldable-card-header"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <span className="foldable-card-chevron" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
        <span className="foldable-card-title">{title}</span>
      </button>
      {open && (
        <div id={bodyId} className="foldable-card-body">
          {children}
        </div>
      )}
    </section>
  );
}
