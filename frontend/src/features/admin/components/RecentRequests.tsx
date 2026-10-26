import { useId } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Stamp } from 'lucide-react';
import { useApi } from '@/lib/auth/AuthProvider';
import { qk } from '@/lib/query';
import { ErrorState } from '@/components/ui/data';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Skeleton, StatusBadge } from '@/components/ui/primitives';
import { RelativeTime, RequestSubject } from './People';
import { isExpired, requestTargetId, requestTitle } from './requests';
import { useUserLookup } from './useUserLookup';

const RECENT = 5;

export function RecentRequests({ now }: { now: number }) {
  const api = useApi();
  const headingId = useId();
  const query = useQuery({
    // Same family as the Approvals lists, so deciding a request refreshes this too
    queryKey: [...qk.adminRequests(undefined, 0), { limit: RECENT }],
    queryFn: () => api.admin.requests({ limit: RECENT }),
  });
  const rows = query.data;
  const resolve = useUserLookup(rows?.map(requestTargetId) ?? []);

  let body;
  if (query.isPending) {
    body = (
      <div className="space-y-3">
        <span className="sr-only">Loading</span>
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  } else if (query.isError) {
    body = <ErrorState error={query.error} onRetry={() => void query.refetch()} className="py-6" />;
  } else if (!rows || rows.length === 0) {
    body = (
      <EmptyState
        icon={Stamp}
        title="No administrative requests yet"
        description="Requests to add staff, change someone’s sign-in or reset an authenticator appear here."
        className="py-8"
      />
    );
  } else {
    body = (
      <ul className="divide-y">
        {rows.map((request) => (
          <li key={request.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium">{requestTitle(request)}</p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted-foreground">
                <RequestSubject request={request} resolve={resolve} />
                <span aria-hidden="true">·</span>
                <RelativeTime iso={request.createdAt} now={now} />
              </p>
            </div>
            {isExpired(request, now) ? (
              <Badge tone="danger" dot className="shrink-0">
                Expired
              </Badge>
            ) : (
              <StatusBadge status={request.status} className="shrink-0" />
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-labelledby={headingId}>
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle id={headingId}>Recent administrative requests</CardTitle>
            <CardDescription>The latest {RECENT}, whatever their status.</CardDescription>
          </div>
          <Link to="/approvals" className="shrink-0 text-[13px] font-medium text-primary underline-offset-2 hover:underline">
            View all requests
          </Link>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    </section>
  );
}
