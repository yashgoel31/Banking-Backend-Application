import { useId } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { HandCoins, Siren, Stamp, Vault } from 'lucide-react';
import { useApi, useUser } from '@/lib/auth/AuthProvider';
import { formatPaise } from '@/lib/money';
import { qk } from '@/lib/query';
import { humanize, PageHeader } from '@/components/ui/primitives';
import { AttentionList, type AttentionItem } from './components/AttentionList';
import { CashStatusChart } from './components/CashStatusChart';
import { countLabel, durationSince, formatDate, formatLongDate, greeting, localDay, nameFromEmail } from './components/format';
import { KpiCard, type KpiState } from './components/KpiCard';
import { PersonName, RequestSubject } from './components/People';
import { RecentRequests } from './components/RecentRequests';
import { isExpired, requestTargetId, requestTitle } from './components/requests';
import { useUserLookup, type ResolvePerson } from './components/useUserLookup';

/** The list APIs have no totals: one page of this size is counted, and a full page reads "100+" */
const QUEUE_LIMIT = 100;
const ATTENTION_ITEMS = 6;

const QUEUES = {
  requests: { label: 'Pending four-eyes requests', href: '/approvals', icon: Stamp, tone: 'warning' },
  cash: { label: 'Cash awaiting approval', href: '/cash-operations', icon: HandCoins, tone: 'warning' },
  sessions: { label: 'Teller sessions to sign off', href: '/teller-sessions', icon: Vault, tone: 'warning' },
  alerts: { label: 'Open fraud alerts', href: '/fraud', icon: Siren, tone: 'danger' },
} as const;

type Pending = AttentionItem & { people: string[]; render: (resolve: ResolvePerson) => AttentionItem['detail'] };

function kpiState<T>(query: UseQueryResult<T[]>, waitingSince: (row: T) => string, now: number): KpiState {
  if (query.isPending) return { status: 'loading' };
  if (query.isError) return { status: 'error', retry: () => void query.refetch() };
  const rows = query.data;
  const count = rows.length;
  const oldest = rows.map(waitingSince).sort()[0];
  let hint = 'Nothing waiting';
  if (count >= QUEUE_LIMIT) hint = `Showing the newest ${QUEUE_LIMIT}`;
  else if (oldest) hint = `Oldest waiting ${durationSince(oldest, now)}`;
  return { status: 'ready', count, value: countLabel(count, QUEUE_LIMIT), hint };
}

