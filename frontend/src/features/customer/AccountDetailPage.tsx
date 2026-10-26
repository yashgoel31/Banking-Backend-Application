import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, ChevronLeft, Gauge, ReceiptText, SearchX, Snowflake } from 'lucide-react';
import type { BankAccount, LedgerEntry } from '@/lib/api/types';
import { useApi } from '@/lib/auth/AuthProvider';
import { qk } from '@/lib/query';
import { comparePaise, formatPaise } from '@/lib/money';
import { notifyError, notifySuccess } from '@/lib/notify';
import { UUID_PATTERN, maskAccountNumber } from '@/lib/validation';
import { isApiError } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { DataTable, ErrorState, Pagination, type Column } from '@/components/ui/data';
import { Amount, Callout, Card, CardHeader, CardTitle, CardDescription, PageHeader, Skeleton, StatusBadge } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/overlays';
import { useBalance } from './hooks';
import { POLICY, accountTitle, entryLabel, formatDate, formatTime } from './lib';
import { AccountNumber } from './components/AccountNumber';
import { DailyLimitDialog } from './components/DailyLimitDialog';

const PAGE_SIZE = 20;

/** Customers may always lower a bank-set limit, and raise it up to the ceiling or their own cap, whichever is lower */
function ceilingNote(ceiling: string): string {
  const cap = POLICY.customerDailyLimitCapPaise;
  return comparePaise(ceiling, cap) <= 0
    ? `Limit set by the bank: you can lower it, or raise it up to ${formatPaise(ceiling)}`
    : `Limit set by the bank: you can lower it, but raising it above ${formatPaise(cap)} needs the bank’s approval`;
}

function BackLink() {
  return (
    <Link to="/accounts" className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground">
      <ChevronLeft className="size-4" aria-hidden="true" /> Accounts
    </Link>
  );
}

