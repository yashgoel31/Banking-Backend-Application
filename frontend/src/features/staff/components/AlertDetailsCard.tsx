import { useId } from 'react';
import { Link, useLocation } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/lib/auth/AuthProvider';
import { qk } from '@/lib/query';
import type { BankAccount, FraudAlert } from '@/lib/api/types';
import { formatAccountNumber } from '@/lib/validation';
import { Card, CardContent, CardHeader, CardTitle, DescriptionList, Mono } from '@/components/ui/primitives';
import { AlertStatusBadge, SeverityBadge } from './badges';
import { formatDateTime, splitReason } from './format';

function AccountValue({ alert, account, failed }: { alert: FraudAlert; account: BankAccount | undefined; failed: boolean }) {
  const location = useLocation();
  if (!account) {
    return (
      <span className="flex flex-col gap-0.5">
        <Mono value={alert.accountId} copy />
        {failed ? <span className="text-[12.5px] text-muted-foreground">Account details unavailable</span> : null}
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-mono tnum">{formatAccountNumber(account.accountNumber)}</span>
      <Link
        to={`/customers/${encodeURIComponent(account.customerId)}`}
        state={{ from: `${location.pathname}${location.search}`, fromLabel: 'Fraud alert' }}
        className="text-[13px] font-medium text-primary hover:underline"
      >
        View customer
      </Link>
    </span>
  );
}

function InitiatorValue({ alert, account, me }: { alert: FraudAlert; account: BankAccount | undefined; me: string }) {
  if (!alert.initiatedBy) return <span className="text-muted-foreground">Not recorded</span>;
  if (alert.initiatedBy === me) return <>You</>;
  if (account && alert.initiatedBy === account.customerId) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span>Account holder</span>
        <Mono value={alert.initiatedBy} />
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Mono value={alert.initiatedBy} copy />
      {alert.cashOperationId ? <span className="text-[12.5px] text-muted-foreground">Branch staff</span> : null}
    </span>
  );
}

export function AlertDetailsCard({ alert, me }: { alert: FraudAlert; me: string }) {
  const api = useApi();
  const titleId = useId();
  const account = useQuery({ queryKey: qk.account(alert.accountId), queryFn: () => api.accounts.get(alert.accountId) });
  const { direction, text } = splitReason(alert.reason);
  const reasons = text.split(' | ').filter(Boolean);

  const items = [
    { label: 'Severity', value: <SeverityBadge severity={alert.severity} long /> },
    { label: 'Status', value: <AlertStatusBadge status={alert.status} /> },
    {
      label: reasons.length > 1 ? 'Reasons' : 'Reason',
      value:
        reasons.length > 1 ? (
          <ul className="list-disc space-y-1 pl-4">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : (
          text
        ),
    },
    ...(direction ? [{ label: 'Direction', value: direction }] : []),
    { label: 'Transaction', value: <Mono value={alert.transactionId} short={false} copy /> },
    { label: 'Account', value: <AccountValue alert={alert} account={account.data} failed={account.isError} /> },
    { label: 'Initiated by', value: <InitiatorValue alert={alert} account={account.data} me={me} /> },
    ...(alert.cashOperationId ? [{ label: 'Branch cash operation', value: <Mono value={alert.cashOperationId} short={false} copy /> }] : []),
    { label: 'Raised', value: <time dateTime={alert.createdAt}>{formatDateTime(alert.createdAt)}</time> },
    { label: 'Last updated', value: <time dateTime={alert.updatedAt}>{formatDateTime(alert.updatedAt)}</time> },
    {
      label: 'Last reviewed by',
      value: alert.reviewedBy ? alert.reviewedBy === me ? 'You' : <Mono value={alert.reviewedBy} /> : <span className="text-muted-foreground">Not yet reviewed</span>,
    },
  ];

  return (
    <Card role="region" aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId}>Alert details</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 sm:pt-0">
        <DescriptionList items={items} />
      </CardContent>
    </Card>
  );
}
