import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Ban, CalendarCheck2, Hourglass, Inbox, RotateCw } from 'lucide-react';
import { useApi } from '@/lib/auth/AuthProvider';
import { qk } from '@/lib/query';
import type { TellerSession, TellerSessionStatus } from '@/lib/api/types';
import { Discrepancy, PAGE_SIZE, formatBusinessDate, formatDateTime, istToday } from '@/features/branch/components/cash';
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
  DescriptionList,
  EmptyState,
  PageHeader,
  Skeleton,
  StatusBadge,
} from '@/components/ui/primitives';
import { CashDesk } from './components/CashDesk';
import { AcceptFloatForm, DeclareCountForm } from './components/CountForms';

/** How often the desk checks for a supervisor's action while the teller is waiting on one */
const POLL_MS = 15_000;

const STATUS_LABEL: Record<TellerSessionStatus, string> = {
  ISSUED: 'Float issued',
  OPEN: 'Open',
  CLOSED: 'Awaiting sign-off',
  RECONCILED: 'Signed off',
  CANCELLED: 'Cancelled',
};

export default function TellerDeskPage() {
  const api = useApi();
  const query = useQuery({
    queryKey: qk.tellerSession,
    queryFn: () => api.teller.currentSession(),
    // Nothing changes under an open desk except the teller's own actions; every other state waits on a supervisor
    refetchInterval: (q) => (q.state.data?.status === 'OPEN' ? false : POLL_MS),
  });
  const session = query.data ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Branch"
        title="Cash desk"
        description={session ? `Business date ${formatBusinessDate(session.businessDate)}` : 'Your cash session for the business day.'}
        actions={session ? <StatusBadge status={session.status} label={STATUS_LABEL[session.status]} /> : null}
      />
      {query.isPending ? (
        <Card>
          <CardContent className="space-y-4 pt-6 sm:pt-6">
            <p role="status" className="sr-only">
              Loading your cash session…
            </p>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-full max-w-md" />
            <Skeleton className="h-10 w-full max-w-xs" />
          </CardContent>
        </Card>
      ) : query.isError && query.data === undefined ? (
        <Card>
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </Card>
      ) : (
        <SessionView session={session} checking={query.isFetching} onCheck={() => void query.refetch()} />
      )}
    </div>
  );
}

function SessionView({ session, checking, onCheck }: { session: TellerSession | null; checking: boolean; onCheck: () => void }) {
  if (!session) {
    return (
      <Card>
        <EmptyState
          icon={Inbox}
          title="No float issued yet"
          description="Ask your supervisor to issue today’s opening float. This page checks for it every 15 seconds."
          action={
            <Button variant="outline" size="sm" onClick={onCheck} aria-busy={checking || undefined}>
              <RotateCw aria-hidden="true" className={checking ? 'animate-spin' : undefined} /> Check now
            </Button>
          }
        />
      </Card>
    );
  }

  switch (session.status) {
    case 'ISSUED':
      return (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Count your opening float</CardTitle>
            <CardDescription>
              Your supervisor has issued your float. Count every note and coin you were handed and enter the total. The issued amount isn’t
              shown, so your count is independent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AcceptFloatForm />
          </CardContent>
        </Card>
      );
    case 'OPEN':
      return <OpenDesk session={session} />;
    case 'CLOSED':
      return <AwaitingSignOff session={session} />;
    case 'RECONCILED':
      return (
        <Card className="max-w-2xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CalendarCheck2 className="size-5 text-success" aria-hidden="true" />
              <CardTitle>Day closed</CardTitle>
            </div>
            <CardDescription>Day closed and signed off at {formatDateTime(session.signedOffAt)}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {session.declaredClosing ? (
              <DescriptionList
                items={[
                  { label: 'Your count', value: <Amount paise={session.declaredClosing} /> },
                  ...(session.expectedClosing ? [{ label: 'Expected', value: <Amount paise={session.expectedClosing} /> }] : []),
                  ...(session.discrepancy !== undefined && session.discrepancy !== null
                    ? [{ label: 'Difference', value: <Discrepancy paise={session.discrepancy} /> }]
                    : []),
                ]}
              />
            ) : null}
            <p className="text-sm text-muted-foreground">You’re done for the day. Your next float will appear here when it’s issued.</p>
          </CardContent>
        </Card>
      );
    case 'CANCELLED':
      return (
        <Card className="max-w-2xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Ban className="size-5 text-muted-foreground" aria-hidden="true" />
              <CardTitle>Float cancelled</CardTitle>
            </div>
            <CardDescription>
              Your supervisor cancelled the float issued for {formatBusinessDate(session.businessDate)}. Hand back any cash you received
              from it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">A new float will appear here when it’s issued. This page checks every 15 seconds.</p>
          </CardContent>
        </Card>
      );
    default:
      return null;
  }
}

