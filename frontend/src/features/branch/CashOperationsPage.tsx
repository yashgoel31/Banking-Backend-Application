import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HandCoins } from 'lucide-react';
import { useApi, useUser } from '@/lib/auth/AuthProvider';
import type { CashOperation, CashOperationStatus } from '@/lib/api/types';
import { formatPaise } from '@/lib/money';
import { qk } from '@/lib/query';
import { Button } from '@/components/ui/button';
import { DataTable, Pagination, type Column } from '@/components/ui/data';
import { Amount, Callout, Card, PageHeader, StatusBadge } from '@/components/ui/primitives';
import {
  CASH_TYPE_LABEL,
  PAGE_SIZE,
  StatusTabs,
  formatDateTime,
  keepPageWithinFilter,
  useStaffDirectory,
  type StatusTab,
} from './components/cash';
import { AccountCell, CashDecisionDialog, type Decision } from './components/CashDecision';

type Filter = 'ALL' | CashOperationStatus;

const TABS: ReadonlyArray<StatusTab<Filter>> = [
  { value: 'PENDING_APPROVAL', label: 'Pending approval' },
  { value: 'EXECUTED', label: 'Executed' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ALL', label: 'All' },
];

const EMPTY: Record<Filter, { title: string; description: string }> = {
  PENDING_APPROVAL: { title: 'Nothing waiting for approval', description: 'Cash operations above a teller’s limits appear here for a second person to decide.' },
  EXECUTED: { title: 'No executed operations', description: 'Completed branch deposits and withdrawals appear here.' },
  REJECTED: { title: 'No rejected operations', description: 'Rejected and expired requests appear here.' },
  ALL: { title: 'No cash operations yet', description: 'Branch deposits and withdrawals appear here.' },
};

export default function CashOperationsPage() {
  const api = useApi();
  const user = useUser();
  const canAct = user.role === 'BANK_ADMIN';
  const [filter, setFilter] = useState<Filter>('PENDING_APPROVAL');
  const [offset, setOffset] = useState(0);
  const [decision, setDecision] = useState<Decision | null>(null);
  const status = filter === 'ALL' ? undefined : filter;

  const tellers = useStaffDirectory('TELLER');
  const query = useQuery({
    queryKey: qk.cashOperations(status, offset),
    queryFn: () => api.teller.cashOperations({ status, limit: PAGE_SIZE, offset }),
    placeholderData: keepPageWithinFilter(status),
    refetchInterval: filter === 'PENDING_APPROVAL' ? 30_000 : false,
  });

  const columns: Column<CashOperation>[] = [
    { key: 'type', header: 'Type', cell: (op) => <span className="font-medium">{CASH_TYPE_LABEL[op.type]}</span> },
    { key: 'amount', header: 'Amount', align: 'right', cell: (op) => <Amount paise={op.amountInPaise} /> },
    { key: 'account', header: 'Account', cell: (op) => <AccountCell accountId={op.accountId} /> },
    {
      key: 'requestedBy',
      header: 'Requested by',
      hideOnMobile: true,
      cell: (op) => <span className="break-all">{tellers.label(op.requestedBy)}</span>,
    },
    { key: 'created', header: 'Created', hideOnMobile: true, cell: (op) => <span className="whitespace-nowrap tnum">{formatDateTime(op.createdAt)}</span> },
    ...(filter === 'PENDING_APPROVAL'
      ? []
      : [
          { key: 'status', header: 'Status', cell: (op: CashOperation) => <StatusBadge status={op.status} /> },
          {
            key: 'decided',
            header: 'Decided',
            hideOnMobile: true,
            cell: (op: CashOperation) =>
              op.decidedAt ? <span className="whitespace-nowrap tnum">{formatDateTime(op.decidedAt)}</span> : <span className="text-muted-foreground">—</span>,
          },
        ]),
    ...(canAct
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right' as const,
            cell: (op: CashOperation) => {
              if (op.status !== 'PENDING_APPROVAL') return null;
              const what = `${CASH_TYPE_LABEL[op.type].toLowerCase()} of ${formatPaise(op.amountInPaise)}`;
              return (
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" aria-label={`Reject ${what}`} onClick={() => setDecision({ kind: 'reject', operation: op })}>
                    Reject
                  </Button>
                  <Button size="sm" variant="success" aria-label={`Approve ${what}`} onClick={() => setDecision({ kind: 'approve', operation: op })}>
                    Approve
                  </Button>
                </div>
              );
            },
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Branch"
        title="Cash approvals"
        description="Deposits and withdrawals above a teller’s limits wait here for a second person. Requests that aren’t decided in time expire."
      />
      {canAct ? null : (
        <Callout tone="info" title="Read-only">
          Only bank administrators can approve or reject cash operations.
        </Callout>
      )}
      <Card>
        <StatusTabs
          label="Filter by status"
          tabs={TABS}
          value={filter}
          onChange={(next) => {
            setFilter(next);
            setOffset(0);
          }}
        >
          <DataTable
            caption="Cash operations"
            columns={columns}
            rows={query.data}
            getRowKey={(op) => op.id}
            loading={query.isFetching}
            error={query.error}
            onRetry={() => void query.refetch()}
            empty={
              offset > 0
                ? { icon: HandCoins, title: 'No more operations', description: 'Go back to see earlier pages.' }
                : { icon: HandCoins, ...EMPTY[filter] }
            }
            className={query.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}
          />
          {query.data && (query.data.length > 0 || offset > 0) ? (
            <Pagination offset={offset} limit={PAGE_SIZE} count={query.data.length} onChange={setOffset} />
          ) : null}
        </StatusTabs>
      </Card>
      {canAct ? <CashDecisionDialog decision={decision} requesterLabel={tellers.label} onClose={() => setDecision(null)} /> : null}
    </div>
  );
}
