import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Clock, Search } from 'lucide-react';
import { useApi, useUser } from '@/lib/auth/AuthProvider';
import { describeError, isApiError } from '@/lib/api/errors';
import type { AccountLookup, CashOperationResult, CashOperationType } from '@/lib/api/types';
import { formatPaise } from '@/lib/money';
import { newIdempotencyKey } from '@/lib/notify';
import { qk } from '@/lib/query';
import { accountNumberSchema, maskAccountNumber, rupeesSchema } from '@/lib/validation';
import { useStepUp } from '@/features/security/StepUp';
import { ACCOUNT_TYPE_LABEL, formatDateTime, shortId } from '@/features/branch/components/cash';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Callout, CopyButton, DescriptionList, MoneyInput, Skeleton, StatusBadge } from '@/components/ui/primitives';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/overlays';

const findSchema = z.object({ accountNumber: accountNumberSchema });

const noteSchema = z.string().trim().max(255, 'Use at most 255 characters');
const codeSchema = z
  .string()
  .transform((v) => v.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^\d{8}$/, 'Enter the customer’s 8-digit code'));

const depositSchema = z.object({ amount: rupeesSchema(), note: noteSchema, code: z.string() });
const withdrawalSchema = z.object({ amount: rupeesSchema(), note: noteSchema, code: codeSchema });

type DetailsInput = z.input<typeof depositSchema>;
interface Intent {
  amountInPaise: string;
  description?: string;
  authorizationCode?: string;
}

type Step =
  | { kind: 'find' }
  | { kind: 'details'; account: AccountLookup }
  | { kind: 'review'; account: AccountLookup; intent: Intent; key: string }
  | { kind: 'done'; account: AccountLookup; intent: Intent; result: CashOperationResult };

const WORDS: Record<CashOperationType, { noun: string; title: string }> = {
  DEPOSIT: { noun: 'deposit', title: 'Deposit' },
  WITHDRAWAL: { noun: 'withdrawal', title: 'Withdrawal' },
};

/** The two cash transactions a teller can start, each in its own tab */
export function CashDesk() {
  const [tab, setTab] = useState<'deposit' | 'withdrawal'>('deposit');
  const [busy, setBusy] = useState(false);
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
      <TabsList aria-label="Transaction type">
        <TabsTrigger value="deposit" disabled={busy}>
          Deposit
        </TabsTrigger>
        <TabsTrigger value="withdrawal" disabled={busy}>
          Withdrawal
        </TabsTrigger>
      </TabsList>
      <TabsContent value="deposit" className="mt-5">
        <CashFlow type="DEPOSIT" onBusyChange={setBusy} />
      </TabsContent>
      <TabsContent value="withdrawal" className="mt-5">
        <CashFlow type="WITHDRAWAL" onBusyChange={setBusy} />
      </TabsContent>
    </Tabs>
  );
}

interface Problem {
  title: string;
  body: string;
  reference?: string;
}

/** What a failed cash request means at the counter, and what to do next */
function problemFor(error: unknown, type: CashOperationType, amount: string): Problem {
  const code = isApiError(error) ? error.code : '';
  switch (code) {
    case 'WITHDRAWAL_NOT_AUTHORISED':
      return {
        title: 'The withdrawal code wasn’t accepted',
        body: `It must be the customer’s newest code, created for this account and exactly ${formatPaise(amount)}, and not yet expired. Ask the customer to check it, or to create a new one. Repeated wrong codes cancel all of the customer’s codes.`,
      };
    case 'NO_TELLER_SESSION':
      return { title: 'Your cash session isn’t open', body: 'No money was moved. Your desk will refresh to show your session’s current state.' };
    case 'STALE_TELLER_SESSION':
      return {
        title: 'Your session is from a previous business day',
        body: 'No money was moved. Close it with your end-of-day count before handling cash today.',
      };
    case 'INSUFFICIENT_FUNDS':
      return {
        title: 'Not enough balance',
        body: 'The account doesn’t have enough money for this withdrawal. Don’t pay out any cash. The customer can withdraw a smaller amount with a new code.',
      };
    case 'ACCOUNT_INACTIVE':
      return { title: 'This account is frozen or closed', body: 'No money was moved. Ask the customer to contact the bank.' };
    case 'FORBIDDEN':
      return {
        title: 'You can’t handle this transaction',
        body: 'Staff can’t handle cash for their own accounts. Ask a colleague to serve this customer.',
      };
    case 'DAILY_LIMIT_EXCEEDED':
      return {
        title: 'Daily limit reached',
        body:
          type === 'WITHDRAWAL'
            ? 'This withdrawal would take the account past today’s limit. Don’t pay out any cash. The customer can withdraw less, with a new code, or come back tomorrow.'
            : 'This would take the account past today’s limit. No money was moved.',
      };
    default: {
      const { title, description, reference } = describeError(error);
      return { title, body: description, reference };
    }
  }
}