function NotFound() {
  return (
    <div className="space-y-4">
      <BackLink />
      <Card>
        <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <div className="mb-1 flex size-11 items-center justify-center rounded-full border bg-muted/60">
            <SearchX className="size-5 text-muted-foreground" aria-hidden="true" />
          </div>
          <h1 className="text-base font-semibold">Account not found</h1>
          <p className="max-w-sm text-[13px] text-muted-foreground">
            We couldn’t find this account among yours. The link may be incomplete, or the account may belong to someone else.
          </p>
          <Button asChild variant="outline" className="mt-2">
            <Link to="/accounts">Back to accounts</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function AccountDetailPage() {
  const api = useApi();
  const { accountId = '' } = useParams();
  const valid = UUID_PATTERN.test(accountId);
  const query = useQuery({ queryKey: qk.account(accountId), queryFn: () => api.accounts.get(accountId), enabled: valid });

  const missing = isApiError(query.error) && (query.error.status === 404 || query.error.code === 'VALIDATION_ERROR');
  if (!valid || missing) return <NotFound />;
  if (query.isError) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      </div>
    );
  }
  if (query.isPending) {
    return (
      <div className="space-y-6" aria-busy="true">
        <BackLink />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  return <AccountView account={query.data} />;
}

function AccountView({ account }: { account: BankAccount }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const balance = useBalance(account.id);
  const [limitOpen, setLimitOpen] = useState(false);
  const [freezeOpen, setFreezeOpen] = useState(false);
  const active = account.status === 'ACTIVE';
  const closed = account.status === 'CLOSED';

  const freeze = async () => {
    try {
      const updated = await api.accounts.setStatus(account.id, 'FROZEN');
      queryClient.setQueryData(qk.account(account.id), updated);
      void queryClient.invalidateQueries({ queryKey: qk.accounts, exact: true });
      notifySuccess('Account frozen', `No money can move in or out of ${maskAccountNumber(account.accountNumber)} until the bank unfreezes it.`);
    } catch (error) {
      notifyError(error, 'The account could not be frozen');
      throw error;
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <BackLink />
        <PageHeader
          title={accountTitle(account)}
          description={
            <span className="flex flex-wrap items-center gap-2">
              <AccountNumber value={account.accountNumber} />
              <StatusBadge status={account.status} />
            </span>
          }
          actions={
            closed ? null : (
              <>
                {active ? (
                  <Button asChild>
                    <Link to={`/transfer?from=${account.id}`}>
                      <ArrowLeftRight aria-hidden="true" /> Transfer from this account
                    </Link>
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => setLimitOpen(true)}>
                  <Gauge aria-hidden="true" /> Change daily limit
                </Button>
                {active ? (
                  <Button variant="outline" onClick={() => setFreezeOpen(true)}>
                    <Snowflake aria-hidden="true" /> Freeze account
                  </Button>
                ) : null}
              </>
            )
          }
        />
      </div>

      {account.status === 'FROZEN' ? (
        <Callout tone="warning" title="This account is frozen">
          No money can be sent from it or paid into it. Only the bank can unfreeze it: contact us when you’re ready to use it
          again.
        </Callout>
      ) : null}
      {closed ? (
        <Callout tone="info" title="This account is closed">
          It can no longer send or receive money. Its statement stays available below.
        </Callout>
      ) : null}

      <Card role="region" aria-label="Account overview">
        <div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-5 sm:p-6">
            <p className="text-[13px] font-medium text-muted-foreground">Balance</p>
            <div className="mt-1 text-3xl font-semibold tracking-tight tnum">
              {balance.isPending ? (
                <Skeleton className="h-9 w-44" />
              ) : balance.isError ? (
                <span className="flex items-center gap-2 text-base font-normal text-muted-foreground">
                  Unavailable
                  <Button variant="link" size="sm" onClick={() => void balance.refetch()}>
                    Try again
                  </Button>
                </span>
              ) : (
                formatPaise(balance.data.balanceInPaise)
              )}
            </div>
          </div>
          <div className="p-5 sm:p-6">
            <p className="text-[13px] font-medium text-muted-foreground">Daily limit</p>
            <p className="mt-1 text-xl font-semibold tracking-tight tnum">{formatPaise(account.dailyLimitPaise)}</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">
              {account.bankLimitCeilingPaise ? ceilingNote(account.bankLimitCeilingPaise) : 'The most that can leave this account each day'}
            </p>
          </div>
          <div className="p-5 sm:p-6">
            <p className="text-[13px] font-medium text-muted-foreground">Opened</p>
            <p className="mt-1 text-xl font-semibold tracking-tight">{formatDate(account.createdAt)}</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">Indian rupees (INR)</p>
          </div>
        </div>
      </Card>

      <Statement accountId={account.id} />

      {closed ? null : <DailyLimitDialog account={account} open={limitOpen} onOpenChange={setLimitOpen} />}
      <ConfirmDialog
        open={freezeOpen}
        onOpenChange={setFreezeOpen}
        tone="destructive"
        title="Freeze this account?"
        description={`Freezing stops all money moving in or out of ${maskAccountNumber(account.accountNumber)} straight away. Use it if you think someone else may be using your account.`}
        confirmLabel="Freeze account"
        onConfirm={freeze}
      >
        <Callout tone="warning" title="You can’t unfreeze it yourself">
          Only the bank can unfreeze the account, after checking with you. Your money stays safe in the meantime.
        </Callout>
      </ConfirmDialog>
    </div>
  );
}

const statementColumns: Column<LedgerEntry>[] = [
  {
    key: 'date',
    header: 'Date',
    hideOnMobile: true,
    cell: (e) => (
      <span className="whitespace-nowrap">
        {formatDate(e.createdAt)}
        <span className="block text-[12px] text-muted-foreground">{formatTime(e.createdAt)}</span>
      </span>
    ),
  },
  {
    key: 'description',
    header: 'Description',
    cell: (e) => (
      <span className="block min-w-[9rem]">
        <span className="block font-medium">{entryLabel(e)}</span>
        <span className="block text-[12px] text-muted-foreground md:hidden">
          {formatDate(e.createdAt)}, {formatTime(e.createdAt)}
        </span>
        <span className="block break-all font-mono text-[11.5px] text-muted-foreground">{e.referenceId}</span>
      </span>
    ),
  },
  { key: 'amount', header: 'Amount', align: 'right', cell: (e) => <Amount paise={e.amountInPaise} direction={e.entryType} /> },
  {
    key: 'balance',
    header: 'Balance',
    align: 'right',
    hideOnMobile: true,
    cell: (e) => <span className="tnum text-muted-foreground">{formatPaise(e.balanceAfterInPaise)}</span>,
  },
];

function Statement({ accountId }: { accountId: string }) {
  const api = useApi();
  const [offset, setOffset] = useState(0);
  const history = useQuery({
    queryKey: qk.history(accountId, offset, PAGE_SIZE),
    queryFn: () => api.ledger.history(accountId, { limit: PAGE_SIZE, offset }),
    placeholderData: keepPreviousData,
  });
  const rows = history.data;
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Statement</CardTitle>
        <CardDescription>Every payment in and out of this account, newest first.</CardDescription>
      </CardHeader>
      <DataTable
        caption="Statement"
        columns={statementColumns}
        rows={rows}
        getRowKey={(e) => e.entryId}
        loading={history.isPending || history.isPlaceholderData}
        error={history.error}
        onRetry={() => void history.refetch()}
        empty={{
          icon: ReceiptText,
          title: offset === 0 ? 'No transactions yet' : 'No more transactions',
          description: offset === 0 ? 'Money you send or receive will appear here.' : 'You’ve reached the start of this account’s history.',
          action:
            offset > 0 ? (
              <Button variant="outline" size="sm" onClick={() => setOffset(0)}>
                Back to the latest
              </Button>
            ) : undefined,
        }}
      />
      {rows && rows.length > 0 ? (
        <Pagination offset={offset} limit={PAGE_SIZE} count={rows.length} onChange={(next) => setOffset(next)} />
      ) : null}
    </Card>
  );
}
