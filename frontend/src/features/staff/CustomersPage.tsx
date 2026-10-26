import { useQuery } from '@tanstack/react-query';
import { Eye, UserSearch } from 'lucide-react';
import { useApi } from '@/lib/auth/AuthProvider';
import { qk } from '@/lib/query';
import type { KycStatus } from '@/lib/api/types';
import { Card, EmptyState, PageHeader } from '@/components/ui/primitives';
import { Pagination } from '@/components/ui/data';
import { Field, NativeSelect } from '@/components/ui/input';
import { CustomerTable } from './components/CustomerTable';
import { LoadingAnnouncement } from './components/LoadingAnnouncement';
import { SearchField } from './components/SearchField';
import { useListParams, useSearchParam } from './components/hooks';
import { KYC_LABEL } from './components/format';

const LIMIT = 20;
const KYC_OPTIONS: KycStatus[] = ['PENDING', 'VERIFIED', 'REJECTED'];

export default function CustomersPage() {
  const api = useApi();
  const { params, update, offset } = useListParams();
  const { search, setSearch, q } = useSearchParam(params, update);
  const kyc = KYC_OPTIONS.find((s) => s === params.get('kyc'));

  // Customer data is only fetched for a deliberate search or filter, never listed by default
  const active = Boolean(q || kyc);
  const filters = { kycStatus: kyc, q, limit: LIMIT, offset };
  const query = useQuery({
    queryKey: qk.customers(filters),
    queryFn: () => api.customers.list({ ...filters, q: q || undefined }),
    enabled: active,
    // Keep rows on screen while a search is refined or paged, never across different KYC filters
    placeholderData: (previous, previousQuery) =>
      (previousQuery?.queryKey[2] as { kycStatus?: KycStatus } | undefined)?.kycStatus === kyc ? previous : undefined,
  });
  const rows = active ? query.data : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Customers"
        title="Customers"
        description="Find a customer by name, phone number or user ID."
      />
      <Card>
        <div className="grid gap-4 p-5 pb-4 sm:p-6 sm:pb-4 md:grid-cols-[minmax(0,1fr)_14rem] md:items-start">
          <SearchField
            label="Search"
            hint="Name, phone number or user ID"
            placeholder="e.g. Asha Rao or +91 98765 43210"
            value={search}
            onChange={setSearch}
          />
          <Field label="KYC status">
            {(p) => (
              <NativeSelect {...p} value={kyc ?? ''} onChange={(e) => update({ kyc: e.target.value, offset: undefined })}>
                <option value="">Any status</option>
                {KYC_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {KYC_LABEL[s]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>
        <p className="flex items-center gap-1.5 px-5 pb-4 text-[12.5px] text-muted-foreground sm:px-6">
          <Eye className="size-3.5 shrink-0" aria-hidden="true" />
          Opening a customer record is logged with your name and role.
        </p>
        <div className="border-t">
          {active ? (
            <>
              <LoadingAnnouncement active={query.isFetching} label="Loading customers…" />
              <CustomerTable
                rows={rows}
                loading={query.isPending}
                error={query.error}
                onRetry={() => void query.refetch()}
                caption="Customer search results"
                showWaiting={kyc === 'PENDING'}
                dateLabel="Last updated"
                backLabel="Customers"
                empty={
                  q
                    ? { title: `No customers match “${q}”`, description: 'Check the spelling, or try a phone number or user ID.' }
                    : { title: `No customers with KYC ${KYC_LABEL[kyc ?? 'PENDING'].toLowerCase()}` }
                }
              />
              {rows && (rows.length > 0 || offset > 0) ? (
                <Pagination offset={offset} limit={LIMIT} count={rows.length} onChange={(next) => update({ offset: next })} />
              ) : null}
            </>
          ) : (
            <EmptyState
              icon={UserSearch}
              title="Search for a customer"
              description="Enter a name, phone number or user ID, or choose a KYC status to list customers."
            />
          )}
        </div>
      </Card>
    </div>
  );
}
