import { Fragment, useId, useState } from 'react';
import { ChevronRight, Inbox } from 'lucide-react';
import type { NotificationLog } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { ErrorState } from '@/components/ui/data';
import { EmptyState, Skeleton, StatusBadge } from '@/components/ui/primitives';
import { formatDateTime } from './format';

const cellBase = 'px-4 py-3 align-middle first:pl-5 last:pr-5';
const headBase =
  'h-10 whitespace-nowrap px-4 text-left text-[12px] font-medium uppercase tracking-wide text-muted-foreground first:pl-5 last:pr-5';

function Details({ log, id, label }: { log: NotificationLog; id: string; label: string }) {
  return (
    <section id={id} aria-label={label} className="space-y-4 bg-muted/30 px-5 py-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Logged</dt>
          <dd>
            <time dateTime={log.createdAt}>{formatDateTime(log.createdAt)}</time>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Recipient</dt>
          <dd className="break-all">{log.recipient}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Channel</dt>
          <dd>{log.channel === 'EMAIL' ? 'Email' : log.channel}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Retries</dt>
          <dd className="tnum">{log.retryCount}</dd>
        </div>
      </dl>
      <div className="space-y-1.5">
        <h3 className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Message</h3>
        {/* Rendered as text: a message body is never interpreted as markup */}
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-background p-3 font-sans text-[13px] leading-relaxed">
          {log.body}
        </pre>
      </div>
      {log.lastError ? (
        <div className="space-y-1.5">
          <h3 className="text-[12px] font-medium uppercase tracking-wide text-destructive">Last error</h3>
          <pre className="overflow-auto whitespace-pre-wrap break-words rounded-md border border-destructive/25 bg-destructive-soft p-3 font-mono text-[12.5px]">
            {log.lastError}
          </pre>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The delivery log with expandable rows. Same look and states as the shared DataTable, which has no
 * expandable rows: the message body and last error open below the row they belong to.
 */
export function NotificationTable({
  rows,
  loading,
  error,
  onRetry,
  empty,
}: {
  rows: NotificationLog[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  empty: { title: string; description?: string };
}) {
  const baseId = useId();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (error && !rows?.length) return <ErrorState error={error} onRetry={onRetry} />;
  if (!loading && rows && rows.length === 0) return <EmptyState icon={Inbox} title={empty.title} description={empty.description} />;

  const columnCount = 6;
  return (
    <div className="relative w-full overflow-x-auto">
      <table className="w-full caption-bottom text-sm">
        <caption className="sr-only">Notifications, newest first</caption>
        <thead>
          <tr className="border-b bg-muted/40">
            <th scope="col" className={cn(headBase, 'w-10 pr-0')}>
              <span className="sr-only">Details</span>
            </th>
            <th scope="col" className={cn(headBase, 'hidden md:table-cell')}>
              Time
            </th>
            <th scope="col" className={cn(headBase, 'hidden md:table-cell')}>
              Recipient
            </th>
            <th scope="col" className={headBase}>
              Subject
            </th>
            <th scope="col" className={headBase}>
              Status
            </th>
            <th scope="col" className={cn(headBase, 'hidden text-right md:table-cell')}>
              Retries
            </th>
          </tr>
        </thead>
        <tbody>
          {loading && !rows
            ? Array.from({ length: 5 }, (_, i) => (
                <tr key={`s${i}`} className="border-b last:border-0">
                  {Array.from({ length: columnCount }, (__, c) => (
                    <td key={c} className={cn(cellBase, c === 1 || c === 2 || c === 5 ? 'hidden md:table-cell' : '')}>
                      <Skeleton className="h-4 w-full max-w-[10rem]" />
                    </td>
                  ))}
                </tr>
              ))
            : rows?.map((log) => {
                const expanded = open.has(log.id);
                const detailsId = `${baseId}-${log.id}`;
                return (
                  <Fragment key={log.id}>
                    <tr
                      className={cn('cursor-pointer border-b transition-colors hover:bg-muted/40', expanded && 'border-b-0 bg-muted/30')}
                      onClick={() => toggle(log.id)}
                    >
                      <td className={cn(cellBase, 'w-10 pr-0')}>
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={expanded ? detailsId : undefined}
                          aria-label={`Show details: ${log.subject}`}
                          className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(log.id);
                          }}
                        >
                          <ChevronRight className={cn('size-4 transition-transform', expanded && 'rotate-90')} aria-hidden="true" />
                        </button>
                      </td>
                      <td className={cn(cellBase, 'hidden whitespace-nowrap text-muted-foreground md:table-cell')}>
                        <time dateTime={log.createdAt}>{formatDateTime(log.createdAt)}</time>
                      </td>
                      <td className={cn(cellBase, 'hidden max-w-[14rem] truncate md:table-cell')} title={log.recipient}>
                        {log.recipient}
                      </td>
                      <td className={cn(cellBase, 'max-w-[20rem]')}>
                        <span className="line-clamp-2 break-words font-medium">{log.subject}</span>
                        <span className="block truncate text-[12px] text-muted-foreground md:hidden">{log.recipient}</span>
                      </td>
                      <td className={cellBase}>
                        <StatusBadge status={log.status} />
                      </td>
                      <td className={cn(cellBase, 'hidden text-right tnum md:table-cell', log.retryCount > 0 && 'font-medium text-warning')}>
                        {log.retryCount}
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className="border-b last:border-0">
                        <td colSpan={columnCount} className="p-0">
                          <Details log={log} id={detailsId} label={`Details: ${log.subject}`} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}
