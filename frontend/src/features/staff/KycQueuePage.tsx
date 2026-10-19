import { useQuery } from '@tanstack/react-query';
import { useApi, useUser } from '@/lib/auth/AuthProvider';
import { qk } from '@/lib/query';
import type { KycStatus } from '@/lib/api/types';
import { Callout, Card, PageHeader } from '@/components/ui/primitives';
import { Pagination } from '@/components/ui/data';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/overlays';
import { CustomerTable } from './components/CustomerTable';
import { LoadingAnnouncement } from './components/LoadingAnnouncement';
import { SearchField } from './components/SearchField';
import { useListParams, useSearchParam } from './components/hooks';

const LIMIT = 20;

const TABS: Array<{ value: string; status: KycStatus; label: string }> = [
  { value: 'pending', status: 'PENDING', label: 'Pending' },
  { value: 'verified', status: 'VERIFIED', label: 'Verified' },
  { value: 'rejected', status: 'REJECTED', label: 'Rejected' },
];

const EMPTY: Record<KycStatus, { title: string; description: string }> = {
  PENDING: { title: 'No profiles waiting for review', description: 'New and changed profiles appear here, longest waiting first.' },
  VERIFIED: { title: 'No verified customers yet', description: 'Customers appear here once a KYC officer verifies them.' },
  REJECTED: { title: 'No rejected profiles', description: 'Profiles that fail review appear here.' },
};

export default function KycQueuePage() {
  const api = useApi();
  const { role } = useUser();
  const { params, update, offset } = useListParams();
  const tab = TABS.find((t) => t.value === params.get('status')) ?? TABS[0]!;
  const { search, setSearch, q } = useSearchParam(params, update);

  const filters = { kycStatus: tab.status, q, limit: LIMIT, offset };
  const query = useQuery({
    queryKey: qk.customers(filters),
    queryFn: () => api.customers.list({ ...filters, q: q || undefined }),
    // While paging or refining a search within one tab, keep the current rows on screen instead of flashing
    placeholderData: (previous, previousQuery) =>
      (previousQuery?.queryKey[2] as { kycStatus?: KycStatus } | undefined)?.kycStatus === tab.status ? previous : undefined,
  });

  const rows = query.data;
  const pending = tab.status === 'PENDING';
  const decides = role === 'KYC_OFFICER';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Compliance"
        title="KYC review"
        description={
          decides
            ? 'Profiles that have waited longest are at the top. Open one to check the details and verify or reject it.'
            : 'Identity verification status for every customer.'
        }
      />
      {decides ? null : (
        <Callout tone="info" title="Read-only view">
          KYC decisions are made by KYC officers. You can see each customer’s status and review history.
        </Callout>
      )}
      <Card>
        <Tabs value={tab.value} onValueChange={(value) => update({ status: value === 'pending' ? undefined : value, offset: undefined })}>
          <div className="flex flex-col gap-4 p-5 pb-4 sm:p-6 sm:pb-4 md:flex-row md:items-end md:justify-between">
            <TabsList aria-label="KYC status">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <SearchField
              label="Search"
              hint="Name, phone number or user ID"
              placeholder="e.g. Asha Rao"
              value={search}
              onChange={setSearch}
              className="md:w-80"
            />
          </div>
          <TabsContent value={tab.value} className="mt-0 border-t">
            <LoadingAnnouncement active={query.isFetching} label="Loading customers…" />
            <CustomerTable
              rows={rows}
              loading={query.isPending}
              error={query.error}
              onRetry={() => void query.refetch()}
              caption={`${tab.label} KYC profiles`}
              showWaiting={pending}
              dateLabel={pending ? 'Submitted' : 'Last updated'}
              backLabel="KYC review"
              empty={q ? { title: `No customers match “${q}”`, description: 'Check the spelling, or search by phone number or user ID.' } : EMPTY[tab.status]}
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
