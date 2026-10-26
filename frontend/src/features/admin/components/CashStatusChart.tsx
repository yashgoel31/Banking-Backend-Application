import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { HandCoins } from 'lucide-react';
import { useApi } from '@/lib/auth/AuthProvider';
import type { CashOperationStatus } from '@/lib/api/types';
import { qk } from '@/lib/query';
import { ErrorState } from '@/components/ui/data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Skeleton } from '@/components/ui/primitives';

const SAMPLE = 100;

/** Status colours are the design system's status tokens (they mean waiting / done / refused), always shown with a label */
const STATUSES: Array<{ status: CashOperationStatus; label: string; color: string }> = [
  { status: 'PENDING_APPROVAL', label: 'Awaiting approval', color: 'hsl(var(--warning))' },
  { status: 'EXECUTED', label: 'Executed', color: 'hsl(var(--success))' },
  { status: 'REJECTED', label: 'Rejected', color: 'hsl(var(--destructive))' },
];

type Datum = (typeof STATUSES)[number] & { count: number };

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Category name in text ink (never the series colour), just above the start of its bar */
function BarLabel({ x, y, value }: { x?: number | string; y?: number | string; value?: number | string }) {
  return (
    <text x={Number(x ?? 0)} y={Number(y ?? 0) - 6} fill="hsl(var(--muted-foreground))" fontSize={12}>
      {value}
    </text>
  );
}

function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
  const datum = payload?.[0]?.payload as Datum | undefined;
  if (!active || !datum) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-[12px] text-popover-foreground shadow-md">
      <span className="font-medium">{datum.label}</span>: <span className="tnum">{datum.count}</span>
    </div>
  );
}

/** Recent cash operations by outcome: a small bar chart with the same numbers as text beneath it */
export function CashStatusChart() {
  const api = useApi();
  const headingId = useId();
  const query = useQuery({
    queryKey: [...qk.cashOperations(undefined, 0), { limit: SAMPLE }],
    queryFn: () => api.teller.cashOperations({ limit: SAMPLE }),
  });
  const rows = query.data;
  const data: Datum[] = STATUSES.map((s) => ({ ...s, count: rows?.filter((op) => op.status === s.status).length ?? 0 }));
  const total = rows?.length ?? 0;

  let body;
  if (query.isPending) {
    body = (
      <div className="space-y-3">
        <span className="sr-only">Loading</span>
        <Skeleton className="h-28 w-full" />
      </div>
    );
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={() => void query.refetch()} className="py-6" />;
  } else if (total === 0) {
    body = <EmptyState icon={HandCoins} title="No cash operations yet" className="py-8" />;
  } else {
    body = (
      <>
        {/* Decorative: the list below carries the same numbers for everyone */}
        <div className="h-36 w-full" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 300, height: 144 }}>
            {/* No category axis: each bar is labelled directly above its start, so narrow columns keep the full width */}
            <BarChart data={data} layout="vertical" margin={{ top: 16, right: 8, bottom: 0, left: 0 }} barCategoryGap="38%">
              <XAxis type="number" hide allowDecimals={false} domain={[0, 'dataMax']} />
              <YAxis type="category" dataKey="label" hide />
              <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltip />} isAnimationActive={false} />
              <Bar dataKey="count" barSize={12} radius={[0, 4, 4, 0]} minPointSize={2} isAnimationActive={!prefersReducedMotion()}>
                {data.map((d) => (
                  <Cell key={d.status} fill={d.color} />
                ))}
                <LabelList dataKey="label" content={BarLabel} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ul className="mt-4 space-y-2 border-t pt-4">
          {data.map((d) => (
            <li key={d.status} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: d.color }} />
                <span>{d.label}</span>
              </span>
              <span className="tnum font-semibold">{d.count}</span>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <section aria-labelledby={headingId}>
      <Card className="h-full">
        <CardHeader>
          <CardTitle id={headingId}>Cash operations by status</CardTitle>
          <CardDescription>
            {total >= SAMPLE ? `The latest ${SAMPLE} operations across branches.` : 'Recent operations across branches.'}
          </CardDescription>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    </section>
  );
}