function OpenDesk({ session }: { session: TellerSession }) {
  const api = useApi();
  const stale = session.businessDate < istToday();
  // Operations still awaiting a supervisor block closing: say so before the teller counts the drawer
  const pending = useQuery({
    queryKey: qk.cashOperations('PENDING_APPROVAL', 0),
    queryFn: () => api.teller.cashOperations({ status: 'PENDING_APPROVAL', limit: PAGE_SIZE, offset: 0 }),
    refetchInterval: (q) => (q.state.data?.length ? POLL_MS : false),
  });
  const waiting = pending.data?.length ?? 0;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      {stale ? (
        <Callout tone="warning" title="This session is from a previous business day">
          It was opened for {formatBusinessDate(session.businessDate)}. Close it with your end-of-day count before you handle any cash today.
        </Callout>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Serve a customer</CardTitle>
            <CardDescription>
              Session open since {formatDateTime(session.acceptedAt ?? session.openedAt)}. Find the customer’s account, then enter the amount.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CashDesk />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>End of day</CardTitle>
          <CardDescription>
            When you’ve served your last customer, count all the cash in your drawer and declare the total. Your supervisor then counts it
            independently to sign off.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {waiting > 0 ? (
            <Callout tone="warning" title={`${waiting >= PAGE_SIZE ? `${PAGE_SIZE} or more operations are` : waiting === 1 ? '1 operation is' : `${waiting} operations are`} waiting for a supervisor`}>
              <p>A supervisor must approve or reject them before you can close.</p>
              <p>
                <Link to="/teller/operations" className="font-medium text-primary underline-offset-2 hover:underline">
                  Review My operations
                </Link>
              </p>
            </Callout>
          ) : null}
          <DeclareCountForm
            label="Cash in drawer"
            submitLabel="Close session"
            confirmTitle="Close your cash session?"
            confirmDescription={(amount) =>
              `You’re declaring ${amount} in your drawer. After closing you can’t take deposits or pay out withdrawals. Your supervisor will count the drawer independently to sign off.`
            }
            confirmLabel="Declare and close"
            successTitle="Session closed"
            successDescription="Your supervisor will now count and sign off."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function AwaitingSignOff({ session }: { session: TellerSession }) {
  const [redeclaring, setRedeclaring] = useState(false);
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Hourglass className="size-5 text-warning" aria-hidden="true" />
          <CardTitle>Waiting for supervisor sign-off</CardTitle>
        </div>
        <CardDescription>You declared your closing count at {formatDateTime(session.closedAt)}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          A supervisor will count your drawer independently and sign off. Keep the drawer sealed until then. This page updates automatically.
        </p>
        {redeclaring ? (
          <div className="space-y-3 rounded-lg border p-4">
            <p className="text-sm font-medium">Correct your count</p>
            <DeclareCountForm
              label="Corrected cash count"
              submitLabel="Re-declare count"
              confirmTitle="Replace your declared count?"
              confirmDescription={(amount) =>
                `Your new count of ${amount} replaces the one you declared earlier. Your supervisor still counts independently before signing off.`
              }
              confirmLabel="Replace count"
              successTitle="Count updated"
              successDescription="Your supervisor will count against your corrected figure."
              onDone={() => setRedeclaring(false)}
            />
            <Button variant="ghost" size="sm" onClick={() => setRedeclaring(false)}>
              Keep my count
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="text-sm text-muted-foreground">Miscounted?</p>
            <Button variant="outline" size="sm" onClick={() => setRedeclaring(true)}>
              Re-declare your count
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
