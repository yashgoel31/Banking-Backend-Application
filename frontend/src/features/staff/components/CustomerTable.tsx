import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { UserSearch } from 'lucide-react';
import type { CustomerProfile } from '@/lib/api/types';
import { DataTable, type Column } from '@/components/ui/data';
import { KycBadge, WaitingBadge } from './badges';
import { formatDateTime, maskPhone, shortId, waitingTime } from './format';

export interface BackLink {
  from: string;
  fromLabel: string;
}

function Phone({ value }: { value: string }) {
  const masked = maskPhone(value);
  return (
    <span className="tnum whitespace-nowrap">
      <span aria-hidden="true">{masked}</span>
      <span className="sr-only">Phone ending in {value.slice(-4)}</span>
    </span>
  );
}

/** Customer search results / KYC queue rows; a row opens the customer record */
export function CustomerTable({
  rows,
  loading,
  error,
  onRetry,
  empty,
  caption,
  showWaiting,
  dateLabel,
  backLabel,
}: {
  rows: CustomerProfile[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  empty: { title: string; description?: ReactNode };
  caption: string;
  showWaiting: boolean;
  dateLabel: string;
  backLabel: string;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const now = Date.now();

  const columns: Column<CustomerProfile>[] = [
    {
      key: 'name',
      header: 'Customer',
      cell: (c) => (
        <span className="flex flex-col">
          <span>{c.fullName}</span>
          <span className="font-mono text-[11.5px] font-normal text-muted-foreground" title={c.userId}>
            ID {shortId(c.userId)}
          </span>
        </span>
      ),
    },
    { key: 'phone', header: 'Phone', hideOnMobile: true, cell: (c) => <Phone value={c.phoneNumber} /> },
    {
      key: 'updated',
      header: dateLabel,
      hideOnMobile: true,
      cell: (c) => (
        <time dateTime={c.updatedAt} className="whitespace-nowrap text-muted-foreground">
          {formatDateTime(c.updatedAt)}
        </time>
      ),
    },
    { key: 'kyc', header: 'KYC', cell: (c) => <KycBadge status={c.kycStatus} /> },
  ];
  if (showWaiting) {
    columns.push({
      key: 'waiting',
      header: 'Waiting',
      align: 'right',
      cell: (c) => {
        const wait = waitingTime(c.updatedAt, now);
        return <WaitingBadge label={wait.label} tone={wait.tone} />;
      },
    });
  }

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={(c) => c.userId}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={{ icon: UserSearch, ...empty }}
      caption={caption}
      onRowClick={(c) =>
        navigate(`/customers/${encodeURIComponent(c.userId)}`, {
          state: { from: `${location.pathname}${location.search}`, fromLabel: backLabel } satisfies BackLink,
        })
      }
      rowActionLabel={(c) => `Open ${c.fullName}`}
    />
  );
}
