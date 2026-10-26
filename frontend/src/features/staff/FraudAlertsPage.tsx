import { useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useApi, useUser } from '@/lib/auth/AuthProvider';
import { qk } from '@/lib/query';
import type { AlertStatus, FraudAlert } from '@/lib/api/types';
import { Badge, Callout, Card, Mono, PageHeader } from '@/components/ui/primitives';
import { DataTable, Pagination } from '@/components/ui/data';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/overlays';
import { SecondAnalystBadge, SeverityBadge } from './components/badges';
import { LoadingAnnouncement } from './components/LoadingAnnouncement';
import { formatDateTime, splitReason } from './components/format';
import { useListParams } from './components/hooks';

const LIMIT = 20;

const TABS: Array<{ value: string; status: AlertStatus; label: string; empty: string }> = [
  { value: 'open', status: 'OPEN', label: 'Open', empty: 'No open alerts' },
  { value: 'under_review', status: 'UNDER_REVIEW', label: 'Under review', empty: 'No alerts under review' },
  { value: 'resolved', status: 'RESOLVED', label: 'Resolved', empty: 'No resolved alerts' },
  { value: 'dismissed', status: 'DISMISSED', label: 'Dismissed', empty: 'No dismissed alerts' },
];

function ReviewState({ alert, me }: { alert: FraudAlert; me: string }) {
  return (
    <span className="flex flex-wrap items-start gap-1">
      <SecondAnalystBadge />
      {alert.closeRequestedBy === me ? <Badge tone="neutral">Your proposal</Badge> : null}
    </span>
  );
}

export interface AlertRouteState {
  alert: FraudAlert;
  from: string;
  fromLabel: string;
}

export default function FraudAlertsPage() {
  const api = useApi();
  const user = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const { params, update, offset } = useListParams();
  const tab = TABS.find((t) => t.value === params.get('status')) ?? TABS[0]!;
  const triages = user.role === 'FRAUD_ANALYST';

  const query = useQuery({
    queryKey: qk.alerts(tab.status, offset),
    queryFn: () => api.fraud.alerts({ status: tab.status, limit: LIMIT, offset }),
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[2] === tab.status ? previous : undefined),
  });
  const rows = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Risk"
        title="Fraud alerts"
        description={
          triages
            ? 'Alerts raised by the risk rules, newest first. Closing a high or critical alert needs two analysts.'
            : 'Alerts raised by the risk rules, newest first.'
        }
      />
      {triages ? null : (
        <Callout tone="info" title="Read-only view">
          Only fraud analysts can triage alerts. You can see every alert and its history.
        </Callout>
      )}
      <Card>
        <Tabs value={tab.value} onValueChange={(value) => update({ status: value === 'open' ? undefined : value, offset: undefined })}>
          <div className="p-5 pb-4 sm:p-6 sm:pb-4">
            <TabsList aria-label="Alert status" className="h-auto flex-wrap justify-start">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value={tab.value} className="mt-0 border-t">
            <LoadingAnnouncement active={query.isFetching} label="Loading alerts…" />
            <DataTable<FraudAlert>
              caption={`${tab.label} fraud alerts`}
              rows={rows}
              loading={query.isPending}
              error={query.error}
              onRetry={() => void query.refetch()}
              getRowKey={(a) => a.id}
              empty={{ icon: ShieldCheck, title: tab.empty, description: tab.status === 'OPEN' ? 'New alerts appear here as soon as a rule fires.' : undefined }}
              onRowClick={(alert) =>
                navigate(`/fraud/${encodeURIComponent(alert.id)}`, {
                  state: { alert, from: `${location.pathname}${location.search}`, fromLabel: 'Fraud alerts' } satisfies AlertRouteState,
                })
              }
              rowActionLabel={(a) => `Open alert: ${splitReason(a.reason).text}`}
              columns={[
                {
                  key: 'reason',
                  header: 'Alert',
                  className: 'max-w-[22rem]',
                  cell: (a) => {
                    const { direction, text } = splitReason(a.reason);
                    return (
                      <span className="flex flex-col items-start gap-1">
                        <span className="line-clamp-2 break-words">{text}</span>
                        {direction ? (
                          <span className="text-[11.5px] font-normal text-muted-foreground">{direction}</span>
                        ) : null}
                        {/* Small screens have no Review column: the four-eyes state goes under the reason */}
                        {a.closeRequestedBy ? (
                          <span className="md:hidden">
                            <ReviewState alert={a} me={user.id} />
                          </span>
                        ) : null}
                      </span>
                    );
                  },
                },
                { key: 'severity', header: 'Severity', cell: (a) => <SeverityBadge severity={a.severity} /> },
                { key: 'account', header: 'Account', hideOnMobile: true, cell: (a) => <Mono value={a.accountId} /> },
                {
                  key: 'initiatedBy',
                  header: 'Initiated by',
                  hideOnMobile: true,
                  cell: (a) => (a.initiatedBy ? <Mono value={a.initiatedBy} /> : <span className="text-muted-foreground">Not recorded</span>),
                },
                {
                  key: 'created',
                  header: 'Raised',
                  hideOnMobile: true,
                  cell: (a) => (
                    <time dateTime={a.createdAt} className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(a.createdAt)}
                    </time>
                  ),
                },
                {
                  key: 'review',
                  header: 'Review',
                  hideOnMobile: true,
                  cell: (a) => (a.closeRequestedBy ? <ReviewState alert={a} me={user.id} /> : null),
                },
              ]}
            />
            {rows && (rows.length > 0 || offset > 0) ? (
              <Pagination offset={offset} limit={LIMIT} count={rows.length} onChange={(next) => update({ offset: next })} />
            ) : null}
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
