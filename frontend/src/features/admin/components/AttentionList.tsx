import { useId, type ComponentType, type ReactNode } from 'react';
import { Link } from 'react-router';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Callout, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Skeleton } from '@/components/ui/primitives';
import { durationSince } from './format';

export interface AttentionItem {
  key: string;
  /** "Four-eyes request", "Cash approval", ... */
  kind: string;
  title: string;
  detail: ReactNode;
  /** When it started waiting */
  since: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  tone: 'warning' | 'danger';
}

const ICON_TONES = { warning: 'bg-warning-soft text-warning', danger: 'bg-destructive-soft text-destructive' };

const joinNames = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** The oldest waiting work across every queue, so the next decision is obvious */
export function AttentionList({
  items,
  loading,
  failed,
  now,
}: {
  items: AttentionItem[];
  loading: boolean;
  /** Names of queues that failed to load */
  failed: string[];
  now: number;
}) {
  const headingId = useId();
  let body: ReactNode;
  if (items.length > 0) {
    body = (
      <ol className="divide-y">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.key} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', ICON_TONES[item.tone])}>
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="flex flex-wrap gap-x-1.5 text-[12px] text-muted-foreground">
                  <span>{item.kind}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tnum">Waiting {durationSince(item.since, now)}</span>
                </p>
                <Link to={item.href} className="block text-sm font-medium underline-offset-2 hover:underline">
                  {item.title}
                </Link>
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 break-words text-[12.5px] text-muted-foreground">
                  {item.detail}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    );
  } else if (loading) {
    body = (
      <div className="space-y-4">
        <span className="sr-only">Loading</span>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="size-8 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-4 w-56 max-w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (failed.length > 0) {
    body = <p className="text-[13px] text-muted-foreground">Nothing else is waiting.</p>;
  } else {
    body = (
      <EmptyState
        icon={CheckCircle2}
        title="You’re all caught up"
        description="Nothing is waiting for a decision right now."
        className="py-8"
      />
    );
  }

  return (
    <section aria-labelledby={headingId}>
      <Card>
        <CardHeader>
          <CardTitle id={headingId}>Needs your attention</CardTitle>
          <CardDescription>Oldest first, across every queue. Requests only a colleague can decide are left out.</CardDescription>
          {/* Kept short on purpose: each queue's card above links to the full list */}
        </CardHeader>
        <CardContent className="space-y-4">
          {failed.length > 0 ? (
            <Callout tone="warning" title={`${joinNames(failed)} couldn’t be loaded`}>
              The other queues are shown below. Use Try again on the card above.
            </Callout>
          ) : null}
          {body}
        </CardContent>
      </Card>
    </section>
  );
}
