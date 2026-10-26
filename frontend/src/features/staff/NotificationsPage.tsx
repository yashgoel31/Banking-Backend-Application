import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Filter, X } from 'lucide-react';
import { useApi } from '@/lib/auth/AuthProvider';
import { qk } from '@/lib/query';
import { Button } from '@/components/ui/button';
import { Pagination } from '@/components/ui/data';
import { Field, Input } from '@/components/ui/input';
import { Card, PageHeader } from '@/components/ui/primitives';
import { LoadingAnnouncement } from './components/LoadingAnnouncement';
import { NotificationTable } from './components/NotificationTable';
import { useListParams } from './components/hooks';

const LIMIT = 20;
const MAX_RECIPIENT = 254;

/** The log matches recipients exactly; addresses are stored lower-case */
const normaliseRecipient = (value: string) => {
  const trimmed = value.trim();
  return trimmed.includes('@') ? trimmed.toLowerCase() : trimmed;
};

export default function NotificationsPage() {
  const api = useApi();
  const { params, update, offset } = useListParams();
  const recipient = params.get('recipient') ?? '';
  const [draft, setDraft] = useState(recipient);
  const [error, setError] = useState<string>();

  const filters = { recipient, limit: LIMIT, offset };
  const query = useQuery({
    queryKey: qk.notificationLogs(filters),
    queryFn: () => api.notifications.logs({ ...filters, recipient: recipient || undefined }),
    placeholderData: (previous, previousQuery) =>
      (previousQuery?.queryKey[1] as { recipient?: string } | undefined)?.recipient === recipient ? previous : undefined,
  });
  const rows = query.data;

  const apply = (event: FormEvent) => {
    event.preventDefault();
    const next = normaliseRecipient(draft);
    if (next.length > MAX_RECIPIENT) {
      setError('Addresses are at most 254 characters');
      return;
    }
    setError(undefined);
    setDraft(next);
    update({ recipient: next, offset: undefined });
  };

  const clear = () => {
    setDraft('');
    setError(undefined);
    update({ recipient: undefined, offset: undefined });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Oversight"
        title="Notification log"
        description="Every email the bank sent, newest first, with its delivery status. Open a row to read the message."
      />
      <Card>
        <form onSubmit={apply} noValidate role="search" aria-label="Filter notifications" className="flex flex-col gap-3 p-5 pb-4 sm:flex-row sm:items-start sm:p-6 sm:pb-4">
          <Field label="Recipient" error={error} hint="Matches the exact address, e.g. asha@example.in" className="sm:w-96">
            {(p) => (
              <Input
                {...p}
                type="text"
                inputMode="email"
                autoComplete="off"
                spellCheck={false}
                placeholder="name@example.in"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
            )}
          </Field>
          <div className="flex gap-2 sm:mt-[26px]">
            <Button type="submit" variant="secondary">
              <Filter aria-hidden="true" /> Filter
            </Button>
            {recipient ? (
              <Button variant="ghost" onClick={clear}>
                <X aria-hidden="true" /> Clear filter
              </Button>
            ) : null}
          </div>
        </form>
        <div className="border-t">
          <LoadingAnnouncement active={query.isFetching} label="Loading notifications…" />
          <NotificationTable
            rows={rows}
            loading={query.isPending}
            error={query.error}
            onRetry={() => void query.refetch()}
            empty={
              recipient
                ? { title: `No notifications to ${recipient}`, description: 'The filter matches the exact address. Check it for typos.' }
                : { title: 'No notifications yet', description: 'Emails appear here as soon as they are sent.' }
            }
          />
          {rows && (rows.length > 0 || offset > 0) ? (
            <Pagination offset={offset} limit={LIMIT} count={rows.length} onChange={(next) => update({ offset: next })} />
          ) : null}
        </div>
      </Card>
    </div>
  );
}
