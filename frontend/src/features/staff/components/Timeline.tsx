import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { formatDateTime } from './format';

export interface TimelineItem {
  id: string;
  title: ReactNode;
  /** Who did it, already formatted ("You", "Customer", "Analyst 1a2b3c4d") */
  actor: ReactNode;
  at: string;
  children?: ReactNode;
}

/** An audit trail: newest or oldest first as given; every entry says what, who and when */
export function Timeline({ items, label, className }: { items: TimelineItem[]; label: string; className?: string }) {
  return (
    <ol aria-label={label} className={cn('relative space-y-5 border-l pl-5', className)}>
      {items.map((item) => (
        <li key={item.id} className="relative">
          <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-card bg-primary" aria-hidden="true" />
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <p className="text-sm font-medium">{item.title}</p>
            <p className="shrink-0 text-[12.5px] text-muted-foreground">
              <time dateTime={item.at}>{formatDateTime(item.at)}</time>
            </p>
          </div>
          <p className="text-[12.5px] text-muted-foreground">By {item.actor}</p>
          {item.children ? <div className="mt-2 text-[13px]">{item.children}</div> : null}
        </li>
      ))}
    </ol>
  );
}
