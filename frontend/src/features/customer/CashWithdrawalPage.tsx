import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { BadgeCheck, Banknote, IdCard, MailCheck, PhoneOff, RefreshCcw, TimerOff, Wallet } from 'lucide-react';
import type { BankAccount, WithdrawalCode } from '@/lib/api/types';
import { describeError, isApiError } from '@/lib/api/errors';
import { useAuth } from '@/lib/auth/AuthProvider';
import { comparePaise, formatPaise, parseRupees } from '@/lib/money';
import { rupeesSchema } from '@/lib/validation';
import { useStepUp } from '@/features/security/StepUp';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/data';
import { Field, NativeSelect } from '@/components/ui/input';
import {
  Callout,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CopyButton,
  DescriptionList,
  EmptyState,
  MoneyInput,
  PageHeader,
  Skeleton,
} from '@/components/ui/primitives';
import { useAccounts, useBalances, useNow } from './hooks';
import { POLICY, accountShortName, formatClock, formatTime } from './lib';

const schema = z.object({
  accountId: z.string().min(1, 'Choose an account'),
  amount: rupeesSchema(),
});
type Values = z.output<typeof schema>;

/** "12345678" -> "1234 5678" */
const spaced = (code: string) => code.replace(/(\d{4})(?=\d)/g, '$1 ');

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <PageHeader title="Cash withdrawal" description="Create a one-time code to take cash out at any BankSphere branch." />
      {children}
    </div>
  );
}

export default function CashWithdrawalPage() {
  const accountsQuery = useAccounts();
  if (accountsQuery.isError) {
    return (
      <Shell>
        <Card>
          <ErrorState error={accountsQuery.error} onRetry={() => void accountsQuery.refetch()} />
        </Card>
      </Shell>
    );
  }
  if (accountsQuery.isPending) {
    return (
      <Shell>
        <Card className="max-w-xl space-y-5 p-6" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-32" />
        </Card>
      </Shell>
    );
  }
  const active = accountsQuery.data.filter((a) => a.status === 'ACTIVE');
  if (active.length === 0) {
    return (
      <Shell>
        <Card>
          <EmptyState
            icon={Wallet}
            title="No active account"
            description="You need an active account to withdraw cash. Open one, or contact the bank if your account is frozen."
            action={
              <Button asChild variant="outline">
                <Link to="/accounts">Go to accounts</Link>
              </Button>
            }
          />
        </Card>
      </Shell>
    );
  }
  return (
    <Shell>
      <WithdrawalFlow accounts={active} />
    </Shell>
  );
}

interface Issued {
  code: WithdrawalCode;
  account: BankAccount;
  issuedAt: number;
}