export default function OverviewPage() {
  const api = useApi();
  const me = useUser();
  const queuesId = useId();
  const now = Date.now();
  const name = nameFromEmail(me.email);

  // Each queue is its own query, so one failing service never blanks the page. Keys extend the shared
  // families (qk.*) so any decision made elsewhere also refreshes these counts.
  const requests = useQuery({
    queryKey: [...qk.adminRequests('PENDING', 0), { limit: QUEUE_LIMIT }],
    queryFn: () => api.admin.requests({ status: 'PENDING', limit: QUEUE_LIMIT }),
  });
  const cash = useQuery({
    queryKey: [...qk.cashOperations('PENDING_APPROVAL', 0), { limit: QUEUE_LIMIT }],
    queryFn: () => api.teller.cashOperations({ status: 'PENDING_APPROVAL', limit: QUEUE_LIMIT }),
  });
  const sessions = useQuery({
    queryKey: [...qk.sessions('CLOSED', 0), { limit: QUEUE_LIMIT }],
    queryFn: () => api.supervisor.sessions({ status: 'CLOSED', limit: QUEUE_LIMIT }),
  });
  const alerts = useQuery({
    queryKey: [...qk.alerts('OPEN', 0), { limit: QUEUE_LIMIT }],
    queryFn: () => api.fraud.alerts({ status: 'OPEN', limit: QUEUE_LIMIT }),
  });

  const sessionSince = (s: { closedAt: string | null; openedAt: string }) => s.closedAt ?? s.openedAt;

  const pending: Pending[] = [
    // Only requests this administrator can actually approve: not their own, not about them, not expired
    // (expired ones can only be cleared, and are flagged on the Approvals page)
    ...(requests.data ?? [])
      .filter((r) => r.requestedBy !== me.id && requestTargetId(r) !== me.id && !isExpired(r, now))
      .map<Pending>((r) => ({
        key: `request-${r.id}`,
        kind: 'Four-eyes request',
        title: requestTitle(r),
        since: r.createdAt,
        href: '/approvals',
        icon: Stamp,
        tone: 'warning',
        detail: null,
        people: [requestTargetId(r) ?? ''],
        render: (resolve) => <RequestSubject request={r} resolve={resolve} />,
      })),
    ...(cash.data ?? []).map<Pending>((op) => ({
      key: `cash-${op.id}`,
      kind: 'Cash approval',
      title: `${humanize(op.type)} of ${formatPaise(op.amountInPaise)}`,
      since: op.createdAt,
      href: '/cash-operations',
      icon: HandCoins,
      tone: 'warning',
      detail: null,
      people: [],
      render: () => <span>{op.description || 'No description'}</span>,
    })),
    ...(sessions.data ?? []).map<Pending>((s) => ({
      key: `session-${s.id}`,
      kind: 'Teller sign-off',
      title: 'Sign off teller session',
      since: sessionSince(s),
      href: '/teller-sessions',
      icon: Vault,
      tone: 'warning',
      detail: null,
      people: [s.tellerId],
      render: (resolve) => (
        <>
          <PersonName person={resolve(s.tellerId)} />
          <span aria-hidden="true">·</span>
          <span>Business day {formatDate(s.businessDate)}</span>
        </>
      ),
    })),
    ...(alerts.data ?? []).map<Pending>((a) => ({
      key: `alert-${a.id}`,
      kind: 'Fraud alert',
      title: `${humanize(a.severity)} fraud alert`,
      since: a.createdAt,
      href: `/fraud/${encodeURIComponent(a.id)}`,
      icon: Siren,
      tone: 'danger',
      detail: null,
      people: [],
      render: () => <span>{a.reason}</span>,
    })),
  ]
    .sort((x, y) => new Date(x.since).getTime() - new Date(y.since).getTime())
    .slice(0, ATTENTION_ITEMS);

  const resolve = useUserLookup(pending.flatMap((p) => p.people));
  const items: AttentionItem[] = pending.map(({ people: _people, render, ...item }) => ({ ...item, detail: render(resolve) }));

  const queries = { requests, cash, sessions, alerts };
  const failed = (Object.keys(queries) as Array<keyof typeof queries>).filter((k) => queries[k].isError).map((k) => QUEUES[k].label);
  const loading = Object.values(queries).some((q) => q.isPending);

  const kpis: Array<{ id: keyof typeof QUEUES; state: KpiState }> = [
    { id: 'requests', state: kpiState(requests, (r) => r.createdAt, now) },
    { id: 'cash', state: kpiState(cash, (op) => op.createdAt, now) },
    { id: 'sessions', state: kpiState(sessions, sessionSince, now) },
    { id: 'alerts', state: kpiState(alerts, (a) => a.createdAt, now) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<time dateTime={localDay(new Date(now))}>{formatLongDate(new Date(now))}</time>}
        title={name ? `${greeting(new Date(now))}, ${name}` : greeting(new Date(now))}
        description="What is waiting for a decision across the bank. Each queue loads on its own, so one slow service never hides the rest."
      />

      <section aria-labelledby={queuesId}>
        <h2 id={queuesId} className="sr-only">
          Queues
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {kpis.map(({ id, state }) => (
            <li key={id}>
              <KpiCard {...QUEUES[id]} state={state} />
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <AttentionList items={items} loading={loading} failed={failed} now={now} />
          <RecentRequests now={now} />
        </div>
        <div>
          <CashStatusChart />
        </div>
      </div>
    </div>
  );
}
