import { useId, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { Lock, LockOpen, SlidersHorizontal, Wallet, XCircle } from 'lucide-react';
import { useApi } from '@/lib/auth/AuthProvider';
import { qk } from '@/lib/query';
import type { AccountStatus, BankAccount } from '@/lib/api/types';
import { comparePaise, formatPaise } from '@/lib/money';
import { notifyError, notifySuccess } from '@/lib/notify';
import { formatAccountNumber } from '@/lib/validation';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/data';
import { ConfirmDialog } from '@/components/ui/overlays';
import { Amount, Callout, Card, CardContent, CardDescription, CardHeader, CardTitle, CopyButton, EmptyState, Skeleton, StatusBadge } from '@/components/ui/primitives';
import { DailyLimitDialog } from './DailyLimitDialog';
import { RecentTransactions } from './RecentTransactions';
import { applyAccountUpdate } from './accountCache';
import { formatDate } from './format';
import { hasCode, isRefusal } from './hooks';
import { OutcomeCallout, outcomeFromError, type Outcome } from './Outcome';

type StatusAction = 'freeze' | 'unfreeze' | 'close';

const TARGET: Record<StatusAction, AccountStatus> = { freeze: 'FROZEN', unfreeze: 'ACTIVE', close: 'CLOSED' };
const DONE: Record<StatusAction, [string, string]> = {
  freeze: ['Account frozen', 'Payments in and out are blocked. The customer has been told by email.'],
  unfreeze: ['Account unfrozen', 'Payments in and out can resume.'],
  close: ['Account closed', 'The account can no longer be used.'],
};

function Stat({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[15px] font-semibold tnum">{children}</dd>
      {hint ? <dd className="mt-0.5 text-[12px] text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

function AccountControls({ account, customerId, balance }: { account: BankAccount; customerId: string; balance: string | undefined }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<StatusAction | null>(null);
  const [limitOpen, setLimitOpen] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const last4 = account.accountNumber.slice(-4);
  const number = formatAccountNumber(account.accountNumber);

  const run = async (current: StatusAction) => {
    setOutcome(null);
    try {
      const updated = await api.accounts.setStatus(account.id, TARGET[current]);
      applyAccountUpdate(queryClient, customerId, updated);
      notifySuccess(...DONE[current]);
    } catch (error) {
      if (!isRefusal(error)) {
        notifyError(error);
        throw error; // keep the dialog open to try again
      }
      if (current === 'unfreeze' && hasCode(error, 'FORBIDDEN')) {
        setOutcome({
          tone: 'danger',
          title: 'A different administrator must unfreeze this account',
          body: 'Dual control: an account frozen by an administrator can only be unfrozen by someone else. Ask a colleague to review it.',
        });
      } else {
        setOutcome(outcomeFromError(error));
      }
      void queryClient.invalidateQueries({ queryKey: qk.customerAccounts(customerId) });
      if (hasCode(error, 'BALANCE_NOT_ZERO')) void queryClient.invalidateQueries({ queryKey: qk.balance(account.id) });
    }
  };

  const holdsMoney = balance !== undefined && comparePaise(balance, '0') !== 0;
  const dialog = action
    ? {
        freeze: {
          title: `Freeze account ${number}?`,
          description:
            'No money can be paid in or out until the account is unfrozen, and the customer is told by email. Dual control applies: a different administrator will have to unfreeze it.',
          confirmLabel: 'Freeze account',
          tone: 'destructive' as const,
          body: null,
        },
        unfreeze: {
          title: `Unfreeze account ${number}?`,
          description:
            'Payments in and out resume straight away. If you froze this account yourself, a different administrator must unfreeze it.',
          confirmLabel: 'Unfreeze account',
          tone: 'primary' as const,
          body: null,
        },
        close: {
          title: `Close account ${number} permanently?`,
          description: 'Closing can’t be undone. The balance must be zero, so move any remaining money first.',
          confirmLabel: 'Close account',
          tone: 'destructive' as const,
          body: holdsMoney ? (
            <Callout tone="warning" title={`This account still holds ${formatPaise(balance)}`}>
              The bank will refuse to close it until the balance is zero.
            </Callout>
          ) : balance !== undefined ? (
            <p className="text-[13px] text-muted-foreground">Balance: {formatPaise(balance)}</p>
          ) : null,
        },
      }[action]
    : null;

  return (
    <div className="space-y-3">
      <OutcomeCallout outcome={outcome} onDismiss={() => setOutcome(null)} />
      <div className="flex flex-wrap gap-2">
        {account.status === 'ACTIVE' ? (
          <Button variant="outline" size="sm" aria-label={`Freeze account ending ${last4}`} onClick={() => setAction('freeze')}>
            <Lock aria-hidden="true" /> Freeze
          </Button>
        ) : (
          <Button variant="outline" size="sm" aria-label={`Unfreeze account ending ${last4}`} onClick={() => setAction('unfreeze')}>
            <LockOpen aria-hidden="true" /> Unfreeze
          </Button>
        )}
        <Button variant="outline" size="sm" aria-label={`Set daily limit for account ending ${last4}`} onClick={() => setLimitOpen(true)}>
          <SlidersHorizontal aria-hidden="true" /> Set daily limit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive-soft hover:text-destructive"
          aria-label={`Close account ending ${last4}`}
          onClick={() => setAction('close')}
        >
          <XCircle aria-hidden="true" /> Close account
        </Button>
      </div>
      {account.status === 'FROZEN' ? (
        <p className="text-[12.5px] text-muted-foreground">
          Dual control: only an administrator other than the one who froze this account can unfreeze it.
        </p>
      ) : null}
      {dialog ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setAction(null);
          }}
          title={dialog.title}
          description={dialog.description}
          confirmLabel={dialog.confirmLabel}
          tone={dialog.tone}
          onConfirm={() => run(action!)}
        >
          {dialog.body}
        </ConfirmDialog>
      ) : null}
      <DailyLimitDialog open={limitOpen} onOpenChange={setLimitOpen} account={account} customerId={customerId} />
    </div>
  );
}

function AccountPanel({ account, customerId, canAdminister }: { account: BankAccount; customerId: string; canAdminister: boolean }) {
  const api = useApi();
  const typeLabel = account.accountType === 'SAVINGS' ? 'Savings account' : 'Current account';
  const balance = useQuery({ queryKey: qk.balance(account.id), queryFn: () => api.ledger.balance(account.id) });
  const last4 = account.accountNumber.slice(-4);
  const ceiling = account.bankLimitCeilingPaise;

  return (
    <section aria-label={`${typeLabel} ending ${last4}`} className="space-y-4 rounded-lg border p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{typeLabel}</h3>
          <p className="flex items-center gap-1 font-mono text-[13px] text-muted-foreground tnum">
            {formatAccountNumber(account.accountNumber)}
            <CopyButton value={account.accountNumber} label="Copy account number" />
          </p>
          <p className="text-[12px] text-muted-foreground">Opened {formatDate(account.createdAt)}</p>
        </div>
        <StatusBadge status={account.status} />
      </div>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Balance">
          {balance.isPending ? (
            <Skeleton className="mt-1 h-5 w-28" />
          ) : balance.isError ? (
            <span className="flex items-center gap-2 text-[13px] font-normal text-muted-foreground">
              Unavailable
              <Button variant="link" className="text-[13px]" aria-label="Retry loading the balance" onClick={() => void balance.refetch()}>
                Retry
              </Button>
            </span>
          ) : (
            <Amount paise={balance.data.balanceInPaise} className="font-semibold" />
          )}
        </Stat>
        <Stat label="Daily limit">{formatPaise(account.dailyLimitPaise)}</Stat>
        <Stat label="Bank ceiling" hint={ceiling ? 'The customer can’t raise their limit above this.' : 'The customer’s own cap applies.'}>
          {ceiling ? formatPaise(ceiling) : <span className="font-normal text-muted-foreground">None set</span>}
        </Stat>
      </dl>
      {canAdminister && account.status !== 'CLOSED' ? (
        <AccountControls account={account} customerId={customerId} balance={balance.data?.balanceInPaise} />
      ) : null}
      <RecentTransactions accountId={account.id} last4={last4} />
    </section>
  );
}

export function AccountsSection({
  customerId,
  query,
  canAdminister,
  me,
}: {
  customerId: string;
  query: UseQueryResult<BankAccount[]>;
  canAdminister: boolean;
  me: string;
}) {
  const titleId = useId();
  const accounts = query.data;
  return (
    <Card role="region" aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId}>Accounts{accounts?.length ? <span className="ml-1.5 font-normal text-muted-foreground tnum">{accounts.length}</span> : null}</CardTitle>
        <CardDescription>Balances and transactions are read live from the ledger; staff reads are audited.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isPending ? (
          <div className="space-y-3" aria-hidden="true">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} className="py-6" />
        ) : accounts!.length === 0 ? (
          <EmptyState icon={Wallet} title="No accounts" description="The customer can open an account once their KYC is verified." className="py-6" />
        ) : (
          accounts!.map((account) => (
            <AccountPanel
              key={account.id}
              account={account}
              customerId={customerId}
              // On their own account an administrator has only a customer's rights
              canAdminister={canAdminister && account.customerId !== me}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
