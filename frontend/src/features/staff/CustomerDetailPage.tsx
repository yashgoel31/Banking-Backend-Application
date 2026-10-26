import { Link, useLocation, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Eye, UserX } from 'lucide-react';
import { useApi, useUser } from '@/lib/auth/AuthProvider';
import type { Role } from '@/lib/auth/session';
import { qk } from '@/lib/query';
import { UUID_PATTERN } from '@/lib/validation';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/data';
import { Callout, Card, CardContent, CardHeader, CardTitle, EmptyState, Mono, PageHeader, Skeleton } from '@/components/ui/primitives';
import { AccountsSection } from './components/AccountsSection';
import { KycBadge } from './components/badges';
import type { BackLink } from './components/CustomerTable';
import { LoadingAnnouncement } from './components/LoadingAnnouncement';
import { KycDecisionPanel } from './components/KycDecisionPanel';
import { KycHistoryCard } from './components/KycHistoryCard';
import { ProfileCard } from './components/ProfileCard';
import { SignInAccessCard, useDirectoryUser } from './components/SignInAccessCard';
import { shortId } from './components/format';
import { isNotFound } from './components/hooks';

const HISTORY_ROLES: Role[] = ['KYC_OFFICER', 'BANK_ADMIN', 'SUPPORT'];
const ACCESS_ROLES: Role[] = ['BANK_ADMIN', 'SUPPORT'];
const SEARCH_ROLES: Role[] = ['KYC_OFFICER', 'BANK_ADMIN', 'SUPPORT'];

/** Where "back" goes: the list the person came from, else their own customer list */
function backLinkFor(state: unknown, role: Role): BackLink | null {
  const candidate = state as Partial<BackLink> | null;
  if (typeof candidate?.from === 'string' && candidate.from.startsWith('/') && !candidate.from.startsWith('//')) {
    return { from: candidate.from, fromLabel: typeof candidate.fromLabel === 'string' ? candidate.fromLabel : 'Back' };
  }
  if (role === 'KYC_OFFICER') return { from: '/kyc', fromLabel: 'KYC review' };
  if (SEARCH_ROLES.includes(role)) return { from: '/customers', fromLabel: 'Customers' };
  return null;
}

function NotFound({ role, back }: { role: Role; back: BackLink | null }) {
  return (
    <div className="space-y-6">
      {back ? <BackLinkView back={back} /> : null}
      <PageHeader title="Customer not found" />
      <Card>
        <EmptyState
          icon={UserX}
          title="No customer matches this ID"
          description="Check the ID, or search for the customer by name or phone number."
          action={
            SEARCH_ROLES.includes(role) ? (
              <Button asChild variant="outline">
                <Link to="/customers">Search customers</Link>
              </Button>
            ) : null
          }
        />
      </Card>
    </div>
  );
}

function BackLinkView({ back }: { back: BackLink }) {
  return (
    <Link to={back.from} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden="true" /> {back.fromLabel}
    </Link>
  );
}

export default function CustomerDetailPage() {
  const { userId = '' } = useParams();
  const api = useApi();
  const user = useUser();
  const location = useLocation();
  const valid = UUID_PATTERN.test(userId);
  const canSeeHistory = HISTORY_ROLES.includes(user.role);
  const canSeeAccess = ACCESS_ROLES.includes(user.role);
  const isAdmin = user.role === 'BANK_ADMIN';
  const back = backLinkFor(location.state, user.role);

  const profileQuery = useQuery({ queryKey: qk.customer(userId), queryFn: () => api.customers.get(userId), enabled: valid });
  const accountsQuery = useQuery({ queryKey: qk.customerAccounts(userId), queryFn: () => api.accounts.list(userId), enabled: valid });
  const directoryQuery = useDirectoryUser(userId, valid && canSeeAccess);

  if (!valid) return <NotFound role={user.role} back={back} />;

  const profile = profileQuery.data;
  const profileMissing = isNotFound(profileQuery.error);
  const directoryUser = directoryQuery.data ?? null;
  const directorySettled = !canSeeAccess || !directoryQuery.isPending;
  // A customer without a profile still exists if they have accounts or a sign-in account
  const notFound =
    profileMissing && accountsQuery.isSuccess && accountsQuery.data.length === 0 && directorySettled && directoryUser === null;
  const checkingMissing = profileMissing && (accountsQuery.isPending || !directorySettled);

  if (notFound) return <NotFound role={user.role} back={back} />;

  const name = profile?.fullName ?? directoryUser?.email ?? 'this customer';
  const loading = profileQuery.isPending || checkingMissing;

  return (
    <div className="space-y-6">
      {back ? <BackLinkView back={back} /> : null}
      <LoadingAnnouncement active={loading} label="Loading customer…" />
      <PageHeader
        eyebrow="Customer"
        title={profile?.fullName ?? (loading ? <Skeleton className="h-8 w-56" /> : directoryUser?.email ?? `Customer ${shortId(userId)}`)}
        description={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            User ID <Mono value={userId} short={false} copy />
          </span>
        }
        actions={profile ? <KycBadge status={profile.kycStatus} /> : null}
      />
      <p className="-mt-3 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
        <Eye className="size-3.5 shrink-0" aria-hidden="true" />
        Your access to this record is logged.
      </p>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {profile ? (
            <ProfileCard profile={profile}>
              {user.role === 'KYC_OFFICER' ? <KycDecisionPanel profile={profile} me={user.id} /> : null}
            </ProfileCard>
          ) : loading ? (
            <Card aria-hidden="true">
              <CardHeader>
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ) : profileMissing ? (
            <Callout tone="info" title="No profile yet">
              This customer has registered but hasn’t completed their profile, so there are no identity details to review.
            </Callout>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
              </CardHeader>
              <ErrorState error={profileQuery.error} onRetry={() => void profileQuery.refetch()} />
            </Card>
          )}
          <AccountsSection customerId={userId} query={accountsQuery} canAdminister={isAdmin} me={user.id} />
        </div>
        <div className="min-w-0 space-y-6">
          {canSeeAccess ? <SignInAccessCard userId={userId} name={name} query={directoryQuery} canManage={isAdmin} me={user.id} /> : null}
          {canSeeHistory && !profileMissing ? <KycHistoryCard userId={userId} me={user.id} /> : null}
        </div>
      </div>
    </div>
  );
}