function ProblemCallout({ problem }: { problem: Problem }) {
  return (
    <Callout tone="danger" title={problem.title}>
      <p>{problem.body}</p>
      {problem.reference ? <p className="font-mono text-[11.5px]">Reference: {problem.reference}</p> : null}
    </Callout>
  );
}

function CashFlow({ type, onBusyChange }: { type: CashOperationType; onBusyChange: (busy: boolean) => void }) {
  const api = useApi();
  const user = useUser();
  const queryClient = useQueryClient();
  const { run } = useStepUp();
  const words = WORDS[type];
  const headingId = useId();

  const [step, setStep] = useState<Step>({ kind: 'find' });
  const [lookupProblem, setLookupProblem] = useState<Problem | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** One idempotency key per intent: retries of identical details reuse it, anything changed gets a new one */
  const intentRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);

  const findForm = useForm({ resolver: zodResolver(findSchema), defaultValues: { accountNumber: '' } });
  const detailsForm = useForm<DetailsInput, unknown, z.output<typeof depositSchema>>({
    resolver: zodResolver(type === 'WITHDRAWAL' ? withdrawalSchema : depositSchema),
    defaultValues: { amount: '', note: '', code: '' },
  });

  useEffect(() => onBusyChange(submitting), [submitting, onBusyChange]);
  useEffect(() => {
    // Move focus to the new step's heading so it is announced, and so a second Enter can't confirm unread
    if (step.kind === 'done' || step.kind === 'review') resultRef.current?.focus();
  }, [step.kind]);

  const startOver = () => {
    findForm.reset({ accountNumber: '' });
    detailsForm.reset({ amount: '', note: '', code: '' });
    intentRef.current = null;
    setProblem(null);
    setLookupProblem(null);
    setStep({ kind: 'find' });
    setTimeout(() => findForm.setFocus('accountNumber'), 0);
  };

  const onFind = findForm.handleSubmit(async ({ accountNumber }) => {
    setLookupProblem(null);
    try {
      const account = await api.accounts.lookup(accountNumber);
      detailsForm.reset({ amount: '', note: '', code: '' });
      setProblem(null);
      setStep({ kind: 'details', account });
    } catch (error) {
      if (isApiError(error) && error.code === 'NOT_FOUND') {
        findForm.setError('accountNumber', { message: 'No account has this number. Check it with the customer.' }, { shouldFocus: true });
      } else if (isApiError(error) && error.fieldErrors.accountNumber) {
        findForm.setError('accountNumber', { message: error.fieldErrors.accountNumber }, { shouldFocus: true });
      } else {
        setLookupProblem(problemFor(error, type, '0'));
      }
    }
  });

  const onReview = detailsForm.handleSubmit(({ amount, note, code }) => {
    if (step.kind !== 'details') return;
    const intent: Intent = {
      amountInPaise: amount,
      ...(note ? { description: note } : {}),
      ...(type === 'WITHDRAWAL' ? { authorizationCode: code } : {}),
    };
    const fingerprint = JSON.stringify([type, step.account.id, intent.amountInPaise, intent.description ?? '', intent.authorizationCode ?? '']);
    if (intentRef.current?.fingerprint !== fingerprint) intentRef.current = { fingerprint, key: newIdempotencyKey() };
    setProblem(null);
    setStep({ kind: 'review', account: step.account, intent, key: intentRef.current.key });
  });

  const submit = async () => {
    if (step.kind !== 'review') return;
    const { account, intent, key } = step;
    setSubmitting(true);
    setProblem(null);
    try {
      const base = { accountId: account.id, amountInPaise: intent.amountInPaise, ...(intent.description ? { description: intent.description } : {}) };
      const result = await run(() =>
        type === 'DEPOSIT'
          ? api.teller.deposit(base, key)
          : api.teller.withdraw({ ...base, authorizationCode: intent.authorizationCode ?? '' }, key)
      );
      intentRef.current = null;
      setStep({ kind: 'done', account, intent, result });
      void queryClient.invalidateQueries({ queryKey: qk.cashOperationsAll });
    } catch (error) {
      setProblem(problemFor(error, type, intent.amountInPaise));
      if (!isApiError(error)) return;
      if (error.code === 'WITHDRAWAL_NOT_AUTHORISED') {
        // The code is single-use and attempt-limited: ask for it again rather than resending it
        detailsForm.setValue('code', '');
        setStep({ kind: 'details', account });
        setTimeout(() => detailsForm.setFocus('code'), 0);
      } else if (error.code === 'VALIDATION_ERROR') {
        const fields = error.fieldErrors;
        if (fields.amountInPaise) detailsForm.setError('amount', { message: fields.amountInPaise });
        if (fields.description) detailsForm.setError('note', { message: fields.description });
        if (fields.authorizationCode) detailsForm.setError('code', { message: fields.authorizationCode });
        setStep({ kind: 'details', account });
      } else if (error.code === 'NO_TELLER_SESSION' || error.code === 'STALE_TELLER_SESSION') {
        void queryClient.invalidateQueries({ queryKey: qk.tellerSession });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (step.kind === 'find') {
    return (
      <form onSubmit={onFind} noValidate className="space-y-4">
        {lookupProblem ? <ProblemCallout problem={lookupProblem} /> : null}
        <Field label="Account number" error={findForm.formState.errors.accountNumber?.message} hint="12 digits. Spaces are fine.">
          {(p) => (
            <Input
              {...p}
              {...findForm.register('accountNumber')}
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              maxLength={20}
              placeholder="1001 2345 6789"
              className="max-w-xs font-mono tnum"
              autoFocus
            />
          )}
        </Field>
        <Button type="submit" loading={findForm.formState.isSubmitting}>
          <Search aria-hidden="true" /> Find account
        </Button>
      </form>
    );
  }

  const { account } = step;
  const ownAccount = account.customerId === user.id;
  const blocked = ownAccount || account.status !== 'ACTIVE';

  if (step.kind === 'done') {
    const executed = step.result.status === 'EXECUTED';
    return (
      <section aria-labelledby={headingId} className="space-y-4">
        <div className="flex items-start gap-3">
          <span className={executed ? 'text-success' : 'text-warning'}>
            {executed ? <CheckCircle2 className="size-6" aria-hidden="true" /> : <Clock className="size-6" aria-hidden="true" />}
          </span>
          <div className="space-y-1">
            <h3 id={headingId} ref={resultRef} tabIndex={-1} className="text-base font-semibold outline-none">
              {executed ? `${words.title} completed` : 'Sent to a supervisor for approval'}
            </h3>
            {executed ? (
              <p className="text-sm text-muted-foreground">
                {type === 'WITHDRAWAL'
                  ? `Hand ${formatPaise(step.intent.amountInPaise)} to the customer now.`
                  : 'Put the cash in your drawer and give the customer the reference.'}
              </p>
            ) : (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  This {words.noun} is above the single-approval limit, or it would take your total for today past your daily limit, so a
                  second person must approve it.
                </p>
                <p className="font-medium text-foreground">
                  {type === 'WITHDRAWAL'
                    ? 'Don’t hand over any cash until it’s approved. If it’s rejected, the customer will need a new withdrawal code.'
                    : 'Keep the customer’s cash separate from your drawer until it’s approved.'}
                </p>
              </div>
            )}
          </div>
        </div>
        <DescriptionList
          className="rounded-lg border px-4"
          items={[
            executed && step.result.status === 'EXECUTED'
              ? {
                  label: 'Reference',
                  value: (
                    <span className="inline-flex items-center gap-1">
                      <span className="font-mono text-[13px]">{step.result.transaction.referenceId}</span>
                      <CopyButton value={step.result.transaction.referenceId} label="Copy reference" />
                    </span>
                  ),
                }
              : { label: 'Request', value: <span className="font-mono text-[13px]">{shortId(step.result.cashOperationId)}</span> },
            { label: 'Amount', value: <span className="tnum font-semibold">{formatPaise(step.intent.amountInPaise)}</span> },
            { label: 'Account', value: `${ACCOUNT_TYPE_LABEL[account.accountType]} ${maskAccountNumber(account.accountNumber)}` },
            ...(step.result.status === 'EXECUTED' ? [{ label: 'Time', value: formatDateTime(step.result.transaction.createdAt) }] : []),
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button onClick={startOver}>New {words.noun}</Button>
          {executed ? null : (
            <Button variant="link" asChild>
              <Link to="/teller/operations">Track it in My operations</Link>
            </Button>
          )}
        </div>
      </section>
    );
  }

  if (step.kind === 'review') {
    return (
      <section aria-labelledby={headingId} className="space-y-4">
        <h3 id={headingId} ref={resultRef} tabIndex={-1} className="text-base font-semibold outline-none">
          Check the details with the customer
        </h3>
        {problem ? <ProblemCallout problem={problem} /> : null}
        <DescriptionList
          className="rounded-lg border px-4"
          items={[
            { label: 'Transaction', value: `Cash ${words.noun}` },
            { label: 'Account', value: <AccountLine account={account} /> },
            { label: 'Amount', value: <span className="text-lg font-semibold tnum">{formatPaise(step.intent.amountInPaise)}</span> },
            ...(step.intent.description ? [{ label: 'Note', value: step.intent.description }] : []),
            ...(step.intent.authorizationCode
              ? [{ label: 'Withdrawal code', value: `Entered, ending ${step.intent.authorizationCode.slice(-2)}` }]
              : []),
          ]}
        />
        {type === 'WITHDRAWAL' ? (
          <p className="text-[13px] text-muted-foreground">Hand over cash only after you see the confirmation.</p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            variant="outline"
            disabled={submitting}
            onClick={() => {
              setProblem(null);
              setStep({ kind: 'details', account });
            }}
          >
            <ArrowLeft aria-hidden="true" /> Edit
          </Button>
          <Button onClick={submit} loading={submitting}>
            Confirm {words.noun}
          </Button>
        </div>
      </section>
    );
  }

  // details
  const errors = detailsForm.formState.errors;
  return (
    <div className="space-y-5">
      <AccountSummary account={account} onChange={startOver} />
      {ownAccount ? (
        <Callout tone="danger" title="This is your own account">
          Staff can’t handle cash for their own accounts. Ask a colleague to serve you.
        </Callout>
      ) : account.status !== 'ACTIVE' ? (
        <Callout tone="danger" title={`This account is ${account.status.toLowerCase()}`}>
          Cash can’t be paid in or out of it. Ask the customer to contact the bank.
        </Callout>
      ) : null}
      {blocked ? null : (
        <form onSubmit={onReview} noValidate className="space-y-4">
          {problem ? <ProblemCallout problem={problem} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount" error={errors.amount?.message}>
              {(p) => <MoneyInput {...p} {...detailsForm.register('amount')} autoFocus />}
            </Field>
            {type === 'WITHDRAWAL' ? (
              <Field
                label="Customer’s withdrawal code"
                error={errors.code?.message}
                hint="The customer creates this 8-digit code in their app for this account and this exact amount. Codes expire after a few minutes."
              >
                {(p) => (
                  <Input
                    {...p}
                    {...detailsForm.register('code')}
                    inputMode="numeric"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={12}
                    placeholder="•••• ••••"
                    className="font-mono tracking-widest tnum"
                  />
                )}
              </Field>
            ) : null}
          </div>
          <Field label="Note" optional error={errors.note?.message} hint="Shown on the customer’s statement.">
            {(p) => <Input {...p} {...detailsForm.register('note')} maxLength={255} autoComplete="off" />}
          </Field>
          <Button type="submit">Review {words.noun}</Button>
        </form>
      )}
    </div>
  );
}

function useHolderName(customerId: string) {
  const api = useApi();
  return useQuery({
    queryKey: qk.customer(customerId),
    queryFn: () => api.customers.get(customerId),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

function HolderName({ customerId }: { customerId: string }) {
  const holder = useHolderName(customerId);
  if (holder.isPending) return <Skeleton className="h-5 w-32" />;
  if (holder.isError || !holder.data) return <span className="text-muted-foreground">Name unavailable</span>;
  return <span className="font-medium">{holder.data.fullName}</span>;
}

function AccountLine({ account }: { account: AccountLookup }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <span className="tnum">
        {ACCOUNT_TYPE_LABEL[account.accountType]} {maskAccountNumber(account.accountNumber)}
      </span>
      <span aria-hidden="true" className="text-muted-foreground">
        ·
      </span>
      <HolderName customerId={account.customerId} />
    </span>
  );
}

function AccountSummary({ account, onChange }: { account: AccountLookup; onChange: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Customer account" role="group">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <HolderName customerId={account.customerId} />
          <StatusBadge status={account.status} />
        </div>
        <div className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted-foreground">
          <p>{ACCOUNT_TYPE_LABEL[account.accountType]} account</p>
          <span aria-hidden="true">·</span>
          <p className="font-mono tnum text-foreground">{maskAccountNumber(account.accountNumber)}</p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onChange} className="self-start sm:self-center">
        Change account
      </Button>
    </div>
  );
}
