import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Clock, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import type { Beneficiary } from '@/lib/api/types';
import { useApi } from '@/lib/auth/AuthProvider';
import { qk } from '@/lib/query';
import { formatPaise } from '@/lib/money';
import { notifyError, notifySuccess } from '@/lib/notify';
import { maskAccountNumber } from '@/lib/validation';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/data';
import { Badge, Callout, Card, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { ConfirmDialog } from '@/components/ui/overlays';
import { useBeneficiaries, useNow } from './hooks';
import { POLICY, formatDate, formatDateTime, formatWait, isNotFound } from './lib';
import { AddPayeeDialog } from './components/AddPayeeDialog';

export default function PayeesPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const payeesQuery = useBeneficiaries();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(() => params.get('add') === '1');
  const [removing, setRemoving] = useState<Beneficiary | null>(null);
  const hasCooling = (payeesQuery.data ?? []).some((p) => new Date(p.activatesAt).getTime() > Date.now());
  // Tick while a payee is cooling off so its countdown (and "Pay") update by themselves
  const ticked = useNow(15_000, hasCooling);
  // A re-render (e.g. after adding a payee) must never compare against a stale clock
  const now = Math.max(ticked, Date.now());

  const setAddOpen = (open: boolean) => {
    setAdding(open);
    if (!open && params.has('add')) {
      const next = new URLSearchParams(params);
      next.delete('add');
      setParams(next, { replace: true });
    }
  };

  const remove = async () => {
    if (!removing) return;
    try {
      await api.ledger.removeBeneficiary(removing.id);
      notifySuccess(`${removing.nickname} removed`, 'You can add them again at any time.');
    } catch (error) {
      if (!isNotFound(error)) {
        notifyError(error, 'The payee could not be removed');
        throw error;
      }
      // Already gone (removed in another tab): the list just needs refreshing
    } finally {
      void queryClient.invalidateQueries({ queryKey: qk.beneficiaries });
    }
  };

  const columns: Column<Beneficiary>[] = [
    {
      key: 'payee',
      header: 'Payee',
      cell: (p) => {
        const wait = new Date(p.activatesAt).getTime() - now;
        return (
          <span className="block min-w-0 space-y-1">
            <span className="block truncate font-medium">{p.nickname}</span>
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[12.5px] text-muted-foreground">{maskAccountNumber(p.accountNumber)}</span>
              {wait > 0 ? (
                <Badge tone="warning" title={`Active from ${formatDateTime(p.activatesAt)}`}>
                  <Clock className="size-3" aria-hidden="true" /> Activates in {formatWait(wait)}
                </Badge>
              ) : (
                <StatusBadge status="ACTIVE" />
              )}
            </span>
          </span>
        );
      },
    },
    { key: 'added', header: 'Added', hideOnMobile: true, cell: (p) => <span className="text-muted-foreground">{formatDate(p.createdAt)}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      className: 'pl-0',
      cell: (p) => {
        const ready = new Date(p.activatesAt).getTime() <= now;
        return (
          <span className="inline-flex items-center justify-end gap-1">
            {ready ? (
              <Button asChild size="sm" variant="outline">
                <Link to={`/transfer?payee=${encodeURIComponent(p.id)}`} aria-label={`Pay ${p.nickname}`}>
                  Pay
                </Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled aria-label={`Pay ${p.nickname}`}>
                Pay
              </Button>
            )}
            <Button size="icon" variant="ghost" aria-label={`Remove ${p.nickname}`} onClick={() => setRemoving(p)}>
              <Trash2 aria-hidden="true" />
            </Button>
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payees"
        description="People and businesses you can send money to."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus aria-hidden="true" /> Add payee
          </Button>
        }
      />
      <Callout tone="info" title="How we keep payments safe">
        New payees become active after a {POLICY.payeeCoolingMinutes}-minute cooling-off period, unless you approve them instantly with
        your authenticator. In their first 24 hours, you can send each new payee up to {formatPaise(POLICY.newPayeeLimitPaise)} in total.
      </Callout>
      <Card className="overflow-hidden">
        <DataTable
          caption="Your payees"
          columns={columns}
          rows={payeesQuery.data}
          getRowKey={(p) => p.id}
          loading={payeesQuery.isPending}
          error={payeesQuery.error}
          onRetry={() => void payeesQuery.refetch()}
          skeletonRows={3}
          empty={{
            icon: Users,
            title: 'No payees yet',
            description: 'Add someone’s account to send them money. Your own accounts don’t need to be added.',
            action: (
              <Button variant="outline" onClick={() => setAddOpen(true)}>
                <UserPlus aria-hidden="true" /> Add payee
              </Button>
            ),
          }}
        />
      </Card>
      <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
        We’ll never ask you to add a payee over the phone. If someone does, it’s a scam.
      </p>

      <AddPayeeDialog open={adding} onOpenChange={setAddOpen} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        tone="destructive"
        title={`Remove ${removing?.nickname ?? 'payee'}?`}
        description={
          removing
            ? `You won’t be able to send money to ${maskAccountNumber(removing.accountNumber)} until you add them again. Adding them again restarts the cooling-off period.`
            : undefined
        }
        confirmLabel="Remove payee"
        onConfirm={remove}
      />
    </div>
  );
}
