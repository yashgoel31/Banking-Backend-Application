import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleDashed, Search, UserPlus, Users } from 'lucide-react';
import { useApi, useUser } from '@/lib/auth/AuthProvider';
import { ROLES, type Role } from '@/lib/auth/session';
import type { DirectoryUser } from '@/lib/api/types';
import { qk } from '@/lib/query';
import { Button } from '@/components/ui/button';
import { DataTable, Pagination, type Column } from '@/components/ui/data';
import { Field, Input, NativeSelect } from '@/components/ui/input';
import { Badge, Card, PageHeader, StatusBadge } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatDate } from './components/format';
import { RoleBadge } from './components/People';
import { RequestStaffDialog } from './components/RequestStaffDialog';
import { ROLE_INFO, STAFF_ROLES } from './components/roles';
import { useDebouncedValue } from './components/useDebouncedValue';
import { UserActionDialog, UserActionsMenu, type UserAction } from './components/UserActions';

const PAGE_SIZE = 20;

const ROLE_FILTERS: Array<{ value: Role | ''; label: string }> = [
  { value: '', label: 'All roles' },
  { value: 'CUSTOMER', label: 'Customers' },
  ...STAFF_ROLES.map((role) => ({ value: role, label: ROLE_INFO[role].label })),
];

const parseRole = (value: string | null): Role | '' => (ROLES as readonly string[]).includes(value ?? '') ? (value as Role) : '';

