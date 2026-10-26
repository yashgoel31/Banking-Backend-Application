import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ReceiptText } from 'lucide-react';
import { useApi } from '@/lib/auth/AuthProvider';
import { qk } from '@/lib/query';
import type { LedgerEntry } from '@/lib/api/types';
import { cn } from '@/lib/cn';
import { Amount, humanize } from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/data';
import { formatDateTime } from './format';

const LIMIT = 10;

function TransactionsTable({ accountId }: { accountId: string }) {
  const api = useApi();
  const query = useQuery({
    queryKey: qk.history(accountId, 0, LIMIT),
    queryFn: () => api.ledger.history(accountId, { limit: LIMIT, offset: 0 }),
  });
  return (
    <DataTable<LedgerEntry>
      caption="Last 10 transactions, newest first"
      rows={query.data}
      loading={query.isPending}
      error={query.error}
      onRetry={() => void query.refetch()}
      getRowKey={(e) => e.entryId}
      skeletonRows={3}
      empty={{ icon: ReceiptText, title: 'No transactions yet' }}
      columns={[
        {
          key: 'date',
          header: 'Date',
          cell: (e) => (
            <time dateTime={e.createdAt} className="whitespace-nowrap text-muted-foreground">
              {formatDateTime(e.createdAt)}
            </time>
          ),
        },
        {
          key: 'description',
          header: 'Details',
          cell: (e) => (
            <span className="flex min-w-0 flex-col">
              <span className="break-words">{e.description || humanize(e.type)}</span>
              <span className="font-mono text-[11.5px] text-muted-foreground">{e.referenceId}</span>
            </span>
          ),
        },
        { key: 'amount', header: 'Amount', align: 'right', cell: (e) => <Amount paise={e.amountInPaise} direction={e.entryType} /> },
        {
          key: 'after',
          header: 'Balance after',
          align: 'right',
          hideOnMobile: true,
          cell: (e) => <Amount paise={e.balanceAfterInPaise} className="font-normal text-muted-foreground" />,
        },
      ]}
    />
  );
}

/** Loaded only when opened: every staff read of a ledger is audited, so don't read what nobody looks at */
export function RecentTransactions({ accountId, last4 }: { accountId: string; last4: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="border-t pt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Recent transactions for account ending ${last4}`}
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer items-center gap-1.5 rounded-md text-[13px] font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
        Recent transactions
      </button>
      <div id={panelId} hidden={!open} className="-mx-4 mt-3 sm:-mx-5">
        {open ? <TransactionsTable accountId={accountId} /> : null}
      </div>
    </div>
  );
}
