import type { AdminRequest } from '@/lib/api/types';
import type { Role } from '@/lib/auth/session';
import { Badge, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatDateTime, relativeTime } from './format';
import { requestTargetId } from './requests';
import { roleLabel } from './roles';
import type { PersonResolution, ResolvePerson } from './useUserLookup';

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  const tone = role === 'CUSTOMER' ? 'neutral' : role === 'BANK_ADMIN' ? 'primary' : 'info';
  return (
    <Badge tone={tone} className={className}>
      {roleLabel(role)}
    </Badge>
  );
}

/** "2 hours ago", with the exact time on hover and in the markup */
export function RelativeTime({ iso, now, className }: { iso: string; now?: number; className?: string }) {
  return (
    <time dateTime={iso} title={formatDateTime(iso)} className={cn('tnum', className)}>
      {relativeTime(iso, now)}
    </time>
  );
}

/** A user id shown as a person: their email, "You", or a short id when they can't be found */
export function PersonName({ person, me = 'You' }: { person: PersonResolution | null; me?: string }) {
  if (!person) return <span className="text-muted-foreground">—</span>;
  switch (person.kind) {
    case 'me':
      return <span className="font-medium">{me}</span>;
    case 'loading':
      return (
        <>
          <Skeleton className="inline-block h-3.5 w-36 align-middle" />
          <span className="sr-only">Loading</span>
        </>
      );
    case 'user':
      return <span className="break-all">{person.user.email}</span>;
    case 'unknown':
      return (
        <span className="font-mono text-[12.5px] text-muted-foreground" title={person.id}>
          User {person.id.slice(0, 8)}…
        </span>
      );
  }
}

/** Who a request is about: the new colleague's email and role, or the existing user it changes */
export function RequestSubject({ request, resolve }: { request: AdminRequest; resolve: ResolvePerson }) {
  if (request.type === 'CREATE_STAFF') {
    return (
      <>
        <span className="break-all font-medium">{request.payload.email}</span>
        {request.payload.role ? <RoleBadge role={request.payload.role} /> : null}
      </>
    );
  }
  const person = resolve(requestTargetId(request));
  return (
    <>
      <span className="font-medium">
        <PersonName person={person} me="Your account" />
      </span>
      {person?.kind === 'user' ? <RoleBadge role={person.user.role} /> : null}
    </>
  );
}
