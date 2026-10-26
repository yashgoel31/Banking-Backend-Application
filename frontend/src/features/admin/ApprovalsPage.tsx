import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Inbox, Stamp, UserPlus } from 'lucide-react';
import { useApi, useUser } from '@/lib/auth/AuthProvider';
import type { AdminRequest, AdminRequestStatus } from '@/lib/api/types';
import { notifyError, notifySuccess } from '@/lib/notify';
import { qk } from '@/lib/query';
import { Button } from '@/components/ui/button';
import { ErrorState, Pagination } from '@/components/ui/data';
import { Card, EmptyState, PageHeader, Skeleton } from '@/components/ui/primitives';
import { ConfirmDialog, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/overlays';
import { RequestCard, requestPermissions } from './components/RequestCard';
import { RequestStaffDialog } from './components/RequestStaffDialog';
import { approvalCopy, approvedMessage, decisionProblem, rejectionCopy, requestTargetId } from './components/requests';
import { useUserLookup } from './components/useUserLookup';

const PAGE_SIZE = 20;

const TABS: Array<{ value: string; status: AdminRequestStatus; label: string; empty: { title: string; description: string } }> = [
  {
    value: 'pending',
    status: 'PENDING',
    label: 'Pending',
    empty: {
      title: 'No requests waiting for a decision',
      description: 'When an administrator asks to add staff, change someone’s sign-in or reset an authenticator, it appears here for a second administrator.',
    },
  },
  {
    value: 'approved',
    status: 'APPROVED',
    label: 'Approved',
    empty: { title: 'No approved requests yet', description: 'Requests a second administrator approved appear here.' },
  },
  {
    value: 'rejected',
    status: 'REJECTED',
    label: 'Rejected',
    empty: { title: 'No rejected requests', description: 'Rejected, withdrawn and expired requests appear here.' },
  },
];

export default function ApprovalsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.value === params.get('status')) ?? TABS[0]!;
  const [requestOpen, setRequestOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        description="Every change to who can work at the bank needs two administrators. Review your colleagues’ requests; nobody can approve their own request or one about their own account."
        actions={
          <Button onClick={() => setRequestOpen(true)}>
            <UserPlus aria-hidden="true" /> Request new staff member
          </Button>
        }
      />
      <Card>
        <Tabs
          value={tab.value}
          onValueChange={(value) => setParams(value === 'pending' ? {} : { status: value }, { replace: true })}
        >
          <div className="border-b px-4 py-3 sm:px-6">
            <TabsList aria-label="Request status">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {TABS.map((t) => (
            <TabsContent key={t.value} value={t.value} className="mt-0">
              {t.value === tab.value ? <RequestList status={t.status} empty={t.empty} /> : null}
            </TabsContent>
          ))}
        </Tabs>
      </Card>
      <RequestStaffDialog open={requestOpen} onOpenChange={setRequestOpen} />
    </div>
  );
}

type Decision = { kind: 'approve' | 'reject'; request: AdminRequest };

function RequestList({ status, empty }: { status: AdminRequestStatus; empty: { title: string; description: string } }) {
  const api = useApi();
  const me = useUser();
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const query = useQuery({
    queryKey: qk.adminRequests(status, offset),
    queryFn: () => api.admin.requests({ status, limit: PAGE_SIZE, offset }),
    placeholderData: keepPreviousData,
  });
  const rows = query.data;
  const resolve = useUserLookup(rows?.flatMap((r) => [r.requestedBy, requestTargetId(r), r.decidedBy]) ?? []);
  const now = Date.now();

  const open = (kind: Decision['kind'], request: AdminRequest) => {
    setDecision({ kind, request });
    setDialogOpen(true);
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.adminRequestsAll });
  };

  const decide = async () => {
    if (!decision) return;
    const { kind, request } = decision;
    const mine = request.requestedBy === me.id;
    try {
      if (kind === 'approve') await api.admin.approveRequest(request.id);
      else await api.admin.rejectRequest(request.id);
    } catch (error) {
      const problem = decisionProblem(error, kind);
      if (!problem) {
        // Possibly transient: keep the dialog open so the same decision can be retried
        notifyError(error);
        throw error;
      }
      toast.error(problem.title, { description: problem.description });
      refresh();
      return;
    }
    if (kind === 'approve') {
      const message = approvedMessage(request, resolve);
      notifySuccess(message.title, message.description);
      // Approval creates or changes a user
      void queryClient.invalidateQueries({ queryKey: qk.directoryAll });
    } else {
      notifySuccess(mine ? 'Request withdrawn' : 'Request rejected', 'Nothing was changed.');
    }
    refresh();
  };

  const copy = decision
    ? decision.kind === 'approve'
      ? approvalCopy(decision.request, resolve)
      : rejectionCopy(decision.request, resolve, decision.request.requestedBy === me.id)
    : null;

  let content;
  if (query.isPending) {
    content = (
      <div className="space-y-3 p-4 sm:p-6">
        <p role="status" className="sr-only">
          Loading requests
        </p>
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-lg" />
        ))}
      </div>
    );
  } else if (query.isError && !rows) {
    content = <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  } else if (rows && rows.length === 0 && offset === 0) {
    content = <EmptyState icon={status === 'PENDING' ? Inbox : Stamp} title={empty.title} description={empty.description} />;
  } else {
    content = (
      <>
        {rows && rows.length > 0 ? (
          <ul className={query.isPlaceholderData ? 'space-y-3 p-3 opacity-60 sm:p-6' : 'space-y-3 p-3 sm:p-6'} aria-busy={query.isPlaceholderData}>
            {rows.map((request) => (
              <li key={request.id}>
                <RequestCard
                  request={request}
                  resolve={resolve}
                  meId={me.id}
                  now={now}
                  onApprove={(r) => requestPermissions(r, me.id).canApprove && open('approve', r)}
                  onReject={(r) => requestPermissions(r, me.id).canReject && open('reject', r)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-6 py-10 text-center text-[13px] text-muted-foreground">No more requests on this page.</p>
        )}
        <Pagination offset={offset} limit={PAGE_SIZE} count={rows?.length ?? 0} onChange={setOffset} />
      </>
    );
  }

  return (
    <>
      {content}
      {copy ? (
        <ConfirmDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title={copy.title}
          description={copy.description}
          confirmLabel={copy.confirmLabel}
          tone={copy.tone}
          onConfirm={decide}
        />
      ) : null}
    </>
  );
}
