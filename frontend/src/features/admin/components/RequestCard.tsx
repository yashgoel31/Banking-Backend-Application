import { useId, type ReactNode } from 'react';
import { Check, Info, Undo2, X } from 'lucide-react';
import type { AdminRequest } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/primitives';
import { formatDateTime, relativeTime } from './format';
import { PersonName, RelativeTime, RequestSubject } from './People';
import { isExpired, requestTargetId, requestTitle, subjectText } from './requests';
import type { ResolvePerson } from './useUserLookup';

export interface RequestPermissions {
  mine: boolean;
  aboutMe: boolean;
  expired: boolean;
  canApprove: boolean;
  canReject: boolean;
  /** Why a decision button is disabled (or what the person may still do) */
  note: string | null;
}

/**
 * Mirrors the four-eyes rules enforced by the auth service, so nobody is offered a button that can only fail:
 * the requester may withdraw (reject) but never approve; the person a request is about may do neither.
 */
export function requestPermissions(request: AdminRequest, meId: string, now: number = Date.now()): RequestPermissions {
  const mine = request.requestedBy === meId;
  const aboutMe = requestTargetId(request) === meId;
  const expired = isExpired(request, now);
  const canApprove = request.status === 'PENDING' && !mine && !aboutMe && !expired;
  const canReject = request.status === 'PENDING' && !aboutMe;
  let note: string | null = null;
  if (aboutMe) note = 'This request is about your account, so another administrator must decide it.';
  else if (expired) {
    note = `This request expired ${relativeTime(request.expiresAt, now)} and can no longer be approved. ${
      mine ? 'Withdraw' : 'Reject'
    } it to clear it from the queue.`;
  } else if (mine) note = 'You made this request, so a different administrator must approve it. You can withdraw it.';
  return { mine, aboutMe, expired, canApprove, canReject, note };
}

function Meta({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    // People's emails get a full row on phones; the two times share one
    <div className={wide ? 'col-span-2 min-w-0 space-y-0.5 sm:col-span-1' : 'min-w-0 space-y-0.5'}>
      <dt className="text-[12px] text-muted-foreground">{label}</dt>
      <dd className="text-[13px]">{children}</dd>
    </div>
  );
}

export function RequestCard({
  request,
  resolve,
  meId,
  now,
  onApprove,
  onReject,
}: {
  request: AdminRequest;
  resolve: ResolvePerson;
  meId: string;
  now: number;
  onApprove: (request: AdminRequest) => void;
  onReject: (request: AdminRequest) => void;
}) {
  const id = useId();
  const titleId = `${id}-title`;
  const subjectId = `${id}-subject`;
  const noteId = `${id}-note`;
  const pending = request.status === 'PENDING';
  const rules = requestPermissions(request, meId, now);
  const title = requestTitle(request);
  // Many cards share one page: each button names the request it acts on
  const context = `${title.toLowerCase()} for ${subjectText(request, resolve)}`;
  const rejectLabel = rules.mine ? 'Withdraw' : 'Reject';

  return (
    <article aria-labelledby={`${titleId} ${subjectId}`} className="rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-1.5">
          <h3 id={titleId} className="text-sm font-semibold leading-5">
            {title}
          </h3>
          <p id={subjectId} className="flex flex-wrap items-center gap-2 text-sm">
            <RequestSubject request={request} resolve={resolve} />
          </p>
        </div>
        {rules.expired ? (
          <Badge tone="danger" dot>
            Expired
          </Badge>
        ) : (
          <StatusBadge status={request.status} />
        )}
      </div>

      <dl className={pending ? 'mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3' : 'mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4'}>
        <Meta label="Requested by" wide>
          <PersonName person={resolve(request.requestedBy)} />
        </Meta>
        {pending ? null : (
          <Meta label="Decided by" wide>
            {request.decidedBy ? (
              <PersonName person={resolve(request.decidedBy)} />
            ) : (
              <span className="text-muted-foreground">Expired without a decision</span>
            )}
          </Meta>
        )}
        <Meta label="Requested">
          <RelativeTime iso={request.createdAt} now={now} />
        </Meta>
        {pending ? (
          <Meta label="Expires">
            <RelativeTime iso={request.expiresAt} now={now} className={rules.expired ? 'font-medium text-destructive' : undefined} />
          </Meta>
        ) : (
          <>
            <Meta label="Decided">
              {request.decidedAt ? (
                <time dateTime={request.decidedAt} className="tnum">
                  {formatDateTime(request.decidedAt)}
                </time>
              ) : (
                '—'
              )}
            </Meta>
          </>
        )}
      </dl>

      {pending ? (
        <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          {rules.note ? (
            <p id={noteId} className="flex items-start gap-2 text-[13px] text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{rules.note}</span>
            </p>
          ) : (
            <span />
          )}
          <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              disabled={!rules.canReject}
              aria-label={`${rejectLabel} ${context}`}
              aria-describedby={rules.note ? noteId : undefined}
              onClick={() => onReject(request)}
            >
              {rules.mine ? <Undo2 aria-hidden="true" /> : <X aria-hidden="true" />}
              {rejectLabel}
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={!rules.canApprove}
              aria-label={`Approve ${context}`}
              aria-describedby={rules.note ? noteId : undefined}
              onClick={() => onApprove(request)}
            >
              <Check aria-hidden="true" />
              Approve
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
