import { Link } from 'react-router';
import { RotateCw, Wallet } from 'lucide-react';
import type { BankAccount } from '@/lib/api/types';
import { formatPaise } from '@/lib/money';
import { DataTable, type Column } from '@/components/ui/data';
import { Card, PageHeader, Skeleton, StatusBadge } from '@/components/ui/primitives';
import { useAccounts, useBalances, useProfile } from './hooks';
import { accountShortName, accountTitle } from './lib';
import { AccountNumber } from './components/AccountNumber';
import { KycNotice } from './components/KycNotice';
import { OpenAccountButton } from './components/OpenAccountDialog';

type BalanceState = ReturnType<typeof useBalances>[number];

function BalanceCell({ account, state }: { account: BankAccount; state: BalanceState | undefined }) {
  if (account.status === 'CLOSED' || !state) return <span className="text-muted-foreground">—</span>;
  if (state.isPending) return <Skeleton className="ml-auto h-4 w-24" />;
  if (state.isError) {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] text-muted-foreground">
        Unavailable
        <button
          type="button"
          className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md hover:bg-accent hover:text-foreground"
          aria-label={`Retry loading the balance of ${accountShortName(account)}`}
          onClick={() => void state.refetch()}
        >
          <RotateCw className="size-3.5" aria-hidden="true" />
        </button>
      </span>
    );
  }
  return <span className="font-medium tnum">{formatPaise(state.data.balanceInPaise)}</span>;
}

export default function AccountsPage() {
  const profileQuery = useProfile();
  const accountsQuery = useAccounts();
  const accounts = accountsQuery.data;
  const open = (accounts ?? []).filter((a) => a.status !== 'CLOSED');
  const balanceQueries = useBalances(open.map((a) => a.id));
  const balanceOf = new Map(open.map((a, i) => [a.id, balanceQueries[i]]));
  const kycStatus = profileQuery.isSuccess ? (profileQuery.data?.kycStatus ?? null) : undefined;

  const columns: Column<BankAccount>[] = [
    {
      key: 'account',
      header: 'Account',
      cell: (a) => (
        <div className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link to={`/accounts/${a.id}`} className="font-medium hover:underline">
              {accountTitle(a)}
            </Link>
            <StatusBadge status={a.status} />
          </span>
          <AccountNumber value={a.accountNumber} className="-ml-0.5 flex" />
        </div>
      ),
    },
    { key: 'balance', header: 'Balance', align: 'right', cell: (a) => <BalanceCell account={a} state={balanceOf.get(a.id)} /> },
    {
      key: 'limit',
      header: 'Daily limit',
      align: 'right',
      hideOnMobile: true,
      cell: (a) => <span className="tnum text-muted-foreground">{formatPaise(a.dailyLimitPaise)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        description="Your savings and current accounts. Select one to see its statement and settings."
        actions={accounts?.length ? <OpenAccountButton kycStatus={kycStatus} showReason={false} /> : null}
      />
      <KycNotice profile={profileQuery.isSuccess ? profileQuery.data : undefined} />
      <Card className="overflow-hidden">
        <DataTable
          caption="Your accounts"
          columns={columns}
          rows={accounts}
          getRowKey={(a) => a.id}
          loading={accountsQuery.isPending}
          error={accountsQuery.error}
          onRetry={() => void accountsQuery.refetch()}
          skeletonRows={2}
          empty={{
            icon: Wallet,
            title: 'No accounts yet',
            description: 'Open a savings or current account. It’s ready to use as soon as it’s open.',
            action: <OpenAccountButton kycStatus={kycStatus} className="items-center text-center" />,
          }}
        />
      </Card>
    </div>
  );
}
