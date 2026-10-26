import { Link, useLocation, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, SearchX } from 'lucide-react';
import { useApi, useUser } from '@/lib/auth/AuthProvider';
import type { FraudAlert } from '@/lib/api/types';
import { UUID_PATTERN } from '@/lib/validation';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/data';
import { Callout, Card, CardContent, CardHeader, CardTitle, EmptyState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { AlertDetailsCard } from './components/AlertDetailsCard';
import { AlertHistoryCard } from './components/AlertHistoryCard';
import { AlertStatusBadge } from './components/badges';
import { LoadingAnnouncement } from './components/LoadingAnnouncement';
import { TriagePanel } from './components/TriagePanel';
import { SCAN_MAX_PAGES, SCAN_PAGE_SIZE, alertKey, findAlert } from './components/alertLookup';
import { ALERT_STATUS_LABEL, shortId, splitReason } from './components/format';
import type { AlertRouteState } from './FraudAlertsPage';

const SEVERITY_TITLE = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' } as const;

/** The list hands over the alert it showed; only trust it for this exact alert */
function readRouteState(state: unknown, alertId: string): Partial<AlertRouteState> {
  const candidate = state as Partial<AlertRouteState> | null;
  const alert = candidate?.alert && candidate.alert.id === alertId ? candidate.alert : undefined;
  const from = typeof candidate?.from === 'string' && candidate.from.startsWith('/') && !candidate.from.startsWith('//') ? candidate.from : undefined;
  return { alert, from, fromLabel: from && typeof candidate?.fromLabel === 'string' ? candidate.fromLabel : undefined };
}

function NotFound() {
  return (
    <div className="space-y-6">
      <PageHeader title="Alert not found" />
      <Card>
        <EmptyState
          icon={SearchX}
          title="We couldn’t find this alert"
          description={`It isn’t among the ${(SCAN_PAGE_SIZE * SCAN_MAX_PAGES).toLocaleString('en-IN')} most recent alerts, or the link is wrong. Open it from the alert list instead.`}
          action={
            <Button asChild variant="outline">
              <Link to="/fraud">Back to fraud alerts</Link>
            </Button>
          }
        />
      </Card>
    </div>
  );
}

export default function FraudAlertDetailPage() {
  const { alertId = '' } = useParams();
  const api = useApi();
  const user = useUser();
  const location = useLocation();
  const queryClient = useQueryClient();
  const valid = UUID_PATTERN.test(alertId);
  const routeState = readRouteState(location.state, alertId);

  const query = useQuery({
    queryKey: alertKey(alertId),
    queryFn: async (): Promise<FraudAlert | null> => {
      const known = queryClient.getQueryData<FraudAlert | null>(alertKey(alertId)) ?? routeState.alert ?? null;
      return (await findAlert(api, alertId, known?.status)) ?? known;
    },
    enabled: valid,
    // Show what the list already had straight away, then confirm it with the API
    initialData: routeState.alert,
    initialDataUpdatedAt: 0,
  });

  if (!valid || query.data === null) return <NotFound />;

  const alert = query.data;
  const back = { to: routeState.from ?? '/fraud', label: routeState.fromLabel ?? 'Fraud alerts' };
  const backLink = (
    <Link to={back.to} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden="true" /> {back.label}
    </Link>
  );

  if (!alert) {
    return (
      <div className="space-y-6">
        {backLink}
        <LoadingAnnouncement active={query.isFetching} label="Loading alert…" />
        <PageHeader eyebrow="Fraud alert" title={query.isError ? 'Fraud alert' : <Skeleton className="h-8 w-64" />} />
        <Card>
          {query.isError ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : (
            <CardContent className="space-y-3 pt-6 sm:pt-6" aria-hidden="true">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          )}
        </Card>
      </div>
    );
  }

  const closed = alert.status === 'RESOLVED' || alert.status === 'DISMISSED';
  const proposal = !closed && alert.closeRequestedBy && alert.closeRequestedStatus ? alert : null;
  const analyst = user.role === 'FRAUD_ANALYST';

  return (
    <div className="space-y-6">
      {backLink}
      <PageHeader
        eyebrow="Fraud alert"
        title={`${SEVERITY_TITLE[alert.severity]}-severity alert`}
        description={splitReason(alert.reason).text.split(' | ').join(' · ')}
        actions={<AlertStatusBadge status={alert.status} />}
      />
      {proposal ? (
        <Callout
          tone="warning"
          title={`${proposal.closeRequestedBy === user.id ? 'You' : `Analyst ${shortId(proposal.closeRequestedBy)}`} proposed ${
            ALERT_STATUS_LABEL[proposal.closeRequestedStatus!]
          } — a second analyst must confirm`}
        >
          High and critical alerts close only when two different analysts agree.
        </Callout>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="min-w-0 lg:col-span-2">
          <AlertDetailsCard alert={alert} me={user.id} />
        </div>
        <div className="min-w-0 lg:row-span-2">
          {analyst ? (
            <TriagePanel alert={alert} me={user.id} />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Triage</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-[13px] text-muted-foreground">Read-only: only fraud analysts can triage alerts.</p>
              </CardContent>
            </Card>
          )}
        </div>
        <div className="min-w-0 lg:col-span-2">
          <AlertHistoryCard alertId={alert.id} me={user.id} />
        </div>
      </div>
    </div>
  );
}