function WithdrawalFlow({ accounts }: { accounts: BankAccount[] }) {
  const { api, user } = useAuth();
  const { run } = useStepUp();
  const balanceQueries = useBalances(accounts.map((a) => a.id));
  // The code itself lives only in this component's memory: never cached, stored or sent anywhere else
  const [issued, setIssued] = useState<Issued | null>(null);
  /** After "Done": what is still valid, without the code */
  const [outstanding, setOutstanding] = useState<{ account: BankAccount; amountInPaise: string; expiresAt: string } | null>(null);
  const [problem, setProblem] = useState<{ title: string; description: string } | null>(null);
  const now = useNow(1000, Boolean(issued || outstanding));
  const form = useForm<z.input<typeof schema>, unknown, Values>({
    resolver: zodResolver(schema),
    defaultValues: { accountId: accounts[0]?.id ?? '', amount: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const [accountId, amountText] = form.watch(['accountId', 'amount']);
  const balance = balanceQueries[accounts.findIndex((a) => a.id === accountId)];
  const available = balance?.data?.balanceInPaise;
  const typed = parseRupees(amountText ?? '');
  const needsStepUp = Boolean(typed && comparePaise(typed, POLICY.withdrawalCodeStepUpPaise) >= 0);
  const aboveBalance = Boolean(typed && available && comparePaise(typed, available) > 0);

  const onSubmit = form.handleSubmit(async (values) => {
    setProblem(null);
    const account = accounts.find((a) => a.id === values.accountId);
    if (!account) return;
    try {
      const code = await run(() => api.ledger.createWithdrawalCode(account.id, values.amount));
      // Describe what the bank confirmed, not what was typed
      setIssued({ code, account: accounts.find((a) => a.id === code.accountId) ?? account, issuedAt: Date.now() });
      setOutstanding(null);
      form.reset({ accountId: account.id, amount: '' });
    } catch (error) {
      if (isApiError(error)) {
        if (error.requiresStepUp) {
          const threshold = formatPaise(POLICY.withdrawalCodeStepUpPaise);
          setProblem(
            user?.mfa
              ? {
                  title: 'Authenticator code needed',
                  description: `Codes of ${threshold} or more must be approved with a code from your authenticator app. Try again when you have it.`,
                }
              : {
                  title: 'Set up an authenticator first',
                  description: `Codes of ${threshold} or more must be approved with an authenticator app. Set one up in Security settings, or choose a smaller amount.`,
                }
          );
          return;
        }
        if (error.code === 'AMOUNT_TOO_LARGE') {
          form.setError('amount', { message: 'That’s more than you can withdraw in a day. Try a smaller amount.' }, { shouldFocus: true });
          return;
        }
        if (error.code === 'INVALID_AMOUNT' || error.code === 'VALIDATION_ERROR') {
          form.setError('amount', { message: error.fieldErrors.amountInPaise ?? 'Enter an amount greater than ₹0.00' }, { shouldFocus: true });
          return;
        }
      }
      setProblem(describeError(error));
    }
  });

  if (issued) {
    const remaining = new Date(issued.code.expiresAt).getTime() - now;
    if (remaining <= 0) {
      const ttl = Math.max(1, Math.round((new Date(issued.code.expiresAt).getTime() - issued.issuedAt) / 60_000));
      return (
        <Card className="max-w-xl" role="status">
          <EmptyState
            icon={TimerOff}
            title="This code has expired"
            description={`For your security, codes only last ${ttl} minute${ttl === 1 ? '' : 's'}. Create a new one when you’re at the branch.`}
            action={
              <Button onClick={() => setIssued(null)}>
                <RefreshCcw aria-hidden="true" /> Create a new code
              </Button>
            }
          />
        </Card>
      );
    }
    return (
      <CodeCard
        issued={issued}
        remaining={remaining}
        onDone={() => {
          setOutstanding({ account: issued.account, amountInPaise: issued.code.amountInPaise, expiresAt: issued.code.expiresAt });
          setIssued(null);
        }}
      />
    );
  }

  const stillValid = outstanding && new Date(outstanding.expiresAt).getTime() > now ? outstanding : null;
  const amountHint =
    aboveBalance || needsStepUp ? (
      <span className="block space-y-1">
        {aboveBalance && available ? (
          <span className="block font-medium text-warning">
            That’s more than the available balance of {formatPaise(available)}, so the branch would decline it.
          </span>
        ) : null}
        {needsStepUp ? (
          <span className="block">Codes of {formatPaise(POLICY.withdrawalCodeStepUpPaise)} or more need a code from your authenticator app.</span>
        ) : null}
      </span>
    ) : undefined;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card>
        <form onSubmit={onSubmit} noValidate>
          <CardHeader>
            <CardTitle>Create a withdrawal code</CardTitle>
            <CardDescription>Choose the account and the exact amount you’ll take out.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {stillValid ? (
              <Callout tone="info" title="You have an active code">
                {`A code for ${formatPaise(stillValid.amountInPaise)} from ${accountShortName(stillValid.account)} is active until ${formatTime(stillValid.expiresAt)}. Creating a new code cancels it.`}
              </Callout>
            ) : null}
            {problem ? (
              <Callout tone="danger" title={problem.title}>
                {problem.description}
              </Callout>
            ) : null}
            <Field
              label="Account"
              error={errors.accountId?.message}
              hint={available ? `Available balance: ${formatPaise(available)}` : balance?.isError ? 'Balance unavailable right now' : undefined}
            >
              {(p) => (
                <NativeSelect {...p} {...form.register('accountId')}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {accountShortName(a)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label="Amount" error={errors.amount?.message} hint={amountHint}>
              {(p) => <MoneyInput {...p} {...form.register('amount')} />}
            </Field>
          </CardContent>
          <CardFooter className="justify-end">
            <Button type="submit" loading={isSubmitting}>
              <Banknote aria-hidden="true" /> Create code
            </Button>
          </CardFooter>
        </form>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>How it works</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-[13px] text-muted-foreground">
            {[
              'Create a code here for the exact amount you need.',
              `Go to any BankSphere branch within ${POLICY.withdrawalCodeTtlMinutes} minutes.`,
              'Give the teller the code and show your photo ID. The code works only once.',
            ].map((text, i) => (
              <li key={text} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[12px] font-semibold text-primary" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="pt-0.5">{text}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function CodeCard({ issued, remaining, onDone }: { issued: Issued; remaining: number; onDone: () => void }) {
  const headingId = useId();
  const { code, account } = issued;
  const total = Math.max(1, new Date(code.expiresAt).getTime() - issued.issuedAt);
  const left = Math.min(100, Math.max(0, (remaining / total) * 100));
  const amount = formatPaise(code.amountInPaise);
  const guidance = [
    { icon: IdCard, text: 'Show it to the teller together with your photo ID at any BankSphere branch.' },
    { icon: BadgeCheck, text: `It works once, for exactly ${amount} from ${accountShortName(account)}.` },
    { icon: RefreshCcw, text: 'Creating a new code cancels this one.' },
    { icon: PhoneOff, text: 'BankSphere will never ask for this code by phone, SMS or email. Only the teller at the counter needs it.' },
  ];
  return (
    <Card role="region" aria-labelledby={headingId} className="max-w-xl">
      <CardHeader>
        <CardTitle id={headingId}>Your withdrawal code</CardTitle>
        <CardDescription>We show it only once. Note it down, or keep this screen open at the branch.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-xl border bg-muted/40 px-4 py-6 text-center">
          <div className="flex flex-col items-center justify-center gap-1 sm:flex-row sm:gap-2">
            <p aria-hidden="true" className="select-all whitespace-nowrap font-mono text-3xl font-semibold tracking-[0.15em] tnum sm:text-5xl sm:tracking-[0.2em]">
              {spaced(code.authorizationCode)}
            </p>
            <CopyButton value={code.authorizationCode} label="Copy code" className="size-9" />
          </div>
          <p className="sr-only">Your code is {code.authorizationCode.split('').join(' ')}</p>
          <p className="mt-3 text-[13px] text-muted-foreground tnum">
            <span aria-hidden="true">Expires in {formatClock(remaining)}</span>
            <span className="sr-only">Expires at {formatTime(code.expiresAt)}</span>
          </p>
          <div className="mx-auto mt-2 h-1 max-w-[12rem] overflow-hidden rounded-full bg-border" aria-hidden="true">
            <div className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${left}%` }} />
          </div>
        </div>
        <DescriptionList
          items={[
            { label: 'Amount', value: <span className="font-medium tnum">{amount}</span> },
            { label: 'From', value: accountShortName(account) },
            { label: 'Valid until', value: formatTime(code.expiresAt) },
          ]}
        />
        <ul className="space-y-2.5">
          {guidance.map(({ icon: Icon, text }) => (
            <li key={text} className="flex gap-3 text-[13px]">
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <p className="flex gap-3 text-[12.5px] text-muted-foreground">
          <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          We’ve also emailed you to say a code was created. The email doesn’t contain the code.
        </p>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={onDone}>Done</Button>
      </CardFooter>
    </Card>
  );
}
