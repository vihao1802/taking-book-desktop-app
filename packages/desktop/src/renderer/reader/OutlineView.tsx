import { useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PdfOutlineNode } from './usePdfOutline';

interface OutlineViewProps {
  nodes: PdfOutlineNode[];
  loading: boolean;
  currentPage: number;
  onSelect: (page: number) => void;
}

/**
 * Collapsible table-of-contents tree from the PDF outline. Entries with an
 * unresolvable destination render muted and are not clickable; clicking a
 * resolved entry jumps the main view to its page.
 */
export function OutlineView({ nodes, loading, currentPage, onSelect }: OutlineViewProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the outline entry matching the current page in view while scrolling.
  useEffect(() => {
    const active = listRef.current?.querySelector('[aria-current="true"]');
    active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentPage]);

  if (loading) {
    return <p className="text-muted-foreground px-4 py-6 text-center text-sm">Loading outlines…</p>;
  }

  if (nodes.length === 0) {
    return (
      <p className="text-muted-foreground px-4 py-6 text-center text-sm">
        No outlines in this document.
      </p>
    );
  }

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      ref={listRef}
      className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
      role="tree"
      aria-label="Document outlines"
    >
      {nodes.map((node) => (
        <OutlineRow
          key={node.id}
          node={node}
          depth={0}
          collapsed={collapsed}
          onToggle={toggle}
          currentPage={currentPage}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function OutlineRow({
  node,
  depth,
  collapsed,
  onToggle,
  currentPage,
  onSelect,
}: {
  node: PdfOutlineNode;
  depth: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  currentPage: number;
  onSelect: (page: number) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);
  const clickable = node.page !== null;
  const active = node.page === currentPage;

  return (
    <div role="treeitem" aria-expanded={hasChildren ? !isCollapsed : undefined}>
      <div
        className={cn(
          'flex min-w-0 items-center gap-0.5 rounded-md py-1 pr-2',
          active ? 'bg-accent' : 'hover:bg-accent/60',
        )}
        aria-current={active ? 'true' : undefined}
        style={{ paddingLeft: 8 + depth * 14 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-label={isCollapsed ? `Expand ${node.title}` : `Collapse ${node.title}`}
            className="text-muted-foreground hover:text-foreground shrink-0 rounded p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <ChevronRight className={cn('size-3.5 transition-transform', !isCollapsed && 'rotate-90')} />
          </button>
        ) : (
          <span className="w-[18px] shrink-0" aria-hidden />
        )}
        <button
          type="button"
          disabled={!clickable}
          onClick={() => {
            if (node.page !== null) onSelect(node.page);
          }}
          title={clickable ? `Go to page ${node.page}` : 'Destination unavailable'}
          className={cn(
            'min-w-0 flex-1 truncate text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm',
            clickable ? 'cursor-pointer' : 'cursor-default opacity-50',
            active ? 'text-foreground font-medium' : 'text-foreground/90',
          )}
        >
          {node.title}
        </button>
        {node.page !== null && (
          <span className="text-muted-foreground ml-1 shrink-0 text-[11px] tabular-nums">
            {node.page}
          </span>
        )}
      </div>
      {hasChildren && !isCollapsed && (
        <div role="group">
          {node.children.map((child) => (
            <OutlineRow
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsed={collapsed}
              onToggle={onToggle}
              currentPage={currentPage}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
