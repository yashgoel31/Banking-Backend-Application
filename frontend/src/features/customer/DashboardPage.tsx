import { useId, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useQueries } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, Banknote, Layers, Plus, ReceiptText, UserPlus, Wallet } from 'lucide-react';
import type { BankAccount, KycStatus } from '@/lib/api/types';
import { useApi } from '@/lib/auth/AuthProvider';
import { qk } from '@/lib/query';
import { addPaise, formatPaise } from '@/lib/money';
import { maskAccountNumber } from '@/lib/validation';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/data';
import {
  Amount,
  Callout,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  Skeleton,
  StatCard,
  StatusBadge,
} from '@/components/ui/primitives';
import { buildCashFlow, type AccountEntry } from './cashflow';
import { useAccounts, useBalances, useProfile } from './hooks';
import { ACCOUNT_TYPE_LABEL, entryLabel, firstName, formatDateTime, greeting } from './lib';
import { CashFlowChart } from './components/CashFlowChart';
import { KycNotice, openAccountBlocker } from './components/KycNotice';
import { OpenAccountButton, OpenAccountDialog } from './components/OpenAccountDialog';

const HISTORY_LIMIT = 100;
const RECENT_COUNT = 8;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function DashboardPage() {
  const api = useApi();
  const profileQuery = useProfile();
  const accountsQuery = useAccounts();
  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const openAccounts = accounts.filter((a) => a.status !== 'CLOSED');
  const activeAccounts = accounts.filter((a) => a.status === 'ACTIVE');
  const frozenCount = accounts.filter((a) => a.status === 'FROZEN').length;

  const balanceQueries = useBalances(openAccounts.map((a) => a.id));
  const balanceOf = new Map(openAccounts.map((a, i) => [a.id, balanceQueries[i]]));
  const historyQueries = useQueries({
    queries: accounts.map((account) => ({
      queryKey: qk.history(account.id, 0, HISTORY_LIMIT),
      queryFn: () => api.ledger.history(account.id, { limit: HISTORY_LIMIT }),
    })),
  });

  // --- derived figures -------------------------------------------------------------------------
  const activeBalances = activeAccounts.map((a) => balanceOf.get(a.id));
  const balancesLoading = accountsQuery.isPending || activeBalances.some((q) => q?.isPending);
  const balancesFailed = accountsQuery.isError || activeBalances.some((q) => q?.isError);
  const totalBalance = addPaise(activeBalances.map((q) => q?.data?.balanceInPaise ?? '0'));

  const historyLoading = accountsQuery.isPending || historyQueries.some((q) => q.isPending);
  const historyError = historyQueries.find((q) => q.isError)?.error;
  // A handful of accounts with at most 100 entries each: cheap enough to derive on every render
  const entries: AccountEntry[] = accounts.flatMap((account, i) => (historyQueries[i]?.data ?? []).map((entry) => ({ account, entry })));
  const flow = historyLoading || historyError ? null : buildCashFlow(entries);
  const recent = [...entries].sort((a, b) => b.entry.createdAt.localeCompare(a.entry.createdAt)).slice(0, RECENT_COUNT);
  const spentToday = flow?.days[flow.days.length - 1]?.outPaise ?? '0';

  const retryFailed = (queries: Array<{ isError: boolean; refetch: () => Promise<unknown> }>) => () => {
    for (const q of queries) if (q.isError) void q.refetch();
  };
  const retryHistory = retryFailed(historyQueries);
  const retryBalances = retryFailed(balanceQueries);

  const profile = profileQuery.data;
  const kycStatus: KycStatus | null | undefined = profileQuery.isSuccess ? (profile?.kycStatus ?? null) : undefined;
  const title = profile ? `${greeting()}, ${firstName(profile.fullName)}` : profile === null ? 'Welcome to BankSphere' : 'Welcome back';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}
        title={title}
        description="Here’s where your money stands today."
        actions={
          activeAccounts.length ? (
            <Button asChild>
              <Link to="/transfer">
                <ArrowLeftRight aria-hidden="true" /> Transfer
              </Link>
            </Button>
          ) : null
        }
      />

      <KycNotice profile={profileQuery.isSuccess ? profile : undefined} />
      {profileQuery.isError ? (
        <Callout
          tone="warning"
          title="We couldn’t load your profile"
          action={
            <Button variant="outline" size="sm" onClick={() => void profileQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : null}

      <section aria-label="Summary" aria-busy={balancesLoading || historyLoading} className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total balance"
          icon={Wallet}
          tone="primary"
          loading={balancesLoading && !accountsQuery.isError}
          value={balancesFailed ? '—' : formatPaise(totalBalance)}
          hint={
            balancesFailed && !accountsQuery.isError ? (
              <InlineRetry onRetry={retryBalances}>Some balances couldn’t be loaded.</InlineRetry>
            ) : accountsQuery.isSuccess ? (
              <>
                Across {plural(activeAccounts.length, 'active account')}
                {frozenCount ? ` · ${plural(frozenCount, 'frozen account')} not included` : ''}
              </>
            ) : null
          }
        />
        <StatCard
          label="Accounts"
          icon={Layers}
          loading={accountsQuery.isPending}
          value={accountsQuery.isError ? '—' : String(openAccounts.length)}
          hint={
            accountsQuery.isSuccess
              ? openAccounts.length === 0
                ? 'None yet'
                : frozenCount
                  ? `${activeAccounts.length} active · ${frozenCount} frozen`
                  : 'All active'
              : null
          }
        />
        <StatCard
          label="Spent today"
          icon={ArrowUpRight}
          loading={historyLoading && !accountsQuery.isError}
          value={historyError || accountsQuery.isError ? '—' : formatPaise(spentToday)}
          hint="Moves between your own accounts aren’t counted"
        />
      </section>

      {accountsQuery.isError ? (
        <Card>
          <ErrorState error={accountsQuery.error} onRetry={() => void accountsQuery.refetch()} />
        </Card>
      ) : (
        <AccountsStrip
          accounts={accounts}
          loading={accountsQuery.isPending}
          kycStatus={kycStatus}
          balance={(id) => balanceOf.get(id)}
        />
      )}

      <div className={cn('grid gap-6', accounts.length > 0 && 'lg:grid-cols-3')}>
        {accounts.length > 0 ? (
          <Section title="Cash flow" description="Money in and out over the last 30 days. Transfers between your own accounts are not counted." className="lg:col-span-2">
            <CashFlowChart flow={flow} loading={historyLoading} error={historyError} onRetry={retryHistory} />
          </Section>
        ) : null}
        <QuickActions kycStatus={kycStatus} />
      </div>

      {accounts.length > 0 ? (
        <Section title="Recent activity" description="Your latest payments across all accounts.">
          <RecentActivity items={recent} loading={historyLoading} error={historyError} onRetry={retryHistory} />
        </Section>
      ) : null}
    </div>
  );
}

function Section({ title, description, action, className, children }: { title: string; description?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  const id = useId();
  return (
    <Card role="region" aria-labelledby={id} className={className}>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle id={id}>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function InlineRetry({ onRetry, children }: { onRetry: () => void; children: ReactNode }) {
  return (
    <span>
      {children}{' '}
      <button type="button" className="cursor-pointer font-medium text-primary hover:underline" onClick={onRetry}>
        Try again
      </button>
    </span>
  );
}

interface BalanceState {
  data?: { balanceInPaise: string };
  isPending: boolean;
  isError: boolean;
}

function AccountsStrip({
  accounts,
  loading,
  kycStatus,
  balance,
}: {
  accounts: BankAccount[];
  loading: boolean;
  kycStatus: KycStatus | null | undefined;
  balance: (id: string) => BalanceState | undefined;
}) {
  const visible = accounts.filter((a) => a.status !== 'CLOSED');
  return (
    <Section
      title="Your accounts"
      action={
        visible.length ? (
          <Link to="/accounts" className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline">
            View all <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : null
      }
    >
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Open your first account"
          description="Choose a savings or current account. It’s ready to use as soon as it’s open."
          action={<OpenAccountButton kycStatus={kycStatus} className="items-center text-center" />}
          className="py-8"
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((account) => {
            const state = balance(account.id);
            return (
              <li key={account.id}>
                <Link
                  to={`/accounts/${account.id}`}
                  className="group block rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] font-medium">
                      {ACCOUNT_TYPE_LABEL[account.accountType]}{' '}
                      <span className="font-mono font-normal text-muted-foreground">{maskAccountNumber(account.accountNumber)}</span>
                    </p>
                    <StatusBadge status={account.status} />
                  </div>
                  <p className="mt-3 text-xl font-semibold tracking-tight tnum">
                    {state?.isPending ? (
                      <span className="block">
                        <Skeleton className="h-7 w-28" />
                      </span>
                    ) : state?.isError ? (
                      '—'
                    ) : (
                      formatPaise(state?.data?.balanceInPaise)
                    )}
                  </p>
                  <p className="text-[12px] text-muted-foreground">{state?.isError ? 'Balance unavailable' : 'Balance'}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function QuickActions({ kycStatus }: { kycStatus: KycStatus | null | undefined }) {
  const [opening, setOpening] = useState(false);
  const tile =
    'flex min-h-[88px] flex-col items-start justify-between gap-2 rounded-lg border p-3 text-left text-[13px] font-medium transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer';
  const icon = 'flex size-8 items-center justify-center rounded-md bg-primary-soft text-primary';
  const links = [
    { to: '/transfer', label: 'Transfer', Icon: ArrowLeftRight },
    { to: '/payees?add=1', label: 'Add payee', Icon: UserPlus },
    { to: '/cash-withdrawal', label: 'Cash withdrawal code', Icon: Banknote },
  ];
  return (
    <Section title="Quick actions">
      <div className="grid grid-cols-2 gap-3">
        {links.map(({ to, label, Icon }) => (
          <Link key={to} to={to} className={tile}>
            <span className={icon}>
              <Icon className="size-4" aria-hidden="true" />
            </span>
            {label}
          </Link>
        ))}
        <button type="button" className={tile} disabled={Boolean(openAccountBlocker(kycStatus))} onClick={() => setOpening(true)}>
          <span className={icon}>
            <Plus className="size-4" aria-hidden="true" />
          </span>
          New account
        </button>
      </div>
      <OpenAccountDialog open={opening} onOpenChange={setOpening} />
    </Section>
  );
}

function RecentActivity({ items, loading, error, onRetry }: { items: AccountEntry[]; loading: boolean; error: unknown; onRetry: () => void }) {
  if (error) return <ErrorState error={error} onRetry={onRetry} className="py-8" />;
  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return <EmptyState icon={ReceiptText} title="No transactions yet" description="Money you send or receive will show up here." className="py-8" />;
  }
  return (
    <ul className="-my-3 divide-y">
      {items.map(({ account, entry }) => {
        const credit = entry.entryType === 'CREDIT';
        const Icon = credit ? ArrowDownLeft : ArrowUpRight;
        return (
          <li key={`${account.id}:${entry.entryId}`} className="flex items-center gap-3 py-3">
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full',
                credit ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'
              )}
              aria-hidden="true"
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{entryLabel(entry)}</p>
              <p className="text-[12px] text-muted-foreground">
                {formatDateTime(entry.createdAt)} · <span className="font-mono">{maskAccountNumber(account.accountNumber)}</span>
              </p>
            </div>
            <Amount paise={entry.amountInPaise} direction={entry.entryType} className="text-sm" />
          </li>
        );
      })}
    </ul>
  );
}
