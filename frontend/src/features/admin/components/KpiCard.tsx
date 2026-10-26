import type { ComponentType } from 'react';
import { Link } from 'react-router';
import { RotateCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/primitives';

export type KpiState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; value: string; count: number; hint: string };

const TONES = {
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-destructive-soft text-destructive',
  primary: 'bg-primary-soft text-primary',
} as const;

/** One queue at a glance: the whole card opens the queue; a failed count can be retried in place */
export function KpiCard({
  label,
  href,
  icon: Icon,
  tone,
  state,
}: {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  tone: keyof typeof TONES;
  state: KpiState;
}) {
  const busy = state.status === 'ready' && state.count > 0;
  return (
    <Card className="relative flex h-full flex-col p-4 transition-colors focus-within:ring-2 focus-within:ring-ring hover:border-primary/40 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[13px] font-medium leading-[1.125rem] text-muted-foreground sm:leading-5">
          {/* Stretched link: the card is one large target, but its name stays short and specific */}
          <Link
            to={href}
            className="after:absolute after:inset-0 after:rounded-xl hover:text-foreground focus-visible:outline-none"
          >
            {label}
            {state.status === 'ready' ? <span className="sr-only">: {state.value}</span> : null}
          </Link>
        </h3>
        <span
          className={cn(
            // Two tiles share a phone's width: the label needs the room more than the icon does
            'hidden size-8 shrink-0 items-center justify-center rounded-lg sm:flex',
            busy ? TONES[tone] : 'bg-muted text-muted-foreground'
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>

      {state.status === 'loading' ? (
        <div className="mt-2 space-y-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3.5 w-32" />
          <span className="sr-only">Loading</span>
        </div>
      ) : null}

      {state.status === 'error' ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm font-medium text-destructive">Couldn’t load</p>
          {/* Above the stretched link so it stays clickable */}
          <Button
            variant="outline"
            size="sm"
            className="relative z-10"
            aria-label={`Try again loading ${label.toLowerCase()}`}
            onClick={state.retry}
          >
            <RotateCw aria-hidden="true" />
            Try again
          </Button>
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <>
          {/* The link already carries the count for screen readers */}
          <p className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" aria-hidden="true">
            {state.value}
          </p>
          <p className="mt-auto pt-1 text-[12.5px] text-muted-foreground">{state.hint}</p>
        </>
      ) : null}
    </Card>
  );
}