export default function DirectoryPage() {
  const api = useApi();
  const me = useUser();
  const canManage = me.role === 'BANK_ADMIN';
  const [params, setParams] = useSearchParams();
  const role = parseRole(params.get('role'));
  const [search, setSearch] = useState(() => params.get('q') ?? '');
  const debounced = useDebouncedValue(search.trim(), 300);
  // Clearing the box applies at once; typing waits for a pause
  const q = search.trim() === '' ? '' : debounced;

  // Filters live in the address, so they survive opening a customer and coming back
  useEffect(() => {
    if ((params.get('q') ?? '') === q) return;
    const next = new URLSearchParams(params);
    if (q) next.set('q', q);
    else next.delete('q');
    setParams(next, { replace: true });
  }, [q, params, setParams]);

  const filterKey = `${role}|${q}`;
  const [page, setPage] = useState({ filterKey, offset: 0 });
  const offset = page.filterKey === filterKey ? page.offset : 0;

  const filters = { role: role || undefined, q: q || undefined };
  const query = useQuery({
    queryKey: qk.directory({ ...filters, offset, limit: PAGE_SIZE }),
    queryFn: () => api.admin.users({ ...filters, limit: PAGE_SIZE, offset }),
    placeholderData: keepPreviousData,
  });

  const [action, setAction] = useState<UserAction | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  const setRole = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set('role', value);
    else next.delete('role');
    setParams(next, { replace: true });
  };
  const filtered = Boolean(role || q);
  const clearFilters = () => {
    setSearch('');
    setParams({}, { replace: true });
  };

  const columns: Column<DirectoryUser>[] = [
    {
      key: 'user',
      header: 'User',
      cell: (user) => <UserCell user={user} isMe={user.id === me.id} />,
    },
    { key: 'role', header: 'Role', hideOnMobile: true, cell: (user) => <RoleBadge role={user.role} /> },
    { key: 'status', header: 'Status', hideOnMobile: true, cell: (user) => <ActiveBadge user={user} /> },
    // Secondary columns appear as the screen widens; until then UserCell repeats them under the email
    {
      key: 'mfa',
      header: 'Two-factor',
      hideOnMobile: true,
      className: 'md:hidden lg:table-cell',
      cell: (user) => <Badge tone={user.mfaEnabled ? 'success' : 'neutral'}>{user.mfaEnabled ? 'On' : 'Off'}</Badge>,
    },
    {
      key: 'verified',
      header: 'Email verified',
      hideOnMobile: true,
      className: 'whitespace-nowrap md:hidden xl:table-cell',
      cell: (user) =>
        user.isEmailVerified ? (
          <span className="inline-flex items-center gap-1.5 text-[13px]">
            <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
            Verified
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <CircleDashed className="size-3.5" aria-hidden="true" />
            Not verified
          </span>
        ),
    },
    {
      key: 'created',
      header: 'Created',
      hideOnMobile: true,
      className: 'whitespace-nowrap md:hidden xl:table-cell',
      cell: (user) => (
        <time dateTime={user.createdAt} className="tnum text-[13px] text-muted-foreground">
          {formatDate(user.createdAt)}
        </time>
      ),
    },
  ];
  if (canManage) {
    columns.push({
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      className: 'w-12',
      cell: (user) =>
        user.id === me.id ? (
          <span className="sr-only">No actions on your own account</span>
        ) : (
          <UserActionsMenu
            user={user}
            onAction={(next) => {
              setAction(next);
              setActionOpen(true);
            }}
          />
        ),
    });
  }

  const rows = query.data;
  return (
    <div className="space-y-6">
      <PageHeader
        title={canManage ? 'Staff & users' : 'User directory'}
        description={
          canManage
            ? 'Everyone with a BankSphere sign-in. Customer sign-in changes take effect at once; staff changes and authenticator resets go to a second administrator for approval.'
            : 'Everyone with a BankSphere sign-in. This view is read-only; bank administrators make changes.'
        }
        actions={
          canManage ? (
            <Button variant="outline" onClick={() => setRequestOpen(true)}>
              <UserPlus aria-hidden="true" /> Request new staff member
            </Button>
          ) : undefined
        }
      />
      <Card>
        <div className="grid gap-3 border-b p-4 sm:grid-cols-[1fr_14rem] sm:p-5">
          <Field label="Search" hint="Email address or user ID">
            {(p) => (
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  {...p}
                  type="search"
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            )}
          </Field>
          <Field label="Role">
            {(p) => (
              <NativeSelect {...p} value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLE_FILTERS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>
        {query.isPending ? (
          <p role="status" className="sr-only">
            Loading users
          </p>
        ) : null}
        <div aria-busy={query.isFetching} className={cn('transition-opacity', query.isPlaceholderData && 'opacity-60')}>
          <DataTable
            caption="Users"
            columns={columns}
            rows={rows}
            getRowKey={(user) => user.id}
            loading={query.isPending}
            error={query.error}
            onRetry={() => void query.refetch()}
            empty={
              filtered
                ? {
                    icon: Search,
                    title: 'No one matches these filters',
                    description: 'Try another role, or search for a full email address or user ID.',
                    action: (
                      <Button variant="outline" size="sm" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ),
                  }
                : { icon: Users, title: 'No users found' }
            }
          />
        </div>
        {rows && (rows.length > 0 || offset > 0) ? (
          <Pagination
            offset={offset}
            limit={PAGE_SIZE}
            count={rows.length}
            onChange={(next) => setPage({ filterKey, offset: next })}
          />
        ) : null}
      </Card>
      {canManage ? (
        <>
          <UserActionDialog action={action} open={actionOpen} onOpenChange={setActionOpen} />
          <RequestStaffDialog open={requestOpen} onOpenChange={setRequestOpen} />
        </>
      ) : null}
    </div>
  );
}

function ActiveBadge({ user, className }: { user: DirectoryUser; className?: string }) {
  return <StatusBadge status={user.isActive ? 'ACTIVE' : 'DISABLED'} label={user.isActive ? 'Active' : 'Disabled'} className={className} />;
}

function UserCell({ user, isMe }: { user: DirectoryUser; isMe: boolean }) {
  return (
    // break-words (not break-all) keeps the column as wide as the address instead of one letter wide
    <div className="min-w-0 max-w-[16rem] sm:max-w-none">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {user.role === 'CUSTOMER' ? (
          <Link to={`/customers/${encodeURIComponent(user.id)}`} className="break-words font-medium text-primary underline-offset-2 hover:underline">
            {user.email}
          </Link>
        ) : (
          <span className="break-words font-medium">{user.email}</span>
        )}
        {isMe ? <Badge tone="primary">You</Badge> : null}
      </div>
      {/* Narrower screens hide detail columns: repeat each one here until its column appears */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 xl:hidden">
        <RoleBadge role={user.role} className="md:hidden" />
        <ActiveBadge user={user} className="md:hidden" />
        <span className="text-[12px] text-muted-foreground lg:hidden">Two-factor {user.mfaEnabled ? 'on' : 'off'}</span>
        {user.isEmailVerified ? null : <span className="text-[12px] text-muted-foreground">Email not verified</span>}
      </div>
    </div>
  );
}
