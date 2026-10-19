import { useId, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Eye, RotateCcw, Undo2, XCircle } from 'lucide-react';
import { useApi } from '@/lib/auth/AuthProvider';
import { isApiError } from '@/lib/api/errors';
import type { FraudAlert } from '@/lib/api/types';
import { notifyError, notifySuccess } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/overlays';
import { Callout, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives';
import { alertKey, applyAlertUpdate } from './alertLookup';
import { CloseAlertDialog, isSevere, type CloseStatus } from './CloseAlertDialog';
import { ALERT_STATUS_LABEL, shortId } from './format';
import { hasCode, isRefusal } from './hooks';
import { OutcomeCallout, outcomeFromError, type Outcome } from './Outcome';

type SimpleIntent = 'start' | 'reopen' | 'withdraw' | 'decline';
type Intent = { kind: SimpleIntent } | { kind: 'close'; status: CloseStatus; confirming: boolean };

const SIMPLE_DONE: Record<SimpleIntent, string> = {
  start: 'Review started',
  reopen: 'Alert reopened',
  withdraw: 'Proposal withdrawn',
  decline: 'Proposal rejected',
};

const CONFIRMS: Record<Exclude<SimpleIntent, 'start'>, { title: string; description: string; confirmLabel: string }> = {
  reopen: {
    title: 'Reopen this alert for review?',
    description: 'It goes back to Under review so analysts can look at it again. The earlier decision stays in the history.',
    confirmLabel: 'Reopen for review',
  },
  withdraw: {
    title: 'Withdraw your proposal?',
    description: 'The alert stays under review and nobody can confirm the proposal any more. You or another analyst can propose again.',
    confirmLabel: 'Withdraw proposal',
  },
  decline: {
    title: 'Reject this proposal?',
    description: 'The alert stays under review and the proposal is cleared. Either analyst can then propose a different outcome.',
    confirmLabel: 'Reject proposal',
  },
};

const closingVerb = (status: CloseStatus) => (status === 'RESOLVED' ? 'resolving' : 'dismissing');
const closingNoun = (status: CloseStatus) => (status === 'RESOLVED' ? 'resolution' : 'dismissal');

function refusal(error: unknown, alert: FraudAlert, me: string): Outcome {
  if (hasCode(error, 'CONFLICT') || (hasCode(error, 'FORBIDDEN') && alert.closeRequestedBy === me)) {
    return {
      tone: 'danger',
      title: 'A different analyst must confirm this',
      body: 'Closing a high or critical alert needs two analysts. Your proposal is waiting for a colleague to confirm it.',
    };
  }
  if (hasCode(error, 'FORBIDDEN') && alert.initiatedBy === me) {
    return { tone: 'danger', title: 'You can’t triage this alert', body: 'It’s about a transaction you initiated, so another analyst must handle it.' };
  }
  if (hasCode(error, 'FORBIDDEN')) {
    return {
      tone: 'danger',
      title: 'You can’t make this change',
      body: 'Only fraud analysts can triage alerts, and never for a transaction they initiated or to confirm their own proposal.',
    };
  }
  if (hasCode(error, 'NOT_FOUND')) {
    return { tone: 'danger', title: 'This alert no longer exists', body: 'Go back to the alert list to see current alerts.' };
  }
  return outcomeFromError(error);
}

/**
 * Fraud analyst actions, following the service rules: nobody triages an alert about a transaction they
 * initiated; closing a HIGH/CRITICAL alert is a proposal that a different analyst confirms (same target
 * status); any non-closing change clears a pending proposal. The message shown always reflects what the
 * API actually did, which can differ from the intent if someone else acted in the meantime.
 */
export function TriagePanel({ alert, me }: { alert: FraudAlert; me: string }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const titleId = useId();
  const [closing, setClosing] = useState<{ status: CloseStatus; confirming: boolean } | null>(null);
  const [confirm, setConfirm] = useState<Exclude<SimpleIntent, 'start'> | null>(null);
  const [starting, setStarting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const severe = isSevere(alert);
  const closed = alert.status === 'RESOLVED' || alert.status === 'DISMISSED';
  const proposal =
    alert.closeRequestedBy && alert.closeRequestedStatus && !closed
      ? { by: alert.closeRequestedBy, status: alert.closeRequestedStatus as CloseStatus }
      : null;

  /** Resolves when the API answered (done or refused, shown in the panel); rejects on transient failures */
  const submit = async (intent: Intent, note?: string): Promise<void> => {
    setOutcome(null);
    const status = intent.kind === 'close' ? intent.status : 'UNDER_REVIEW';
    try {
      const { pendingSecondApproval: _ignored, ...updated } = (await api.fraud.updateAlert(alert.id, status, note)) as FraudAlert & {
        pendingSecondApproval?: boolean;
      };
      applyAlertUpdate(queryClient, updated);
      const closedNow = updated.status === 'RESOLVED' || updated.status === 'DISMISSED';
      if (closedNow) {
        notifySuccess(updated.status === 'RESOLVED' ? 'Alert resolved' : 'Alert dismissed');
        if (intent.kind === 'close' && !intent.confirming && severe) {
          setOutcome({ tone: 'info', title: 'Another analyst had already proposed this, so your decision confirmed it and the alert is now closed.' });
        }
      } else if (updated.closeRequestedBy === me) {
        notifySuccess('Proposal recorded', 'A second analyst must confirm before the alert closes.');
        if (intent.kind === 'close' && intent.confirming) {
          setOutcome({ tone: 'info', title: 'The earlier proposal had been withdrawn', body: 'Your decision is now a new proposal, waiting for a second analyst.' });
        }
      } else {
        notifySuccess(intent.kind === 'close' ? 'Alert updated' : SIMPLE_DONE[intent.kind]);
      }
    } catch (error) {
      if (isApiError(error) && error.fieldErrors.note) throw error;
      if (!isRefusal(error)) throw error;
      setOutcome(refusal(error, alert, me));
      void queryClient.invalidateQueries({ queryKey: alertKey(alert.id) });
    }
  };

  const start = async () => {
    setStarting(true);
    try {
      await submit({ kind: 'start' });
    } catch (error) {
      notifyError(error);
    } finally {
      setStarting(false);
    }
  };

  let body: ReactNode;
  if (alert.initiatedBy === me) {
    body = (
      <Callout tone="danger" title="You can’t triage this alert">
        It’s about a transaction you initiated, so another analyst must handle it.
      </Callout>
    );
  } else if (closed) {
    body = (
      <>
        <p className="text-[13px] text-muted-foreground">
          This alert is {ALERT_STATUS_LABEL[alert.status].toLowerCase()}. Reopen it if new information comes to light.
        </p>
        <Button variant="outline" block onClick={() => setConfirm('reopen')}>
          <RotateCcw aria-hidden="true" /> Reopen for review
        </Button>
      </>
    );
  } else if (proposal && proposal.by === me) {
    body = (
      <>
        <p className="text-[13px] text-muted-foreground">
          You proposed {closingVerb(proposal.status)} this alert. Another analyst must confirm it before the alert closes.
        </p>
        <Button variant="outline" block onClick={() => setConfirm('withdraw')}>
          <Undo2 aria-hidden="true" /> Withdraw proposal
        </Button>
      </>
    );
  } else if (proposal) {
    body = (
      <>
        <p className="text-[13px] text-muted-foreground">
          Analyst <span title={proposal.by}>{shortId(proposal.by)}</span> proposed {ALERT_STATUS_LABEL[proposal.status]}. Check the evidence,
          then confirm or reject the proposal.
        </p>
        <div className="grid gap-2">
          <Button block onClick={() => setClosing({ status: proposal.status, confirming: true })}>
            <CheckCircle2 aria-hidden="true" /> {`Confirm ${closingNoun(proposal.status)}`}
          </Button>
          <Button variant="outline" block onClick={() => setConfirm('decline')}>
            <XCircle aria-hidden="true" /> Reject proposal
          </Button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        {alert.status === 'OPEN' ? (
          <Button block loading={starting} onClick={() => void start()}>
            <Eye aria-hidden="true" /> Start review
          </Button>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => setClosing({ status: 'RESOLVED', confirming: false })}>
            <CheckCircle2 aria-hidden="true" /> Resolve
          </Button>
          <Button variant="outline" onClick={() => setClosing({ status: 'DISMISSED', confirming: false })}>
            <XCircle aria-hidden="true" /> Dismiss
          </Button>
        </div>
        <p className="text-[12.5px] text-muted-foreground">
          {severe
            ? 'High and critical alerts need two analysts: closing records your proposal, and a different analyst confirms it.'
            : 'Low and medium alerts close as soon as you decide. Closing always needs a note.'}
        </p>
      </>
    );
  }

  const confirmCopy = confirm ? CONFIRMS[confirm] : null;

  return (
    <Card role="region" aria-labelledby={titleId}>
      <CardHeader>
        <CardTitle id={titleId}>Triage</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <OutcomeCallout outcome={outcome} onDismiss={() => setOutcome(null)} />
        {body}
      </CardContent>
      <CloseAlertDialog
        alert={alert}
        intent={closing}
        onOpenChange={(open) => {
          if (!open) setClosing(null);
        }}
        onSubmitNote={(note) => submit({ kind: 'close', status: closing!.status, confirming: closing!.confirming }, note)}
      />
      {confirm && confirmCopy ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirm(null);
          }}
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.confirmLabel}
          tone={confirm === 'reopen' ? 'primary' : 'destructive'}
          onConfirm={async () => {
            try {
              await submit({ kind: confirm });
            } catch (error) {
              notifyError(error);
              throw error;
            }
          }}
        />
      ) : null}
    </Card>
  );
}
